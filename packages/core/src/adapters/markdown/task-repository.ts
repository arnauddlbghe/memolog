/**
 * Implémentation du port `TaskRepository` au-dessus de `taches.md` et de ses
 * archives.
 *
 * Elle ne fait que persister : aucune règle métier, aucun événement
 * d'activité. C'est le `TaskService` qui orchestre, au-dessus du port.
 */
import { highestTaskId, taskIdOf } from '../../domain/task-rules.js'
import { normalizeKey } from '../../domain/tags.js'
import type {
  ArchiveResult,
  TaskDraft,
  TaskMutation,
  TaskQuery,
  TaskRepository
} from '../../domain/ports.js'
import type { RelPath, Task, TaskState } from '../../domain/types.js'
import { abs, statRel, type Vault } from '../fs/vault.js'
import { joinRel } from '../fs/paths.js'
import { readNote, writeNote } from './notes.js'
import { raiseFloor, readVaultState, writeVaultState } from './state.js'
import {
  ARCHIVE_DIR,
  TASKS_FILE,
  addTaskToDocument,
  archivePathFor,
  ensureTaskMetadata,
  formatTaskBlock,
  insertRawTaskLine,
  parseTaskDocument,
  removeTasksFromDocument,
  renderTaskDocument,
  setTaskDescriptionInDocument,
  setTaskStateInDocument,
  setTaskTextInDocument,
  type TaskDocument
} from './task-file.js'
import { archiveYearOf, isClosed } from '../../domain/task-rules.js'

export class MarkdownTaskRepository implements TaskRepository {
  constructor(private readonly vault: Vault) {}

  private async load(path: RelPath = TASKS_FILE): Promise<TaskDocument> {
    const stat = await statRel(this.vault, path)
    if (stat === null) return parseTaskDocument(path, '')
    const note = await readNote(this.vault, path)
    return parseTaskDocument(path, note.content)
  }

  private async save(doc: TaskDocument): Promise<void> {
    await writeNote(this.vault, doc.path, renderTaskDocument(doc))
  }

  /** Fichiers d'archive existants, du plus récent au plus ancien. */
  async archiveFiles(): Promise<RelPath[]> {
    const entries = await this.vault.fs.readDir(abs(this.vault, ARCHIVE_DIR)).catch(() => [])
    return entries
      .filter((entry) => entry.kind === 'file' && /^archive-\d{4}\.md$/.test(entry.name))
      .map((entry) => joinRel(ARCHIVE_DIR, entry.name))
      .sort()
      .reverse()
  }

  async all(query: TaskQuery = {}): Promise<Task[]> {
    const { includeArchived = false, includeClosed = true } = query
    const docs = [await this.load()]
    if (includeArchived) {
      for (const path of await this.archiveFiles()) docs.push(await this.load(path))
    }

    const wanted = query.project === undefined ? null : normalizeKey(query.project)
    return docs
      .flatMap((doc) => doc.tasks)
      .filter((task) => includeClosed || !isClosed(task.state))
      .filter((task) => query.states === undefined || query.states.includes(task.state))
      .filter((task) => wanted === null || normalizeKey(task.project) === wanted)
  }

  async find(id: string): Promise<Task | null> {
    const tasks = await this.all({ includeArchived: true })
    return tasks.find((task) => task.id === id) ?? null
  }

  /**
   * Prochain identifiant libre : le compteur de `.memolog/state.json`, relevé
   * au besoin au-dessus du plus grand identifiant déjà écrit. Un identifiant
   * n'est jamais réutilisé, même si le fichier d'état a disparu.
   */
  private async nextId(docs: TaskDocument[]): Promise<number> {
    const highest = Math.max(0, ...docs.map((doc) => highestTaskId(doc.tasks)))
    return raiseFloor(await readVaultState(this.vault), highest).nextTaskId
  }

  private async commitNextId(nextId: number): Promise<void> {
    const state = await readVaultState(this.vault)
    if (nextId > state.nextTaskId) await writeVaultState(this.vault, { nextTaskId: nextId })
  }

  async add(draft: TaskDraft, at: Date): Promise<Task> {
    const doc = await this.load()
    const archives = await Promise.all((await this.archiveFiles()).map((path) => this.load(path)))
    const id = taskIdOf(await this.nextId([doc, ...archives]))

    const result = addTaskToDocument(doc, draft.text, id, {
      ...(draft.project === undefined ? {} : { project: draft.project }),
      ...(draft.state === undefined ? {} : { state: draft.state }),
      ...(draft.description === undefined ? {} : { description: draft.description }),
      at
    })
    await this.save(result.doc)
    await this.commitNextId(Number(id.slice(1)) + 1)
    return result.task
  }

  async setState(id: string, state: TaskState, at: Date): Promise<TaskMutation> {
    const doc = await this.load()
    const result = setTaskStateInDocument(doc, id, state, at)
    if (result.changed) await this.save(result.doc)
    return toMutation(result)
  }

  async setText(id: string, text: string, at: Date): Promise<TaskMutation> {
    const doc = await this.load()
    const result = setTaskTextInDocument(doc, id, text, at)
    if (result.changed) await this.save(result.doc)
    return toMutation(result)
  }

  async setDescription(id: string, description: string, at: Date): Promise<TaskMutation> {
    const doc = await this.load()
    const result = setTaskDescriptionInDocument(doc, id, description, at)
    if (result.changed) await this.save(result.doc)
    return toMutation(result)
  }

  async ensureMetadata(at: Date): Promise<Task[]> {
    const doc = await this.load()
    const archives = await Promise.all((await this.archiveFiles()).map((path) => this.load(path)))
    const result = ensureTaskMetadata(doc, await this.nextId([doc, ...archives]), at)
    if (result.completed.length === 0) return []

    await this.save(result.doc)
    await this.commitNextId(result.nextId)
    return result.completed
  }

  /** Archiver, c'est déplacer : la ligne est recopiée telle quelle. */
  async archive(tasks: Task[], at: Date): Promise<ArchiveResult> {
    if (tasks.length === 0) return { archived: [], targets: [] }

    const byYear = new Map<string, Task[]>()
    for (const task of tasks) {
      const year = archiveYearOf(task, at)
      byYear.set(year, [...(byYear.get(year) ?? []), task])
    }

    const targets: string[] = []
    for (const [year, yearTasks] of byYear) {
      const path = archivePathFor(year)
      let archive = await this.load(path)
      for (const task of yearTasks) {
        // Archiver, c'est déplacer : le bloc entier suit, description comprise.
        archive = insertRawTaskLine(archive, task.project, formatTaskBlock(task))
      }
      await this.save(archive)
      targets.push(path)
    }

    const doc = await this.load()
    await this.save(
      removeTasksFromDocument(
        doc,
        tasks.map((task) => task.id)
      )
    )
    return { archived: tasks, targets }
  }
}

function toMutation(result: {
  task: Task
  previousState: TaskState
  previousText: string
  changed: boolean
}): TaskMutation {
  return {
    task: result.task,
    previousState: result.previousState,
    previousText: result.previousText,
    changed: result.changed
  }
}
