<script setup lang="ts">
import { ref } from 'vue'

import { useSearchStore } from '../stores/search'

const emit = defineEmits<{ open: [path: string] }>()

const search = useSearchStore()
const input = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const cursor = ref(0)

/** Le panneau de résultats ne s'affiche que s'il y a quelque chose à montrer. */
const visible = (): boolean => focused.value && search.query.trim() !== ''

function onInput(event: Event): void {
  search.search((event.target as HTMLInputElement).value)
  cursor.value = 0
}

function move(delta: number): void {
  const count = search.hits.length
  if (count === 0) return
  cursor.value = (cursor.value + delta + count) % count
}

function choose(index = cursor.value): void {
  const hit = search.hits[index]
  if (hit === undefined) return
  emit('open', hit.path)
  close()
}

function close(): void {
  focused.value = false
  input.value?.blur()
}

defineExpose({
  focus: (): void => {
    input.value?.focus()
    input.value?.select()
    focused.value = true
  }
})
</script>

<template>
  <div class="search">
    <input
      ref="input"
      :value="search.query"
      type="search"
      class="search__input"
      placeholder="Rechercher dans toutes les notes…"
      aria-label="Rechercher"
      :aria-expanded="visible()"
      spellcheck="false"
      @input="onInput"
      @focus="focused = true"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="choose()"
      @keydown.esc.prevent="close"
    />

    <div v-if="visible()" class="panel">
      <ul v-if="search.hits.length > 0" class="results">
        <li v-for="(hit, index) in search.hits" :key="hit.path">
          <button
            class="result"
            type="button"
            :aria-current="index === cursor"
            @mouseenter="cursor = index"
            @mousedown.prevent="choose(index)"
          >
            <span class="result__title">{{ hit.title }}</span>
            <span class="result__path mono faint">{{ hit.path }}</span>
            <span class="result__excerpt faint">{{ hit.excerpt }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="!search.running" class="empty faint">
        Aucun résultat pour «&nbsp;{{ search.query }}&nbsp;».
      </p>
    </div>

    <!-- Ferme le panneau au clic à côté, sans voler le clic aux résultats. -->
    <div v-if="visible()" class="scrim" @mousedown="close" />
  </div>
</template>

<style scoped>
.search {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search__input {
  width: 100%;
}

.scrim {
  position: fixed;
  inset: 0;
  z-index: 30;
}

.panel {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  max-height: 60vh;
  overflow: auto;
  background: var(--bg-raised);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  box-shadow: 0 14px 38px rgb(0 0 0 / 18%);
}

.results {
  margin: 0;
  padding: 5px;
  list-style: none;
}

.result {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 7px 10px;
  text-align: left;
  border-radius: var(--radius-sm);
}

.result[aria-current='true'] {
  background: var(--accent-soft);
}

.result__title {
  font-weight: 600;
}

.result__path {
  font-size: 11px;
}

.result__excerpt {
  font-size: 12px;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty {
  margin: 0;
  padding: 14px;
  font-size: 13px;
}
</style>
