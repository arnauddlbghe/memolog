<script setup lang="ts">
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown } from '@codemirror/lang-markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  keymap,
  type DecorationSet,
  type ViewUpdate
} from '@codemirror/view'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { Task } from '@shared/types'

import {
  editorTheme,
  refCompletion,
  taskCommandKeymap,
  type TaskCommand
} from './editor-extensions'

const props = defineProps<{
  /** Contenu du document. Les changements venus du parent remplacent l'éditeur. */
  modelValue: string
  /** Références `@tNN` résolues, pour les afficher en étiquettes. */
  refs?: Record<string, Task | null>
  /** Les cases à cocher sont-elles des tâches Memolog (fichier `taches.md`) ? */
  taskFile?: boolean
  /** Tâches actives, pour l'autocomplétion des références `@t…`. */
  activeTasks?: Task[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  /** Clic sur la case d'une tâche identifiée, dans un fichier de tâches. */
  'toggle-task': [id: string]
  /** Clic sur une étiquette `@tNN`. */
  'open-task': [id: string]
  /** Commande `/t` validée dans l'éditeur. */
  'task-command': [command: TaskCommand]
}>()

const host = ref<HTMLElement | null>(null)
let view: EditorView | null = null

const STATE_MARKS: Record<string, string> = {
  ' ': 'à faire',
  '/': 'en cours',
  '>': 'reportée',
  x: 'terminée',
  X: 'terminée',
  '-': 'abandonnée'
}

/** Case à cocher cliquable, rendue à la place de `[ ]`. */
class CheckboxWidget extends WidgetType {
  constructor(
    private readonly mark: string,
    private readonly taskId: string | null
  ) {
    super()
  }

  override eq(other: CheckboxWidget): boolean {
    return other.mark === this.mark && other.taskId === this.taskId
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'memolog-checkbox'
    box.checked = this.mark.toLowerCase() === 'x'
    box.indeterminate = this.mark === '/' || this.mark === '>'
    box.title = STATE_MARKS[this.mark] ?? 'à faire'
    box.dataset['taskId'] = this.taskId ?? ''
    return box
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/** Étiquette affichée à la place d'une référence `@tNN`. */
class RefWidget extends WidgetType {
  constructor(
    private readonly id: string,
    private readonly task: Task | null
  ) {
    super()
  }

  override eq(other: RefWidget): boolean {
    return other.id === this.id && other.task?.text === this.task?.text && other.task?.state === this.task?.state
  }

  toDOM(): HTMLElement {
    const label = document.createElement('span')
    label.className = this.task === null ? 'memolog-ref memolog-ref--orphan' : 'memolog-ref'
    label.dataset['refId'] = this.id
    label.textContent =
      this.task === null
        ? `@${this.id} (tâche inconnue)`
        : `${this.task.text} · ${STATE_MARKS[markOf(this.task.state)] ?? ''}`
    label.title = `@${this.id}`
    return label
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function markOf(state: string): string {
  switch (state) {
    case 'en-cours':
      return '/'
    case 'reportee':
      return '>'
    case 'terminee':
      return 'x'
    case 'abandonnee':
      return '-'
    default:
      return ' '
  }
}

const TASK_LINE = /^(\s*)([-*+])\s+\[([^\]])\]/
const TASK_ID = /\^t\d+/g
const INLINE_FIELD = /\[[^[\]:]+::\s*[^\]]*\]/g
const REF = /(^|[^\p{L}\p{N}_@])@t(\d+)\b/gu

const dimmed = Decoration.mark({ class: 'memolog-dim' })

/**
 * Décorations de l'éditeur : cases à cocher cliquables, métadonnées de tâche
 * atténuées, références `@tNN` en étiquettes.
 *
 * Construites uniquement sur les lignes visibles : le coût ne dépend pas de
 * la taille du document.
 */
function decorate(view: EditorView, refs: Record<string, Task | null>): DecorationSet {
  const builder: Array<{ from: number; to: number; value: Decoration }> = []

  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = view.state.doc.lineAt(pos)
      const text = line.text

      const task = TASK_LINE.exec(text)
      if (task !== null) {
        const mark = task[3] ?? ' '
        const start = line.from + (task[1]?.length ?? 0) + (task[2]?.length ?? 0) + 1
        const open = text.indexOf('[', start - line.from)
        if (open !== -1) {
          const idMatch = /\^t(\d+)/.exec(text)
          builder.push({
            from: line.from + open,
            to: line.from + open + 3,
            value: Decoration.replace({
              widget: new CheckboxWidget(mark, idMatch === null ? null : `t${idMatch[1]}`)
            })
          })
        }
      }

      for (const match of [...text.matchAll(TASK_ID), ...text.matchAll(INLINE_FIELD)]) {
        const index = match.index ?? 0
        builder.push({ from: line.from + index, to: line.from + index + match[0].length, value: dimmed })
      }

      for (const match of text.matchAll(REF)) {
        const prefix = match[1] ?? ''
        const index = (match.index ?? 0) + prefix.length
        const id = `t${match[2]}`
        // On ne masque la référence que si on sait quoi afficher à la place.
        if (!(id in refs)) continue
        builder.push({
          from: line.from + index,
          to: line.from + index + match[0].length - prefix.length,
          value: Decoration.replace({ widget: new RefWidget(id, refs[id] ?? null) })
        })
      }

      if (line.to + 1 > to) break
      pos = line.to + 1
    }
  }

  builder.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    builder.map((item) => item.value.range(item.from, item.to)),
    true
  )
}

