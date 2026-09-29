/**
 * Ports de persistance.
 *
 * C'est la frontière de l'architecture : le domaine et les services ne
 * connaissent que ces interfaces. L'implémentation d'aujourd'hui range tout
 * dans des fichiers Markdown (`adapters/markdown`) ; une base SQLite ou une
 * API distante n'aurait qu'à fournir un autre jeu d'implémentations.
 *
 * Règle à tenir : **aucun type de ce fichier ne parle de fichier, de dossier
 * ou de Markdown**. `RelPath` y est un identifiant de ressource opaque.
 */
import type {
  ActivityAuthor,
  ActivityPayload,
  AnyActivityEvent,
  Conversation,
  ConversationState,
  ConversationSummary,
  NoteContent,
  RelPath,
  SearchHit,
  TreeEntry,
  WriteResult
} from './types.js'

// --- Conversations ---------------------------------------------------------

export interface ConversationRepository {
  /** Toutes les conversations, sans lire les corps. */
  list(): Promise<ConversationSummary[]>
  read(path: string): Promise<Conversation>
  /** Crée une conversation vide. Le nom devient celui de la ressource. */
  create(name: string): Promise<ConversationSummary>
  /** Remplace le corps, sans toucher aux métadonnées. */
  setContent(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult>
  /** Change l'état et note le changement dans l'historique. */
  setState(path: string, state: ConversationState, at: Date): Promise<Conversation>
  rename(path: string, name: string): Promise<RelPath>
  remove(path: string): Promise<void>
}

// --- Notes libres ----------------------------------------------------------

export interface WalkedNote {
  path: RelPath
  mtimeMs: number
  size: number
}

export interface CollectionSummary {
  noteCount: number
  folderCount: number
}

/** Accès brut au contenu : l'échappatoire, pour éditer un fichier à la main. */
export interface NoteRepository {
  list(dir: string): Promise<TreeEntry[]>
  read(path: string): Promise<NoteContent>
  write(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult>
  create(dir: string, name?: string, content?: string): Promise<NoteContent>
  remove(path: string): Promise<void>
  walk(dir?: string): AsyncIterable<WalkedNote>
  summarize(dir?: string): Promise<CollectionSummary>
}

// --- Activité --------------------------------------------------------------

export interface ActivityLog {
  append(author: ActivityAuthor, payload: ActivityPayload, at: Date): Promise<AnyActivityEvent>
  readDay(date: Date): Promise<AnyActivityEvent[]>
}

// --- Index -----------------------------------------------------------------

export interface IndexReport {
  added: number
  updated: number
  removed: number
  noteCount: number
  conversationCount: number
}

export interface ConversationFilter {
  states?: ConversationState[]
  /** Jour de création, `AAAA-MM-JJ`. */
  created?: string
}

/**
 * Index consultable de tout le contenu.
 *
 * Aujourd'hui reconstruit en mémoire au démarrage ; demain, éventuellement,
 * une table SQL. Les appelants ne voient que ces méthodes.
 */
export interface NoteIndex {
  sync(): Promise<IndexReport>
  updateResource(path: RelPath, content: string, stat: { mtimeMs: number; size: number }): void
  removeResource(path: RelPath): void

  search(query: string, limit?: number): SearchHit[]
  suggest(query: string, limit?: number): string[]

  /** Conversations, de la plus récemment créée à la plus ancienne. */
  conversations(filter?: ConversationFilter): ConversationSummary[]
  conversation(path: RelPath): ConversationSummary | null
  /** Jours de création connus, du plus récent au plus ancien. */
  days(): string[]

  readonly noteCount: number
  readonly conversationCount: number
}

// --- Assemblage ------------------------------------------------------------

/**
 * Tout ce dont les services ont besoin. Un adaptateur de stockage fournit
 * cet objet ; c'est le seul point à remplacer pour changer de stockage.
 */
export interface Storage {
  conversations: ConversationRepository
  notes: NoteRepository
  activity: ActivityLog
  index: NoteIndex
}
