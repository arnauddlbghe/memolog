import { EVENT_CHANNEL } from '../shared/api.js'
import type { MemologEventName, MemologEvents } from '../shared/types.js'
import { getWindow } from './window.js'

/**
 * Un seul canal pour tous les événements principal → renderer, avec le nom
 * de l'événement dans la charge utile. Le preload se contente de filtrer :
 * aucune surface IPC supplémentaire à exposer.
 */
export function emit<E extends MemologEventName>(event: E, data: MemologEvents[E]): void {
  const window = getWindow()
  if (window === null || window.isDestroyed()) return
  window.webContents.send(EVENT_CHANNEL, { event, data })
}
