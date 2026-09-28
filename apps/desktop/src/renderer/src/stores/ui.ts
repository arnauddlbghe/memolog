import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

/** Les vues principales de l'application. */
export type ViewName = 'day' | 'notes' | 'tasks' | 'projects' | 'settings'

/**
 * Navigation et état d'interface. Les vues secondaires sont chargées à la
 * demande : ce store ne retient que laquelle est active.
 */
export const useUiStore = defineStore('ui', () => {
  const view = ref<ViewName>('day')
  const selectedProject = ref<string | null>(null)
  const toast = shallowRef<{ text: string; kind: 'info' | 'error' } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function go(next: ViewName): void {
    view.value = next
  }

  function openProject(name: string): void {
    selectedProject.value = name
    view.value = 'projects'
  }

  function notify(text: string, kind: 'info' | 'error' = 'info'): void {
    toast.value = { text, kind }
    if (toastTimer !== null) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => {
      toast.value = null
    }, kind === 'error' ? 6000 : 2600)
  }

  return { view, selectedProject, toast, go, openProject, notify }
})
