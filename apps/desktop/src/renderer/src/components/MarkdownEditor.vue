<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Annotation, EditorState, Prec } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  rectangularSelection
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import {
  TOOL_COMMANDS,
  TOOL_KEYS,
  editorContext,
  livePreview,
  markdownTheme,
  markdownWritingKeymap,
  minimalChange,
  type EditorContext,
  type MarkdownTool
} from './editor-markdown'

const props = defineProps<{ modelValue: string }>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

/**
 * Marque les changements poussés par le parent, pour les distinguer d'une
 * saisie. Sans elle, ouvrir une conversation remplissait le document, ce qui
 * remontait comme une modification et affichait aussitôt « Non sauvegardé ».
 */
const fromParent = Annotation.define<boolean>()

/** Ce que le curseur touche : sert à allumer les boutons de la barre. */
const context = ref<EditorContext>({ tools: new Set(), heading: 0 })

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

const isMac = navigator.platform.toUpperCase().includes('MAC')

/** « Mod-Shift-l » → « ⌘⇧L » sur macOS, « Ctrl+Shift+L » ailleurs. */
function shortcut(key: string): string {
  const parts = key.split('-')
  if (isMac) {
    return parts
      .map((part) => {
        if (part === 'Mod') return '⌘'
        if (part === 'Shift') return '⇧'
        if (part === 'Alt') return '⌥'
        return part.toUpperCase()
      })
      .join('')
  }
  return parts
    .map((part) => (part === 'Mod' ? 'Ctrl' : part))
    .join('+')
    .toUpperCase()
}

/** Le bouton titre affiche le niveau de la ligne courante. */
function labelOf(item: (typeof TOOLS)[number]): string {
  if (item.tool !== 'titre') return item.label
  return context.value.heading === 0 ? 'H' : `H${context.value.heading}`
}

function titleOf(item: (typeof TOOLS)[number]): string {
  return `${item.title} (${shortcut(TOOL_KEYS[item.tool])})`
}

function isActive(tool: MarkdownTool): boolean {
  if (tool === 'titre') return context.value.heading > 0
  return context.value.tools.has(tool)
}

function use(tool: MarkdownTool): void {
  if (view === null) return
  TOOL_COMMANDS[tool]({ state: view.state, dispatch: (tr) => view?.dispatch(tr) })
  view.focus()
}

onMounted(() => {
  if (host.value === null) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        // Priorité haute, et donc avant `defaultKeymap` : c'est ce qui permet
        // à Entrée de continuer une liste plutôt que d'insérer une ligne nue,
        // et à Cmd+I de mettre en italique au lieu d'étendre la sélection.
        Prec.high(markdownWritingKeymap()),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        // Curseur et sélection dessinés par CodeMirror : le curseur natif est
        // trop fin pour se repérer, et il se perd là où la syntaxe est masquée.
        drawSelection({ cursorBlinkRate: 1100 }),
        dropCursor(),
        rectangularSelection(),
        markdown({ base: markdownLanguage }),
        // Pas de `defaultHighlightStyle` : il souligne les titres, colore les
        // URL en bleu vif et se bat avec l'habillage de `markdownTheme`, qui
        // couvre déjà titres, emphases, code et liens.
        markdownTheme,
        EditorView.lineWrapping,
        livePreview(),
        EditorView.updateListener.of((update) => {
          // Un texte poussé par le parent n'est pas une saisie : le renvoyer
          // marquerait la conversation « Non sauvegardé » à sa simple ouverture.
          const external = update.transactions.some((tr) => tr.annotation(fromParent) === true)
          if (update.docChanged && !external) {
            emit('update:modelValue', update.state.doc.toString())
          }
          if (update.docChanged || update.selectionSet) {
            context.value = editorContext(update.state)
          }
        })
      ]
    })
  })
  context.value = editorContext(view.state)
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

/**
 * Le parent peut remplacer le contenu : autre conversation, rechargement après
 * enregistrement, modification venue du disque. On ne réécrit que ce qui
 * diffère, pour que le curseur reste où il est (voir `minimalChange`).
 */
watch(
  () => props.modelValue,
  (next) => {
    if (view === null) return
    const changes = minimalChange(view.state.doc.toString(), next)
    if (changes !== null) view.dispatch({ changes, annotations: fromParent.of(true) })
  }
)

defineExpose({ focus: (): void => view?.focus() })
</script>

<template>
  <div class="editor">
    <div class="editor__bar">
      <div class="editor__tools" role="toolbar" aria-label="Mise en forme">
        <button
          v-for="item in TOOLS"
          :key="item.tool"
          class="tool"
          :class="{ 'tool--on': isActive(item.tool) }"
          type="button"
          :title="titleOf(item)"
          :aria-label="item.title"
          :aria-pressed="isActive(item.tool)"
          @click="use(item.tool)"
        >
          {{ labelOf(item) }}
        </button>
      </div>
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

/* La bande traverse toute la largeur… */
.editor__bar {
  padding: 5px 0;
  border-bottom: 1px solid var(--border);
  background: var(--bg-sunken);
}

/*
 * …mais les boutons s'alignent sur la colonne de texte, comme `.cm-content`.
 * Collés à gauche, ils ne surplombaient pas le texte qu'ils modifient. Le
 * retrait est moindre que les 28px du texte : un bouton centre son glyphe
 * dans sa propre largeur, ce qui le décale déjà vers la droite.
 */
.editor__tools {
  display: flex;
  gap: 2px;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 20px;
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

.tool--on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.editor__host {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
