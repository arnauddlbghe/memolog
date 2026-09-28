import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { SearchHit } from '@shared/types'

import { api, errorMessage } from '../api'

/** Recherche plein texte : résultats instantanés, requêtes débouncées. */
export const useSearchStore = defineStore('search', () => {
  const query = ref('')
  const hits = ref<SearchHit[]>([])
  const running = ref(false)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setTimeout> | null = null

  async function run(): Promise<void> {
    const text = query.value.trim()
    if (text === '') {
      hits.value = []
      return
    }
    running.value = true
    try {
      hits.value = await api.search.query(text, 40)
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      running.value = false
    }
  }

  /** La frappe ne déclenche qu'une requête, une fois la saisie posée. */
  function search(text: string): void {
    query.value = text
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => void run(), 120)
  }

  function clear(): void {
    query.value = ''
    hits.value = []
  }

  return { query, hits, running, error, search, run, clear }
})
