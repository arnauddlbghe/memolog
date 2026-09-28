import path from 'node:path'

import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'

import {
  isMemologError,
  journalPathFor,
  parseLocalDate,
  resolveInRoot,
  taskAge,
  type TaskState
} from '@memolog/core'

import { CHANNELS } from '../shared/api.js'
import type {
  AppInfo,
  MemoryMetrics,
  ResolvedRef,
  Settings,
  TaskWithAge,
  WriteOutcome
} from '../shared/types.js'
import type { AppState } from './app-state.js'
import { emit } from './events.js'
import { configDir, getSettings, updateSettings } from './settings.js'
import { testShortcut } from './shortcuts.js'
import {
  asBoolean,
  asContent,
  asObject,
  asOptionalBoolean,
  asOptionalNumber,
  asOptionalString,
  asString,
  asStringArray,
  asTaskState
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
    // Le dossier de rangement ne se change que par `vault:set-root`, qui sait
    // déplacer le contenu et réindexer.
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

  // --- Arborescence et notes ------------------------------------------------
  handle(CHANNELS.treeList, (args) => state.notes.list(asString(asObject(args)['dir'], 'dir')))

  handle(CHANNELS.noteRead, (args) => state.notes.read(asString(asObject(args)['path'], 'path')))

  handle(CHANNELS.noteWrite, async (args): Promise<WriteOutcome> => {
    const input = asObject(args)
    const notePath = asString(input['path'], 'path')
    const content = asContent(input['content'])
    const baseMtimeMs = asOptionalNumber(input['baseMtimeMs'], 'baseMtimeMs')

    const result = await state.notes.write(notePath, content, baseMtimeMs)
    if (!result.ok) {
      return { ok: false, path: notePath, mtimeMs: result.disk.mtimeMs, conflict: result.disk }
    }
    state.noteWritten(notePath, content, { mtimeMs: result.mtimeMs, size: result.size })
    if (notePath === 'taches.md' || notePath.startsWith('taches/')) emit('tasks:changed', {})
    return { ok: true, path: result.path, mtimeMs: result.mtimeMs }
  })

  handle(CHANNELS.noteCreate, async (args) => {
    const input = asObject(args)
    const note = await state.notes.create(
      asString(input['dir'], 'dir'),
      asOptionalString(input['name'], 'name')
    )
    state.noteWritten(note.path, note.content, { mtimeMs: note.mtimeMs, size: note.size })
    return note
  })

  handle(CHANNELS.folderCreate, (args) => {
    const input = asObject(args)
    return state.notes.createFolder(asString(input['dir'], 'dir'), asString(input['name'], 'name'))
  })

  handle(CHANNELS.entryRename, async (args) => {
    const input = asObject(args)
    const from = asString(input['path'], 'path')
    const to = await state.notes.rename(from, asString(input['newName'], 'newName'))
    await reindexMove(state, from, to)
    return to
  })

  handle(CHANNELS.entryMove, async (args) => {
    const input = asObject(args)
    const from = asString(input['path'], 'path')
    const to = await state.notes.move(from, asString(input['newDir'], 'newDir'))
    await reindexMove(state, from, to)
    return to
  })

  handle(CHANNELS.entryRemove, async (args) => {
    const target = asString(asObject(args)['path'], 'path')
    await state.notes.remove(target)
    state.index.remove(target)
    emit('tasks:changed', {})
  })

  // --- Journal --------------------------------------------------------------
  handle(CHANNELS.journalToday, async () => {
    const day = await state.journal.open()
    const note = await state.notes.read(day.path)
    state.noteWritten(note.path, note.content, { mtimeMs: note.mtimeMs, size: note.size })
    return note
  })

  handle(CHANNELS.journalOpen, async (args) => {
    const date = parseLocalDate(asString(asObject(args)['date'], 'date'))
    if (date === null) throw new Error('[invalid-path] Date attendue au format AAAA-MM-JJ.')
    return state.notes.read(journalPathFor(date))
  })

  handle(CHANNELS.journalAppend, async (args) => {
    const text = asString(asObject(args)['text'], 'text')
    const result = await state.journal.append(text)
    const note = await state.notes.read(result.path)
    state.noteWritten(note.path, note.content, { mtimeMs: note.mtimeMs, size: note.size })
    return { path: result.path, line: result.line }
  })

  handle(CHANNELS.journalDay, (args) =>
    state.dayView(asOptionalString(asObject(args)['date'], 'date'))
  )

  handle(CHANNELS.journalDays, () => state.journal.days())

  // --- Tâches ---------------------------------------------------------------
  handle(CHANNELS.tasksList, (args) => {
    const input = asObject(args)
    const project = asOptionalString(input['project'], 'project')
    return state.tasks.list({
      includeClosed: asOptionalBoolean(input['includeClosed']) ?? true,
      ...(project === undefined ? {} : { project })
    })
  })

  handle(CHANNELS.tasksDormant, async (args): Promise<TaskWithAge[]> => {
    const days = asOptionalNumber(asObject(args)['days'], 'days') ?? getSettings().dormantAfterDays
    const now = new Date()
    const tasks = await state.tasks.dormant(days)
    return tasks.map((task) => ({ task, ageDays: taskAge(task, now) }))
  })

  handle(CHANNELS.tasksCreate, async (args) => {
    const input = asObject(args)
    const task = await state.tasks.create(
      asString(input['text'], 'text'),
      asOptionalString(input['project'], 'project'),
      asOptionalString(input['description'], 'description')
    )
    await afterTaskChange(state)
    return task
  })

  handle(CHANNELS.tasksSetState, async (args) => {
    const input = asObject(args)
    const task = await state.tasks.setState(
      asString(input['id'], 'id'),
      asTaskState(input['state']) as TaskState
    )
    await afterTaskChange(state)
    return task
  })

  handle(CHANNELS.tasksCycle, async (args) => {
    const task = await state.tasks.cycleState(asString(asObject(args)['id'], 'id'))
    await afterTaskChange(state)
    return task
  })

  handle(CHANNELS.tasksRename, async (args) => {
    const input = asObject(args)
    const task = await state.tasks.rename(asString(input['id'], 'id'), asString(input['text'], 'text'))
    await afterTaskChange(state)
    return task
  })

  handle(CHANNELS.tasksDescribe, async (args) => {
    const input = asObject(args)
    const task = await state.tasks.describe(
      asString(input['id'], 'id'),
      asString(input['description'], 'description')
    )
    await afterTaskChange(state)
    return task
  })

  handle(CHANNELS.tasksResolve, (args): ResolvedRef[] => {
    const ids = asStringArray(asObject(args)['ids'], 'ids')
    return ids.map((id) => ({ id, task: state.noteIndex.task(id) }))
  })

  handle(CHANNELS.tasksArchive, async () => {
    const report = await state.tasks.archiveClosed(getSettings().archiveAfterDays)
    await afterTaskChange(state)
    return report
  })

  // --- Projets --------------------------------------------------------------
  handle(CHANNELS.projectsList, () => state.projects.list())
  handle(CHANNELS.projectsDetail, (args) =>
    state.projects.detail(asString(asObject(args)['name'], 'name'))
  )

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

/** Après une mutation de tâche : réindexer le fichier et prévenir l'interface. */
async function afterTaskChange(state: AppState): Promise<void> {
  try {
    const note = await state.notes.read('taches.md')
    state.index.update(note.path, note.content, { mtimeMs: note.mtimeMs, size: note.size })
  } catch {
    // Le fichier peut ne pas encore exister : la synchronisation suivante s'en charge.
  }
  emit('tasks:changed', {})
}

async function reindexMove(state: AppState, from: string, to: string): Promise<void> {
  state.index.remove(from)
  try {
    const note = await state.notes.read(to)
    state.index.update(to, note.content, { mtimeMs: note.mtimeMs, size: note.size })
  } catch {
    // Dossier déplacé : la surveillance disque rattrapera le contenu.
  }
  emit('tasks:changed', {})
}
