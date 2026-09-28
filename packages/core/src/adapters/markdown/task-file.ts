/**
 * Représentation Markdown des tâches : `taches.md` et ses archives.
 *
 * Adaptateur de stockage : il ne connaît que la syntaxe
 * (`- [x] … ^t42 [créée:: …]`) et la préservation du fichier. Les règles
 * métier (états, âge, archivabilité) vivent dans `domain/task-rules.ts`.
 *
 * Toutes les transformations sont pures et préservent intégralement ce
 * qu'elles n'ont pas écrit : paragraphes, sous-titres, champs inconnus,
 * indentation. Voir `docs/format.md` §4.
 */
import { formatLocalDate } from '../../domain/dates.js'
import { MemologError } from '../../domain/errors.js'
import { normalizeKey } from '../../domain/tags.js'
import { DEFAULT_PROJECT, type RelPath, type Task, type TaskState } from '../../domain/types.js'
import { joinRel } from '../fs/paths.js'
import { extractTags, indentWidth } from './bullets.js'
import { markFromState, stateFromMark } from './task-marks.js'

export const TASKS_FILE = 'taches.md'
export const ARCHIVE_DIR = 'taches'

export function archivePathFor(year: number | string): RelPath {
  return joinRel(ARCHIVE_DIR, `archive-${year}.md`)
}

export function isTaskFile(relPath: string): boolean {
  return relPath === TASKS_FILE || /^taches\/archive-\d{4}\.md$/.test(relPath)
}

// --- Analyse d'une ligne ---------------------------------------------------

const TASK_LINE = /^(\s*)([-*+])\s+\[([^\]])\]\s?(.*)$/
const SECTION = /^##\s+(.+?)\s*$/
const FENCE = /^\s*(```|~~~)/
const TASK_ID = /\s*\^t(\d+)\b/
const INLINE_FIELD = /\[([^[\]:]+)::\s*([^\]]*)\]/g

const FIELD_CREATED = 'creee'
const FIELD_UPDATED = 'maj'

export interface ParsedTaskLine {
  indent: number
  bullet: string
  state: TaskState
  text: string
  id: string | null
  created: string | null
  updated: string | null
  extraFields: Record<string, string>
}

/** Décompose une ligne de tâche. `null` si la ligne n'en est pas une. */
export function parseTaskLine(line: string): ParsedTaskLine | null {
  const match = TASK_LINE.exec(line)
  if (match === null) return null

  const [, indent = '', bullet = '-', mark = ' ', rest = ''] = match

  let remainder = rest
  let id: string | null = null
  const idMatch = TASK_ID.exec(remainder)
  if (idMatch !== null) {
    id = `t${idMatch[1]}`
    remainder = remainder.replace(TASK_ID, '')
  }

  let created: string | null = null
  let updated: string | null = null
  const extraFields: Record<string, string> = {}

  remainder = remainder.replace(INLINE_FIELD, (_whole, rawKey: string, rawValue: string) => {
    const key = normalizeKey(rawKey)
    const value = rawValue.trim()
    if (key === FIELD_CREATED) created = value
    else if (key === FIELD_UPDATED) updated = value
    else extraFields[rawKey.trim()] = value
    return ''
  })

  return {
    indent: indentWidth(indent),
    bullet,
    state: stateFromMark(mark),
    text: remainder.replace(/\s{2,}/g, ' ').trim(),
    id,
    created,
    updated,
    extraFields
  }
}

/** Reconstruit une ligne de tâche dans la forme canonique du format. */
export function formatTaskLine(task: {
  indent: number
  state: TaskState
  text: string
  id: string
  created: string
  updated: string
  extraFields?: Record<string, string>
}): string {
  const fields = [
    `[créée:: ${task.created}]`,
    `[maj:: ${task.updated}]`,
    ...Object.entries(task.extraFields ?? {}).map(([key, value]) => `[${key}:: ${value}]`)
  ]
  return `${' '.repeat(task.indent)}- [${markFromState(task.state)}] ${task.text} ^${task.id} ${fields.join(' ')}`
}

// --- Document de tâches ----------------------------------------------------

export interface TaskDocument {
  path: RelPath
  lines: string[]
  tasks: Task[]
  /**
   * Dernière ligne (à partir de 1) du bloc de chaque tâche, description
   * comprise. Aligné sur `tasks`.
   */
  blockEnds: number[]
  /** Le fichier se terminait-il par un saut de ligne ? */
  trailingNewline: boolean
}

/**
 * Analyse un fichier de tâches : sections `##` et lignes de tâches.
 * Les lignes sont conservées telles quelles pour permettre une réécriture
 * sans perte.
 */
export function parseTaskDocument(path: RelPath, content: string): TaskDocument {
  const trailingNewline = content.endsWith('\n')
  const body = trailingNewline ? content.slice(0, -1) : content
  const lines = body === '' ? [] : body.split('\n')

  const tasks: Task[] = []
  const blockEnds: number[] = []
  let project = DEFAULT_PROJECT
  let inFence = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const section = SECTION.exec(line)
    if (section !== null) {
      project = (section[1] ?? DEFAULT_PROJECT).trim() || DEFAULT_PROJECT
      continue
    }

    const parsed = parseTaskLine(line)
    if (parsed === null) continue

    const description = collectDescription(lines, i, parsed.indent)

    tasks.push({
      id: parsed.id ?? '',
      state: parsed.state,
      text: parsed.text,
      description: description.text,
      project,
      created: parsed.created ?? '',
      updated: parsed.updated ?? '',
      path,
      line: i + 1,
      indent: parsed.indent,
      tags: extractTags(parsed.text),
      extraFields: parsed.extraFields
    })
    blockEnds.push(description.endLine)
  }

  return { path, lines, tasks, blockEnds, trailingNewline }
}

