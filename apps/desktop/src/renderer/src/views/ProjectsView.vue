<script setup lang="ts">
import { onMounted, watch } from 'vue'

import TaskRow from '../components/TaskRow.vue'
import { useProjectsStore } from '../stores/projects'
import { useTasksStore } from '../stores/tasks'
import { useUiStore } from '../stores/ui'
import { useVaultStore } from '../stores/vault'

const projects = useProjectsStore()
const tasks = useTasksStore()
const ui = useUiStore()
const vault = useVaultStore()

onMounted(async () => {
  await projects.load()
  if (ui.selectedProject !== null) await projects.open(ui.selectedProject)
})

watch(
  () => ui.selectedProject,
  async (name) => {
    if (name === null) projects.close()
    else await projects.open(name)
  }
)

async function refresh(): Promise<void> {
  await tasks.load()
  await projects.load()
  if (ui.selectedProject !== null) await projects.open(ui.selectedProject)
}

async function openNote(path: string): Promise<void> {
  await vault.openNote(path, { reveal: true })
  ui.go('notes')
}
</script>

<template>
  <div class="projects">
    <!-- Liste -->
    <template v-if="projects.detail === null">
      <header class="head">
        <h1>Projets</h1>
        <span class="faint">{{ projects.list.length }} au total</span>
      </header>

      <p class="hint faint">
        Un projet apparaît dès qu'il est utilisé quelque part&nbsp;: section de
        <code>taches.md</code>, tag du journal, ou fiche dans <code>projets/</code>.
      </p>

      <ul class="cards">
        <li v-for="project in projects.list" :key="project.key">
          <button class="card" type="button" @click="ui.openProject(project.name)">
            <span class="card__name">{{ project.name }}</span>
            <span class="card__stats faint">
              <span>{{ project.openTaskCount }} ouverte(s)</span>
              <span>{{ project.closedTaskCount }} fermée(s)</span>
              <span v-if="project.journalEntryCount > 0">
                {{ project.journalEntryCount }} jour(s) au journal
              </span>
              <span v-if="project.notePath" class="badge">fiche</span>
            </span>
            <span class="card__date mono faint">{{ project.lastActivity ?? '—' }}</span>
          </button>
        </li>
      </ul>

      <p v-if="projects.list.length === 0 && !projects.loading" class="empty faint">
        Aucun projet pour l'instant. Créez une tâche avec un projet, ou taguez une entrée de
        journal.
      </p>
    </template>

    <!-- Fiche d'un projet -->
    <template v-else>
      <header class="head">
        <button class="btn" type="button" @click="ui.selectedProject = null">‹ Tous</button>
        <h1>{{ projects.detail.summary.name }}</h1>
        <button
          v-if="projects.detail.note"
          class="btn"
          type="button"
          @click="openNote(projects.detail.note.path)"
        >
          Ouvrir la fiche
        </button>
      </header>

      <section v-if="projects.detail.note" class="note">
        <pre>{{ projects.detail.note.content }}</pre>
      </section>

      <section v-for="group in projects.detail.groups" :key="group.state" class="group">
        <h2>{{ group.label }} <span class="faint">({{ group.tasks.length }})</span></h2>
        <ul class="list">
          <TaskRow
            v-for="item in group.tasks"
            :key="item.task.id"
            :task="item.task"
            :age-days="item.ageDays"
            :show-project="false"
            @cycle="tasks.cycle($event).then(refresh)"
            @set-state="(id, state) => tasks.setState(id, state).then(refresh)"
            @rename="(id, text) => tasks.rename(id, text).then(refresh)"
            @describe="(id, body) => tasks.describe(id, body).then(refresh)"
            @open-project="ui.openProject($event)"
          />
        </ul>
      </section>

      <section v-if="projects.detail.days.length > 0" class="group">
        <h2>Historique au journal</h2>
        <ul class="days">
          <li v-for="date in projects.detail.days" :key="date">
            <button class="btn btn--ghost" type="button" @click="ui.go('day')">{{ date }}</button>
          </li>
        </ul>
      </section>

      <p v-if="projects.detail.groups.length === 0 && projects.detail.days.length === 0" class="empty faint">
        Ce projet n'a encore ni tâche ni entrée de journal.
      </p>
    </template>

    <p v-if="projects.error" class="error" role="alert">{{ projects.error }}</p>
  </div>
</template>

<style scoped>
.projects {
  height: 100%;
  overflow: auto;
  padding: 18px 24px 40px;
}

.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

h1 {
  margin: 0;
  font-size: 18px;
  flex: 1;
}

h2 {
  margin: 18px 0 4px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.hint,
.empty {
  max-width: 620px;
  line-height: 1.6;
}

.cards {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
  max-width: 820px;
}

.card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.card:hover {
  border-color: var(--accent);
}

.card__name {
  font-weight: 600;
  flex: none;
  min-width: 140px;
}

.card__stats {
  display: flex;
  gap: 10px;
  flex: 1;
  flex-wrap: wrap;
  font-size: 12px;
}

.badge {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}

.card__date {
  font-size: 11px;
}

.note pre {
  margin: 10px 0 0;
  padding: 12px 14px;
  max-width: 820px;
  max-height: 200px;
  overflow: auto;
  white-space: pre-wrap;
  background: var(--bg-sunken);
  border-radius: var(--radius);
}

.list,
.days {
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 820px;
}

.days {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

code {
  font-family: var(--mono);
  font-size: 12px;
}

.error {
  color: var(--danger);
}
</style>
