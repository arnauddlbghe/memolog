/**
 * Correspondance entre les marques Markdown `[ ]`, `[/]`, `[>]`, `[x]`, `[-]`
 * et les états du domaine. C'est la seule endroit qui connaît cette syntaxe.
 */
import type { TaskState } from '../../domain/types.js'

const MARK_TO_STATE: Record<string, TaskState> = {
  ' ': 'a-faire',
  '/': 'en-cours',
  '>': 'reportee',
  x: 'terminee',
  X: 'terminee',
  '-': 'abandonnee'
}

const STATE_TO_MARK: Record<TaskState, string> = {
  'a-faire': ' ',
  'en-cours': '/',
  reportee: '>',
  terminee: 'x',
  abandonnee: '-'
}

/** Une marque inconnue est lue comme « à faire » et normalisée à l'écriture. */
export function stateFromMark(mark: string): TaskState {
  return MARK_TO_STATE[mark] ?? 'a-faire'
}

export function markFromState(state: TaskState): string {
  return STATE_TO_MARK[state]
}