/**
 * Lignes de description qui suivent une tâche : plus indentées qu'elle, non
 * vides, et qui ne sont pas elles-mêmes des tâches (`docs/format.md` §4.3).
 */
function collectDescription(
  lines: string[],
  taskIndex: number,
  taskIndent: number
): { text: string; endLine: number } {
  const collected: string[] = []
  let index = taskIndex + 1

  while (index < lines.length) {
    const line = lines[index] ?? ''
    if (line.trim() === '') break
    const indent = indentWidth(/^\s*/.exec(line)?.[0] ?? '')
    if (indent <= taskIndent) break
    if (parseTaskLine(line) !== null) break
    collected.push(line)
    index += 1
  }

  if (collected.length === 0) return { text: '', endLine: taskIndex + 1 }

  // On retire l'indentation commune pour rendre un texte propre.
  const common = Math.min(
    ...collected.map((line) => indentWidth(/^\s*/.exec(line)?.[0] ?? ''))
  )
  const text = collected
    .map((line) => line.replace(/^\s*/, (prefix) => ' '.repeat(Math.max(0, indentWidth(prefix) - common))))
    .join('\n')
  return { text, endLine: index }
}

/** Lignes de description telles qu'elles seront écrites dans le fichier. */
export function formatDescription(description: string, indent: number): string[] {
  const trimmed = description.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (trimmed === '') return []
  const prefix = ' '.repeat(indent + 2)
  return trimmed.split('\n').map((line) => `${prefix}${line}`.replace(/\s+$/, ''))
}

/** Ligne de tâche et sa description, prêtes à être insérées. */
export function formatTaskBlock(task: {
  indent: number
  state: TaskState
  text: string
  description?: string
  id: string
  created: string
  updated: string
  extraFields?: Record<string, string>
}): string[] {
  return [formatTaskLine(task), ...formatDescription(task.description ?? '', task.indent)]
}

/** Le format impose un fichier terminé par exactement un saut de ligne. */
export function renderTaskDocument(doc: TaskDocument): string {
  const body = doc.lines.join('\n')
  return body.trim() === '' ? '' : `${body.replace(/\n+$/, '')}\n`
}

function reparse(doc: TaskDocument): TaskDocument {
  return parseTaskDocument(doc.path, renderTaskDocument(doc))
}

// --- Transformations pures -------------------------------------------------

export interface MetadataResult {
  doc: TaskDocument
  /** Tâches qui viennent de recevoir un identifiant ou une date. */
  completed: Task[]
  nextId: number
}

