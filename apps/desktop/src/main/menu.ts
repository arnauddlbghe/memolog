import { Menu, app, shell, type MenuItemConstructorOptions } from 'electron'

import { emit } from './events.js'
import { setQuitting } from './window.js'

export const APP_NAME = 'Memolog'

/**
 * Menu de l'application.
 *
 * Sans menu explicite, Electron en installe un par défaut intitulé
 * « Electron » — et sur macOS les raccourcis d'édition (copier, coller,
 * annuler) ne fonctionnent que parce qu'un élément de menu leur est associé.
 * Celui-ci porte donc à la fois le nom de l'app et ces rôles.
 */
export function buildMenu(): void {
  const isMac = process.platform === 'darwin'

  const appMenu: MenuItemConstructorOptions[] = isMac
    ? [
        {
          label: APP_NAME,
          submenu: [
            { role: 'about', label: `À propos de ${APP_NAME}` },
            { type: 'separator' },
            {
              label: 'Paramètres…',
              accelerator: 'CmdOrCtrl+,',
              click: () => emit('navigate', { view: 'settings' })
            },
            { type: 'separator' },
            { role: 'hide', label: `Masquer ${APP_NAME}` },
            { role: 'hideOthers', label: 'Masquer les autres' },
            { role: 'unhide', label: 'Tout afficher' },
            { type: 'separator' },
            {
              label: `Quitter ${APP_NAME}`,
              accelerator: 'Cmd+Q',
              click: () => {
                setQuitting(true)
                app.quit()
              }
            }
          ]
        }
      ]
    : []

  const template: MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Rechercher',
          accelerator: 'CmdOrCtrl+K',
          click: () => emit('navigate', { view: 'search' })
        },
        { type: 'separator' },
        ...(isMac
          ? [{ role: 'close' as const, label: 'Fermer la fenêtre' }]
          : [
              {
                label: 'Paramètres…',
                accelerator: 'CmdOrCtrl+,',
                click: () => emit('navigate', { view: 'settings' })
              },
              { type: 'separator' as const },
              {
                label: `Quitter ${APP_NAME}`,
                accelerator: 'Alt+F4',
                click: () => {
                  setQuitting(true)
                  app.quit()
                }
              }
            ])
      ]
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' }
      ]
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'resetZoom', label: 'Taille normale' },
        { role: 'zoomIn', label: 'Agrandir' },
        { role: 'zoomOut', label: 'Réduire' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
        ...(app.isPackaged
          ? []
          : [{ role: 'toggleDevTools' as const, label: 'Outils de développement' }])
      ]
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Format des fichiers',
          click: () => {
            void shell.openExternal('https://github.com/memolog/memolog/blob/main/docs/format.md')
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
