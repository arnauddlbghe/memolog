import path from 'node:path'

import { BrowserWindow, shell } from 'electron'

import type { Settings } from '../shared/types.js'
import { updateSettings } from './settings.js'

let mainWindow: BrowserWindow | null = null
let quitting = false
let saveBoundsTimer: NodeJS.Timeout | null = null

export function setQuitting(value: boolean): void {
  quitting = value
}

export function getWindow(): BrowserWindow | null {
  return mainWindow
}

/**
 * Une seule fenêtre pour toute la durée de vie de l'app : on la masque, on ne
 * la détruit jamais. C'est ce qui rend la réapparition au raccourci instantanée.
 */
export function createWindow(settings: Settings): BrowserWindow {
  if (mainWindow !== null && !mainWindow.isDestroyed()) return mainWindow

  const bounds = settings.windowBounds
  mainWindow = new BrowserWindow({
    width: bounds?.width ?? 1100,
    height: bounds?.height ?? 720,
    ...(bounds?.x !== undefined && bounds.y !== undefined ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 620,
    minHeight: 420,
    show: false,
    title: 'Memolog',
    backgroundColor: settings.theme === 'dark' ? '#1b1b1f' : '#faf9f7',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // Le renderer n'a aucun accès à Node ni au disque.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true
    }
  })

  mainWindow.on('close', (event) => {
    // Fermer la fenêtre ne quitte pas l'application : elle reste dans la
    // barre système, prête à revenir au raccourci.
    if (!quitting) {
      event.preventDefault()
      hideWindow()
    }
  })

  mainWindow.on('resize', scheduleBoundsSave)
  mainWindow.on('move', scheduleBoundsSave)

  // Aucune navigation hors de l'app : les liens partent dans le navigateur.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL']
    if (devUrl !== undefined && url.startsWith(devUrl)) return
    event.preventDefault()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl !== undefined) {
    void mainWindow.loadURL(devUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function scheduleBoundsSave(): void {
  if (saveBoundsTimer !== null) clearTimeout(saveBoundsTimer)
  saveBoundsTimer = setTimeout(() => {
    if (mainWindow === null || mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    const { width, height, x, y } = mainWindow.getBounds()
    updateSettings({ windowBounds: { width, height, x, y } })
  }, 800)
  saveBoundsTimer.unref?.()
}

export function showWindow(): void {
  const window = mainWindow
  if (window === null || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function hideWindow(): void {
  const window = mainWindow
  if (window === null || window.isDestroyed()) return
  window.hide()
}

export function isWindowVisible(): boolean {
  return mainWindow !== null && !mainWindow.isDestroyed() && mainWindow.isVisible()
}

/** Le raccourci global : affiche si masquée, masque si déjà au premier plan. */
export function toggleWindow(): void {
  const window = mainWindow
  if (window === null || window.isDestroyed()) return
  if (window.isVisible() && window.isFocused()) hideWindow()
  else showWindow()
}