/**
 * Complète les tâches écrites à la main : identifiant manquant, `créée` ou
 * `maj` absents. Compléter n'est pas modifier : `maj` prend la date du jour
 * seulement s'il n'existait pas.
 */
export function ensureTaskMetadata(
  doc: TaskDocument,
  nextId: number,
  at: Date = new Date()
): MetadataResult {
  const today = formatLocalDate(at)
  const lines = [...doc.lines]
  const completed: Task[] = []
  let counter = nextId

  for (const task of doc.tasks) {
    const needsId = task.id === ''
    const needsCreated = task.created === ''
    const needsUpdated = task.updated === ''
    if (!needsId && !needsCreated && !needsUpdated) continue

    const id = needsId ? `t${counter++}` : task.id
    const created = needsCreated ? today : task.created
    const updated = needsUpdated ? today : task.updated

    lines[task.line - 1] = formatTaskLine({
      indent: task.indent,
      state: task.state,
      text: task.text,
      id,
      created,
      updated,
      extraFields: task.extraFields
    })
    completed.push({ ...task, id, created, updated })
  }

  const next = reparse({ ...doc, lines })
  return { doc: next, completed, nextId: counter }
}

export interface MutationResult {
  doc: TaskDocument
  task: Task
  /** État avant modification, pour le journal d'activité. */
  previousState: TaskState
  previousText: string
  /** La ligne a-t-elle réellement changé ? */
  changed: boolean
}

function requireTask(doc: TaskDocument, id: string): Task {
  const task = doc.tasks.find((candidate) => candidate.id === id)
  if (task === undefined) {
    throw new MemologError('not-found', `Tâche introuvable : ^${id}`)
  }
  return task
}

/** Change l'état d'une tâche et met `maj` à jour. */
export function setTaskStateInDocument(
  doc: TaskDocument,
  id: string,
  state: TaskState,
  at: Date = new Date()
): MutationResult {
  const task = requireTask(doc, id)
  if (task.state === state) {
    return { doc, task, previousState: task.state, previousText: task.text, changed: false }
  }
  return applyTask(doc, task, { state }, at)
}

/** Change le texte d'une tâche et met `maj` à jour. */
export function setTaskTextInDocument(
  doc: TaskDocument,
  id: string,
  text: string,
  at: Date = new Date()
): MutationResult {
  const task = requireTask(doc, id)
  const trimmed = text.trim()
  if (trimmed === '') {
    throw new MemologError('invalid-name', 'Le texte d’une tâche ne peut pas être vide.')
  }
  if (trimmed === task.text) {
    return { doc, task, previousState: task.state, previousText: task.text, changed: false }
  }
  return applyTask(doc, task, { text: trimmed }, at)
}

/** Change la description d'une tâche et met `maj` à jour. */
export function setTaskDescriptionInDocument(
  doc: TaskDocument,
  id: string,
  description: string,
  at: Date = new Date()
): MutationResult {
  const task = requireTask(doc, id)
  const next = description.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (next === task.description) {
    return { doc, task, previousState: task.state, previousText: task.text, changed: false }
  }
  return applyTask(doc, task, { description: next }, at)
}

function applyTask(
  doc: TaskDocument,
  task: Task,
  patch: Partial<Pick<Task, 'state' | 'text' | 'description'>>,
  at: Date
): MutationResult {
  const today = formatLocalDate(at)
  const updatedTask: Task = {
    ...task,
    ...patch,
    updated: today,
    created: task.created === '' ? today : task.created
  }

  // Le bloc entier (ligne + description) est remplacé d'un coup.
  const index = doc.tasks.indexOf(task)
  const end = doc.blockEnds[index] ?? task.line
  const lines = [...doc.lines]
  lines.splice(task.line - 1, end - task.line + 1, ...formatTaskBlock(updatedTask))

  return {
    doc: reparse({ ...doc, lines }),
    task: { ...updatedTask, tags: extractTags(updatedTask.text) },
    previousState: task.state,
    previousText: task.text,
    changed: true
  }
}

export interface AddTaskOptions {
  project?: string
  state?: TaskState
  description?: string
  at?: Date
}