function decorationPlugin(getRefs: () => Record<string, Task | null>): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = decorate(view, getRefs())
      }

      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || update.focusChanged) {
          this.decorations = decorate(update.view, getRefs())
        }
      }
    },
    { decorations: (plugin) => plugin.decorations }
  )
}

/** Clic sur une case : cycle l'état, ou coche simplement hors fichier de tâches. */
function onCheckboxClick(view: EditorView, target: HTMLInputElement): boolean {
  const taskId = target.dataset['taskId'] ?? ''
  if (props.taskFile === true && taskId !== '') {
    emit('toggle-task', taskId)
    return true
  }

  const pos = view.posAtDOM(target)
  const line = view.state.doc.lineAt(pos)
  const match = TASK_LINE.exec(line.text)
  if (match === null) return false
  const open = line.text.indexOf('[')
  const current = match[3] ?? ' '
  const next = current.toLowerCase() === 'x' ? ' ' : 'x'
  view.dispatch({
    changes: { from: line.from + open + 1, to: line.from + open + 2, insert: next }
  })
  return true
}

function buildExtensions(): Extension[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    markdown(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    editorTheme,
    // Avant le keymap par défaut : `Entrée` sur une commande `/t` lui revient.
    taskCommandKeymap((command) => emit('task-command', command)),
    refCompletion(() => props.activeTasks ?? []),
    EditorView.lineWrapping,
    EditorState.readOnly.of(props.readonly === true),
    decorationPlugin(() => props.refs ?? {}),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const target = event.target as HTMLElement
        if (target instanceof HTMLInputElement && target.classList.contains('memolog-checkbox')) {
          event.preventDefault()
          return onCheckboxClick(view, target)
        }
        if (target.classList.contains('memolog-ref')) {
          event.preventDefault()
          emit('open-task', target.dataset['refId'] ?? '')
          return true
        }
        return false
      }
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
    })
  ]
}

onMounted(() => {
  if (host.value === null) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({ doc: props.modelValue, extensions: buildExtensions() })
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

// Le parent peut remplacer le contenu (autre note, rechargement après conflit).
watch(
  () => props.modelValue,
  (next) => {
    if (view === null || next === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } })
  }
)

watch(
  () => props.readonly,
  () => {
    if (view === null) return
    const content = view.state.doc.toString()
    view.setState(EditorState.create({ doc: content, extensions: buildExtensions() }))
  }
)

defineExpose({
  focus: (): void => view?.focus(),
  /** Remplace un intervalle : sert à changer `/t …` en `@tNN`. */
  replaceRange: (from: number, to: number, text: string): void => {
    if (view === null) return
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  },
  /** Insère du texte à la position du curseur : commande `/t`, référence… */
  insertAtCursor: (text: string): void => {
    if (view === null) return
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  }
})
</script>

<template>
  <div ref="host" class="editor" />
</template>

<style scoped>
.editor {
  height: 100%;
  overflow: hidden;
}
</style>
