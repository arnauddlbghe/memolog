import type { MemologApi } from '@shared/api'

/** Accès unique au pont exposé par le preload. */
export const api: MemologApi = window.memolog

/**
 * Les erreurs traversent l'IPC sous la forme `[code] message`.
 * On les remet en forme pour pouvoir réagir au code côté interface.
 */
export interface ApiError {
  code: string
  message: string
}

export function parseError(error: unknown): ApiError {
  const raw = error instanceof Error ? error.message : String(error)
  const match = /\[([a-z-]+)\]\s*(?:Error:\s*)?([\s\S]*)$/.exec(raw)
  if (match === null) return { code: 'io', message: raw }
  return { code: match[1] ?? 'io', message: (match[2] ?? raw).trim() }
}

/** Message court et lisible, à afficher tel quel dans l'interface. */
export function errorMessage(error: unknown): string {
  return parseError(error).message
}
