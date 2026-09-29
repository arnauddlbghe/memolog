<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'

import { api } from './api'
import Sidebar from './components/Sidebar.vue'
import { useConversationsStore } from './stores/conversations'
import { useSettingsStore } from './stores/settings'
import { useUiStore } from './stores/ui'
import ConversationView from './views/ConversationView.vue'
import OnboardingView from './views/OnboardingView.vue'

const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))

const settings = useSettingsStore()
const ui = useUiStore()
const conversations = useConversationsStore()

const ready = ref(false)
const unsubscribers: Array<() => void> = []
let started = false

onMounted(async () => {
  await settings.load()
  ready.value = true
  if (settings.onboardingDone) await afterReady()
})

watch(
  () => settings.onboardingDone,
  async (done) => {
    if (done) await afterReady()
  }
)

/** Démarrage effectif : une seule fois, que l'on vienne de l'accueil ou non. */
async function afterReady(): Promise<void> {
  if (started) return
  started = true
  await conversations.load()

  unsubscribers.push(
    api.on('settings:changed', (next) => settings.receive(next)),
    api.on('shortcut:status', (status) => {
      settings.shortcutIssue = status
    }),
    api.on('conversations:changed', (payload) => void conversations.refresh(payload.path)),
    api.on('navigate', (payload) => {
      if (payload.view === 'settings') ui.go('settings')
    })
  )
}

onUnmounted(() => {
  for (const off of unsubscribers) off()
})

async function create(name: string): Promise<void> {
  const path = await conversations.create(name)
  if (path === null) {
    ui.notify(conversations.error ?? 'La conversation n’a pas pu être créée.', 'error')
    return
  }
  ui.go('conversation')
}
</script>

<template>
  <div v-if="!ready" class="boot faint">Chargement…</div>

  <OnboardingView v-else-if="!settings.onboardingDone" />

  <div v-else class="shell">
    <Sidebar @create="create" />

    <main class="main">
      <SettingsView v-if="ui.view === 'settings'" />
      <ConversationView v-else />
    </main>

    <div
      v-if="ui.toast"
      class="toast"
      :class="{ 'toast--error': ui.toast.kind === 'error' }"
      role="status"
    >
      {{ ui.toast.text }}
    </div>
  </div>
</template>

<style scoped>
.boot {
  display: grid;
  place-items: center;
  height: 100%;
}

.shell {
  position: relative;
  display: grid;
  grid-template-columns: 238px 1fr;
  height: 100%;
  overflow: hidden;
  /* Place pour les boutons de fenêtre de macOS, au-dessus de la liste. */
  padding-top: 28px;
}

.shell::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 28px;
  background: var(--bg-sunken);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}

.main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.toast {
  position: fixed;
  left: 50%;
  bottom: 22px;
  transform: translateX(-50%);
  z-index: 60;
  padding: 8px 16px;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  font-size: 13px;
  box-shadow: 0 6px 20px rgb(0 0 0 / 20%);
}

.toast--error {
  background: var(--danger);
  color: #fff;
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 196px 1fr;
  }
}
</style>
