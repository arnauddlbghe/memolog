<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { ConversationState } from '@shared/types'

import { api, errorMessage } from '../api'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import StateBubble from '../components/StateBubble.vue'
import { useConversationsStore } from '../stores/conversations'
import { useUiStore } from '../stores/ui'

const conversations = useConversationsStore()
const ui = useUiStore()

const draft = ref('')
const saveState = ref<'saved' | 'dirty' | 'saving' | 'error'>('saved')
const baseMtimeMs = ref(0)
const historyOpen = ref(false)

/** Le titre se saisit ici, directement : c'est aussi le nom du fichier. */
const title = ref('')
const titleField = ref<HTMLInputElement | null>(null)

const conversation = computed(() => conversations.current)

const saveLabel = computed(() => {
  switch (saveState.value) {
    case 'saving':
      return 'Enregistrement…'
    case 'dirty':
      return 'Non sauvegardé'
    case 'error':
      return 'Échec de l’enregistrement'
    default:
      return 'Enregistré'
  }
})

// Changer de conversation remplace le brouillon, sans emporter l'ancien.
watch(
  () => conversation.value?.path,
  async () => {
    flush()
    draft.value = conversation.value?.content ?? ''
    title.value = conversation.value?.name ?? ''
    baseMtimeMs.value = conversation.value?.mtimeMs ?? 0
    saveState.value = 'saved'
    historyOpen.value = false

    // Conversation tout juste créée : le curseur attend dans le titre.
    if (ui.titleAwaitsName) {
      ui.titleAwaitsName = false
      await nextTick()
      titleField.value?.focus()
      titleField.value?.select()
    }
  },
  { immediate: true }
)

// Un renommage venu d'ailleurs (ou du disque) se reflète dans le champ.
watch(
  () => conversation.value?.name,
  (next) => {
    if (next !== undefined && document.activeElement !== titleField.value) title.value = next
  }
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
}

async function save(): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined || saveState.value === 'saved' || saveState.value === 'saving') return

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

/**
 * Plus d'enregistrement automatique pendant la frappe : on écrit quand on
 * quitte la fenêtre, quand on change de conversation, et sur ⌘S.
 *
 * Trois filets plutôt qu'un, parce que « quitter la fenêtre » prend plusieurs
 * formes : passer à une autre application (`blur`), masquer la fenêtre par le
 * raccourci global ou la barre système (`visibilitychange`), et fermer pour de
 * bon (`beforeunload`).
 */
function onSaveShortcut(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    flush()
  }
}

function onHidden(): void {
  if (document.visibilityState === 'hidden') flush()
}

onMounted(() => {
  window.addEventListener('blur', flush)
  window.addEventListener('beforeunload', flush)
  window.addEventListener('keydown', onSaveShortcut)
  document.addEventListener('visibilitychange', onHidden)
})

onBeforeUnmount(() => {
  flush()
  window.removeEventListener('blur', flush)
  window.removeEventListener('beforeunload', flush)
  window.removeEventListener('keydown', onSaveShortcut)
  document.removeEventListener('visibilitychange', onHidden)
})

async function setState(state: ConversationState): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined) return
  // Sans autosave, le corps peut être en retard sur l'écran : on l'écrit
  // d'abord, sinon changer d'état réécrirait le fichier depuis le disque.
  await save()
  try {
    await conversations.setState(path, state)
  } catch (error) {
    ui.notify(errorMessage(error), 'error')
  }
}

/** Le renommage suit le champ de titre : à la validation ou à la sortie. */
async function commitTitle(): Promise<void> {
  const path = conversation.value?.path
  const next = title.value.trim()
  if (path === undefined) return
  if (next === '' || next === conversation.value?.name) {
    title.value = conversation.value?.name ?? ''
    return
  }
  // Renommer déplace le fichier : le corps en attente doit partir avant,
  // sinon il serait écrit à l'ancien chemin, avec une base périmée.
  await save()
  try {
    await conversations.rename(path, next)
  } catch (error) {
    title.value = conversation.value?.name ?? ''
    ui.notify(errorMessage(error), 'error')
  }
}

async function remove(): Promise<void> {
  const path = conversation.value?.path
  if (path === undefined) return
  if (!window.confirm(`Envoyer « ${conversation.value?.name} » à la corbeille du système ?`)) return
  await conversations.remove(path)
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
      <button
        v-if="!ui.sidebarOpen"
        class="reveal"
        type="button"
        title="Afficher la liste (⌘\)"
        aria-label="Afficher la liste"
        @click="ui.toggleSidebar()"
      >
        »
      </button>

      <input
        ref="titleField"
        v-model="title"
        class="conv__title"
        type="text"
        placeholder="Titre de la conversation"
        aria-label="Titre de la conversation"
        @blur="commitTitle"
        @keydown.enter.prevent="commitTitle"
        @keydown.esc.prevent="title = conversation.name"
      />

      <button
        class="state"
        :class="{
          'state--dirty': saveState === 'dirty',
          'state--error': saveState === 'error',
          faint: saveState === 'saved'
        }"
        type="button"
        :disabled="saveState !== 'dirty' && saveState !== 'error'"
        :title="
          saveState === 'dirty' || saveState === 'error'
            ? 'Enregistrer maintenant (⌘S)'
            : 'Enregistré sur le disque'
        "
        @click="flush"
      >
        {{ saveLabel }}
      </button>
      <StateBubble :state="conversation.state" @select="setState" />
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

    <MarkdownEditor :model-value="draft" class="conv__editor" @update:model-value="onInput" />

    <footer class="conv__foot">
      <span class="mono faint">{{ conversation.path }}</span>
      <button class="btn btn--ghost btn--danger" type="button" @click="remove">Supprimer</button>
    </footer>
  </section>

  <div v-else class="placeholder">
    <button
      v-if="!ui.sidebarOpen"
      class="reveal reveal--alone"
      type="button"
      title="Afficher la liste (⌘\)"
      aria-label="Afficher la liste"
      @click="ui.toggleSidebar()"
    >
      »
    </button>
    <p class="faint">Choisissez une conversation à gauche, ou créez-en une.</p>
  </div>
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
  gap: 10px;
  padding: 10px 20px 6px;
}

/* Le titre se fond dans la page : c'est un titre, pas un formulaire. */
.conv__title {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: 17px;
  font-weight: 600;
}

.conv__title:hover {
  border-color: var(--border);
}

.conv__title:focus {
  border-color: var(--border-strong);
  background: var(--bg-raised);
  outline: none;
}

.conv__title::placeholder {
  color: var(--text-faint);
  font-weight: 400;
}

.reveal {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  color: var(--text-muted);
}

.reveal:hover {
  background: var(--bg-sunken);
  color: var(--text);
}

.reveal--alone {
  position: absolute;
  top: 34px;
  left: 10px;
}

.state {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--text-muted);
}

/* Du texte en attente d'écriture doit se voir, pas se deviner. */
.state--dirty {
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  color: var(--text);
}

.state--error {
  color: var(--danger);
  font-weight: 600;
}

.state:disabled {
  cursor: default;
}

.conv__meta {
  padding: 0 20px 8px 26px;
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
