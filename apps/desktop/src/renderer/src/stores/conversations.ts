import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { Conversation, ConversationState, ConversationSummary } from '@shared/types'

import { api, errorMessage } from '../api'

export interface DayGroup {
  /** Jour de création, `AAAA-MM-JJ`. */
  date: string
  label: string
  conversations: ConversationSummary[]
}

function todayIso(): string {
  const now = new Date()
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** « Aujourd'hui », « Hier », sinon la date en toutes lettres. */
export function dayLabel(iso: string): string {
  const today = todayIso()
  if (iso === today) return "Aujourd'hui"

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const yesterdayIso = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`
  if (iso === yesterdayIso) return 'Hier'

  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year ?? 2026, (month ?? 1) - 1, day ?? 1)
  const label = date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' })
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/**
 * Les conversations : la liste de gauche, et celle qui est ouverte.
 *
 * Le process principal reste la source de vérité ; après chaque écriture on
 * recharge, plutôt que de deviner le nouvel état localement.
 */
export const useConversationsStore = defineStore('conversations', () => {
  const list = ref<ConversationSummary[]>([])
  const currentPath = ref<string | null>(null)
  const current = shallowRef<Conversation | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /** Groupées par jour de création, du jour le plus récent au plus ancien. */
  const groups = computed<DayGroup[]>(() => {
    const byDay = new Map<string, ConversationSummary[]>()
    for (const item of list.value) {
      byDay.set(item.created, [...(byDay.get(item.created) ?? []), item])
    }

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, conversations]) => ({
        date,
        label: dayLabel(date),
        conversations: [...conversations].sort((a, b) => b.mtimeMs - a.mtimeMs)
      }))
  })

  const openCount = computed(
    () => list.value.filter((item) => item.state !== 'termine').length
  )

  async function load(): Promise<void> {
    loading.value = true
    try {
      list.value = await api.conversations.list()
      error.value = null
    } catch (cause) {
      error.value = errorMessage(cause)
    } finally {
      loading.value = false
    }
  }

  async function open(path: string): Promise<void> {
    currentPath.value = path
    try {
      current.value = await api.conversations.read(path)
      error.value = null
    } catch (cause) {
      current.value = null
      error.value = errorMessage(cause)
    }
  }

  async function create(name: string): Promise<string | null> {
    try {
      const created = await api.conversations.create(name)
      await load()
      await open(created.path)
      return created.path
    } catch (cause) {
      error.value = errorMessage(cause)
      return null
    }
  }

  async function setState(path: string, state: ConversationState): Promise<void> {
    const after = await api.conversations.setState(path, state)
    if (currentPath.value === path) current.value = after
    await load()
  }

  async function rename(path: string, name: string): Promise<void> {
    const next = await api.conversations.rename(path, name)
    await load()
    await open(next)
  }

  async function remove(path: string): Promise<void> {
    await api.conversations.remove(path)
    if (currentPath.value === path) {
      currentPath.value = null
      current.value = null
    }
    await load()
  }

  /** Recharge la liste, et le fil ouvert si c'est lui qui a changé. */
  async function refresh(path?: string): Promise<void> {
    await load()
    if (path !== undefined && path === currentPath.value) await open(path)
  }

  return {
    list,
    groups,
    openCount,
    currentPath,
    current,
    loading,
    error,
    todayIso,
    load,
    open,
    create,
    setState,
    rename,
    remove,
    refresh
  }
})
