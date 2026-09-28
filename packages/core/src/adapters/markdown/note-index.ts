/**
 * Implémentation en mémoire du port `NoteIndex`, alimentée par les fichiers
 * Markdown du dossier de notes.
 *
 * Ce qui est gardé en mémoire est volontairement maigre : les tâches (peu
 * nombreuses et courtes), les références, et pour chaque tag la liste des
 * jours où il apparaît. Le texte des notes n'est jamais conservé — seul
 * l'index inversé de la recherche l'est, sous forme de termes.
 *
 * Une implémentation SQLite du même port remplacerait ce fichier sans rien
 * changer au domaine ni aux services.
 */
import type { IndexReport, NoteIndex, TaskFilter } from '../../domain/ports.js'
import { normalizeKey } from '../../domain/tags.js'
import { isActive } from '../../domain/task-rules.js'
import { journalDateOf, parseEntries } from './journal-file.js'
import { readNote } from './notes.js'
import { extractRefs } from './refs.js'
import { SearchIndex, type SearchIndexCache } from './search.js'
import { isTaskFile, parseTaskDocument } from './task-file.js'
import { walkNotes } from './tree.js'
import type { ProjectSummary, RelPath, SearchHit, Task, TaskRef } from '../../domain/types.js'
import type { Vault } from '../fs/vault.js'

export const PROJECTS_DIR = 'projets'

interface FileFacts {
  tagKeys: string[]
  refIds: string[]
  taskIds: string[]
  journalDay: string | null
}

export class MemoryNoteIndex implements NoteIndex {
  constructor(private readonly vault: Vault) {}

  private readonly search_ = SearchIndex.create()
  private readonly tasksById = new Map<string, Task>()
  /** Tâches par fichier, pour pouvoir remplacer un fichier d'un bloc. */
  private readonly tasksByFile = new Map<RelPath, Task[]>()
  private readonly refsById = new Map<string, TaskRef[]>()
  private readonly refsByFile = new Map<RelPath, TaskRef[]>()
  /** clé de tag → jours de journal, et forme d'affichage du tag. */
  private readonly daysByTag = new Map<string, Set<string>>()
  private readonly tagDisplay = new Map<string, string>()
  private readonly entriesByDay = new Map<string, number>()
  private readonly projectNotes = new Map<string, RelPath>()
  private readonly facts = new Map<RelPath, FileFacts>()

  get noteCount(): number {
    return this.search_.size
  }

  get taskCount(): number {
    return this.tasksById.size
  }

  /** Ressources actuellement indexées. */
  get paths(): RelPath[] {
    return [...this.facts.keys()]
  }

  /** Cache sérialisable de la seule partie coûteuse à reconstruire. */
  toSearchCache(root: string): SearchIndexCache {
    return this.search_.toCache(root)
  }

  loadSearchCache(cache: unknown, root: string): boolean {
    return this.search_.load(cache, root)
  }

  async sync(): Promise<IndexReport> {
    const seen = new Set<RelPath>()
    let added = 0
    let updated = 0

    for await (const note of walkNotes(this.vault)) {
      seen.add(note.path)
      const stat = { mtimeMs: note.mtimeMs, size: note.size }
      const known = this.facts.has(note.path)
      if (known && !this.search_.isStale(note.path, stat)) continue

      try {
        const content = await readNote(this.vault, note.path)
        this.updateResource(note.path, content.content, stat)
        if (known) updated += 1
        else added += 1
      } catch {
        // Fichier disparu entre le parcours et la lecture : on l'ignore.
      }
    }

    let removed = 0
    for (const path of [...this.facts.keys()]) {
      if (!seen.has(path)) {
        this.removeResource(path)
        removed += 1
      }
    }

    return {
      added,
      updated,
      removed,
      noteCount: this.noteCount,
      taskCount: this.taskCount
    }
  }

  updateResource(path: RelPath, content: string, stat: { mtimeMs: number; size: number }): void {
    this.forget(path)
    this.search_.upsert(path, content, stat)

    const facts: FileFacts = { tagKeys: [], refIds: [], taskIds: [], journalDay: null }

    // Tâches : uniquement dans taches.md et ses archives (docs/format.md §4).
    if (isTaskFile(path)) {
      const doc = parseTaskDocument(path, content)
      this.tasksByFile.set(path, doc.tasks)
      for (const task of doc.tasks) {
        if (task.id === '') continue
        this.tasksById.set(task.id, task)
        facts.taskIds.push(task.id)
      }
    }

    // Références @tNN : dans n'importe quelle note.
    const refs = extractRefs(path, content)
    if (refs.length > 0) {
      this.refsByFile.set(path, refs)
      for (const ref of refs) {
        this.refsById.set(ref.id, [...(this.refsById.get(ref.id) ?? []), ref])
        facts.refIds.push(ref.id)
      }
    }

    // Journal : tags du jour, pour la vue Projet et la liste des projets.
    const day = journalDateOf(path)
    if (day !== null) {
      const iso = path.slice('journal/'.length, -'.md'.length)
      facts.journalDay = iso
      const entries = parseEntries(content)
      this.entriesByDay.set(iso, entries.length)

      const tags = new Set<string>()
      const collect = (list: Array<{ effectiveTags: string[]; children: unknown[] }>): void => {
        for (const bullet of list) {
          for (const tag of bullet.effectiveTags) {
            const key = normalizeKey(tag)
            tags.add(key)
            if (!this.tagDisplay.has(key)) this.tagDisplay.set(key, tag)
          }
          collect(bullet.children as Array<{ effectiveTags: string[]; children: unknown[] }>)
        }
      }
      collect(entries)

      for (const key of tags) {
        const days = this.daysByTag.get(key) ?? new Set<string>()
        days.add(iso)
        this.daysByTag.set(key, days)
        facts.tagKeys.push(key)
      }
    }

    // Fiches projet.
    if (path.startsWith(`${PROJECTS_DIR}/`) && path.endsWith('.md')) {
      const name = path.slice(PROJECTS_DIR.length + 1, -'.md'.length)
      this.projectNotes.set(normalizeKey(name), path)
      if (!this.tagDisplay.has(normalizeKey(name))) this.tagDisplay.set(normalizeKey(name), name)
    }

    this.facts.set(path, facts)
  }

