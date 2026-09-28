import { describe, expect, it } from 'vitest'

import type {
  ActivityLog,
  ArchiveResult,
  TaskDraft,
  TaskMutation,
  TaskQuery,
  TaskRepository
} from '../../src/domain/ports.js'
import type { ActivityAuthor, ActivityPayload, AnyActivityEvent, Task } from '../../src/domain/types.js'
import { TaskService } from '../../src/services/task-service.js'

const AT = new Date(2026, 8, 28, 14, 32)

/**
 * Dépôt de tâches entièrement en mémoire : aucun fichier, aucun Markdown.
 * Le service doit fonctionner tel quel avec lui — c'est la preuve que la
 * logique ne dépend pas du stockage.
 */
class FakeTaskRepository implements TaskRepository {
  private readonly items = new Map<string, Task>()
  private counter = 1
  archived: Task[] = []

  constructor(seed: Task[] = []) {
    for (const task of seed) {
      this.items.set(task.id, task)
      this.counter = Math.max(this.counter, Number(task.id.slice(1)) + 1)
    }
  }

  async all(query: TaskQuery = {}): Promise<Task[]> {
    return [...this.items.values()].filter(
      (task) =>
        query.includeClosed !== false || (task.state !== 'terminee' && task.state !== 'abandonnee')
    )
  }

  async find(id: string): Promise<Task | null> {
    return this.items.get(id) ?? null
  }

  async add(draft: TaskDraft, at: Date): Promise<Task> {
    const id = `t${this.counter++}`
    const iso = at.toISOString().slice(0, 10)
    const task: Task = {
      id,
      state: draft.state ?? 'a-faire',
      text: draft.text,
      description: draft.description ?? '',
      project: draft.project ?? 'Divers',
      created: iso,
      updated: iso,
      path: 'memoire',
      line: this.items.size + 1,
      indent: 0,
      tags: [],
      extraFields: {}
    }
    this.items.set(id, task)
    return task
  }

  async setState(id: string, state: Task['state'], at: Date): Promise<TaskMutation> {
    const task = this.items.get(id)
    if (task === undefined) throw new Error(`inconnue: ${id}`)
    if (task.state === state) {
      return { task, previousState: task.state, previousText: task.text, changed: false }
    }
    const next: Task = { ...task, state, updated: at.toISOString().slice(0, 10) }
    this.items.set(id, next)
    return { task: next, previousState: task.state, previousText: task.text, changed: true }
  }

  async setText(id: string, text: string, at: Date): Promise<TaskMutation> {
    const task = this.items.get(id)
    if (task === undefined) throw new Error(`inconnue: ${id}`)
    if (task.text === text) {
      return { task, previousState: task.state, previousText: task.text, changed: false }
    }
    const next: Task = { ...task, text, updated: at.toISOString().slice(0, 10) }
    this.items.set(id, next)
    return { task: next, previousState: task.state, previousText: task.text, changed: true }
  }

  async setDescription(id: string, description: string, at: Date): Promise<TaskMutation> {
    const task = this.items.get(id)
    if (task === undefined) throw new Error(`inconnue: ${id}`)
    if (task.description === description) {
      return { task, previousState: task.state, previousText: task.text, changed: false }
    }
    const next: Task = { ...task, description, updated: at.toISOString().slice(0, 10) }
    this.items.set(id, next)
    return { task: next, previousState: task.state, previousText: task.text, changed: true }
  }

  async archive(tasks: Task[]): Promise<ArchiveResult> {
    for (const task of tasks) this.items.delete(task.id)
    this.archived.push(...tasks)
    return { archived: tasks, targets: ['memoire/archive'] }
  }

  async ensureMetadata(): Promise<Task[]> {
    return []
  }
}

class FakeActivityLog implements ActivityLog {
  readonly events: AnyActivityEvent[] = []

  async append(author: ActivityAuthor, payload: ActivityPayload, at: Date): Promise<AnyActivityEvent> {
    const event = { ts: at.toISOString(), auteur: author, ...payload } as AnyActivityEvent
    this.events.push(event)
    return event
  }

  async readDay(): Promise<AnyActivityEvent[]> {
    return this.events
  }
}

function makeService(seed: Task[] = []) {
  const tasks = new FakeTaskRepository(seed)
  const activity = new FakeActivityLog()
  return { service: new TaskService({ tasks, activity, clock: () => AT }), tasks, activity }
}

