import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { ProjectDetail, ProjectSummary } from '@shared/types'

import { api, errorMessage } from '../api'

/** Liste des projets et fiche détaillée du projet ouvert. */
export const useProjectsStore = defineStore('projects', () => {
  const list = ref<ProjectSummary[]>([])
  const detail = ref<ProjectDetail | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await api.projects.list()
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  async function open(name: string): Promise<void> {
    loading.value = true
    try {
      detail.value = await api.projects.detail(name)
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  function close(): void {
    detail.value = null
  }

  return { list, detail, loading, error, load, open, close }
})
