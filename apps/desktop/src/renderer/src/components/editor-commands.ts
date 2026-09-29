import { syntaxTree } from '@codemirror/language'
import { EditorSelection } from '@codemirror/state'
import type { ChangeSpec, EditorState, StateCommand, Transaction } from '@codemirror/state'

/**
 * Les outils d'écriture Markdown, en commandes pures.
 *
 * Aucun import de `@codemirror/view` ici : ces commandes ne travaillent que sur
 * l'état de l'éditeur, ce qui les rend testables sans navigateur. Le reste —
 * décorations, thème, raccourcis clavier — vit dans `editor-markdown.ts`.
 */

export type MarkdownTool =
  'titre' | 'gras' | 'italique' | 'code' | 'liste' | 'case' | 'citation' | 'lien'

/**
 * Un nœud de l'arbre syntaxique. Le type vient de `@lezer/common`, que l'app
 * n'a pas en dépendance directe : on le dérive plutôt que de l'importer.
 */
type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolveInner']>

// --- Reconnaissance des préfixes de ligne ----------------------------------

const BULLET = /^(\s*)([-*+] )/
const TASK = /^(\s*)([-*+] \[[ xX]\] )/
const QUOTE = /^(\s*)(> ?)/
const HEADING = /^(\s*)(#{1,6}) /

/** Niveau de titre d'une ligne, 0 si ce n'en est pas un. */
export function headingLevel(text: string): number {
  return HEADING.exec(text)?.[2]?.length ?? 0
}

// --- Entourages (gras, italique, code) -------------------------------------

interface Inline {
  /** Nœud Markdown correspondant, pour reconnaître un entourage existant. */
  node: string
  /** Nom des marques à retirer quand on défait l'entourage. */
  mark: string
  marker: string
}

const INLINE: Record<'gras' | 'italique' | 'code', Inline> = {
  gras: { node: 'StrongEmphasis', mark: 'EmphasisMark', marker: '**' },
  italique: { node: 'Emphasis', mark: 'EmphasisMark', marker: '*' },
  code: { node: 'InlineCode', mark: 'CodeMark', marker: '`' }
}

/** Le nœud `name` le plus proche qui contient entièrement `from`..`to`. */
function enclosing(state: EditorState, from: number, to: number, name: string): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1)
  while (node !== null) {
    if (node.name === name && node.from <= from && node.to >= to) return node
    node = node.parent
  }
  return null
}

/** Les deux marques qui encadrent un nœud, s'il en a bien deux. */
function fences(node: SyntaxNode, mark: string): [SyntaxNode, SyntaxNode] | null {
  const found: SyntaxNode[] = []
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.name === mark) found.push(child)
  }
  const first = found[0]
  const last = found[found.length - 1]
  if (first === undefined || last === undefined || first === last) return null
  return [first, last]
}

/**
 * Pose ou retire un entourage.
 *
 * On passe par l'arbre syntaxique plutôt que par une comparaison de texte :
 * c'est le seul moyen de distinguer l'italique du gras, qui partagent le même
 * caractère. Sélection vide : on entoure le mot sous le curseur, et à défaut on
 * insère les deux marques en laissant le curseur **entre** elles.
 */
function toggleInline(kind: 'gras' | 'italique' | 'code'): StateCommand {
  const { node: nodeName, mark, marker } = INLINE[kind]

  return ({ state, dispatch }) => {
    const spec = state.changeByRange((range) => {
      const node = enclosing(state, range.from, range.to, nodeName)
      const pair = node === null ? null : fences(node, mark)

      if (node !== null && pair !== null) {
        const [open, close] = pair
        const shift = open.to - open.from
        return {
          changes: [
            { from: open.from, to: open.to },
            { from: close.from, to: close.to }
          ],
          range: EditorSelection.range(
            Math.max(node.from, range.from - shift),
            Math.max(node.from, range.to - shift)
          )
        }
      }

      let { from, to } = range
      if (from === to) {
        const word = state.wordAt(from)
        if (word !== null) {
          from = word.from
          to = word.to
        }
      }

      const width = marker.length
      if (from === to) {
        return {
          changes: { from, insert: marker + marker },
          range: EditorSelection.cursor(from + width)
        }
      }

      return {
        changes: [
          { from, insert: marker },
          { from: to, insert: marker }
        ],
        range: EditorSelection.range(from + width, to + width)
      }
    })

    dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }))
    return true
  }
}

