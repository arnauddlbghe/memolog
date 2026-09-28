/**
 * Ports de persistance.
 *
 * C'est la frontière de l'architecture : le domaine et les services ne
 * connaissent que ces interfaces. L'implémentation d'aujourd'hui range tout
 * dans des fichiers Markdown (`adapters/markdown`) ; une base SQLite ou une
 * API distante n'aurait qu'à fournir un autre jeu d'implémentations, sans
 * toucher ni au domaine ni aux services.
 *
 * Règle à tenir : **aucun type de ce fichier ne parle de fichier, de dossier
 * ou de Markdown**. `RelPath` y est un identifiant de ressource opaque.
 */
import type {
  ActivityPayload,
  AnyActivityEvent,
  ActivityAuthor,
  JournalEntry,
  NoteContent,
  ProjectSummary,
  RelPath,
  SearchHit,
  Task,
  TaskRef,
  TaskState,
  TreeEntry,
  WriteResult
} from './types.js'

// --- Notes -----------------------------------------------------------------

export interface WalkedNote {
  path: RelPath
  mtimeMs: number
  size: number
}

export interface CollectionSummary {
  noteCount: number
  folderCount: number
}

/** Accès au contenu libre : les notes et leur organisation. */
export interface NoteRepository {
  list(dir: string): Promise<TreeEntry[]>
  read(path: string): Promise<NoteContent>
  /** `baseMtimeMs` permet de refuser l'écriture si la source a changé. */
  write(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult>
  create(dir: string, name?: string, content?: string): Promise<NoteContent>
  createFolder(dir: string, name: string): Promise<RelPath>
  rename(path: string, newName: string): Promise<RelPath>
  move(path: string, newDir: string): Promise<RelPath>
  remove(path: string): Promise<void>
  walk(dir?: string): AsyncIterable<WalkedNote>
  summarize(dir?: string): Promise<CollectionSummary>
}

// --- Tâches ----------------------------------------------------------------

export interface TaskDraft {
  text: string
  /** Description libre, éventuellement sur plusieurs lignes. */
  description?: string
  project?: string
  state?: TaskState
}

export interface TaskMutation {
  task: Task
  previousState: TaskState
  previousText: string
  /** `false` si la demande ne changeait rien : aucun événement à émettre. */
  changed: boolean
}

export interface TaskQuery {
  includeArchived?: boolean
  includeClosed?: boolean
  project?: string
  states?: TaskState[]
}

export interface ArchiveResult {
  archived: Task[]
  /** Destinations touchées, telles que le stockage les nomme. */
  targets: string[]
}

export interface TaskRepository {
  all(query?: TaskQuery): Promise<Task[]>
  find(id: string): Promise<Task | null>
  /** Attribue un identifiant jamais encore utilisé et enregistre la tâche. */
  add(draft: TaskDraft, at: Date): Promise<Task>
  setState(id: string, state: TaskState, at: Date): Promise<TaskMutation>
  setText(id: string, text: string, at: Date): Promise<TaskMutation>
  setDescription(id: string, description: string, at: Date): Promise<TaskMutation>
  /** Déplace les tâches données vers leur archive. */
  archive(tasks: Task[], at: Date): Promise<ArchiveResult>
  /**
   * Complète ce qui a été écrit à la main : identifiant, dates.
   * Renvoie les tâches complétées.
   */
  ensureMetadata(at: Date): Promise<Task[]>
}

// --- Journal ---------------------------------------------------------------

export interface JournalDay {
  /** Date locale `AAAA-MM-JJ`. */
  date: string
  /** Identifiant de la ressource, pour l'ouvrir dans l'éditeur. */
  path: RelPath
  entries: JournalEntry[]
  content: string
  mtimeMs: number
}

export interface JournalAppendResult {
  path: RelPath
  line: number
  mtimeMs: number
}

export interface JournalRepository {
  /** Ouvre (et crée si besoin) la journée demandée. */
  open(date: Date): Promise<JournalDay>
  append(text: string, at: Date): Promise<JournalAppendResult>
  /** Journées connues, de la plus récente à la plus ancienne. */
  days(): Promise<string[]>
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
  taskCount: number
}

export interface TaskFilter {
  states?: TaskState[]
  project?: string
  /** `true` : uniquement les actives ; `false` : uniquement les fermées. */
  active?: boolean
}

/**
 * Index consultable de tout le contenu.
 *
 * Aujourd'hui reconstruit en mémoire au démarrage ; demain, éventuellement,
 * une table SQL. Les appelants ne voient que ces méthodes.
 */
export interface NoteIndex {
  /** Remet l'index en phase avec la source de vérité. */
  sync(): Promise<IndexReport>
  /** Réindexe une ressource dont on a déjà le contenu. */
  updateResource(path: RelPath, content: string, stat: { mtimeMs: number; size: number }): void
  removeResource(path: RelPath): void

  search(query: string, limit?: number): SearchHit[]
  suggest(query: string, limit?: number): string[]

  tasks(filter?: TaskFilter): Task[]
  task(id: string): Task | null
  refsTo(id: string): TaskRef[]

  projects(): ProjectSummary[]
  daysForTag(tag: string): string[]
  journalDays(): string[]

  readonly noteCount: number
  readonly taskCount: number
}

// --- Assemblage ------------------------------------------------------------

/**
 * Tout ce dont les services ont besoin. Un adaptateur de stockage fournit
 * cet objet ; c'est le seul point à remplacer pour changer de stockage.
 */
export interface Storage {
  notes: NoteRepository
  tasks: TaskRepository
  journal: JournalRepository
  activity: ActivityLog
  index: NoteIndex
}