export interface AddTaskResult {
  doc: TaskDocument
  task: Task
}

/**
 * Ajoute une tâche à la fin de sa section, en créant la section si besoin.
 * La section par défaut est `## Divers`.
 */
export function addTaskToDocument(
  doc: TaskDocument,
  text: string,
  id: string,
  options: AddTaskOptions = {}
): AddTaskResult {
  const trimmed = text.trim()
  if (trimmed === '') {
    throw new MemologError('invalid-name', 'Le texte d’une tâche ne peut pas être vide.')
  }

  const at = options.at ?? new Date()
  const today = formatLocalDate(at)
  const project = (options.project ?? DEFAULT_PROJECT).trim() || DEFAULT_PROJECT
  const state = options.state ?? 'a-faire'

  const block = formatTaskBlock({
    indent: 0,
    state,
    text: trimmed,
    description: options.description ?? '',
    id,
    created: today,
    updated: today
  })
  const next = insertRawTaskLine(doc, project, block)
  const task = next.tasks.find((candidate) => candidate.id === id)
  if (task === undefined) {
    throw new MemologError('io', "La tâche ajoutée est introuvable après relecture.")
  }
  return { doc: next, task }
}

/**
 * Insère une ligne de tâche déjà formée dans la section d'un projet.
 * Utilisé à la création comme à l'archivage, où la ligne doit être recopiée
 * telle quelle (identifiant et dates inchangés).
 */
export function insertRawTaskLine(
  doc: TaskDocument,
  project: string,
  rawBlock: string | string[]
): TaskDocument {
  const block = Array.isArray(rawBlock) ? rawBlock : [rawBlock]
  const lines = [...doc.lines]
  const insertAt = findInsertionPoint(lines, doc, project)

  if (insertAt.createSection) {
    if (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() !== '') lines.push('')
    lines.push(`## ${project}`, '', ...block)
  } else {
    lines.splice(insertAt.index, 0, ...block)
  }
  return reparse({ ...doc, lines })
}

/** Où insérer une tâche : après la dernière tâche de la section visée. */
function findInsertionPoint(
  lines: string[],
  doc: TaskDocument,
  project: string
): { index: number; createSection: boolean } {
  const key = normalizeKey(project)
  let sectionStart = -1
  let sectionEnd = lines.length

  for (let i = 0; i < lines.length; i += 1) {
    const section = SECTION.exec(lines[i] ?? '')
    if (section === null) continue
    if (sectionStart !== -1) {
      sectionEnd = i
      break
    }
    if (normalizeKey(section[1] ?? '') === key) sectionStart = i
  }

  // Tâches avant toute section : elles appartiennent à « Divers ».
  if (sectionStart === -1 && key === normalizeKey(DEFAULT_PROJECT)) {
    const implicit = doc.tasks.filter((task) => task.project === DEFAULT_PROJECT)
    const hasSection = lines.some((line) => SECTION.test(line))
    if (implicit.length > 0 && !hasSection) {
      const last = implicit[implicit.length - 1]
      return { index: (last?.line ?? 0), createSection: false }
    }
  }

  if (sectionStart === -1) return { index: lines.length, createSection: true }

  let lastLine = sectionStart
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    const taskIndex = doc.tasks.findIndex((task) => task.line === i + 1)
    if (taskIndex !== -1) lastLine = (doc.blockEnds[taskIndex] ?? i + 1) - 1
  }
  return { index: lastLine + 1, createSection: false }
}

/** Retire des lignes de tâches du document, en conservant le reste. */
/** Retire des tâches du document, description comprise, en gardant le reste. */
export function removeTasksFromDocument(doc: TaskDocument, ids: string[]): TaskDocument {
  const targets = new Set(ids)
  const toRemove = new Set<number>()

  doc.tasks.forEach((task, index) => {
    if (!targets.has(task.id)) return
    const end = doc.blockEnds[index] ?? task.line
    for (let line = task.line; line <= end; line += 1) toRemove.add(line - 1)
  })

  if (toRemove.size === 0) return doc
  const lines = doc.lines.filter((_line, index) => !toRemove.has(index))
  return reparse({ ...doc, lines })
}

