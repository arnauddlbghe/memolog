/**
 * Erreurs du coeur métier. Le code est stable : il traverse l'IPC et servira
 * aussi au futur CLI / serveur MCP, qui doivent pouvoir réagir sans lire le
 * message (potentiellement traduit).
 */
export type MemologErrorCode =
  | 'invalid-path'
  | 'outside-root'
  | 'invalid-name'
  | 'not-found'
  | 'already-exists'
  | 'not-a-note'
  | 'conflict'
  | 'io'

export class MemologError extends Error {
  readonly code: MemologErrorCode

  constructor(code: MemologErrorCode, message: string) {
    super(message)
    this.name = 'MemologError'
    this.code = code
  }
}

export function isMemologError(value: unknown): value is MemologError {
  return value instanceof MemologError
}
