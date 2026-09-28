import { contextBridge, ipcRenderer } from 'electron'

import { CHANNELS, EVENT_CHANNEL, type MemologApi } from '../shared/api.js'
import type { MemologEventName, MemologEvents } from '../shared/types.js'

/**
 * Un seul écouteur IPC pour tout le pont, qui redistribue aux abonnés du
 * renderer. Brancher un écouteur `ipcRenderer` par abonnement ferait grimper
 * le compteur d'EventEmitter et déclencherait un avertissement de fuite.
 */
type AnyListener = (payload: unknown) => void
const subscribers = new Map<MemologEventName, Set<AnyListener>>()

ipcRenderer.on(
  EVENT_CHANNEL,
  (_sender, message: { event: MemologEventName; data: MemologEvents[MemologEventName] }) => {
    for (const listener of subscribers.get(message.event) ?? []) listener(message.data)
  }
)

/**
 * Pont minimal. Le renderer ne reçoit jamais `ipcRenderer` : uniquement les
 * quelques fonctions ci-dessous, avec des arguments simples et sérialisables.
 */
const api: MemologApi = {
  settings: {
    get: () => ipcRenderer.invoke(CHANNELS.settingsGet),
    update: (patch) => ipcRenderer.invoke(CHANNELS.settingsUpdate, patch)
  },

  vault: {
    choose: () => ipcRenderer.invoke(CHANNELS.vaultChoose),
    previewChange: (newRoot) => ipcRenderer.invoke(CHANNELS.vaultPreviewChange, { newRoot }),
    setRoot: (newRoot, move) => ipcRenderer.invoke(CHANNELS.vaultSetRoot, { newRoot, move }),
    reveal: (relPath) => ipcRenderer.invoke(CHANNELS.vaultReveal, { relPath })
  },

  onboarding: {
    complete: (root, launchAtLogin) =>
      ipcRenderer.invoke(CHANNELS.onboardingComplete, { root, launchAtLogin })
  },

  tree: {
    list: (dir) => ipcRenderer.invoke(CHANNELS.treeList, { dir })
  },

  notes: {
    read: (path) => ipcRenderer.invoke(CHANNELS.noteRead, { path }),
    write: (path, content, baseMtimeMs) =>
      ipcRenderer.invoke(CHANNELS.noteWrite, { path, content, baseMtimeMs }),
    create: (dir, name) => ipcRenderer.invoke(CHANNELS.noteCreate, { dir, name }),
    createFolder: (dir, name) => ipcRenderer.invoke(CHANNELS.folderCreate, { dir, name }),
    rename: (path, newName) => ipcRenderer.invoke(CHANNELS.entryRename, { path, newName }),
    move: (path, newDir) => ipcRenderer.invoke(CHANNELS.entryMove, { path, newDir }),
    remove: (path) => ipcRenderer.invoke(CHANNELS.entryRemove, { path })
  },

  journal: {
    today: () => ipcRenderer.invoke(CHANNELS.journalToday),
    open: (date) => ipcRenderer.invoke(CHANNELS.journalOpen, { date }),
    append: (text) => ipcRenderer.invoke(CHANNELS.journalAppend, { text }),
    day: (date) => ipcRenderer.invoke(CHANNELS.journalDay, { date }),
    days: () => ipcRenderer.invoke(CHANNELS.journalDays)
  },

  tasks: {
    list: (options) => ipcRenderer.invoke(CHANNELS.tasksList, options ?? {}),
    dormant: (days) => ipcRenderer.invoke(CHANNELS.tasksDormant, { days }),
    create: (text, project, description) =>
      ipcRenderer.invoke(CHANNELS.tasksCreate, { text, project, description }),
    setState: (id, state) => ipcRenderer.invoke(CHANNELS.tasksSetState, { id, state }),
    cycle: (id) => ipcRenderer.invoke(CHANNELS.tasksCycle, { id }),
    rename: (id, text) => ipcRenderer.invoke(CHANNELS.tasksRename, { id, text }),
    describe: (id, description) => ipcRenderer.invoke(CHANNELS.tasksDescribe, { id, description }),
    resolve: (ids) => ipcRenderer.invoke(CHANNELS.tasksResolve, { ids }),
    archive: () => ipcRenderer.invoke(CHANNELS.tasksArchive)
  },

  projects: {
    list: () => ipcRenderer.invoke(CHANNELS.projectsList),
    detail: (name) => ipcRenderer.invoke(CHANNELS.projectsDetail, { name })
  },

  search: {
    query: (text, limit) => ipcRenderer.invoke(CHANNELS.searchQuery, { text, limit }),
    status: () => ipcRenderer.invoke(CHANNELS.searchStatus),
    rebuild: () => ipcRenderer.invoke(CHANNELS.searchRebuild)
  },

  app: {
    info: () => ipcRenderer.invoke(CHANNELS.appInfo),
    metrics: () => ipcRenderer.invoke(CHANNELS.appMetrics),
    hide: () => ipcRenderer.invoke(CHANNELS.appHide),
    quit: () => ipcRenderer.invoke(CHANNELS.appQuit),
    testShortcut: (shortcut) => ipcRenderer.invoke(CHANNELS.appTestShortcut, { shortcut }),
    openExternal: (url) => ipcRenderer.invoke(CHANNELS.appOpenExternal, { url })
  },

  on(event, listener) {
    const handler = listener as AnyListener
    const listeners = subscribers.get(event) ?? new Set<AnyListener>()
    listeners.add(handler)
    subscribers.set(event, listeners)

    return () => {
      listeners.delete(handler)
      if (listeners.size === 0) subscribers.delete(event)
    }
  }
}

contextBridge.exposeInMainWorld('memolog', api)
