import { globalShortcut } from 'electron'

import type { ShortcutStatus } from '../shared/types.js'

/**
 * Raccourcis globaux.
 *
 * Un raccourci peut être déjà pris par le système ou par une autre app ;
 * ce n'est pas une erreur fatale : on le signale à l'interface, qui invite à
 * en choisir un autre dans les paramètres.
 */
export interface ShortcutBinding {
  accelerator: string
  action: () => void
}

let lastStatus: ShortcutStatus = { shortcut: '', registered: true }

export function getShortcutStatus(): ShortcutStatus {
  return lastStatus
}

export function registerShortcuts(bindings: ShortcutBinding[]): ShortcutStatus[] {
  globalShortcut.unregisterAll()
  const statuses: ShortcutStatus[] = []

  for (const binding of bindings) {
    const accelerator = binding.accelerator.trim()
    if (accelerator === '') continue

    let registered = false
    let error: string | undefined
    try {
      registered = globalShortcut.register(accelerator, binding.action)
      if (!registered) {
        error = `Le raccourci ${accelerator} est déjà utilisé par le système ou une autre application.`
      }
    } catch (cause) {
      registered = false
      error = `Le raccourci ${accelerator} n'est pas valide (${String(cause)}).`
    }

    statuses.push(error === undefined ? { shortcut: accelerator, registered } : { shortcut: accelerator, registered, error })
  }

  const failed = statuses.find((status) => !status.registered)
  lastStatus = failed ?? statuses[0] ?? { shortcut: '', registered: true }
  return statuses
}

/**
 * Vérifie qu'un raccourci est libre, sans le conserver.
 * Utilisé par les paramètres au moment de la saisie.
 */
export function testShortcut(accelerator: string): ShortcutStatus {
  const trimmed = accelerator.trim()
  if (trimmed === '') {
    return { shortcut: '', registered: false, error: 'Raccourci vide.' }
  }
  if (globalShortcut.isRegistered(trimmed)) {
    // Déjà enregistré par nous-mêmes : c'est donc qu'il fonctionne.
    return { shortcut: trimmed, registered: true }
  }
  try {
    const ok = globalShortcut.register(trimmed, () => undefined)
    if (ok) globalShortcut.unregister(trimmed)
    return ok
      ? { shortcut: trimmed, registered: true }
      : {
          shortcut: trimmed,
          registered: false,
          error: 'Ce raccourci est déjà utilisé par le système ou une autre application.'
        }
  } catch (cause) {
    return { shortcut: trimmed, registered: false, error: `Raccourci invalide (${String(cause)}).` }
  }
}

export function unregisterAll(): void {
  globalShortcut.unregisterAll()
}
