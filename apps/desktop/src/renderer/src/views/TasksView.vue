<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import type { TaskState } from '@shared/types'

import TaskRow from '../components/TaskRow.vue'
import { useSettingsStore } from '../stores/settings'
import { useTasksStore } from '../stores/tasks'
import { useUiStore } from '../stores/ui'

const tasks = useTasksStore()
const ui = useUiStore()
const settings = useSettingsStore()

type Tab = 'actives' | 'dormantes'
const tab = ref<Tab>('actives')

const FILTERS: Array<{ value: TaskState | 'toutes'; label: string }> = [
  { value: 'toutes', label: 'Toutes' },
  { value: 'a-faire', label: 'À faire' },
  { value: 'en-cours', label: 'En cours' },
  { value: 'reportee', label: 'Reportées' }
]

const dormantDays = computed(() => settings.settings?.dormantAfterDays ?? 7)

onMounted(() => void tasks.load())

async function archive(): Promise<void> {
  const count = await tasks.archive()
  ui.notify(
    count === 0 ? 'Rien à archiver pour le moment.' : `${count} tâche(s) déplacée(s) vers l'archive.`
  )
}
</script>

<template>
  <div class="tasks">
    <header class="head">
      <div class="tabs" role="tablist">
        <button
          class="tab"
          role="tab"
          type="button"
          :aria-selected="tab === 'actives'"
          @click="tab = 'actives'"
        >
          Tâches actives
          <span class="count">{{ tasks.active.length }}</span>
        </button>
        <button
          class="tab"
          role="tab"
          type="button"
          :aria-selected="tab === 'dormantes'"
          @click="tab = 'dormantes'"
        >
          Qui dorment
          <span class="count">{{ tasks.dormant.length }}</span>
        </button>
      </div>

      <button class="btn" type="button" title="Archiver les tâches fermées" @click="archive">
        Archiver
      </button>
    </header>


    <template v-if="tab === 'actives'">
      <div class="filters">
        <div class="filters__group" role="group" aria-label="Filtrer par état">
          <button
            v-for="filter in FILTERS"
            :key="filter.value"
            class="pill"
            type="button"
            :aria-pressed="tasks.stateFilter === filter.value"
            @click="tasks.stateFilter = filter.value"
          >
            {{ filter.label }}
          </button>
        </div>

        <select
          class="filters__project"
          :value="tasks.projectFilter ?? ''"
          aria-label="Filtrer par projet"
          @change="tasks.projectFilter = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">Tous les projets</option>
          <option v-for="name in tasks.projects" :key="name" :value="name">{{ name }}</option>
        </select>
      </div>

      <ul class="list">
        <TaskRow
          v-for="task in tasks.visible"
          :key="task.id"
          :task="task"
          @cycle="tasks.cycle($event)"
          @set-state="(id, state) => tasks.setState(id, state)"
          @rename="(id, text) => tasks.rename(id, text)"
          @describe="(id, body) => tasks.describe(id, body)"
          @open-project="ui.openProject($event)"
        />
      </ul>
      <p v-if="tasks.visible.length === 0 && !tasks.loading" class="empty faint">
        Aucune tâche ne correspond. Créez-en une avec le composeur en bas de la fenêtre
        (<code>Cmd/Ctrl + T</code>), titre et description compris.
      </p>
    </template>

    <template v-else>
      <p class="hint faint">
        Tâches actives sans mise à jour depuis plus de {{ dormantDays }} jours, de la plus ancienne
        à la plus récente.
      </p>
      <ul class="list">
        <TaskRow
          v-for="item in tasks.dormant"
          :key="item.task.id"
          :task="item.task"
          :age-days="item.ageDays"
          @cycle="tasks.cycle($event)"
          @set-state="(id, state) => tasks.setState(id, state)"
          @rename="(id, text) => tasks.rename(id, text)"
          @describe="(id, body) => tasks.describe(id, body)"
          @open-project="ui.openProject($event)"
        />
      </ul>
      <p v-if="tasks.dormant.length === 0 && !tasks.loading" class="empty faint">
        Rien ne dort. Tout est à jour.
      </p>
    </template>

    <p v-if="tasks.error" class="error" role="alert">{{ tasks.error }}</p>
  </div>
</template>

<style scoped>
.tasks {
  height: 100%;
  overflow: auto;
  padding: 16px 24px 40px;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.tabs {
  display: flex;
  gap: 4px;
}

.tab {
  padding: 5px 12px;
  border-radius: 999px;
  color: var(--text-muted);
}

.tab[aria-selected='true'] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.count {
  margin-left: 6px;
  font-size: 11px;
  opacity: 0.75;
}

.filters {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  max-width: 820px;
}

.filters__group {
  display: flex;
  gap: 4px;
}

.pill {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-muted);
  border: 1px solid transparent;
}

.pill[aria-pressed='true'] {
  border-color: var(--border-strong);
  background: var(--bg-raised);
  color: var(--text);
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 820px;
}

.hint,
.empty {
  max-width: 620px;
  line-height: 1.6;
}

code {
  font-family: var(--mono);
  font-size: 12px;
}

.error {
  color: var(--danger);
}
</style>
