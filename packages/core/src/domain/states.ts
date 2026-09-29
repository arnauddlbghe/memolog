/**
 * Les états d'une conversation, sans notion de stockage.
 *
 * Quatre états, une bulle colorée par état. C'est tout le vocabulaire de
 * suivi de l'application : pas de sous-états, pas de priorités.
 */
import { formatLocalDate } from './dates.js'
import { CONVERSATION_STATES, type ConversationState, type StateChange } from './types.js'

export const STATE_LABELS: Record<ConversationState, string> = {
  'a-faire': 'À faire',
  'en-cours': 'En cours',
  'a-reprendre': 'À reprendre',
  termine: 'Terminé'
}

/** Couleur de la bulle, comme repère stable dans l'interface. */
export const STATE_COLORS: Record<ConversationState, string> = {
  'a-faire': 'gris',
  'en-cours': 'ambre',
  'a-reprendre': 'rouge',
  termine: 'vert'
}

export const DEFAULT_STATE: ConversationState = 'a-faire'

export function isConversationState(value: unknown): value is ConversationState {
  return typeof value === 'string' && CONVERSATION_STATES.includes(value as ConversationState)
}

/**
 * Lecture tolérante : accents, casse et variantes d'écriture d'un état lu
 * dans un fichier modifié à la main.
 */
export function parseState(value: string): ConversationState | null {
  const key = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[\s_]+/g, '-')

  switch (key) {
    case 'a-faire':
    case 'afaire':
      return 'a-faire'
    case 'en-cours':
    case 'encours':
      return 'en-cours'
    case 'a-reprendre':
    case 'areprendre':
    case 'a-continuer':
      return 'a-reprendre'
    case 'termine':
    case 'fini':
    case 'fait':
      return 'termine'
    default:
      return null
  }
}

export function isOpen(state: ConversationState): boolean {
  return state !== 'termine'
}

/**
 * Ajoute un changement à l'historique, daté du jour.
 * Reposer le même état n'ajoute rien : l'historique dit ce qui a changé.
 */
export function recordChange(
  history: StateChange[],
  state: ConversationState,
  at: Date = new Date()
): StateChange[] {
  const last = history[history.length - 1]
  if (last?.state === state) return history
  return [...history, { date: formatLocalDate(at), state }]
}

/** Date du dernier changement, ou `null` si l'historique est vide. */
export function lastChangeDate(history: StateChange[]): string | null {
  return history[history.length - 1]?.date ?? null
}
