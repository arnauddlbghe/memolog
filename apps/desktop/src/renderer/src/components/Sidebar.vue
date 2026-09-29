<script setup lang="ts">
import { nextTick, ref } from 'vue'

import type { ConversationSummary } from '@shared/types'

import StateBubble from './StateBubble.vue'
import { useConversationsStore } from '../stores/conversations'
import { useUiStore } from '../stores/ui'

const conversations = useConversationsStore()
const ui = useUiStore()

const emit = defineEmits<{ create: [name: string] }>()

/**
 * Nommer une conversation se fait sur place.
 * (Et non dans une boîte de dialogue : Electron ne fournit pas `prompt`.)
 */
const naming = ref(false)
const draft = ref('')
const field = ref<HTMLInputElement | null>(null)

async function startCreate(): Promise<void> {
  draft.value = ''
  naming.value = true
  await nextTick()
  field.value?.focus()
}

function commitCreate(): void {
  const name = draft.value.trim()
  naming.value = false
  draft.value = ''
  if (name !== '') emit('create', name)
}

function open(conversation: ConversationSummary): void {
  void conversations.open(conversation.path)
  ui.go('conversation')
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar__top">
      <input
        v-if="naming"
        ref="field"
        v-model="draft"
        class="new new--input"
        type="text"
        placeholder="Nom de la conversation…"
        aria-label="Nom de la nouvelle conversation"
        @blur="commitCreate"
        @keydown.enter.prevent="commitCreate"
        @keydown.esc.prevent="naming = false"
      />
      <button v-else class="new" type="button" @click="startCreate">
        + Nouvelle conversation
      </button>
    </div>

    <nav class="sidebar__list" aria-label="Conversations">
      <section v-for="group in conversations.groups" :key="group.date" class="group">
        <h2 class="group__title">{{ group.label }}</h2>

        <ul>
          <li v-for="item in group.conversations" :key="item.path">
            <button
              class="row"
              :class="{
                'row--current': ui.view === 'conversation' && conversations.currentPath === item.path,
                'row--done': item.state === 'termine'
              }"
              type="button"
              :title="`${item.name} — créée le ${item.created}`"
              @click="open(item)"
            >
              <StateBubble dot :state="item.state" />
              <span class="row__name">{{ item.name }}</span>
            </button>
          </li>
        </ul>
      </section>

      <p v-if="conversations.groups.length === 0 && !conversations.loading" class="empty faint">
        Aucune conversation. Créez-en une pour commencer à écrire.
      </p>
    </nav>

    <footer class="sidebar__foot">
      <span class="faint">{{ conversations.openCount }} en cours</span>
      <button
        class="foot__btn"
        type="button"
        :aria-pressed="ui.view === 'settings'"
        @click="ui.go(ui.view === 'settings' ? 'conversation' : 'settings')"
      >
        Paramètres
      </button>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--bg-sunken);
}

.sidebar__top {
  padding: 10px 10px 6px;
}

.new {
  width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-raised);
  font-size: 12.5px;
  text-align: left;
  color: var(--text-muted);
}

.new:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.new--input {
  color: var(--text);
  font-size: 12.5px;
}

.sidebar__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 6px 10px;
}

.group + .group {
  margin-top: 12px;
}

.group__title {
  margin: 0 0 3px;
  padding: 0 6px;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
}

.group ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 28px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  text-align: left;
  color: var(--text);
}

.row:hover {
  background: var(--bg-raised);
}

.row--current,
.row--current:hover {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.row--done .row__name {
  color: var(--text-faint);
}

.row__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  padding: 10px 8px;
  font-size: 12px;
  line-height: 1.5;
}

.sidebar__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 11.5px;
}

.foot__btn {
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-muted);
}

.foot__btn:hover,
.foot__btn[aria-pressed='true'] {
  background: var(--bg-raised);
  color: var(--text);
}
</style>
