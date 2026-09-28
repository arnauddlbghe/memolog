/**
 * Cas d'usage des tâches.
 *
 * Écrit **uniquement contre les ports** : ce service ne sait pas si les
 * tâches finissent dans `taches.md`, dans SQLite ou derrière une API. C'est
 * ici que vivent les enchaînements — créer une tâche puis journaliser,
 * changer un état puis journaliser — et c'est ici que le futur CLI et le
 * serveur MCP entreront, en changeant seulement l'auteur.
 */
import { archivableTasks, dormantTasks, nextState } from '../domain/task-rules.js'
import type { ActivityLog, ArchiveResult, TaskQuery, TaskRepository } from '../domain/ports.js'
import type { ActivityAuthor, Task, TaskState } from '../domain/types.js'

export interface TaskServiceDeps {
  tasks: TaskRepository
  activity: ActivityLog
  /** Injectable pour les tests ; par défaut, l'heure courante. */
  clock?: () => Date
}

export interface ActionContext {
  /** Qui agit. Par défaut l'utilisateur dans l'application. */
  author?: ActivityAuthor
  at?: Date
}

export class TaskService {
  private readonly tasks: TaskRepository
  private readonly activity: ActivityLog
  private readonly clock: () => Date

  constructor(deps: TaskServiceDeps) {
    this.tasks = deps.tasks
    this.activity = deps.activity
    this.clock = deps.clock ?? ((): Date => new Date())
  }

  private context(context: ActionContext = {}): { at: Date; author: ActivityAuthor } {
    return { at: context.at ?? this.clock(), author: context.author ?? 'vous' }
  }

  list(query?: TaskQuery): Promise<Task[]> {
    return this.tasks.all(query)
  }

  find(id: string): Promise<Task | null> {
    return this.tasks.find(id)
  }

  async create(
    text: string,
    project?: string,
    description?: string,
    context: ActionContext = {}
  ): Promise<Task> {
    const { at, author } = this.context(context)
    const task = await this.tasks.add(
      {
        text,
        ...(project === undefined ? {} : { project }),
        ...(description === undefined || description.trim() === '' ? {} : { description })
      },
      at
    )
    await this.activity.append(
      author,
      { type: 'tache.creee', tache: task.id, titre: task.text, projet: task.project },
      at
    )
    return task
  }

  async setState(id: string, state: TaskState, context: ActionContext = {}): Promise<Task> {
    const { at, author } = this.context(context)
    const mutation = await this.tasks.setState(id, state, at)
    if (!mutation.changed) return mutation.task

    // Un changement d'état n'est jamais regroupé : il a son propre événement.
    await this.activity.append(
      author,
      { type: 'tache.etat', tache: id, de: mutation.previousState, vers: state },
      at
    )
    return mutation.task
  }

  /** Clic sur la case : état suivant du cycle. */
  async cycleState(id: string, context: ActionContext = {}): Promise<Task> {
    const task = await this.tasks.find(id)
    return this.setState(id, task === null ? 'a-faire' : nextState(task.state), context)
  }

  async rename(id: string, text: string, context: ActionContext = {}): Promise<Task> {
    const { at, author } = this.context(context)
    const mutation = await this.tasks.setText(id, text, at)
    if (!mutation.changed) return mutation.task

    await this.activity.append(
      author,
      { type: 'tache.modifiee', tache: id, titre: mutation.task.text },
      at
    )
    return mutation.task
  }

  /** Change la description ; journalisé comme une modification de tâche. */
  async describe(id: string, description: string, context: ActionContext = {}): Promise<Task> {
    const { at, author } = this.context(context)
    const mutation = await this.tasks.setDescription(id, description, at)
    if (!mutation.changed) return mutation.task

    await this.activity.append(
      author,
      { type: 'tache.modifiee', tache: id, titre: mutation.task.text },
      at
    )
    return mutation.task
  }

  /** Complète les tâches écrites à la main (identifiant, dates). */
  ensureMetadata(context: ActionContext = {}): Promise<Task[]> {
    return this.tasks.ensureMetadata(this.context(context).at)
  }

  /** Tâches actives sans mise à jour depuis `days` jours. */
  async dormant(days = 7, context: ActionContext = {}): Promise<Task[]> {
    const { at } = this.context(context)
    return dormantTasks(await this.tasks.all({ includeClosed: false }), days, at)
  }

  /** Déplace vers l'archive les tâches fermées depuis plus de `days` jours. */
  async archiveClosed(days = 30, context: ActionContext = {}): Promise<ArchiveResult> {
    const { at } = this.context(context)
    const candidates = archivableTasks(await this.tasks.all(), days, at)
    if (candidates.length === 0) return { archived: [], targets: [] }
    return this.tasks.archive(candidates, at)
  }
}
