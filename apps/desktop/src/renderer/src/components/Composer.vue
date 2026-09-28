<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

export type ComposerMode = 'tache' | 'note'

export interface ComposerSubmit {
  mode: ComposerMode
  /** Titre de la tâche, ou texte de l'entrée de journal. */
  text: string
  /** Description de la tâche, ou sous-puces de l'entrée. */
  body: string
  /** Projet de la tâche ; vide = « Divers ». */
  project: string
}

const props = defineProps<{ projects: string[]; busy?: boolean }>()
const emit = defineEmits<{ submit: [value: ComposerSubmit] }>()

const mode = ref<ComposerMode>('tache')
const text = ref('')
const body = ref('')
const project = ref('')
const expanded = ref(false)

const title = ref<HTMLInputElement | null>(null)
const bodyField = ref<HTMLTextAreaElement | null>(null)

const isTask = computed(() => mode.value === 'tache')
const canSubmit = computed(() => text.value.trim() !== '' && props.busy !== true)

const placeholder = computed(() =>
  isTask.value ? 'Nouvelle tâche…' : 'Noter une entrée de journal…'
)

const bodyPlaceholder = computed(() =>
  isTask.value
    ? 'Description : contexte, lien, prochaine action…'
    : 'Détails : chaque ligne devient une sous-puce de l’entrée.'
)

/** La zone de description grandit avec son contenu, sans jamais s'emballer. */
function autosize(): void {
  const field = bodyField.value
  if (field === null) return
  field.style.height = 'auto'
  field.style.height = `${Math.min(field.scrollHeight, 180)}px`
}

watch(body, () => void nextTick(autosize))

async function expand(): Promise<void> {
  expanded.value = true
  await nextTick()
  bodyField.value?.focus()
  autosize()
}

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', {
    mode: mode.value,
    text: text.value.trim(),
    body: body.value.trim(),
    project: project.value.trim()
  })
  text.value = ''
  body.value = ''
  expanded.value = false
  void nextTick(() => title.value?.focus())
}

/**
 * `/t` en tête bascule en mode tâche : la commande du cahier des charges
 * reste utilisable, même quand on écrit dans le composeur de notes.
 */
watch(text, (value) => {
  const command = /^\/t\s+(.*)$/i.exec(value)
  if (command === null) return
  mode.value = 'tache'
  text.value = command[1] ?? ''
})

defineExpose({
  focus: (target: ComposerMode = 'tache'): void => {
    mode.value = target
    title.value?.focus()
  }
})
</script>

<template>
  <form class="composer" :class="{ 'composer--expanded': expanded }" @submit.prevent="submit">
    <div class="composer__modes" role="group" aria-label="Que voulez-vous ajouter ?">
      <button
        type="button"
        class="mode"
        :aria-pressed="isTask"
        @click="mode = 'tache'"
      >
        Tâche
      </button>
      <button
        type="button"
        class="mode"
        :aria-pressed="!isTask"
        @click="mode = 'note'"
      >
        Note du jour
      </button>
    </div>

    <div class="composer__main">
      <input
        ref="title"
        v-model="text"
        type="text"
        class="composer__title"
        :placeholder="placeholder"
        :aria-label="isTask ? 'Titre de la tâche' : 'Entrée de journal'"
        @keydown.enter.exact.prevent="submit"
        @keydown.meta.enter.prevent="submit"
        @keydown.ctrl.enter.prevent="submit"
      />

      <input
        v-if="isTask"
        v-model="project"
        type="text"
        class="composer__project"
        placeholder="Projet"
        aria-label="Projet"
        list="composer-projets"
        @keydown.enter.prevent="submit"
      />
      <datalist id="composer-projets">
        <option v-for="name in projects" :key="name" :value="name" />
      </datalist>

      <button
        v-if="!expanded"
        type="button"
        class="btn btn--ghost composer__more"
        :title="isTask ? 'Ajouter une description' : 'Ajouter des détails'"
        @click="expand"
      >
        + {{ isTask ? 'description' : 'détails' }}
      </button>

      <button class="btn btn--primary" type="submit" :disabled="!canSubmit">Ajouter</button>
    </div>

    <textarea
      v-show="expanded"
      ref="bodyField"
      v-model="body"
      class="composer__body"
      rows="2"
      :placeholder="bodyPlaceholder"
      :aria-label="isTask ? 'Description de la tâche' : 'Détails de l’entrée'"
      @keydown.meta.enter.prevent="submit"
      @keydown.ctrl.enter.prevent="submit"
      @keydown.esc.prevent="expanded = false"
    />

    <p v-if="expanded" class="composer__hint faint">
      {{ isTask ? 'La description est écrite sous la tâche dans taches.md.' : 'Chaque ligne devient une sous-puce.' }}
      <span class="mono">Cmd/Ctrl + Entrée</span> pour valider.
    </p>
  </form>
</template>

<style scoped>
.composer {
  border-top: 1px solid var(--border);
  background: var(--bg-sunken);
  padding: 8px 16px 10px;
}

.composer__modes {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.mode {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-muted);
}

.mode[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.composer__main {
  display: flex;
  gap: 8px;
  align-items: center;
}

.composer__title {
  flex: 1;
  min-width: 0;
}

.composer__project {
  width: 150px;
  flex: none;
}

.composer__more {
  white-space: nowrap;
  font-size: 12px;
}

.composer__body {
  display: block;
  width: 100%;
  margin-top: 8px;
  resize: none;
  line-height: 1.5;
  overflow-y: auto;
}

.composer__hint {
  margin: 6px 0 0;
  font-size: 11px;
}

@media (max-width: 720px) {
  .composer__project {
    width: 110px;
  }
}
</style>
