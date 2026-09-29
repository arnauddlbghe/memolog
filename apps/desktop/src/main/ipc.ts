import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

import { isMemologError, resolveInRoot } from '@memolog/core'

import { CHANNELS } from '../shared/api.js'
import type { AppInfo, MemoryMetrics, Settings, WriteOutcome } from '../shared/types.js'
import type { AppState } from './app-state.js'
import { emit } from './events.js'
import { configDir, getSettings, updateSettings } from './settings.js'
import { testShortcut } from './shortcuts.js'
import {
  asBoolean,
  asContent,
  asObject,
  asOptionalNumber,
  asOptionalString,
  asState,
  asString
} from './validate.js'
import { getWindow, hideWindow, setQuitting } from './window.js'

/**
 * Enveloppe commune : toute erreur du coeur traverse l'IPC sous la forme
 * `[code] message`, pour que l'interface puisse réagir au code sans dépendre
 * de la formulation.
 */
function handle<T>(channel: string, fn: (args: unknown) => Promise<T> | T): void {
  ipcMain.handle(channel, async (_event, args: unknown) => {
    try {
      return await fn(args)
    } catch (error) {
      if (isMemologError(error)) throw new Error(`[${error.code}] ${error.message}`)
      throw new Error(`[io] ${error instanceof Error ? error.message : String(error)}`)
    }
  })
}

