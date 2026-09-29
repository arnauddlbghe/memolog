/**
 * Une conversation, en Markdown.
 *
 * Un frontmatter YAML restreint — trois clés, pas une de plus — puis un corps
 * libre auquel l'application ne touche jamais. Voir `docs/format.md` §3.
 *
 * Toutes les fonctions sont **pures** et travaillent sur le texte du fichier.
 * Les clés de frontmatter inconnues sont préservées telles quelles.
 */
import { formatLocalDate } from '../../domain/dates.js'
import { DEFAULT_STATE, parseState, recordChange } from '../../domain/states.js'
import type {
  Conversation,
  ConversationState,
  ConversationSummary,
  StateChange
} from '../../domain/types.js'
import { splitFrontmatter } from './frontmatter.js'

export const CONVERSATIONS_DIR = 'conversations'

/** Une entrée d'historique : `AAAA-MM-JJ <état>`. */
const HISTORY_LINE = /^-\s+(\d{4}-\d{2}-\d{2})\s+(\S+)\s*$/

/** Une clé de frontmatter : `clé: valeur`. */
const FIELD = /^([^\s:][^:]*):\s*(.*)$/

/** Repli des accents et de la casse, pour lire une clé écrite à la main. */
function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}

export function conversationName(path: string): string {
  const file = path.slice(path.lastIndexOf('/') + 1)
  return file.replace(/\.md$/i, '')
}

export function isConversationPath(path: string): boolean {
  return path.startsWith(`${CONVERSATIONS_DIR}/`) && path.toLowerCase().endsWith('.md')
}

interface ParsedHeader {
  created: string | null
  state: ConversationState | null
  history: StateChange[]
  extra: Record<string, string>
}

/**
 * Lit l'en-tête. Volontairement restreint : on n'analyse que la forme que
 * Memolog écrit, plus les listes d'historique. Tout le reste est conservé en
 * l'état, sans être interprété.
 */
function parseHeader(frontmatter: string | null): ParsedHeader {
  const result: ParsedHeader = { created: null, state: null, history: [], extra: {} }
  if (frontmatter === null) return result

  const lines = frontmatter.split('\n').slice(1, -1)
  let inHistory = false

  for (const line of lines) {
    if (line.trim() === '') continue

    if (inHistory) {
      const entry = HISTORY_LINE.exec(line.trim())
      if (entry !== null) {
        const state = parseState(entry[2] ?? '')
        if (state !== null) result.history.push({ date: entry[1] ?? '', state })
        continue
      }
      inHistory = false
    }

    const field = FIELD.exec(line)
    if (field === null) continue

    const key = normalizeKey(field[1] ?? '')
    const value = (field[2] ?? '').trim()

    if (key === 'creee') {
      result.created = value
    } else if (key === 'etat') {
      result.state = parseState(value)
    } else if (key === 'historique') {
      inHistory = true
    } else {
      // Une clé que Memolog ne connaît pas : on la rend telle quelle.
      result.extra[(field[1] ?? '').trim()] = value
    }
  }

  return result
}

export interface ParseOptions {
  /** Date de repli quand le fichier ne dit pas quand il a été créé. */
  fallbackCreated?: string
  mtimeMs?: number
  /** Création du fichier ; à défaut, on retombe sur `mtimeMs`. */
  birthtimeMs?: number
}

/**
 * Lit une conversation.
 *
 * Un fichier sans en-tête est une conversation valide : état `a-faire`,
 * création au repli fourni, historique vide. Si `état` et la fin de
 * l'historique divergent, `état` fait foi (`docs/format.md` §3.1).
 */
export function parseConversation(
  path: string,
  raw: string,
  options: ParseOptions = {}
): Conversation {
  const { frontmatter, body } = splitFrontmatter(raw)
  const header = parseHeader(frontmatter)

  const state = header.state ?? header.history[header.history.length - 1]?.state ?? DEFAULT_STATE
  const created =
    header.created ??
    header.history[0]?.date ??
    options.fallbackCreated ??
    formatLocalDate(options.mtimeMs === undefined ? new Date() : new Date(options.mtimeMs))

  return {
    path,
    name: conversationName(path),
    created,
    createdMs: options.birthtimeMs ?? options.mtimeMs ?? 0,
    state,
    history: header.history,
    content: body.replace(/^\n+/, ''),
    extraFrontmatter: header.extra,
    mtimeMs: options.mtimeMs ?? 0
  }
}

/** Réécrit le fichier complet : en-tête à jour, corps inchangé. */
export function renderConversation(conversation: Conversation): string {
  const lines = [
    '---',
    `créée: ${conversation.created}`,
    `état: ${conversation.state}`,
    ...(conversation.history.length === 0
      ? []
      : [
          'historique:',
          ...conversation.history.map((change) => `  - ${change.date} ${change.state}`)
        ]),
    ...Object.entries(conversation.extraFrontmatter).map(([key, value]) => `${key}: ${value}`),
    '---',
    ''
  ]

  // La dernière entrée vide de `lines` fournit déjà le saut de ligne final.
  const header = lines.join('\n')
  const body = conversation.content.replace(/^\n+/, '').replace(/\s*$/, '')
  return body === '' ? header : `${header}\n${body}\n`
}

/** Change l'état et note le changement dans l'historique. */
export function withState(
  conversation: Conversation,
  state: ConversationState,
  at: Date = new Date()
): Conversation {
  if (conversation.state === state) return conversation
  return { ...conversation, state, history: recordChange(conversation.history, state, at) }
}

/** Remplace le corps, sans toucher à l'en-tête. */
export function withContent(conversation: Conversation, content: string): Conversation {
  return { ...conversation, content }
}

/** Une conversation neuve : rien d'autre que sa date et son état de départ. */
export function newConversation(
  path: string,
  at: Date = new Date(),
  state: ConversationState = DEFAULT_STATE
): Conversation {
  const created = formatLocalDate(at)
  return {
    path,
    name: conversationName(path),
    created,
    createdMs: at.getTime(),
    state,
    history: [{ date: created, state }],
    content: '',
    extraFrontmatter: {},
    mtimeMs: 0
  }
}

export function summarize(conversation: Conversation): ConversationSummary {
  return {
    path: conversation.path,
    name: conversation.name,
    created: conversation.created,
    createdMs: conversation.createdMs,
    state: conversation.state,
    lastChange: conversation.history[conversation.history.length - 1]?.date ?? null,
    mtimeMs: conversation.mtimeMs
  }
}
