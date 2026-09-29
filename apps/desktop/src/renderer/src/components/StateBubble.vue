<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import type { ConversationState } from '@shared/types'

const props = defineProps<{
  state: ConversationState
  /** Pastille seule, sans libellé : pour la barre latérale. */
  dot?: boolean
  /** Lecture seule : aucune ouverture de menu. */
  readonly?: boolean
}>()

const emit = defineEmits<{ select: [state: ConversationState] }>()

/** Les quatre états, chacun avec sa couleur. */
const STATES: Array<{ state: ConversationState; label: string }> = [
  { state: 'a-faire', label: 'À faire' },
  { state: 'en-cours', label: 'En cours' },
  { state: 'a-reprendre', label: 'À reprendre' },
  { state: 'termine', label: 'Terminé' }
]

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const current = computed(() => STATES.find((item) => item.state === props.state) ?? STATES[0]!)

function choose(state: ConversationState): void {
  open.value = false
  if (state !== props.state) emit('select', state)
}

function onDocumentClick(event: MouseEvent): void {
  if (root.value !== null && !root.value.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('mousedown', onDocumentClick))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentClick))
</script>

<template>
  <span v-if="dot" class="dot" :class="`dot--${state}`" :title="current.label" />

  <div v-else ref="root" class="host">
    <button
      class="badge"
      :class="`badge--${state}`"
      type="button"
      :disabled="readonly"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :title="`${current.label} — cliquer pour changer`"
      @click="open = !open"
    >
      <span class="badge__dot" :class="`dot--${state}`" aria-hidden="true" />
      {{ current.label }}
    </button>

    <ul v-if="open" class="menu" role="listbox" aria-label="État">
      <li v-for="item in STATES" :key="item.state" role="none">
        <button
          class="menu__item"
          type="button"
          role="option"
          :aria-selected="item.state === state"
          @click="choose(item.state)"
        >
          <span class="dot" :class="`dot--${item.state}`" aria-hidden="true" />
          {{ item.label }}
          <span v-if="item.state === state" class="menu__current">actuel</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.host {
  position: relative;
  flex: none;
}

.dot {
  display: inline-block;
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: var(--state-color);
}

/* Une couleur par état — c'est le repère le plus rapide à lire. */
.dot--a-faire {
  --state-color: #9a938a;
}

.dot--en-cours {
  --state-color: #c67c2f;
}

.dot--a-reprendre {
  --state-color: #b5452f;
}

.dot--termine {
  --state-color: #3d8a5f;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-strong);
  background: var(--bg-raised);
  font-size: 12px;
  white-space: nowrap;
}

.badge:not(:disabled):hover {
  border-color: var(--accent);
}

.badge__dot {
  width: 8px;
  height: 8px;
}

.menu {
  position: absolute;
  z-index: 25;
  top: calc(100% + 4px);
  left: 0;
  margin: 0;
  padding: 4px;
  min-width: 170px;
  list-style: none;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 10px 28px rgb(0 0 0 / 16%);
}

.menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 5px 8px;
  text-align: left;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.menu__item:hover {
  background: var(--bg-sunken);
}

.menu__current {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-faint);
}
</style>
