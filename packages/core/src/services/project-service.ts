/**
 * Cas d'usage des projets : liste, et rassemblement de tout ce qui concerne
 * un projet (fiche, tâches groupées par état, jours de journal tagués).
 *
 * Le service ne lit rien directement : il interroge l'index et les dépôts.
 */
import { STATE_LABELS, taskAge } from '../domain/task-rules.js'
import { normalizeKey } from '../domain/tags.js'
import type { NoteIndex, NoteRepository } from '../domain/ports.js'
import type { ProjectSummary, Task, TaskState } from '../domain/types.js'

export interface ProjectServiceDeps {
  index: NoteIndex
  notes: NoteRepository
  clock?: () => Date
}

export interface TaskWithAge {
  task: Task
  /** Jours depuis la dernière mise à jour, `null` si la date est illisible. */
  ageDays: number | null
}

export interface ProjectGroup {
  state: TaskState
  label: string
  tasks: TaskWithAge[]
}

export interface ProjectDetail {
  summary: ProjectSummary
  /** Contenu de la fiche `projets/<nom>.md`, si elle existe. */
  note: { path: string; content: string } | null
  groups: ProjectGroup[]
  /** Jours de journal portant ce tag, du plus récent au plus ancien. */
  days: string[]
}

export class ProjectService {
  private readonly index: NoteIndex
  private readonly notes: NoteRepository
  private readonly clock: () => Date

  constructor(deps: ProjectServiceDeps) {
    this.index = deps.index
    this.notes = deps.notes
    this.clock = deps.clock ?? ((): Date => new Date())
  }

  list(): ProjectSummary[] {
    return this.index.projects()
  }

  async detail(name: string): Promise<ProjectDetail | null> {
    const key = normalizeKey(name)
    const summary = this.index.projects().find((project) => project.key === key)
    if (summary === undefined) return null

    const now = this.clock()
    const tasks = this.index.tasks({ project: key })
    const groups: ProjectGroup[] = []
    for (const [state, label] of Object.entries(STATE_LABELS) as Array<[TaskState, string]>) {
      const inState = tasks
        .filter((task) => task.state === state)
        .map((task) => ({ task, ageDays: taskAge(task, now) }))
      if (inState.length > 0) groups.push({ state, label, tasks: inState })
    }

    let note: ProjectDetail['note'] = null
    if (summary.notePath !== null) {
      try {
        const loaded = await this.notes.read(summary.notePath)
        note = { path: loaded.path, content: loaded.content }
      } catch {
        note = null
      }
    }

    return { summary, note, groups, days: this.index.daysForTag(key) }
  }
}
