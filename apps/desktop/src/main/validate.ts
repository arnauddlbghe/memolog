import { CONVERSATION_STATES, MemologError, type ConversationState } from '@memolog/core'

/**
 * Validation des arguments qui traversent l'IPC.
 *
 * Le renderer est du code de confiance, mais il reste la seule surface
 * extérieure du process principal : rien n'entre sans être vérifié, et les
 * chemins repassent ensuite par les garde-fous de `@memolog/core`.
 */
export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new MemologError('invalid-path', 'Arguments IPC invalides.')
  }
  return value as Record<string, unknown>
}

export function asString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new MemologError('invalid-path', `Champ « ${field} » : chaîne attendue.`)
  }
  return value
}

export function asOptionalString(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : asString(value, field)
}

export function asBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new MemologError('invalid-path', `Champ « ${field} » : booléen attendu.`)
  }
  return value
}

export function asOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

export function asNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new MemologError('invalid-path', `Champ « ${field} » : nombre attendu.`)
  }
  return value
}

export function asOptionalNumber(value: unknown, field: string): number | undefined {
  return value === undefined || value === null ? undefined : asNumber(value, field)
}

/** Un état de conversation, refusé s'il n'est pas l'un des quatre. */
export function asState(value: unknown): ConversationState {
  const state = asString(value, 'state')
  if (!CONVERSATION_STATES.includes(state as ConversationState)) {
    throw new MemologError('invalid-path', `État inconnu : ${state}`)
  }
  return state as ConversationState
}

/** Garde-fou de taille : une note de plus de 8 Mo n'est pas un usage normal. */
const MAX_CONTENT_BYTES = 8 * 1024 * 1024

export function asContent(value: unknown): string {
  const content = asString(value, 'content')
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) {
    throw new MemologError('io', 'Contenu trop volumineux pour être enregistré.')
  }
  return content
}
