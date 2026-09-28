<script setup lang="ts">
import { computed, ref } from 'vue'

import type { NoteContent } from '@shared/types'

const props = defineProps<{ disk: NoteContent; mine: string }>()
const emit = defineEmits<{ keep: []; take: [] }>()

const comparing = ref(false)

/** Diff ligne à ligne, préfixe et suffixe communs retirés. */
const diff = computed(() => {
  const mine = props.mine.split('\n')
  const disk = props.disk.content.split('\n')

  let start = 0
  while (start < mine.length && start < disk.length && mine[start] === disk[start]) start += 1

  let end = 0
  while (
    end < mine.length - start &&
    end < disk.length - start &&
    mine[mine.length - 1 - end] === disk[disk.length - 1 - end]
  ) {
    end += 1
  }

  return {
    firstLine: start + 1,
    mine: mine.slice(start, mine.length - end),
    disk: disk.slice(start, disk.length - end)
  }
})
</script>

<template>
  <div class="banner" role="alert">
    <div class="banner__row">
      <span class="banner__icon" aria-hidden="true">⚠</span>
      <p class="banner__text">
        Cette note a été modifiée en dehors de Memolog pendant que vous l'éditiez.
        <span class="muted">Rien n'a été écrasé.</span>
      </p>
      <div class="banner__actions">
        <button class="btn" type="button" @click="comparing = !comparing">
          {{ comparing ? 'Masquer' : 'Comparer' }}
        </button>
        <button class="btn" type="button" @click="emit('take')">Charger la version du disque</button>
        <button class="btn btn--primary" type="button" @click="emit('keep')">Garder la mienne</button>
      </div>
    </div>

    <div v-if="comparing" class="diff">
      <p class="diff__hint faint">Différences à partir de la ligne {{ diff.firstLine }}.</p>
      <div class="diff__panes">
        <section>
          <h3>Votre version</h3>
          <pre class="mono">{{ diff.mine.join('\n') || '(rien)' }}</pre>
        </section>
        <section>
          <h3>Sur le disque</h3>
          <pre class="mono">{{ diff.disk.join('\n') || '(rien)' }}</pre>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner {
  background: var(--warning-bg);
  border-bottom: 1px solid var(--warning-border);
  padding: 10px 16px;
}

.banner__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.banner__text {
  margin: 0;
  flex: 1;
  min-width: 220px;
}

.banner__actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.diff {
  margin-top: 10px;
}

.diff__hint {
  margin: 0 0 6px;
}

.diff__panes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

h3 {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
}

pre {
  margin: 0;
  padding: 8px;
  max-height: 220px;
  overflow: auto;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  white-space: pre-wrap;
}

@media (max-width: 720px) {
  .diff__panes {
    grid-template-columns: 1fr;
  }
}
</style>
