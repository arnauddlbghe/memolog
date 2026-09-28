<script setup lang="ts">
import { computed, ref } from 'vue'

import type { Task, TaskState } from '@shared/types'

const props = defineProps<{ task: Task; ageDays?: number | null; showProject?: boolean }>()
const emit = defineEmits<{
  cycle: [id: string]
  setState: [id: string, state: TaskState]
  rename: [id: string, text: string]
  describe: [id: string, description: string]
  openProject: [name: string]
}>()

const STATES: Array<{ state: TaskState; label: string; mark: string }> = [
  { state: 'a-faire', label: 'À faire', mark: ' ' },
  { state: 'en-cours', label: 'En cours', mark: '/' },
  { state: 'reportee', label: 'Reportée', mark: '>' },
  { state: 'terminee', label: 'Terminée', mark: '×' },
  { state: 'abandonnee', label: 'Abandonnée', mark: '–' }
]

const menuOpen = ref(false)
const editing = ref(false)
const draft = ref('')
const editingBody = ref(false)
const bodyDraft = ref('')

const current = computed(() => STATES.find((item) => item.state === props.task.state) ?? STATES[0]!)

const age = computed(() => {
  const days = props.ageDays
  if (days === null || days === undefined) return null
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 31) return `il y a ${days} jours`
  const months = Math.round(days / 30)
  return months <= 1 ? 'il y a un mois' : `il y a ${months} mois`
})

function startEdit(): void {
  draft.value = props.task.text
  editing.value = true
}

function commit(): void {
  editing.value = false
  const next = draft.value.trim()
  if (next !== '' && next !== props.task.text) emit('rename', props.task.id, next)
}

function startEditBody(): void {
  bodyDraft.value = props.task.description
  editingBody.value = true
}

function commitBody(): void {
  editingBody.value = false
  const next = bodyDraft.value.trim()
  if (next !== props.task.description) emit('describe', props.task.id, next)
}

function choose(state: TaskState): void {
  menuOpen.value = false
  emit('setState', props.task.id, state)
}
</script>

<template>
  <li class="task" :class="`task--${task.state}`">
    <button
      class="box"
      type="button"
      :title="`${current.label} — cliquer pour passer à l'état suivant`"
      :aria-label="`${task.text} : ${current.label}`"
      @click="emit('cycle', task.id)"
    >
      <span aria-hidden="true">{{ current.mark }}</span>
    </button>

    <div class="body">
      <input
        v-if="editing"
        v-model="draft"
        class="edit"
        type="text"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="editing = false"
      />
      <span v-else class="text" @dblclick="startEdit">{{ task.text }}</span>

      <textarea
        v-if="editingBody"
        v-model="bodyDraft"
        class="edit edit--body"
        rows="3"
        aria-label="Description"
        @blur="commitBody"
        @keydown.meta.enter.prevent="commitBody"
        @keydown.ctrl.enter.prevent="commitBody"
        @keydown.esc.prevent="editingBody = false"
      />
      <p v-else-if="task.description" class="description" @dblclick="startEditBody">
        {{ task.description }}
      </p>

      <span class="meta faint">
        <button
          v-if="showProject !== false"
          class="chip"
          type="button"
          @click="emit('openProject', task.project)"
        >
          {{ task.project }}
        </button>
        <span v-if="age">maj {{ age }}</span>
        <button
          v-if="!task.description && !editingBody"
          class="chip"
          type="button"
          title="Ajouter une description"
          @click="startEditBody"
        >
          + description
        </button>
        <span class="mono">^{{ task.id }}</span>
      </span>
    </div>

    <div class="menu">
      <button
        class="btn btn--ghost"
        type="button"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        title="Changer l'état"
        @click="menuOpen = !menuOpen"
      >
        ⋯
      </button>
      <ul v-if="menuOpen" class="menu__list" role="menu" @mouseleave="menuOpen = false">
        <li v-for="item in STATES" :key="item.state" role="none">
          <button
            class="menu__item"
            type="button"
            role="menuitem"
            :aria-current="item.state === task.state"
            @click="choose(item.state)"
          >
            <span class="menu__mark" aria-hidden="true">{{ item.mark }}</span>
            {{ item.label }}
          </button>
        </li>
      </ul>
    </div>
  </li>
</template>

<style scoped>
.task {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
}

.task:hover {
  background: var(--bg-sunken);
}

.task--terminee .text,
.task--abandonnee .text {
  text-decoration: line-through;
  color: var(--text-faint);
}

.box {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
  display: grid;
  place-items: center;
  border: 1.5px solid var(--border-strong);
  border-radius: 4px;
  background: var(--bg-raised);
  font-size: 12px;
  line-height: 1;
}

.task--en-cours .box {
  border-color: var(--accent);
  color: var(--accent);
}

.task--terminee .box,
.task--abandonnee .box {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.body {
  flex: 1;
  min-width: 0;
}

.text {
  display: block;
  word-break: break-word;
}

.edit {
  width: 100%;
}

.edit--body {
  margin-top: 4px;
  resize: vertical;
  line-height: 1.5;
}

.description {
  margin: 3px 0 0;
  white-space: pre-wrap;
  color: var(--text-muted);
  line-height: 1.5;
  font-size: 13px;
  border-left: 2px solid var(--border);
  padding-left: 8px;
}

.meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  margin-top: 2px;
}

.chip {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg-sunken);
  border: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.chip:hover {
  border-color: var(--accent);
  color: var(--text);
}

.menu {
  position: relative;
  flex: none;
}

.menu__list {
  position: absolute;
  right: 0;
  z-index: 20;
  margin: 2px 0 0;
  padding: 4px;
  min-width: 160px;
  list-style: none;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 8px 24px rgb(0 0 0 / 12%);
}

.menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  text-align: left;
  border-radius: var(--radius-sm);
}

.menu__item:hover {
  background: var(--bg-sunken);
}

.menu__item[aria-current='true'] {
  color: var(--accent);
}

.menu__mark {
  width: 12px;
  text-align: center;
  color: var(--text-faint);
}
</style>
