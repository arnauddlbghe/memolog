/** Un chemin relatif à la racine du dossier, en séparateurs `/`. */
export type RelPath = string

export type EntryKind = 'note' | 'folder'

export interface TreeEntry {
  path: RelPath
  name: string
  title: string
  kind: EntryKind
  mtimeMs: number
  size: number
}

export interface NoteContent {
  path: RelPath
  title: string
  content: string
  mtimeMs: number
  size: number
}

/** Résultat d'une écriture : soit elle a eu lieu, soit la source a changé. */
export type WriteResult =
  | { ok: true; path: RelPath; mtimeMs: number; size: number }
  | { ok: false; reason: 'conflict'; disk: NoteContent }

// --- Conversations ---------------------------------------------------------

/** Où en est une conversation. Voir `docs/format.md` §3.2. */
export type ConversationState = 'a-faire' | 'en-cours' | 'a-reprendre' | 'termine'

export const CONVERSATION_STATES: readonly ConversationState[] = [
  'a-faire',
  'en-cours',
  'a-reprendre',
  'termine'
]

/** Un changement d'état, daté. */
export interface StateChange {
  /** Date locale `AAAA-MM-JJ`. */
  date: string
  state: ConversationState
}

/**
 * Une conversation : un bloc-notes libre sur un sujet, plus quatre
 * métadonnées — nom, date de création, état, historique des états.
 */
export interface Conversation {
  path: RelPath
  /** Nom affiché : le nom du fichier sans l'extension. */
  name: string
  /** Date locale `AAAA-MM-JJ`. */
  created: string
  state: ConversationState
  /** De la plus ancienne à la plus récente ; se termine par l'état courant. */
  history: StateChange[]
  /** Le corps Markdown, sans le frontmatter. */
  content: string
  /** Clés de frontmatter que Memolog ne connaît pas, préservées telles quelles. */
  extraFrontmatter: Record<string, string>
  mtimeMs: number
}

/** Ce qu'il faut pour lister une conversation sans lire son corps. */
export interface ConversationSummary {
  path: RelPath
  name: string
  created: string
  state: ConversationState
  /** Date du dernier changement d'état, ou `null` s'il n'y en a jamais eu. */
  lastChange: string | null
  mtimeMs: number
}

// --- Recherche -------------------------------------------------------------

export interface SearchHit {
  path: RelPath
  title: string
  score: number
  excerpt: string
}

// --- Journal d'activité ----------------------------------------------------

export type ActivityAuthor = 'vous' | 'claude' | 'externe'

interface ActivityBase {
  /** ISO 8601 avec décalage local. */
  ts: string
  auteur: ActivityAuthor
}

export interface ConversationCreatedEvent extends ActivityBase {
  type: 'conversation.creee'
  fichier: RelPath
  nom: string
}

export interface ConversationStateEvent extends ActivityBase {
  type: 'conversation.etat'
  fichier: RelPath
  nom: string
  de: ConversationState
  vers: ConversationState
}

export interface FileEditedEvent extends ActivityBase {
  type: 'fichier.edite'
  fichier: RelPath
  ligne: number
  extrait: string
  lignes: number
}

export type ActivityEvent =
  | ConversationCreatedEvent
  | ConversationStateEvent
  | FileEditedEvent

/**
 * Un événement sans ses champs communs : `ts` et `auteur` sont ajoutés à
 * l'enregistrement. L'omission est distributive, pour garder chaque variante
 * de l'union intacte.
 */
export type ActivityPayload = ActivityEvent extends infer E
  ? E extends ActivityEvent
    ? Omit<E, 'ts' | 'auteur'>
    : never
  : never

/** Événement d'un type inconnu : conservé tel quel, jamais rejeté. */
export interface UnknownActivityEvent extends ActivityBase {
  type: string
  [key: string]: unknown
}

export type AnyActivityEvent = ActivityEvent | UnknownActivityEvent
