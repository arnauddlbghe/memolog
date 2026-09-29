import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

/** Ce qu'occupe le panneau principal. */
export type ViewName = 'conversation' | 'settings'

/** Navigation et messages passagers. */
export const useUiStore = defineStore('ui', () => {
  const view = ref<ViewName>('conversation')
  const toast = shallowRef<{ text: string; kind: 'info' | 'error' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function go(next: ViewName): void {
    view.value = next
  }

  function notify(text: string, kind: 'info' | 'error' = 'info'): void {
    toast.value = { text, kind }
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = null
    }, kind === 'error' ? 6000 : 2600)
  }

  return { view, toast, go, notify }
})