  removeResource(path: RelPath): void {
    this.forget(path)
    this.search_.remove(path)
    this.facts.delete(path)
  }

  /** Retire tout ce que ce fichier avait apporté à l'index. */
  private forget(path: RelPath): void {
    const facts = this.facts.get(path)
    if (facts === undefined) return

    for (const id of facts.taskIds) this.tasksById.delete(id)
    this.tasksByFile.delete(path)

    for (const id of facts.refIds) {
      const remaining = (this.refsById.get(id) ?? []).filter((ref) => ref.path !== path)
      if (remaining.length === 0) this.refsById.delete(id)
      else this.refsById.set(id, remaining)
    }
    this.refsByFile.delete(path)

    if (facts.journalDay !== null) {
      this.entriesByDay.delete(facts.journalDay)
      for (const key of facts.tagKeys) {
        const days = this.daysByTag.get(key)
        if (days === undefined) continue
        days.delete(facts.journalDay)
        if (days.size === 0) this.daysByTag.delete(key)
      }
    }

    if (path.startsWith(`${PROJECTS_DIR}/`)) {
      const name = path.slice(PROJECTS_DIR.length + 1, -'.md'.length)
      this.projectNotes.delete(normalizeKey(name))
    }
  }

  search(query: string, limit = 30): SearchHit[] {
    return this.search_.search(query, limit)
  }

  suggest(query: string, limit = 5): string[] {
    return this.search_.suggest(query, limit)
  }

  tasks(filter: TaskFilter = {}): Task[] {
    const wanted = filter.project === undefined ? null : normalizeKey(filter.project)
    return [...this.tasksById.values()]
      .filter((task) => filter.states === undefined || filter.states.includes(task.state))
      .filter((task) => filter.active === undefined || isActive(task) === filter.active)
      .filter((task) => wanted === null || normalizeKey(task.project) === wanted)
      .sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
  }

  task(id: string): Task | null {
    return this.tasksById.get(id) ?? null
  }

  refsTo(id: string): TaskRef[] {
    return this.refsById.get(id) ?? []
  }

  daysForTag(tag: string): string[] {
    return [...(this.daysByTag.get(normalizeKey(tag)) ?? [])].sort().reverse()
  }

  journalDays(): string[] {
    return [...this.entriesByDay.keys()].sort().reverse()
  }

  /**
   * Un projet existe dès qu'il apparaît quelque part : section de
   * `taches.md`, tag du journal, ou fiche `projets/<nom>.md`.
   */
  projects(): ProjectSummary[] {
    const summaries = new Map<string, ProjectSummary>()

    const ensure = (name: string): ProjectSummary => {
      const key = normalizeKey(name)
      const existing = summaries.get(key)
      if (existing !== undefined) return existing
      const created: ProjectSummary = {
        name: this.tagDisplay.get(key) ?? name,
        key,
        notePath: this.projectNotes.get(key) ?? null,
        openTaskCount: 0,
        closedTaskCount: 0,
        journalEntryCount: 0,
        lastActivity: null
      }
      summaries.set(key, created)
      return created
    }

    for (const task of this.tasksById.values()) {
      const summary = ensure(task.project)
      if (isActive(task)) summary.openTaskCount += 1
      else summary.closedTaskCount += 1
      if (summary.lastActivity === null || task.updated > summary.lastActivity) {
        summary.lastActivity = task.updated
      }
    }

    for (const [key, days] of this.daysByTag) {
      const summary = ensure(this.tagDisplay.get(key) ?? key)
      summary.journalEntryCount += days.size
      const latest = [...days].sort().pop() ?? null
      if (latest !== null && (summary.lastActivity === null || latest > summary.lastActivity)) {
        summary.lastActivity = latest
      }
    }

    for (const [key, path] of this.projectNotes) {
      const summary = ensure(this.tagDisplay.get(key) ?? key)
      summary.notePath = path
    }

    return [...summaries.values()].sort((a, b) => {
      if (a.lastActivity === b.lastActivity) return a.name.localeCompare(b.name, 'fr')
      if (a.lastActivity === null) return 1
      if (b.lastActivity === null) return -1
      return b.lastActivity.localeCompare(a.lastActivity)
    })
  }
}

export function createNoteIndex(vault: Vault): MemoryNoteIndex {
  return new MemoryNoteIndex(vault)
}