function task(partial: Partial<Task> & { id: string }): Task {
  return {
    state: 'a-faire',
    text: 'Tâche',
    description: '',
    project: 'Divers',
    created: '2026-09-01',
    updated: '2026-09-01',
    path: 'memoire',
    line: 1,
    indent: 0,
    tags: [],
    extraFields: {},
    ...partial
  }
}

describe('création', () => {
  it('enregistre la tâche et journalise', async () => {
    const { service, activity } = makeService()
    const created = await service.create('Relancer', 'Infra')

    expect(created.id).toBe('t1')
    expect(activity.events).toHaveLength(1)
    expect(activity.events[0]).toMatchObject({
      type: 'tache.creee',
      auteur: 'vous',
      tache: 't1',
      projet: 'Infra'
    })
  })

  it('attribue l auteur demandé, pour le futur CLI ou Claude', async () => {
    const { service, activity } = makeService()
    await service.create('Écrite ailleurs', 'Infra', undefined, { author: 'claude' })
    expect(activity.events[0]).toMatchObject({ auteur: 'claude' })
  })
})

describe('changements d état', () => {
  it('journalise la transition', async () => {
    const { service, activity } = makeService([task({ id: 't1' })])
    await service.setState('t1', 'en-cours')
    expect(activity.events[0]).toMatchObject({
      type: 'tache.etat',
      de: 'a-faire',
      vers: 'en-cours'
    })
  })

  it('ne journalise rien quand l état ne change pas', async () => {
    const { service, activity } = makeService([task({ id: 't1' })])
    await service.setState('t1', 'a-faire')
    expect(activity.events).toHaveLength(0)
  })

  it('suit le cycle du clic', async () => {
    const { service } = makeService([task({ id: 't1' })])
    expect((await service.cycleState('t1')).state).toBe('en-cours')
    expect((await service.cycleState('t1')).state).toBe('terminee')
    expect((await service.cycleState('t1')).state).toBe('a-faire')
  })
})

describe('description', () => {
  it('est enregistrée à la création', async () => {
    const { service } = makeService()
    const created = await service.create('Relancer', 'Infra', 'Ils attendent le devis signé.')
    expect(created.description).toBe('Ils attendent le devis signé.')
  })

  it('peut être modifiée ensuite, et c est journalisé', async () => {
    const { service, activity } = makeService([task({ id: 't1', text: 'Relancer' })])
    const updated = await service.describe('t1', 'Deux lignes\nde contexte.')
    expect(updated.description).toBe('Deux lignes\nde contexte.')
    expect(activity.events[0]).toMatchObject({ type: 'tache.modifiee', tache: 't1' })
  })

  it('reste silencieuse si rien ne change', async () => {
    const { service, activity } = makeService([task({ id: 't1', description: 'Idem' })])
    await service.describe('t1', 'Idem')
    expect(activity.events).toHaveLength(0)
  })
})

describe('renommage', () => {
  it('journalise le nouveau titre', async () => {
    const { service, activity } = makeService([task({ id: 't1', text: 'Avant' })])
    await service.rename('t1', 'Après')
    expect(activity.events[0]).toMatchObject({ type: 'tache.modifiee', titre: 'Après' })
  })

  it('reste silencieux si le texte est identique', async () => {
    const { service, activity } = makeService([task({ id: 't1', text: 'Pareil' })])
    await service.rename('t1', 'Pareil')
    expect(activity.events).toHaveLength(0)
  })
})

describe('sélections', () => {
  it('liste les tâches qui dorment', async () => {
    const { service } = makeService([
      task({ id: 't1', updated: '2026-09-01' }),
      task({ id: 't2', updated: '2026-09-27' })
    ])
    expect((await service.dormant(7)).map((item) => item.id)).toEqual(['t1'])
  })

  it('archive les tâches fermées assez anciennes', async () => {
    const { service, tasks } = makeService([
      task({ id: 't1', state: 'terminee', updated: '2026-01-01' }),
      task({ id: 't2', state: 'terminee', updated: '2026-09-27' }),
      task({ id: 't3', state: 'a-faire', updated: '2026-01-01' })
    ])
    const report = await service.archiveClosed(30)
    expect(report.archived.map((item) => item.id)).toEqual(['t1'])
    expect(tasks.archived).toHaveLength(1)
  })

  it('ne touche à rien quand il n y a rien à archiver', async () => {
    const { service } = makeService([task({ id: 't1' })])
    expect(await service.archiveClosed(30)).toEqual({ archived: [], targets: [] })
  })
})
