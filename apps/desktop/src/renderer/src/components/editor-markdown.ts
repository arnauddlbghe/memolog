import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { markdownKeymap } from '@codemirror/lang-markdown'
import type { EditorState, Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view'
import type { DecorationSet, KeyBinding, ViewUpdate } from '@codemirror/view'

import { TOOL_COMMANDS, TOOL_KEYS, type MarkdownTool } from './editor-commands'

/**
 * Le mode « rendu visuel » : on écrit dans du Markdown, mais on le voit mis
 * en forme.
 *
 * Le principe est celui d'Obsidian : les marques de syntaxe (`#`, `**`, `` ` ``)
 * sont masquées, et réapparaissent là où le curseur se pose pour qu'on puisse
 * les corriger — voir `revealsMark` pour la portée exacte. Le fichier, lui, ne
 * change jamais : c'est un habillage.
 */

/** Un nœud de l'arbre, dérivé faute d'avoir `@lezer/common` en dépendance. */
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

/** Marques masquées en mode rendu, hors de ce que le curseur touche. */
const HIDDEN_MARKS = new Set([
  'HeaderMark',
  'EmphasisMark',
  'CodeMark',
  'QuoteMark',
  'LinkMark',
  'StrikethroughMark'
])

/** Nœuds habillés d'une classe posée sur la ligne entière. */
const LINE_STYLED: Record<string, string> = {
  ATXHeading1: 'cm-md-h1',
  ATXHeading2: 'cm-md-h2',
  ATXHeading3: 'cm-md-h3',
  ATXHeading4: 'cm-md-h4',
  ATXHeading5: 'cm-md-h5',
  ATXHeading6: 'cm-md-h6',
  ListItem: 'cm-md-li'
}

/** Nœuds habillés d'une classe posée sur le texte seul. */
const MARK_STYLED: Record<string, string> = {
  StrongEmphasis: 'cm-md-strong',
  Emphasis: 'cm-md-em',
  Strikethrough: 'cm-md-strike',
  InlineCode: 'cm-md-code',
  Link: 'cm-md-link',
  CodeInfo: 'cm-md-info'
}

/**
 * Nœuds dont *toutes* les lignes reçoivent une classe. Un fond de bloc de code
 * ou un filet de citation n'a de sens que sur la ligne entière : une
 * décoration de texte ne saurait pas les dessiner.
 */
const BLOCK_STYLED: Record<string, string> = {
  Blockquote: 'cm-md-quote',
  FencedCode: 'cm-md-fence',
  CodeBlock: 'cm-md-fence'
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

/** Le filet d'un `---`, dessiné plutôt qu'écrit. */
class RuleWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const rule = document.createElement('span')
    rule.className = 'cm-md-rule'
    return rule
  }
}

/**
 * La puce d'une liste, à la place de `- `.
 *
 * Elle occupe une largeur fixe, et c'est ce qui permet au retour à la ligne de
 * s'aligner exactement sous le texte : avec le tiret d'origine, la largeur
 * dépendait de la police et l'alignement tombait toujours à côté.
 */
class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const bullet = document.createElement('span')
    bullet.className = 'cm-md-bullet'
    bullet.textContent = '•'
    return bullet
  }
}

export interface Span {
  from: number
  to: number
}

/**
 * Faut-il laisser voir cette marque de syntaxe ?
 *
 * On ne dévoile plus la ligne entière : écrire à la fin d'un titre faisait
 * surgir le `#` du début et décalait tout le texte. La règle est maintenant :
 *
 * - marque de **bloc** (`#`, `>`, la puce d'une liste) — `construct` vaut
 *   `null` : elle n'apparaît que si le curseur est posé dessus ;
 * - marque **en ligne** (`**`, `` ` ``, les crochets d'un lien) : elle
 *   apparaît dès que le curseur est quelque part dans ce qu'elle délimite,
 *   puisque c'est là qu'on voudra la corriger.
 *
 * `ranges` est vide quand l'éditeur n'a pas le focus : sinon une note
 * s'ouvrirait avec son curseur en position 0, et sa première ligne
 * s'afficherait en Markdown brut alors qu'on n'a pas encore cliqué dedans.
 */