// --- Préfixes de ligne (liste, case, citation, titre) -----------------------

/** Les numéros de ligne couverts par la sélection, sans doublon. */
function selectedLines(state: EditorState): number[] {
  const numbers = new Set<number>()
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number
    const last = state.doc.lineAt(range.to).number
    for (let line = first; line <= last; line += 1) numbers.add(line)
  }
  return [...numbers]
}

/**
 * Transformation d'une ligne pour un outil de bloc.
 *
 * Les cas sont explicites parce que les préfixes se chevauchent : poser une
 * case sur `- texte` doit donner `- [ ] texte`, et non `- - [ ] texte`.
 */
function blockChange(
  kind: 'liste' | 'case' | 'citation',
  text: string,
  at: number
): ChangeSpec | null {
  const task = TASK.exec(text)
  const bullet = BULLET.exec(text)
  const quote = QUOTE.exec(text)

  if (kind === 'citation') {
    if (quote !== null) {
      const indent = quote[1]?.length ?? 0
      return { from: at + indent, to: at + indent + (quote[2]?.length ?? 0) }
    }
    const indent = /^\s*/.exec(text)?.[0].length ?? 0
    return { from: at + indent, insert: '> ' }
  }

  // Une case posée sur une ligne déjà en case, ou une puce sur une case :
  // dans les deux cas on retire tout le marqueur et la ligne redevient nue.
  if (task !== null) {
    const indent = task[1]?.length ?? 0
    return { from: at + indent, to: at + indent + (task[2]?.length ?? 0) }
  }

  if (kind === 'liste') {
    if (bullet !== null) {
      const indent = bullet[1]?.length ?? 0
      return { from: at + indent, to: at + indent + (bullet[2]?.length ?? 0) }
    }
    const indent = /^\s*/.exec(text)?.[0].length ?? 0
    return { from: at + indent, insert: '- ' }
  }

  // kind === 'case' : on complète une puce existante plutôt que d'en ajouter une.
  if (bullet !== null) {
    const indent = bullet[1]?.length ?? 0
    return { from: at + indent + (bullet[2]?.length ?? 0), insert: '[ ] ' }
  }
  const indent = /^\s*/.exec(text)?.[0].length ?? 0
  return { from: at + indent, insert: '- [ ] ' }
}

/**
 * Applique des changements de préfixe en gardant le curseur **après** la
 * balise posée.
 *
 * Par défaut, une position située exactement à l'endroit d'une insertion reste
 * devant le texte inséré : poser une puce sur une ligne vide laissait donc
 * écrire avant le `- `. Reporter la sélection avec `assoc = 1` la pousse de
 * l'autre côté.
 */
function applyPrefix(
  state: EditorState,
  dispatch: (tr: Transaction) => void,
  changes: ChangeSpec[]
): boolean {
  if (changes.length === 0) return false

  const changeSet = state.changes(changes)
  dispatch(
    state.update({
      changes: changeSet,
      selection: state.selection.map(changeSet, 1),
      scrollIntoView: true,
      userEvent: 'input.format'
    })
  )
  return true
}

function toggleBlock(kind: 'liste' | 'case' | 'citation'): StateCommand {
  return ({ state, dispatch }) => {
    const changes: ChangeSpec[] = []
    for (const number of selectedLines(state)) {
      const line = state.doc.line(number)
      const change = blockChange(kind, line.text, line.from)
      if (change !== null) changes.push(change)
    }
    return applyPrefix(state, dispatch, changes)
  }
}

/** Nombre maximal de dièses avant de revenir au texte nu. */
const MAX_HEADING = 3

/**
 * Le bouton titre : H1 → H2 → H3 → aucun. Le niveau de la première ligne
 * sélectionnée décide de la cible, pour que tout le bloc reçoive le même.
 */
