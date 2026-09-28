import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { DayView } from '@shared/types'

import { api, errorMessage } from '../api'

function todayIso(): string {
  const now = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Vue Jour : notes libres et activité fusionnées, avec navigation par date. */
export const useDayStore = defineStore('day', () => {
  const date = ref(todayIso())
  const view = ref<DayView | null>(null)
  const days = ref<string[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function load(target = date.value): Promise<void> {
    loading.value = true
    date.value = target
    try {
      view.value = await api.journal.day(target)
      days.value = await api.journal.days()
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  function shift(days_: number): Promise<void> {
    const [year, month, day] = date.value.split('-').map(Number)
    const next = new Date(year ?? 2026, (month ?? 1) - 1, (day ?? 1) + days_)
    const pad = (n: number): string => n.toString().padStart(2, '0')
    return load(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`)
  }

  function goToday(): Promise<void> {
    return load(todayIso())
  }

  const isToday = (): boolean => date.value === todayIso()

  return { date, view, days, loading, error, load, shift, goToday, isToday, todayIso }
})