export function revealsMark(ranges: readonly Span[], mark: Span, construct: Span | null): boolean {
  const zone = construct ?? mark
  for (const range of ranges) {
    if (range.to >= zone.from && range.from <= zone.to) return true
  }
  return false
}

/** Temps laissé à l'analyseur pour couvrir la zone visible, en millisecondes. */
const PARSE_BUDGET_MS = 50

/** Étend une position d'un caractère si c'est une espace, sans changer de ligne. */
function eatSpace(state: EditorState, to: number): number {
  return state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to
}

/** Vrai si le nœud possède un enfant direct de ce nom. */
function hasChild(node: SyntaxNode | null, name: string): boolean {
  if (node === null) return false
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.name === name) return true
  }
  return false
}

function decorate(view: EditorView): DecorationSet {
  const marks: Array<{ from: number; to: number; value: Decoration }> = []
  const ranges: readonly Span[] = view.hasFocus ? view.state.selection.ranges : []
  // Une même ligne peut être touchée par plusieurs nœuds — listes imbriquées,
  // citation contenant une liste : une classe n'y est posée qu'une fois.
  const lined = new Set<string>()

  const addLine = (pos: number, cls: string): void => {
    const line = view.state.doc.lineAt(pos)
    const key = `${line.from}:${cls}`
    if (lined.has(key)) return
    lined.add(key)
    marks.push({ from: line.from, to: line.from, value: Decoration.line({ class: cls }) })
  }

  for (const { from, to } of view.visibleRanges) {
    // L'analyse est incrémentale : sans cette attente, l'arbre peut s'arrêter
    // avant le bas de l'écran et le Markdown y resterait affiché brut.
    const tree = ensureSyntaxTree(view.state, to, PARSE_BUDGET_MS) ?? syntaxTree(view.state)
    tree.iterate({
      from,
      to,
      enter: (node) => {
        const lineClass = LINE_STYLED[node.name]
        if (lineClass !== undefined) addLine(node.from, lineClass)

        const markClass = MARK_STYLED[node.name]
        if (markClass !== undefined && node.to > node.from) {
          marks.push({ from: node.from, to: node.to, value: Decoration.mark({ class: markClass }) })
        }

        const blockClass = BLOCK_STYLED[node.name]
        if (blockClass !== undefined) {
          const first = view.state.doc.lineAt(node.from).number
          const last = view.state.doc.lineAt(node.to).number
          for (let number = first; number <= last; number += 1) {
            const at = view.state.doc.line(number).from
            addLine(at, blockClass)
            if (number === first) addLine(at, `${blockClass}-open`)
            if (number === last) addLine(at, `${blockClass}-close`)
          }
        }

        if (node.name === 'TaskMarker') {
          const text = view.state.doc.sliceString(node.from, node.to)
          marks.push({
            from: node.from,
            to: eatSpace(view.state, node.to),
            value: Decoration.replace({
              widget: new CheckboxWidget(text.toLowerCase().includes('x'))
            })
          })
          return
        }

        /*
         * La puce : remplacée par un rond de largeur fixe. Sur une tâche, la
         * case à cocher en tient lieu et le tiret disparaît — il reste dans le
         * fichier, parce qu'une case Markdown est toujours un élément de liste.
         * Le tiret d'origine ne revient que si le curseur se pose dessus.
         */
        if (node.name === 'ListMark') {
          const end = eatSpace(view.state, node.to)
          const bullet = '-*+'.includes(view.state.doc.sliceString(node.from, node.to))
          if (bullet && !revealsMark(ranges, { from: node.from, to: end }, null)) {
            marks.push({
              from: node.from,
              to: end,
              value: hasChild(node.node.parent, 'Task')
                ? hidden
                : Decoration.replace({ widget: new BulletWidget() })
            })
          }
          return
        }

        if (node.name === 'HorizontalRule' && !revealsMark(ranges, node, null)) {
          marks.push({
            from: node.from,
            to: node.to,
            value: Decoration.replace({ widget: new RuleWidget() })
          })
          return
        }

        const parent = node.node.parent

        // L'adresse d'un lien s'efface : seul son libellé reste, souligné.
        // Elle revient dès que le curseur entre dans le lien, pour la corriger.
        if (node.name === 'URL' && parent?.name === 'Link') {
          if (!revealsMark(ranges, node, parent)) {
            marks.push({ from: node.from, to: node.to, value: hidden })
          }
          return
        }

        if (HIDDEN_MARKS.has(node.name) && node.to > node.from) {
          // Les ``` d'un bloc de code restent : les masquer laisserait deux
          // bandes vides, et la ligne d'ouverture réduite au nom du langage.
          if (node.name === 'CodeMark' && parent?.name === 'FencedCode') return

          // `#` et `>` emportent l'espace qui les suit, sinon tout le bloc
          // reste décalé d'un caractère vers la droite.
          const lineLevel = node.name === 'HeaderMark' || node.name === 'QuoteMark'
          const end = lineLevel ? eatSpace(view.state, node.to) : node.to

          const mark = { from: node.from, to: end }
          if (!revealsMark(ranges, mark, lineLevel ? null : parent)) {
            marks.push({ ...mark, value: hidden })
          }
        }
      }
    })
  }

  // `Decoration.set` trie lui-même, et lui seul sait ordonner une décoration de
  // ligne et une décoration de texte qui commencent au même endroit : trier à
  // la main ici casserait le rendu.
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
          // L'analyse Markdown se poursuit en tâche de fond : quand elle avance,
          // l'arbre change sans que le document ni la vue aient bougé. Sans ce
          // dernier cas, la zone analysée trop tard resterait en Markdown brut.
          const parsed = syntaxTree(update.state) !== syntaxTree(update.startState)

          if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            update.focusChanged ||
            parsed
          ) {
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

// --- Clavier ----------------------------------------------------------------

/**
 * Les raccourcis d'écriture, plus ceux de `@codemirror/lang-markdown` : Entrée
 * continue une liste, une case ou une citation, Retour arrière retire un niveau
 * de markup.
 *
 * À monter **avant** `defaultKeymap`, donc à une priorité plus haute : sinon
 * `insertNewlineAndIndent` et `deleteCharBackward` répondent les premiers et la
 * continuation de liste ne se déclenche jamais. `Mod-i` est dans le même cas,
 * déjà pris par `selectParentSyntax`.
 */
export function markdownWritingKeymap(): Extension {
  const bindings: KeyBinding[] = Object.entries(TOOL_KEYS).map(([tool, key]) => ({
    key,
    run: TOOL_COMMANDS[tool as MarkdownTool],
    preventDefault: true
  }))

  return keymap.of([...bindings, ...markdownKeymap])
}

// --- Habillage --------------------------------------------------------------

/**
 * Tout le style de l'éditeur vit ici plutôt que dans `styles.css` : les
 * décorations et leurs règles restent ainsi côte à côte. Les couleurs viennent
 * des variables de thème de l'application, donc le mode sombre suit tout seul.
 */
export const markdownTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },

  '.cm-scroller': {
    fontFamily: 'var(--font)',
    fontSize: '15px',
    lineHeight: '1.75',
    padding: '18px 0 40vh'
  },

  // Une mesure d'environ 70 caractères : au-delà, l'œil perd sa ligne.
  '.cm-content': { maxWidth: '720px', margin: '0 auto', padding: '0 28px' },
  '.cm-gutters': { display: 'none' },

  // Le curseur : franc, à la couleur d'accent, pour ne jamais le chercher.
  '.cm-cursor, .cm-dropCursor': {
    borderLeft: '2px solid var(--accent)',
    marginLeft: '-1px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    background: 'var(--selection)'
  },

  // Les titres respirent par le haut : c'est ce qui sépare les sections.
  '.cm-md-h1': {
    fontSize: '1.75em',
    fontWeight: '700',
    lineHeight: '1.25',
    padding: '0.7em 2px 0.15em 6px'
  },
  '.cm-md-h2': {
    fontSize: '1.4em',
    fontWeight: '700',
    lineHeight: '1.3',
    padding: '0.55em 2px 0.1em 6px'
  },
  '.cm-md-h3': { fontSize: '1.18em', fontWeight: '600', padding: '0.45em 2px 0.05em 6px' },
  '.cm-md-h4, .cm-md-h5, .cm-md-h6': { fontWeight: '600', padding: '0.35em 2px 0 6px' },

  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-em': { fontStyle: 'italic' },
  '.cm-md-strike': { textDecoration: 'line-through', opacity: '0.7' },
  '.cm-md-code': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    background: 'var(--bg-sunken)',
    borderRadius: '3px',
    padding: '0.1em 0.3em'
  },
  '.cm-md-link': { color: 'var(--accent)', textDecoration: 'underline' },

  // Le retour à la ligne d'une puce s'aligne sous le texte, pas sous la puce.
  '.cm-md-li': { textIndent: '-1.5em', paddingLeft: 'calc(6px + 1.5em)' },
  '.cm-md-bullet': {
    display: 'inline-block',
    width: '1.5em',
    color: 'var(--text-faint)'
  },

  '.cm-md-quote': {
    color: 'var(--text-muted)',
    borderLeft: '3px solid var(--border-strong)',
    paddingLeft: '14px'
  },

  '.cm-md-fence': {
    fontFamily: 'var(--mono)',
    fontSize: '0.9em',
    background: 'var(--bg-sunken)',
    paddingLeft: '12px',
    paddingRight: '12px'
  },
  '.cm-md-fence-open': { borderRadius: 'var(--radius) var(--radius) 0 0', paddingTop: '6px' },
  '.cm-md-fence-close': { borderRadius: '0 0 var(--radius) var(--radius)', paddingBottom: '6px' },
  // Les ``` restent lisibles mais s'effacent : ce sont des bornes, pas du code.
  '.cm-md-fence-open, .cm-md-fence-close': { color: 'var(--text-faint)' },
  '.cm-md-info': { color: 'var(--text-faint)' },

  '.cm-md-rule': {
    display: 'inline-block',
    width: '100%',
    verticalAlign: 'middle',
    borderTop: '1px solid var(--border-strong)'
  },

  /*
   * La case à cocher.
   *
   * `padding` et `boxSizing` sont explicites : la règle globale `input` de
   * `styles.css` posait 6px/9px de remplissage, ce qui transformait le carré
   * en rectangle et faisait déborder la coche. Le repère est dessiné en
   * position absolue, seul moyen de le centrer sans dépendre du remplissage.
   */
  '.cm-md-check': {
    appearance: 'none',
    WebkitAppearance: 'none',
    boxSizing: 'border-box',
    display: 'inline-block',
    position: 'relative',
    flex: 'none',
    width: '14px',
    height: '14px',
    padding: '0',
    // 14px + la marge = 1.5em, la largeur d'une puce : les tâches et les
    // puces s'alignent donc sur la même colonne, retours à la ligne compris.
    margin: '0 calc(1.5em - 14px) -2px 0',
    border: '1.5px solid var(--border-strong)',
    borderRadius: '4px',
    background: 'var(--bg-raised)',
    cursor: 'pointer',
    verticalAlign: 'baseline'
  },
  '.cm-md-check:checked': { background: 'var(--accent)', borderColor: 'var(--accent)' },
  '.cm-md-check:checked::after': {
    content: '""',
    position: 'absolute',
    boxSizing: 'border-box',
    left: '4px',
    top: '1px',
    width: '4px',
    height: '8px',
    border: 'solid #fff',
    borderWidth: '0 2px 2px 0',
    transform: 'rotate(45deg)'
  }
})

export { TOOL_COMMANDS, TOOL_KEYS, editorContext, minimalChange } from './editor-commands'
export type { EditorContext, MarkdownTool } from './editor-commands'
