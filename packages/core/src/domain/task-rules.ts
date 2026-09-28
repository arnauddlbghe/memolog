/**
 * Règles métier des tâches, sans aucune notion de fichier.
 *
 * Rien ici ne sait que les tâches sont écrites dans du Markdown : ce module
 * resterait identique si elles vivaient dans une base ou derrière une API.
 * La syntaxe `- [x]` et les champs en ligne appartiennent à
 * `adapters/markdown/task-file.ts`.
 */
import { ageInDays } from './dates.js'
import { CLOSED_STATES, type Task, type TaskState } from './types.js'

/** Les cinq états possibles, dans l'ordre d'affichage. */
export const TASK_STATES: readonly TaskState[] = [
  'a-faire',
  'en-cours',
  'reportee',
  'terminee',
  'abandonnee'
]

export const STATE_LABELS: Record<TaskState, string> = {
  'a-faire': 'À faire',
  'en-cours': 'En cours',
  reportee: 'Reportée',
  terminee: 'Terminée',
  abandonnee: 'Abandonnée'
}

/** Cycle parcouru par un clic sur la case ; les autres états passent par le menu. */
const CLICK_CYCLE: readonly TaskState[] = ['a-faire', 'en-cours', 'terminee']

export function isClosed(state: TaskState): boolean {
  return CLOSED_STATES.includes(state)
}

export function isActive(task: Task): boolean {
  return !isClosed(task.state)
}

/** État suivant lors d'un clic sur la case. */
export function nextState(state: TaskState): TaskState {
  const index = CLICK_CYCLE.indexOf(state)
  // Un état hors cycle (reportée, abandonnée) y revient par « à faire ».
  if (index === -1) return 'a-faire'
  return CLICK_CYCLE[(index + 1) % CLICK_CYCLE.length] ?? 'a-faire'
}

/**
 * Tâches « qui dorment » : actives et sans mise à jour depuis `days` jours.
 * Triées de la plus ancienne à la plus récente.
 */
export function dormantTasks(tasks: Task[], days = 7, now: Date = new Date()): Task[] {
  return tasks
    .filter((task) => isActive(task))
    .map((task) => ({ task, age: ageInDays(task.updated, now) }))
    .filter((item): item is { task: Task; age: number } => item.age !== null && item.age >= days)
    .sort((a, b) => b.age - a.age)
    .map((item) => item.task)
}

/** Tâches fermées depuis plus de `days` jours : candidates à l'archivage. */
export function archivableTasks(tasks: Task[], days = 30, now: Date = new Date()): Task[] {
  return tasks.filter((task) => {
    if (!isClosed(task.state)) return false
    const age = ageInDays(task.updated, now)
    return age !== null && age >= days
  })
}

/** Année d'archivage d'une tâche : celle de sa date de dernière mise à jour. */
export function archiveYearOf(task: Task, now: Date = new Date()): string {
  const year = task.updated.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : String(now.getFullYear())
}

/** Âge d'une tâche depuis sa dernière mise à jour, en jours. */
export function taskAge(task: Task, now: Date = new Date()): number | null {
  return ageInDays(task.updated, now)
}

/** Plus grand identifiant numérique rencontré, 0 si aucun. */
export function highestTaskId(tasks: Array<{ id: string }>): number {
  let highest = 0
  for (const task of tasks) {
    const value = Number(task.id.replace(/^t/, ''))
    if (Number.isFinite(value) && value > highest) highest = value
  }
  return highest
}

/** Identifiant canonique à partir d'un numéro. */
export function taskIdOf(n: number): string {
  return `t${n}`
}