export function registerIpc(state: AppState): void {
  // --- Réglages ------------------------------------------------------------
  handle(CHANNELS.settingsGet, () => getSettings())

  handle(CHANNELS.settingsUpdate, (args) => {
    const patch = asObject(args) as Partial<Settings>
    // Le dossier de rangement ne se change que par `vault:set-root`.
    delete patch.root
    delete patch.version
    return updateSettings(patch)
  })

  // --- Dossier de rangement -------------------------------------------------
  handle(CHANNELS.vaultChoose, async () => {
    const window = getWindow()
    const result = await dialog.showOpenDialog(window ?? new BrowserWindow({ show: false }), {
      title: 'Choisir le dossier de rangement de Memolog',
      defaultPath: getSettings().root,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Choisir ce dossier'
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  handle(CHANNELS.vaultPreviewChange, async (args) => {
    const newRoot = asString(asObject(args)['newRoot'], 'newRoot')
    const preview = await state.previewRootChange(newRoot)
    return { ...preview, currentRoot: getSettings().root }
  })

  handle(CHANNELS.vaultSetRoot, (args) => {
    const input = asObject(args)
    return state.setRoot(asString(input['newRoot'], 'newRoot'), asBoolean(input['move'], 'move'))
  })

  handle(CHANNELS.vaultReveal, async (args) => {
    const relPath = asOptionalString(asObject(args)['relPath'], 'relPath')
    const root = getSettings().root
    if (relPath === undefined || relPath === '') {
      await shell.openPath(root)
      return
    }
    shell.showItemInFolder(resolveInRoot(root, relPath))
  })

  handle(CHANNELS.onboardingComplete, async (args) => {
    const input = asObject(args)
    const settings = updateSettings({
      root: asString(input['root'], 'root'),
      launchAtLogin: asBoolean(input['launchAtLogin'], 'launchAtLogin'),
      onboardingDone: true
    })
    await state.attachRoot(settings.root)
    return settings
  })

  // --- Conversations --------------------------------------------------------
  handle(CHANNELS.conversationsList, () => state.conversations.list())

  handle(CHANNELS.conversationsRead, (args) =>
    state.conversations.read(asString(asObject(args)['path'], 'path'))
  )

  handle(CHANNELS.conversationsCreate, async (args) => {
    const created = await state.conversations.create(asString(asObject(args)['name'], 'name'))
    await state.reindex(created.path)
    emit('conversations:changed', { path: created.path })
    return created
  })

  handle(CHANNELS.conversationsSetContent, async (args): Promise<WriteOutcome> => {
    const input = asObject(args)
    const target = asString(input['path'], 'path')
    const content = asContent(input['content'])
    const baseMtimeMs = asOptionalNumber(input['baseMtimeMs'], 'baseMtimeMs')

    const result = await state.conversations.setContent(target, content, baseMtimeMs)
    if (!result.ok) {
      return { ok: false, path: target, mtimeMs: result.disk.mtimeMs, conflict: result.disk }
    }
    await state.reindex(target)
    emit('conversations:changed', { path: target })
    return { ok: true, path: result.path, mtimeMs: result.mtimeMs }
  })

  handle(CHANNELS.conversationsSetState, async (args) => {
    const input = asObject(args)
    const target = asString(input['path'], 'path')
    const after = await state.conversations.setState(target, asState(input['state']))
    await state.reindex(target)
    emit('conversations:changed', { path: target })
    return after
  })

  handle(CHANNELS.conversationsRename, async (args) => {
    const input = asObject(args)
    const from = asString(input['path'], 'path')
    const to = await state.conversations.rename(from, asString(input['name'], 'name'))
    state.index.remove(from)
    await state.reindex(to)
    emit('conversations:changed', { path: to })
    return to
  })

  handle(CHANNELS.conversationsRemove, async (args) => {
    const target = asString(asObject(args)['path'], 'path')
    await state.conversations.remove(target)
    state.index.remove(target)
    emit('conversations:changed', {})
  })

  handle(CHANNELS.conversationsDays, () => state.conversations.days())

  // --- Fichiers bruts -------------------------------------------------------
  handle(CHANNELS.notesList, (args) => state.notes.list(asString(asObject(args)['dir'], 'dir')))

  handle(CHANNELS.notesRead, (args) => state.notes.read(asString(asObject(args)['path'], 'path')))

  handle(CHANNELS.notesWrite, async (args): Promise<WriteOutcome> => {
    const input = asObject(args)
    const notePath = asString(input['path'], 'path')
    const content = asContent(input['content'])
    const baseMtimeMs = asOptionalNumber(input['baseMtimeMs'], 'baseMtimeMs')

    const result = await state.notes.write(notePath, content, baseMtimeMs)
    if (!result.ok) {
      return { ok: false, path: notePath, mtimeMs: result.disk.mtimeMs, conflict: result.disk }
    }
    state.noteWritten(notePath, content, { mtimeMs: result.mtimeMs, size: result.size })
    emit('conversations:changed', { path: notePath })
    return { ok: true, path: result.path, mtimeMs: result.mtimeMs }
  })

  handle(CHANNELS.notesCreate, async (args) => {
    const input = asObject(args)
    const note = await state.notes.create(
      asString(input['dir'], 'dir'),
      asOptionalString(input['name'], 'name')
    )
    state.noteWritten(note.path, note.content, { mtimeMs: note.mtimeMs, size: note.size })
    emit('conversations:changed', {})
    return note
  })

  handle(CHANNELS.notesRemove, async (args) => {
    const target = asString(asObject(args)['path'], 'path')
    await state.notes.remove(target)
    state.index.remove(target)
    emit('conversations:changed', {})
  })

  /** Liste à plat de tous les fichiers : la surcouche « Fichiers » en a besoin. */
  handle(CHANNELS.notesAll, async () => {
    const entries = []
    for await (const note of state.notes.walk()) {
      const name = note.path.slice(note.path.lastIndexOf('/') + 1)
      entries.push({
        path: note.path,
        name,
        title: name.replace(/\.md$/i, ''),
        kind: 'note' as const,
        mtimeMs: note.mtimeMs,
        size: note.size
      })
    }
    return entries.sort((a, b) => b.mtimeMs - a.mtimeMs)
  })

  // --- Recherche ------------------------------------------------------------
  handle(CHANNELS.searchQuery, (args) => {
    const input = asObject(args)
    return state.noteIndex.search(
      asString(input['text'], 'text'),
      asOptionalNumber(input['limit'], 'limit') ?? 30
    )
  })
  handle(CHANNELS.searchStatus, () => state.index.getStatus())
  handle(CHANNELS.searchRebuild, () => state.index.rebuild())

  // --- Application ----------------------------------------------------------
  handle(
    CHANNELS.appInfo,
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      root: getSettings().root,
      configDir: configDir(),
      isDev: !app.isPackaged
    })
  )

  handle(CHANNELS.appMetrics, (): MemoryMetrics => {
    const perProcess = app.getAppMetrics().map((metric) => ({
      type: metric.type,
      mb: Math.round(((metric.memory.workingSetSize ?? 0) / 1024) * 10) / 10
    }))
    const totalMb = Math.round(perProcess.reduce((sum, item) => sum + item.mb, 0) * 10) / 10
    return { totalMb, perProcess }
  })

  handle(CHANNELS.appHide, () => hideWindow())

  handle(CHANNELS.appQuit, () => {
    setQuitting(true)
    app.quit()
  })

  handle(CHANNELS.appTestShortcut, (args) =>
    testShortcut(asString(asObject(args)['shortcut'], 'shortcut'))
  )

  handle(CHANNELS.appOpenExternal, async (args) => {
    const url = asString(asObject(args)['url'], 'url')
    // Seuls le web et les fichiers du dossier de notes sont ouvrables.
    if (url.startsWith('https://') || url.startsWith('http://')) {
      await shell.openExternal(url)
      return
    }
    if (url.startsWith('file:')) {
      const target = path.resolve(decodeURI(url.replace(/^file:\/\//, '')))
      if (target.startsWith(path.resolve(getSettings().root))) await shell.openPath(target)
    }
  })
}
