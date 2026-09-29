<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  rectangularSelection
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { EditorMode } from '@shared/types'

import { applyTool, livePreview, markdownTheme, type MarkdownTool } from './editor-markdown'

const props = defineProps<{
  modelValue: string
  /** `rendu` : la syntaxe est mise en forme. `brut` : le Markdown tel quel. */
  mode: EditorMode
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
const preview = new Compartment()
let view: EditorView | null = null

const TOOLS: Array<{ tool: MarkdownTool; label: string; title: string }> = [
  { tool: 'titre', label: 'H', title: 'Titre' },
  { tool: 'gras', label: 'B', title: 'Gras' },
  { tool: 'italique', label: 'I', title: 'Italique' },
  { tool: 'code', label: '</>', title: 'Code' },
  { tool: 'liste', label: '•', title: 'Liste' },
  { tool: 'case', label: '☑', title: 'Case à cocher' },
  { tool: 'citation', label: '❝', title: 'Citation' },
  { tool: 'lien', label: '🔗', title: 'Lien' }
]

function use(tool: MarkdownTool): void {
  if (view !== null) applyTool(view, tool)
}

onMounted(() => {
  if (host.value === null) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        // Curseur et sélection dessinés par CodeMirror : le curseur natif est
        // trop fin pour se repérer, et il se perd là où la syntaxe est masquée.
        drawSelection({ cursorBlinkRate: 1100 }),
        dropCursor(),
        rectangularSelection(),
        highlightActiveLine(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        markdownTheme,
        EditorView.lineWrapping,
        preview.of(props.mode === 'rendu' ? livePreview() : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
        })
      ]
    })
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// Basculer de mode ne touche pas au texte : c'est le même document.
watch(
  () => props.mode,
  (mode) => {
    view?.dispatch({
      effects: preview.reconfigure(mode === 'rendu' ? livePreview() : [])
    })
  }
)

// Le parent peut remplacer le contenu : autre conversation, rechargement.
watch(
  () => props.modelValue,
  (next) => {
    if (view === null || next === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  }
)

defineExpose({ focus: (): void => view?.focus() })
</script>

<template>
  <div class="editor">
    <div class="editor__tools" role="toolbar" aria-label="Mise en forme">
      <button
        v-for="item in TOOLS"
        :key="item.tool"
        class="tool"
        type="button"
        :title="item.title"
        :aria-label="item.title"
        @click="use(item.tool)"
      >
        {{ item.label }}
      </button>
    </div>

    <div ref="host" class="editor__host" />
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.editor__tools {
  display: flex;
  gap: 2px;
  padding: 5px 20px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}

.tool {
  min-width: 27px;
  height: 24px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-muted);
}

.tool:hover {
  background: var(--bg-raised);
  color: var(--text);
}

.editor__host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
