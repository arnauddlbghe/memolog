/**
 * Dates et heures, toujours **locales**.
 *
 * Memolog est une application personnelle sur une seule machine : une entrée
 * de 23:50 doit rester dans la journée de l'utilisateur, pas basculer au
 * lendemain parce que UTC en a décidé autrement.
 */

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/** `AAAA-MM-JJ` en heure locale. */
export function formatLocalDate(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** `HH:MM` en heure locale. */
export function formatLocalTime(date: Date = new Date()): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/** ISO 8601 avec le décalage local, ex. `2026-09-28T14:32:05+02:00`. */
export function formatLocalIso(date: Date = new Date()): string {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const absolute = Math.abs(offset)
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  return `${formatLocalDate(date)}T${time}${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`
}

/** Analyse une date `AAAA-MM-JJ` locale. `null` si la forme ne convient pas. */
export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Nombre de jours pleins écoulés entre deux dates locales (jours calendaires). */
export function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / 86_400_000)
}

/** Âge en jours d'une date `AAAA-MM-JJ`. `null` si elle est illisible. */
export function ageInDays(isoDate: string, now: Date = new Date()): number | null {
  const date = parseLocalDate(isoDate)
  return date === null ? null : daysBetween(date, now)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
