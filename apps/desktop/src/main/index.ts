import { app, nativeTheme } from 'electron'

import { AppState } from './app-state.js'
import { emit } from './events.js'
import { registerIpc } from './ipc.js'
import { getSettings, loadSettings, onSettingsChanged } from './settings.js'
import { registerShortcuts, unregisterAll } from './shortcuts.js'
import { createTray, destroyTray } from './tray.js'
import type { Settings } from '../shared/types.js'
import { createWindow, setQuitting, showWindow, toggleWindow } from './window.js'

// Une seule instance : le raccourci global n'aurait aucun sens en double.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let state: AppState | null = null

function applyTheme(settings: Settings): void {
  nativeTheme.themeSource = settings.theme
}

/**
 * Lancement au démarrage de session. Le réglage est toujours poussé vers le
 * système, y compris à `false` : désactiver dans les paramètres doit vraiment
 * retirer Memolog des ouvertures automatiques.
 */
function applyLaunchAtLogin(settings: Settings): void {
  if (!app.isPackaged) return // en dev, ne pas polluer les réglages du système
  app.setLoginItemSettings({
    openAtLogin: settings.launchAtLogin,
    // Sur Windows et Linux, l'argument dit à l'instance lancée de rester
    // dans la barre système ; macOS l'ignore.
    args: settings.startHidden ? ['--hidden'] : []
  })
}

function applyShortcuts(settings: Settings): void {
  const statuses = registerShortcuts([
    { accelerator: settings.shortcut, action: () => toggleWindow() },
    {
      accelerator: settings.journalShortcut,
      action: () => {
        showWindow()
        emit('navigate', { view: 'journal' })
      }
    }
  ])
  const failed = statuses.find((status) => !status.registered)
  if (failed !== undefined) emit('shortcut:status', failed)
}

app.on('second-instance', () => showWindow())

app.whenReady().then(async () => {
  const settings = loadSettings()
  applyTheme(settings)
  applyLaunchAtLogin(settings)

  state = new AppState()
  registerIpc(state)

  createWindow(settings)
  createTray({
    onOpenJournal: () => {
      showWindow()
      emit('navigate', { view: 'journal' })
    },
    onQuit: () => {
      setQuitting(true)
      app.quit()
    }
  })

  applyShortcuts(settings)

  // La première ouverture doit toujours être visible : c'est là qu'on
  // explique le principe de l'application et où l'on choisit le dossier.
  const hiddenLaunch = settings.startHidden && process.argv.includes('--hidden')
  if (!settings.onboardingDone || !hiddenLaunch) showWindow()

  // Tant que la première ouverture n'est pas validée, on ne crée aucun
  // dossier : l'utilisateur n'a pas encore dit où il voulait ranger ses notes.
  if (settings.onboardingDone) await state.attachRoot(settings.root)

  onSettingsChanged((next) => {
    applyTheme(next)
    applyLaunchAtLogin(next)
    applyShortcuts(next)
    state?.applySettings(next)
    emit('settings:changed', next)
  })

  app.on('activate', () => {
    createWindow(getSettings())
    showWindow()
  })
})

// La fenêtre fermée, l'app continue de vivre dans la barre système.
app.on('window-all-closed', () => undefined)

app.on('before-quit', async () => {
  setQuitting(true)
  unregisterAll()
  destroyTray()
  await state?.dispose()
})
