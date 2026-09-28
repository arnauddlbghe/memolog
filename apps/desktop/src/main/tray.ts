import path from 'node:path'

import { Menu, Tray, app, nativeImage } from 'electron'

import { emit } from './events.js'
import { showWindow, toggleWindow } from './window.js'

let tray: Tray | null = null

function resourcePath(file: string): string {
  // En dev les ressources sont dans le paquet ; une fois empaqueté elles sont
  // copiées à côté de l'asar (`extraResources`).
  return app.isPackaged
    ? path.join(process.resourcesPath, file)
    : path.join(__dirname, '../../resources', file)
}

function trayIcon(): Electron.NativeImage {
  const file = process.platform === 'darwin' ? 'trayTemplate.png' : 'icon.png'
  const image = nativeImage.createFromPath(resourcePath(file))
  if (process.platform === 'darwin') {
    // Image « template » : macOS la teinte lui-même selon le thème de la barre.
    image.setTemplateImage(true)
    return image
  }
  return image.resize({ width: 16, height: 16 })
}

export interface TrayActions {
  onOpenJournal: () => void
  onQuit: () => void
}

/**
 * Icône de la barre système : c'est elle qui rappelle que Memolog tourne en
 * arrière-plan, et le seul endroit d'où l'on quitte vraiment l'application.
 */
export function createTray(actions: TrayActions): Tray {
  if (tray !== null && !tray.isDestroyed()) return tray

  tray = new Tray(trayIcon())
  tray.setToolTip('Memolog')

  const menu = Menu.buildFromTemplate([
    { label: 'Afficher Memolog', click: () => showWindow() },
    { label: 'Note du jour', click: actions.onOpenJournal },
    { type: 'separator' },
    {
      label: 'Paramètres…',
      click: () => {
        showWindow()
        emit('navigate', { view: 'settings' })
      }
    },
    { type: 'separator' },
    { label: 'Quitter Memolog', click: actions.onQuit }
  ])

  tray.setContextMenu(menu)
  // Sur Windows et Linux, un clic simple affiche la fenêtre ; sur macOS le
  // clic ouvre le menu, c'est la convention du système.
  tray.on('click', () => {
    if (process.platform !== 'darwin') toggleWindow()
  })

  return tray
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
