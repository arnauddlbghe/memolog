<script setup lang="ts">
import type { ConversationSummary } from '@shared/types'

import StateBubble from './StateBubble.vue'
import { useConversationsStore } from '../stores/conversations'
import { useUiStore } from '../stores/ui'

const conversations = useConversationsStore()
const ui = useUiStore()

const emit = defineEmits<{ create: [] }>()

function open(conversation: ConversationSummary): void {
  void conversations.open(conversation.path)
  ui.go('conversation')
}
</script>

<template>
  <aside class="sidebar">
    <header class="sidebar__top">
      <button
        class="icon"
        type="button"
        title="Masquer la liste (⌘\)"
        aria-label="Masquer la liste"
        @click="ui.toggleSidebar()"
      >
        «
      </button>
      <span class="sidebar__title faint">Conversations</span>
      <button
        class="icon icon--new"
        type="button"
        title="Nouvelle conversation"
        aria-label="Nouvelle conversation"
        @click="emit('create')"
      >
        +
      </button>
    </header>

    <nav class="sidebar__list" aria-label="Conversations">
      <section v-for="group in conversations.groups" :key="group.date" class="group">
        <button
          class="group__title"
          type="button"
          :aria-expanded="!ui.isDayCollapsed(group.date)"
          :title="ui.isDayCollapsed(group.date) ? 'Afficher ce jour' : 'Masquer ce jour'"
          @click="ui.toggleDay(group.date)"
        >
          <span
            class="group__chevron"
            :class="{ 'group__chevron--shut': ui.isDayCollapsed(group.date) }"
          >
            ▾
          </span>
          {{ group.label }}
          <span class="group__count">{{ group.conversations.length }}</span>
        </button>

        <ul v-show="!ui.isDayCollapsed(group.date)">
          <li v-for="item in group.conversations" :key="item.path">
            <button
              class="row"
              :class="{
                'row--current':
                  ui.view === 'conversation' && conversations.currentPath === item.path,
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
        Aucune conversation. Appuyez sur + pour commencer à écrire.
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
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 4px;
}

.sidebar__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  line-height: 1;
  color: var(--text-muted);
}

.icon:hover {
  background: var(--bg-raised);
  color: var(--text);
}

.icon--new {
  font-size: 17px;
}

.icon--new:hover {
  color: var(--accent);
}

.sidebar__list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 2px 6px 10px;
}

.group + .group {
  margin-top: 10px;
}

.group__title {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 10.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-faint);
  text-align: left;
}

.group__title:hover {
  background: var(--bg-raised);
  color: var(--text-muted);
}

.group__chevron {
  display: inline-block;
  font-size: 9px;
  transition: transform 120ms ease;
}

.group__chevron--shut {
  transform: rotate(-90deg);
}

.group__count {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
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
