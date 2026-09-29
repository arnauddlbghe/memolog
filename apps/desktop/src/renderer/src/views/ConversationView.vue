<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import type { ConversationState, EditorMode } from '@shared/types'

import { api, errorMessage } from '../api'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import StateBubble from '../components/StateBubble.vue'
import { useConversationsStore } from '../stores/conversations'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'

const AUTOSAVE_DELAY = 600

const conversations = useConversationsStore()
const settings = useSettingsStore()
const ui = useUiStore()

const draft = ref('')
const saveState = ref<'saved' | 'dirty' | 'saving' | 'error'>('saved')
const baseMtimeMs = ref(0)
const renaming = ref(false)
const nameDraft = ref('')
const historyOpen = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

const conversation = computed(() => conversations.current)
const mode = computed<EditorMode>(() => settings.settings?.editorMode ?? 'rendu')

const saveLabel = computed(() => {
  switch (saveState.value) {
    case 'saving':
      return 'Enregistrement…'
    case 'dirty':
      return 'Modifié'
    case 'error':
      return 'Échec de l’enregistrement'
    default:
      return 'Enregistré'
  }
})

// Changer de conversation remplace le brouillon, sans emporter l'ancien.
watch(
  () => conversation.value?.path,
  () => {
    flush()
    draft.value = conversation.value?.content ?? ''
    baseMtimeMs.value = conversation.value?.mtimeMs ?? 0
    saveState.value = 'saved'
    historyOpen.value = false
  },
  { immediate: true }
)

// Une modification venue du disque se propage si l'on n'a rien en cours.
watch(
  () => conversation.value?.content,
  (next) => {
    if (next === undefined || saveState.value !== 'saved') return
    draft.value = next
    baseMtimeMs.value = conversation.value?.mtimeMs ?? 0
  }
)

function onInput(value: string): void {
  draft.value = value
  saveState.value = 'dirty'
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => void save(), AUTOSAVE_DELAY)
}

async function save(): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined || saveState.value === 'saved') return
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }

  saveState.value = 'saving'
  try {
    const result = await api.conversations.setContent(path, draft.value, baseMtimeMs.value)
    if (!result.ok) {
      saveState.value = 'error'
      ui.notify('Le fichier a changé sur le disque ; rien n’a été écrasé.', 'error')
      return
    }
    baseMtimeMs.value = result.mtimeMs
    saveState.value = 'saved'
  } catch (error) {
    saveState.value = 'error'
    ui.notify(errorMessage(error), 'error')
  }
}

function flush(): void {
  if (saveState.value === 'dirty') void save()
}

async function setState(state: ConversationState): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined) return
  try {
    await conversations.setState(path, state)
  } catch (error) {
    ui.notify(errorMessage(error), 'error')
  }
}

function startRename(): void {
  nameDraft.value = conversation.value?.name ?? ''
  renaming.value = true
}

async function commitRename(): Promise<void> {
  renaming.value = false
  const path = conversation.value?.path
  const next = nameDraft.value.trim()
  if (path === undefined || next === '' || next === conversation.value?.name) return
  try {
    await conversations.rename(path, next)
  } catch (error) {
    ui.notify(errorMessage(error), 'error')
  }
}

async function remove(): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined) return
  if (!window.confirm(`Envoyer « ${conversation.value?.name} » à la corbeille du système ?`)) return
  await conversations.remove(path)
}

function toggleMode(): void {
  void settings.update({ editorMode: mode.value === 'rendu' ? 'brut' : 'rendu' })
}

const STATE_LABELS: Record<ConversationState, string> = {
  'a-faire': 'À faire',
  'en-cours': 'En cours',
  'a-reprendre': 'À reprendre',
  termine: 'Terminé'
}
</script>

<template>
  <section v-if="conversation" class="conv">
    <header class="conv__head">
      <div class="conv__title">
        <input
          v-if="renaming"
          v-model="nameDraft"
          class="conv__rename"
          type="text"
          aria-label="Nom de la conversation"
          @blur="commitRename"
          @keydown.enter.prevent="commitRename"
          @keydown.esc.prevent="renaming = false"
        />
        <h1 v-else title="Cliquer pour renommer" @click="startRename">{{ conversation.name }}</h1>

        <StateBubble :state="conversation.state" @select="setState" />
      </div>

      <div class="conv__tools">
        <button
          class="btn btn--ghost"
          type="button"
          :title="mode === 'rendu' ? 'Voir le Markdown brut' : 'Revenir au rendu visuel'"
          @click="toggleMode"
        >
          {{ mode === 'rendu' ? 'Markdown' : 'Rendu' }}
        </button>
        <span class="faint state">{{ saveLabel }}</span>
      </div>
    </header>

    <div class="conv__meta">
      <button class="meta__toggle" type="button" @click="historyOpen = !historyOpen">
        Créée le {{ conversation.created }}
        <span v-if="conversation.history.length > 0" class="faint">
          · {{ conversation.history.length }} changement(s) d'état
        </span>
      </button>

      <ol v-if="historyOpen && conversation.history.length > 0" class="history">
        <li v-for="(change, index) in conversation.history" :key="index">
          <span class="mono history__date">{{ change.date }}</span>
          <StateBubble dot :state="change.state" />
          <span>{{ STATE_LABELS[change.state] }}</span>
        </li>
      </ol>
    </div>

    <MarkdownEditor
      :model-value="draft"
      :mode="mode"
      class="conv__editor"
      @update:model-value="onInput"
    />

    <footer class="conv__foot">
      <span class="mono faint">{{ conversation.path }}</span>
      <button class="btn btn--ghost btn--danger" type="button" @click="remove">Supprimer</button>
    </footer>
  </section>

  <p v-else class="placeholder faint">
    Choisissez une conversation à gauche, ou créez-en une.
  </p>
</template>

<style scoped>
.conv {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.conv__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 20px 8px;
}

.conv__title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

h1 {
  margin: 0;
  font-size: 17px;
  cursor: text;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

h1:hover {
  color: var(--accent);
}

.conv__rename {
  font-size: 16px;
  min-width: 240px;
}

.conv__tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conv__tools .btn {
  font-size: 12px;
}

.state {
  font-size: 11.5px;
}

.conv__meta {
  padding: 0 20px 8px;
}

.meta__toggle {
  font-size: 11.5px;
  color: var(--text-muted);
  padding: 2px 0;
}

.meta__toggle:hover {
  color: var(--accent);
}

.history {
  margin: 6px 0 0;
  padding: 8px 12px;
  list-style: none;
  background: var(--bg-sunken);
  border-radius: var(--radius);
  max-width: 420px;
}

.history li {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 2px 0;
  font-size: 12px;
}

.history__date {
  width: 82px;
  color: var(--text-faint);
}

.conv__editor {
  flex: 1;
  min-height: 0;
}

.conv__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 20px 8px;
  border-top: 1px solid var(--border);
  font-size: 11px;
}

.conv__foot .btn {
  font-size: 11.5px;
}

.placeholder {
  display: grid;
  place-items: center;
  height: 100%;
  padding: 24px;
  text-align: center;
  line-height: 1.6;
}
</style>
