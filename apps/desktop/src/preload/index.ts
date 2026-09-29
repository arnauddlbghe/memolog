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

  conversations: {
    list: () => ipcRenderer.invoke(CHANNELS.conversationsList),
    read: (path) => ipcRenderer.invoke(CHANNELS.conversationsRead, { path }),
    create: (name) => ipcRenderer.invoke(CHANNELS.conversationsCreate, { name }),
    setContent: (path, content, baseMtimeMs) =>
      ipcRenderer.invoke(CHANNELS.conversationsSetContent, { path, content, baseMtimeMs }),
    setState: (path, state) =>
      ipcRenderer.invoke(CHANNELS.conversationsSetState, { path, state }),
    rename: (path, name) => ipcRenderer.invoke(CHANNELS.conversationsRename, { path, name }),
    remove: (path) => ipcRenderer.invoke(CHANNELS.conversationsRemove, { path }),
    days: () => ipcRenderer.invoke(CHANNELS.conversationsDays)
  },

  notes: {
    list: (dir) => ipcRenderer.invoke(CHANNELS.notesList, { dir }),
    read: (path) => ipcRenderer.invoke(CHANNELS.notesRead, { path }),
    write: (path, content, baseMtimeMs) =>
      ipcRenderer.invoke(CHANNELS.notesWrite, { path, content, baseMtimeMs }),
    create: (dir, name) => ipcRenderer.invoke(CHANNELS.notesCreate, { dir, name }),
    remove: (path) => ipcRenderer.invoke(CHANNELS.notesRemove, { path }),
    all: () => ipcRenderer.invoke(CHANNELS.notesAll)
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
