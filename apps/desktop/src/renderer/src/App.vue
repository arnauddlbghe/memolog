<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch } from 'vue'

import { api, errorMessage } from './api'
import Composer, { type ComposerSubmit } from './components/Composer.vue'
import SearchBar from './components/SearchBar.vue'
import { useDayStore } from './stores/day'
import { useSettingsStore } from './stores/settings'
import { useTasksStore } from './stores/tasks'
import { useUiStore, type ViewName } from './stores/ui'
import { useVaultStore } from './stores/vault'
import DayView from './views/DayView.vue'
import OnboardingView from './views/OnboardingView.vue'

// Les vues secondaires ne sont chargées qu'à leur première ouverture.
const NotesView = defineAsyncComponent(() => import('./views/NotesView.vue'))
const TasksView = defineAsyncComponent(() => import('./views/TasksView.vue'))
const ProjectsView = defineAsyncComponent(() => import('./views/ProjectsView.vue'))
const SettingsView = defineAsyncComponent(() => import('./views/SettingsView.vue'))

const settings = useSettingsStore()
const ui = useUiStore()
const vault = useVaultStore()
const tasks = useTasksStore()
const day = useDayStore()

const searchBar = ref<InstanceType<typeof SearchBar> | null>(null)
const composer = ref<InstanceType<typeof Composer> | null>(null)
const composing = ref(false)
const indexStatus = ref<{ ready: boolean; noteCount: number; taskCount: number } | null>(null)
const ready = ref(false)

const NAV: Array<{ view: ViewName; label: string; hint: string }> = [
  { view: 'day', label: 'Jour', hint: 'Notes du jour et activité' },
  { view: 'notes', label: 'Notes', hint: 'Arborescence et éditeur' },
  { view: 'tasks', label: 'Tâches', hint: 'Actives et endormies' },
  { view: 'projects', label: 'Projets', hint: 'Par projet' }
]

const current = computed(() => {
  switch (ui.view) {
    case 'notes':
      return NotesView
    case 'tasks':
      return TasksView
    case 'projects':
      return ProjectsView
    case 'settings':
      return SettingsView
    default:
      return DayView
  }
})

const unsubscribers: Array<() => void> = []
let started = false

onMounted(async () => {
  await settings.load()
  ready.value = true
  if (settings.onboardingDone) await afterReady()
})

// La première ouverture validée, l'application démarre pour de bon.
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
  indexStatus.value = await api.search.status()
  await Promise.all([day.load(), tasks.load()])

  unsubscribers.push(
    api.on('settings:changed', (next) => settings.receive(next)),
    api.on('index:status', (status) => {
      indexStatus.value = status
    }),
    api.on('shortcut:status', (status) => {
      settings.shortcutIssue = status
    }),
    api.on('note:changed', (payload) => void vault.handleExternalChange(payload.path)),
    api.on('note:removed', (payload) => vault.handleExternalRemoval(payload.path)),
    api.on('tree:changed', (payload) => void vault.refreshDir(payload.dir)),
    api.on('tasks:changed', () => {
      void tasks.load()
      void day.load()
    }),
    api.on('activity:changed', () => void day.load()),
    api.on('navigate', (payload) => {
      if (payload.view === 'journal') void openToday()
      else if (payload.view === 'settings') ui.go('settings')
      else if (payload.view === 'tasks') ui.go('tasks')
      else if (payload.view === 'search') searchBar.value?.focus()
    })
  )

  window.addEventListener('keydown', onKeydown)
  window.addEventListener('beforeunload', () => void vault.flushSave())
}

onUnmounted(() => {
  for (const off of unsubscribers) off()
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(event: KeyboardEvent): void {
  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    searchBar.value?.focus()
  } else if (mod && event.key.toLowerCase() === 'j') {
    event.preventDefault()
    void openToday()
  } else if (mod && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    composer.value?.focus('note')
  } else if (mod && event.key.toLowerCase() === 't') {
    event.preventDefault()
    composer.value?.focus('tache')
  }
}

async function openToday(): Promise<void> {
  await day.goToday()
  ui.go('day')
}

/**
 * Composeur du bas : une tâche (titre, description, projet) ou une entrée de
 * journal (texte et sous-puces). Créer une tâche laisse une référence `@tNN`
 * dans le journal du jour, pour qu'elle apparaisse dans la vue Jour.
 */
async function onCompose(value: ComposerSubmit): Promise<void> {
  composing.value = true
  try {
    if (value.mode === 'tache') {
      // Un tag dans le titre sert de projet si aucun n'est saisi.
      const tagged = /(^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/u.exec(value.text)?.[2]
      const project = value.project !== '' ? value.project : tagged
      const task = await tasks.create(value.text, project, value.body)
      if (task !== null) {
        await api.journal.append(`@${task.id}`)
        ui.notify(`Tâche ^${task.id} créée dans « ${task.project} ».`)
      }
    } else {
      const entry = value.body === '' ? value.text : `${value.text}\n${value.body}`
      await api.journal.append(entry)
      ui.notify('Entrée ajoutée au journal.')
    }
    await day.load()
  } catch (error) {
    ui.notify(errorMessage(error), 'error')
  } finally {
    composing.value = false
  }
}

async function openFromSearch(path: string): Promise<void> {
  await vault.openNote(path, { reveal: true })
  ui.go('notes')
}
</script>

<template>
  <div v-if="!ready" class="boot faint">Chargement…</div>

  <OnboardingView v-else-if="!settings.onboardingDone" />

  <div v-else class="shell">
    <header class="topbar">
      <SearchBar ref="searchBar" @open="openFromSearch" />
    </header>

    <div class="body">
      <nav class="nav" aria-label="Navigation principale">
        <button
          v-for="item in NAV"
          :key="item.view"
          class="nav__item"
          type="button"
          :aria-current="ui.view === item.view"
          :title="item.hint"
          @click="ui.go(item.view)"
        >
          {{ item.label }}
        </button>

        <div class="nav__spacer" />

        <button
          class="nav__item"
          type="button"
          :aria-current="ui.view === 'settings'"
          @click="ui.go('settings')"
        >
          Paramètres
        </button>

        <p v-if="indexStatus" class="nav__status faint">
          {{ indexStatus.noteCount }} notes · {{ indexStatus.taskCount }} tâches
          <span v-if="!indexStatus.ready">· indexation…</span>
        </p>
      </nav>

      <main class="main">
        <component :is="current" />
      </main>
    </div>

    <Composer
      ref="composer"
      :projects="tasks.projects"
      :busy="composing"
      @submit="onCompose"
    />

    <div v-if="ui.toast" class="toast" :class="{ 'toast--error': ui.toast.kind === 'error' }" role="status">
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
  display: flex;
  flex-direction: column;
  height: 100%;
}

.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  padding-left: 88px; /* place pour les boutons de fenêtre sur macOS */
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
  -webkit-app-region: drag;
}

.topbar :deep(input),
.topbar button {
  -webkit-app-region: no-drag;
}

.body {
  display: grid;
  grid-template-columns: 148px 1fr;
  flex: 1;
  min-height: 0;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  border-right: 1px solid var(--border);
  background: var(--bg-sunken);
}

.nav__item {
  padding: 7px 10px;
  text-align: left;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
}

.nav__item:hover {
  background: var(--bg-raised);
  color: var(--text);
}

.nav__item[aria-current='true'] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.nav__spacer {
  flex: 1;
}

.nav__status {
  margin: 8px 0 0;
  padding: 0 10px;
  font-size: 11px;
  line-height: 1.4;
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
</style>
