import { formatLocalDate, formatLocalTime } from '../../domain/dates.js'
import { createNote, ensureDir, readNote, writeNote } from './notes.js'
import { joinRel, normalizeRelPath } from '../fs/paths.js'
import { mergeTags } from '../../domain/tags.js'
import { extractTags, parseBullets, type ParsedBullet } from './bullets.js'
import type { JournalEntry, NoteContent, RelPath } from '../../domain/types.js'
import { statRel, type Vault } from '../fs/vault.js'

export const JOURNAL_DIR = 'journal'

/** Séparateur entre l'heure et le texte : tiret cadratin entouré d'espaces. */
export const ENTRY_SEPARATOR = ' — '

/**
 * Lecture tolérante (`docs/format.md` §2.2) : puce `-`, `*` ou `+`, heure sur
 * un ou deux chiffres, secondes facultatives, tiret cadratin, demi-cadratin
 * ou trait d'union.
 */
const ENTRY_HEAD = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*[—–-]\s*(.*)$/

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/** Date locale au format `AAAA-MM-JJ` (jamais UTC : le journal suit l'utilisateur). */
export const formatJournalDate = formatLocalDate

/** Heure locale au format `HH:MM`. */
export const formatEntryTime = formatLocalTime

export function journalPathFor(date: Date): RelPath {
  return joinRel(JOURNAL_DIR, `${formatJournalDate(date)}.md`)
}

/** Date d'une note de journal, ou `null` si le chemin n'en est pas une. */
export function journalDateOf(relPath: string): Date | null {
  const rel = normalizeRelPath(relPath)
  const match = /^journal\/(\d{4})-(\d{2})-(\d{2})\.md$/i.exec(rel)
  if (match === null) return null
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  return Number.isNaN(date.getTime()) ? null : date
}

export function isJournalPath(relPath: string): boolean {
  return journalDateOf(relPath) !== null
}

/**
 * Met en forme une entrée. Les sous-puces sont indentées de deux espaces et
 * restent des puces : une entrée, c'est une puce et ses sous-puces.
 */
export function formatEntry(text: string, at: Date): string {
  const lines = text.replace(/\r\n?/g, '\n').trim().split('\n')
  const [first = '', ...rest] = lines
  const head = `- ${formatEntryTime(at)}${ENTRY_SEPARATOR}${first.trim()}`
  if (rest.length === 0) return head
  return [
    head,
    ...rest
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => (line.startsWith('-') ? `  ${line}` : `  - ${line}`))
  ].join('\n')
}

/**
 * Entrées d'une note de journal, dans l'ordre du fichier, avec leurs
 * sous-puces et l'héritage des tags.
 *
 * Les puces de premier niveau qui ne commencent pas par une heure ne sont pas
 * des entrées : elles sont ignorées (mais conservées dans le fichier).
 */
export function parseEntries(content: string): JournalEntry[] {
  const entries: JournalEntry[] = []

  for (const bullet of parseBullets(content)) {
    const match = ENTRY_HEAD.exec(bullet.text)
    if (match === null) continue

    const [, hours = '0', minutes = '00', rest = ''] = match
    const text = rest.trim()
    const tags = extractTags(text)
    // Les tags de l'entrée se propagent à ses sous-puces.
    const children = reparent(bullet.children, tags)

    entries.push({
      ...bullet,
      time: `${pad2(Number(hours))}:${minutes}`,
      text,
      tags,
      effectiveTags: tags,
      children
    })
  }

  return entries
}

/**
 * Recalcule l'héritage des sous-puces à partir des tags de l'entrée.
 * `parseBullets` a vu la ligne complète (heure comprise) ; une fois l'heure
 * retirée, les tags de l'entrée sont les mêmes, mais on repart proprement.
 */
function reparent(children: ParsedBullet[], inherited: string[]): ParsedBullet[] {
  return children.map((child) => {
    const effectiveTags = mergeTags(inherited, child.tags)
    return { ...child, effectiveTags, children: reparent(child.children, effectiveTags) }
  })
}

/** Toutes les puces d'une entrée, l'entrée comprise. */
export function entryBullets(entry: JournalEntry): Array<ParsedBullet | JournalEntry> {
  const out: Array<ParsedBullet | JournalEntry> = [entry]
  const walk = (list: ParsedBullet[]): void => {
    for (const bullet of list) {
      out.push(bullet)
      walk(bullet.children)
    }
  }
  walk(entry.children)
  return out
}

/** Note du jour, créée à la volée si elle n'existe pas encore. */
export async function openJournalNote(vault: Vault, at: Date = new Date()): Promise<NoteContent> {
  const rel = journalPathFor(at)
  const stat = await statRel(vault, rel)
  if (stat !== null) return readNote(vault, rel)

  await ensureDir(vault, JOURNAL_DIR)
  return createNote(vault, JOURNAL_DIR, `${formatJournalDate(at)}.md`)
}

export interface AppendResult {
  path: RelPath
  /** Ligne de la première ligne de l'entrée ajoutée, à partir de 1. */
  line: number
  mtimeMs: number
}

/**
 * Ajoute une entrée horodatée à la fin de la note du jour.
 * Les entrées sont donc rangées du plus ancien au plus récent.
 */
export async function appendEntry(
  vault: Vault,
  text: string,
  at: Date = new Date()
): Promise<AppendResult> {
  const trimmed = text.trim()
  const note = await openJournalNote(vault, at)
  if (trimmed === '') {
    return { path: note.path, line: note.content.split('\n').length, mtimeMs: note.mtimeMs }
  }

  const entry = formatEntry(trimmed, at)
  const write = async (base: string, mtimeMs?: number): Promise<AppendResult | null> => {
    const body = base.replace(/\s*$/, '')
    const next = body === '' ? `${entry}\n` : `${body}\n${entry}\n`
    const line = next.slice(0, next.indexOf(entry)).split('\n').length
    const result = await writeNote(vault, note.path, next, {
      ...(mtimeMs === undefined ? {} : { baseMtimeMs: mtimeMs })
    })
    return result.ok ? { path: note.path, line, mtimeMs: result.mtimeMs } : null
  }

  const first = await write(note.content, note.mtimeMs)
  if (first !== null) return first

  // La note a changé sur le disque entre-temps : on relit et on réessaie.
  // Ajouter une entrée ne doit jamais échouer pour cette raison.
  const fresh = await readNote(vault, note.path)
  const retry = await write(fresh.content)
  return retry ?? { path: note.path, line: 1, mtimeMs: fresh.mtimeMs }
}
