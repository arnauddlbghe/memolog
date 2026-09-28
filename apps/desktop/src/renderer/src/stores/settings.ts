import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { AppInfo, Settings, ShortcutStatus } from '@shared/types'

import { api } from '../api'

/**
 * Réglages de l'application. Le process principal reste la source de vérité :
 * le store se contente de refléter ce qu'il renvoie.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings | null>(null)
  const info = ref<AppInfo | null>(null)
  const shortcutIssue = ref<ShortcutStatus | null>(null)

  const ready = computed(() => settings.value !== null)
  const onboardingDone = computed(() => settings.value?.onboardingDone === true)
  const root = computed(() => settings.value?.root ?? '')

  function applyTheme(): void {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    document.documentElement.dataset['theme'] = dark ? 'dark' : 'light'
  }

  async function load(): Promise<void> {
    settings.value = await api.settings.get()
    info.value = await api.app.info()
    applyTheme()
  }

  async function update(patch: Partial<Settings>): Promise<void> {
    settings.value = await api.settings.update(patch)
    applyTheme()
  }

  async function completeOnboarding(rootPath: string, launchAtLogin: boolean): Promise<void> {
    settings.value = await api.onboarding.complete(rootPath, launchAtLogin)
    info.value = await api.app.info()
  }

  async function setRoot(newRoot: string, move: boolean): Promise<void> {
    settings.value = await api.vault.setRoot(newRoot, move)
    info.value = await api.app.info()
  }

  function receive(next: Settings): void {
    settings.value = next
    applyTheme()
  }

  // Le thème « système » suit les changements de l'OS en direct.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme)

  return {
    settings,
    info,
    shortcutIssue,
    ready,
    onboardingDone,
    root,
    load,
    update,
    completeOnboarding,
    setRoot,
    receive,
    applyTheme
  }
})