export const cycleHeading: StateCommand = ({ state, dispatch }) => {
  const numbers = selectedLines(state)
  const firstNumber = numbers[0]
  if (firstNumber === undefined) return false

  const current = headingLevel(state.doc.line(firstNumber).text)
  const next = current >= MAX_HEADING ? 0 : current + 1
  const prefix = next === 0 ? '' : `${'#'.repeat(next)} `

  const changes: ChangeSpec[] = []
  for (const number of numbers) {
    const line = state.doc.line(number)
    const match = HEADING.exec(line.text)
    const indent = (match?.[1] ?? /^\s*/.exec(line.text)?.[0] ?? '').length
    // La longueur du préfixe existant inclut l'espace qui suit les dièses.
    const width = match === null ? 0 : (match[2]?.length ?? 0) + 1
    if (width === 0 && prefix === '') continue
    changes.push({ from: line.from + indent, to: line.from + indent + width, insert: prefix })
  }
  return applyPrefix(state, dispatch, changes)
}

/** Insère un lien autour de la sélection, ou du mot sous le curseur. */
export const insertLink: StateCommand = ({ state, dispatch }) => {
  const spec = state.changeByRange((range) => {
    let { from, to } = range
    if (from === to) {
      const word = state.wordAt(from)
      if (word !== null) {
        from = word.from
        to = word.to
      }
    }

    const text = state.sliceDoc(from, to)
    if (text === '') {
      // Rien à lier : on pose la coquille et le curseur dans les crochets.
      return {
        changes: { from, insert: '[](url)' },
        range: EditorSelection.cursor(from + 1)
      }
    }

    // La cible est sélectionnée : elle est prête à être remplacée par l'URL.
    const start = from + text.length + 3
    return {
      changes: { from, to, insert: `[${text}](url)` },
      range: EditorSelection.range(start, start + 3)
    }
  })

  dispatch(state.update(spec, { scrollIntoView: true, userEvent: 'input.format' }))
  return true
}

// --- Surface publique -------------------------------------------------------

export const TOOL_COMMANDS: Record<MarkdownTool, StateCommand> = {
  titre: cycleHeading,
  gras: toggleInline('gras'),
  italique: toggleInline('italique'),
  code: toggleInline('code'),
  liste: toggleBlock('liste'),
  case: toggleBlock('case'),
  citation: toggleBlock('citation'),
  lien: insertLink
}

/** Raccourcis clavier, syntaxe CodeMirror (`Mod` = Cmd sur macOS, Ctrl ailleurs). */
export const TOOL_KEYS: Record<MarkdownTool, string> = {
  titre: 'Mod-Alt-1',
  gras: 'Mod-b',
  italique: 'Mod-i',
  code: 'Mod-e',
  liste: 'Mod-Shift-l',
  case: 'Mod-Shift-x',
  citation: 'Mod-Shift-q',
  lien: 'Mod-k'
}

/**
 * La plus petite réécriture qui transforme `current` en `next`, ou `null` si
 * les deux textes sont identiques.
 *
 * Remplacer tout le document ramènerait le curseur au début : une sélection ne
 * survit pas à la suppression du texte qui la porte. L'autosave relit le
 * fichier après chaque écriture, et le corps revenu du disque diffère parfois
 * d'un saut de ligne final — cela suffisait à faire sauter le curseur.
 */
export function minimalChange(
  current: string,
  next: string
): { from: number; to: number; insert: string } | null {
  if (current === next) return null

  const max = Math.min(current.length, next.length)
  let start = 0
  while (start < max && current[start] === next[start]) start += 1

  let end = 0
  while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end]) {
    end += 1
  }

  return {
    from: start,
    to: current.length - end,
    insert: next.slice(start, next.length - end)
  }
}

/** Ce que le curseur touche, pour allumer les boutons de la barre. */
export interface EditorContext {
  tools: ReadonlySet<MarkdownTool>
  /** 0 si la ligne courante n'est pas un titre. */
  heading: number
}

/** Nœuds de l'arbre qui allument un outil. */
const NODE_TOOLS: Record<string, MarkdownTool> = {
  StrongEmphasis: 'gras',
  Emphasis: 'italique',
  InlineCode: 'code',
  FencedCode: 'code',
  CodeBlock: 'code',
  Blockquote: 'citation',
  ListItem: 'liste',
  Link: 'lien'
}

export function editorContext(state: EditorState): EditorContext {
  const pos = state.selection.main.head
  const tools = new Set<MarkdownTool>()

  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1)
  while (node !== null) {
    const tool = NODE_TOOLS[node.name]
    if (tool !== undefined) tools.add(tool)
    node = node.parent
  }

  const line = state.doc.lineAt(pos)
  if (TASK.test(line.text)) tools.add('case')

  return { tools, heading: headingLevel(line.text) }
}
