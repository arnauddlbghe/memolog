import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Task, TaskState, TaskWithAge } from '@shared/types'

import { api, errorMessage } from '../api'

export type StateFilter = TaskState | 'toutes'

/**
 * Tâches actives et tâches qui dorment.
 *
 * Le process principal reste la source de vérité : après chaque mutation on
 * recharge, plutôt que de deviner le nouvel état localement.
 */
export const useTasksStore = defineStore('tasks', () => {
  const tasks = ref<Task[]>([])
  const dormant = ref<TaskWithAge[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const stateFilter = ref<StateFilter>('toutes')
  const projectFilter = ref<string | null>(null)

  const active = computed(() => tasks.value.filter((task) => isActiveState(task.state)))

  const projects = computed(() => {
    const names = new Map<string, string>()
    for (const task of tasks.value) names.set(task.project.toLowerCase(), task.project)
    return [...names.values()].sort((a, b) => a.localeCompare(b, 'fr'))
  })

  const visible = computed(() =>
    active.value
      .filter((task) => stateFilter.value === 'toutes' || task.state === stateFilter.value)
      .filter(
        (task) =>
          projectFilter.value === null ||
          task.project.toLowerCase() === projectFilter.value.toLowerCase()
      )
  )

  async function load(): Promise<void> {
    loading.value = true
    try {
      tasks.value = await api.tasks.list({ includeClosed: false })
      dormant.value = await api.tasks.dormant()
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  async function create(text: string, project?: string, description?: string): Promise<Task | null> {
    try {
      const task = await api.tasks.create(text, project, description)
      await load()
      return task
    } catch (cause) {
      error.value = errorMessage(cause)
      return null
    }
  }

  async function cycle(id: string): Promise<void> {
    await api.tasks.cycle(id)
    await load()
  }

  async function setState(id: string, state: TaskState): Promise<void> {
    await api.tasks.setState(id, state)
    await load()
  }

  async function rename(id: string, text: string): Promise<void> {
    await api.tasks.rename(id, text)
    await load()
  }

  async function describe(id: string, description: string): Promise<void> {
    await api.tasks.describe(id, description)
    await load()
  }

  async function archive(): Promise<number> {
    const report = await api.tasks.archive()
    await load()
    return report.archived.length
  }

  return {
    tasks,
    dormant,
    loading,
    error,
    stateFilter,
    projectFilter,
    active,
    visible,
    projects,
    load,
    create,
    cycle,
    setState,
    rename,
    describe,
    archive
  }
})

function isActiveState(state: TaskState): boolean {
  return state !== 'terminee' && state !== 'abandonnee'
}
