import { syntaxTree } from '@codemirror/language'
import type { ChangeSpec, EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'

/**
 * Le mode « rendu visuel » : on écrit dans du Markdown, mais on le voit mis
 * en forme.
 *
 * Le principe est celui d'Obsidian : les marques de syntaxe (`#`, `**`, `` ` ``)
 * sont masquées, sauf sur la ligne où se trouve le curseur — là, elles
 * réapparaissent pour qu'on puisse les corriger. Le fichier, lui, ne change
 * jamais : c'est un habillage.
 */

/** Marques masquées en mode rendu, hors de la ligne courante. */
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
  'StrikethroughMark'
])

/** Nœuds simplement habillés d'une classe. */
const STYLED: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
  Blockquote: 'cm-md-quote',
  URL: 'cm-md-url'
}

const hidden = Decoration.replace({})

/** Case à cocher cliquable, rendue à la place de `[ ]`. */
class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super()
  }

  override eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }

  toDOM(): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-md-check'
    box.checked = this.checked
    return box
  }

  override ignoreEvent(): boolean {
    return false
  }
}

/** Lignes que le curseur occupe : elles gardent leur syntaxe visible. */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number
    const to = state.doc.lineAt(range.to).number
    for (let line = from; line <= to; line += 1) lines.add(line)
  }
  return lines
}

function decorate(view: EditorView): DecorationSet {
  const marks: Array<{ from: number; to: number; value: Decoration }> = []
  const active = activeLines(view.state)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const styleClass = STYLED[node.name]
        if (styleClass !== undefined && node.to > node.from) {
          marks.push({ from: node.from, to: node.to, value: Decoration.mark({ class: styleClass }) })
        }

        if (node.name === 'TaskMarker') {
          const text = view.state.doc.sliceString(node.from, node.to)
          marks.push({
            from: node.from,
            to: node.to,
            value: Decoration.replace({
              widget: new CheckboxWidget(text.toLowerCase().includes('x'))
            })
          })
          return
        }

        if (HIDDEN_MARKS.has(node.name) && node.to > node.from) {
          const line = view.state.doc.lineAt(node.from).number
          // Sur la ligne courante, on laisse voir la syntaxe pour l'éditer.
          if (!active.has(line)) marks.push({ from: node.from, to: node.to, value: hidden })
        }
      }
    })
  }

  marks.sort((a, b) => a.from - b.from || a.to - b.to)
  return Decoration.set(
    marks.map((item) => item.value.range(item.from, item.to)),
    true
  )
}

/** Clic sur une case : on écrit le nouveau caractère dans le document. */
function toggleCheckbox(view: EditorView, target: HTMLElement): boolean {
  const pos = view.posAtDOM(target)
  const line = view.state.doc.lineAt(pos)
  const match = /^(\s*[-*+]\s+\[)([^\]])(\])/.exec(line.text)
  if (match === null) return false

  const at = line.from + (match[1]?.length ?? 0)
  const next = (match[2] ?? ' ').toLowerCase() === 'x' ? ' ' : 'x'
  view.dispatch({ changes: { from: at, to: at + 1, insert: next } })
  return true
}

export function livePreview(): Extension {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet

        constructor(view: EditorView) {
          this.decorations = decorate(view)
        }

        update(update: ViewUpdate): void {
          if (update.docChanged || update.viewportChanged || update.selectionSet) {
            this.decorations = decorate(update.view)
          }
        }
      },
      { decorations: (plugin) => plugin.decorations }
    ),
    EditorView.domEventHandlers({
      mousedown: (event, view) => {
        const target = event.target as HTMLElement
        if (target instanceof HTMLInputElement && target.classList.contains('cm-md-check')) {
          event.preventDefault()
          return toggleCheckbox(view, target)
        }
        return false
      }
    })
  ]
}

// --- Outils d'écriture -----------------------------------------------------

/** Entoure la sélection, ou retire l'entourage s'il est déjà là. */
function wrap(view: EditorView, marker: string): void {
  const changes: ChangeSpec[] = []
  for (const range of view.state.selection.ranges) {
    const text = view.state.sliceDoc(range.from, range.to)
    const already = text.startsWith(marker) && text.endsWith(marker) && text.length >= marker.length * 2
    changes.push({
      from: range.from,
      to: range.to,
      insert: already ? text.slice(marker.length, -marker.length) : `${marker}${text}${marker}`
    })
  }
  view.dispatch({ changes })
  view.focus()
}

/** Pose ou retire un préfixe de ligne (`#`, `- `, `> `, `- [ ] `). */
function prefixLines(view: EditorView, prefix: string): void {
  const changes: ChangeSpec[] = []
  const seen = new Set<number>()

  for (const range of view.state.selection.ranges) {
    const first = view.state.doc.lineAt(range.from).number
    const last = view.state.doc.lineAt(range.to).number
    for (let number = first; number <= last; number += 1) {
      if (seen.has(number)) continue
      seen.add(number)

      const line = view.state.doc.line(number)
      if (line.text.startsWith(prefix)) {
        changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
      } else {
        changes.push({ from: line.from, insert: prefix })
      }
    }
  }
  view.dispatch({ changes })
  view.focus()
}

export type MarkdownTool =
  | 'titre'
  | 'gras'
  | 'italique'
  | 'code'
  | 'liste'
  | 'case'
  | 'citation'
  | 'lien'

/** Applique un outil de la barre d'écriture. */
export function applyTool(view: EditorView, tool: MarkdownTool): void {
  switch (tool) {
    case 'titre':
      return prefixLines(view, '## ')
    case 'gras':
      return wrap(view, '**')
    case 'italique':
      return wrap(view, '*')
    case 'code':
      return wrap(view, '`')
    case 'liste':
      return prefixLines(view, '- ')
    case 'case':
      return prefixLines(view, '- [ ] ')
    case 'citation':
      return prefixLines(view, '> ')
    case 'lien': {
      const range = view.state.selection.main
      const text = view.state.sliceDoc(range.from, range.to)
      view.dispatch({
        changes: { from: range.from, to: range.to, insert: `[${text}](url)` },
        selection: { anchor: range.from + text.length + 3, head: range.from + text.length + 6 }
      })
      view.focus()
      return
    }
  }
}

/** Habillage du mode rendu : tailles, graisses, citations, cases. */
export const markdownTheme = EditorView.baseTheme({
  // Le curseur : franc, à la couleur d'accent, pour ne jamais le chercher.
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '2px solid var(--accent)',
    marginLeft: '-1px'
  },
  '.cm-activeLine': { background: 'var(--active-line)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    background: 'var(--selection)'
  },

  '.cm-md-h1': { fontSize: '1.7em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-md-h2': { fontSize: '1.4em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-md-h3': { fontSize: '1.2em', fontWeight: '600' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': { fontWeight: '600' },
  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code': {
    fontFamily: 'var(--mono)',
    fontSize: '0.92em',
    background: 'var(--bg-sunken)',
    borderRadius: '3px',
    padding: '0 3px'
  },
  '.cm-md-quote': { color: 'var(--text-muted)', fontStyle: 'italic' },
  '.cm-md-url': { color: 'var(--accent)', textDecoration: 'underline' },
  '.cm-md-check': {
    appearance: 'none',
    width: '13px',
    height: '13px',
    margin: '0 4px -1px 0',
    border: '1.5px solid var(--border-strong)',
    borderRadius: '3px',
    background: 'var(--bg-raised)',
    cursor: 'pointer',
    verticalAlign: 'baseline'
  },
  '.cm-md-check:checked': { background: 'var(--accent)', borderColor: 'var(--accent)' }
})
