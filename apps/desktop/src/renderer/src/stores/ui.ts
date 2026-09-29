import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

/** Ce qu'occupe le panneau principal. */
export type ViewName = 'conversation' | 'settings'

/** Navigation, repli des panneaux, et messages passagers. */
export const useUiStore = defineStore('ui', () => {
  const view = ref<ViewName>('conversation')
  const toast = shallowRef<{ text: string; kind: 'info' | 'error' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  /** La liste de gauche peut disparaître pour écrire au calme. */
  const sidebarOpen = ref(true)

  /** Jours dont la liste est repliée, par date `AAAA-MM-JJ`. */
  const collapsedDays = ref<Set<string>>(new Set())

  /**
   * Une conversation vient d'être créée : son titre attend d'être saisi.
   * La vue le consomme une fois, puis remet le drapeau à `false`.
   */
  const titleAwaitsName = ref(false)

  function go(next: ViewName): void {
    view.value = next
  }

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  function toggleDay(date: string): void {
    // Un `Set` muté sur place ne réveille pas Vue : on le remplace.
    const next = new Set(collapsedDays.value)
    if (!next.delete(date)) next.add(date)
    collapsedDays.value = next
  }

  function isDayCollapsed(date: string): boolean {
    return collapsedDays.value.has(date)
  }

  function notify(text: string, kind: 'info' | 'error' = 'info'): void {
    toast.value = { text, kind }
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(
      () => {
        toast.value = null
      },
      kind === 'error' ? 6000 : 2600
    )
  }

  return {
    view,
    toast,
    sidebarOpen,
    collapsedDays,
    titleAwaitsName,
    go,
    toggleSidebar,
    toggleDay,
    isDayCollapsed,
    notify
  }
})
