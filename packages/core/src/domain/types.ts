/** Un chemin relatif à la racine du dossier de notes, en séparateurs `/`. */
export type RelPath = string

export type EntryKind = 'note' | 'folder'

export interface TreeEntry {
  /** Chemin relatif POSIX, ex. `projets/infra.md`. */
  path: RelPath
  /** Nom du fichier ou du dossier sur le disque. */
  name: string
  /** Titre affiché : le nom sans l'extension `.md`. */
  title: string
  kind: EntryKind
  mtimeMs: number
  /** Taille en octets ; 0 pour un dossier. */
  size: number
}

export interface NoteContent {
  path: RelPath
  title: string
  content: string
  mtimeMs: number
  size: number
}

/** Résultat d'une écriture : soit elle a eu lieu, soit le disque a changé entre-temps. */
export type WriteResult =
  | { ok: true; path: RelPath; mtimeMs: number; size: number }
  | { ok: false; reason: 'conflict'; disk: NoteContent }

// --- Journal ---------------------------------------------------------------

/** Une puce du journal : une entrée de premier niveau ou une sous-puce. */
export interface Bullet {
  /** Numéro de ligne dans le fichier, à partir de 1. */
  line: number
  /** Indentation en espaces (une tabulation vaut 2). */
  indent: number
  /** Texte de la puce, tags compris, sans la puce ni l'heure. */
  text: string
  /** Tags écrits sur cette puce. */
  tags: string[]
  /** Tags propres + tags hérités des puces parentes. */
  effectiveTags: string[]
  children: Bullet[]
}

/** Une entrée de journal : une puce de premier niveau et ses sous-puces. */
export interface JournalEntry extends Bullet {
  /** Heure locale `HH:MM`. */
  time: string
}

// --- Tâches ----------------------------------------------------------------

export type TaskState = 'a-faire' | 'en-cours' | 'reportee' | 'terminee' | 'abandonnee'

/** Les deux états fermés : ce sont eux qui déclenchent l'archivage. */
export const CLOSED_STATES: readonly TaskState[] = ['terminee', 'abandonnee']

export const DEFAULT_PROJECT = 'Divers'

export interface Task {
  /** Identifiant stable sans le `^`, ex. `t42`. */
  id: string
  state: TaskState
  /** Texte de la tâche, sans la case, l'identifiant ni les champs en ligne. */
  text: string
  /**
   * Description libre, éventuellement sur plusieurs lignes.
   * Chaîne vide s'il n'y en a pas.
   */
  description: string
  /** Nom du projet : la section `##` qui précède la tâche. */
  project: string
  /** Date locale `AAAA-MM-JJ`. */
  created: string
  /** Date locale `AAAA-MM-JJ` de la dernière modification d'état ou de texte. */
  updated: string
  /** Fichier où se trouve la tâche : `taches.md` ou une archive. */
  path: RelPath
  /** Numéro de ligne, à partir de 1. */
  line: number
  /** Indentation en espaces. */
  indent: number
  /** Tags écrits dans le texte de la tâche. */
  tags: string[]
  /** Champs en ligne autres que `créée` et `maj`, préservés tels quels. */
  extraFields: Record<string, string>
}

export interface TaskRef {
  /** Identifiant référencé, ex. `t42`. */
  id: string
  path: RelPath
  line: number
  /** Position du `@` dans la ligne. */
  column: number
}

// --- Projets ---------------------------------------------------------------

export interface ProjectSummary {
  /** Nom affiché, tel qu'il apparaît dans `taches.md` ou dans un tag. */
  name: string
  /** Nom normalisé, qui sert de clé. */
  key: string
  /** Fiche `projets/<nom>.md`, si elle existe. */
  notePath: RelPath | null
  openTaskCount: number
  closedTaskCount: number
  /** Nombre d'entrées de journal portant ce tag. */
  journalEntryCount: number
  /** Date locale `AAAA-MM-JJ` de la dernière activité connue, ou `null`. */
  lastActivity: string | null
}

// --- Recherche -------------------------------------------------------------

export interface SearchHit {
  path: RelPath
  title: string
  score: number
  /** Extrait du contenu autour de la première occurrence. */
  excerpt: string
}

// --- Journal d'activité ----------------------------------------------------

export type ActivityAuthor = 'vous' | 'claude' | 'externe'

interface ActivityBase {
  /** ISO 8601 avec décalage local. */
  ts: string
  auteur: ActivityAuthor
}

export interface TaskCreatedEvent extends ActivityBase {
  type: 'tache.creee'
  tache: string
  titre: string
  projet: string
}

export interface TaskStateEvent extends ActivityBase {
  type: 'tache.etat'
  tache: string
  de: TaskState
  vers: TaskState
}

export interface TaskModifiedEvent extends ActivityBase {
  type: 'tache.modifiee'
  tache: string
  titre: string
}

export interface FileEditedEvent extends ActivityBase {
  type: 'fichier.edite'
  fichier: RelPath
  /** Première ligne modifiée, à partir de 1. */
  ligne: number
  /** Contenu de cette ligne, tronqué. */
  extrait: string
  /** Nombre de lignes touchées. */
  lignes: number
}

export type ActivityEvent =
  | TaskCreatedEvent
  | TaskStateEvent
  | TaskModifiedEvent
  | FileEditedEvent

/**
 * Un événement sans ses champs communs : `ts` et `auteur` sont ajoutés au
 * moment de l'enregistrement. L'omission est distributive, pour garder
 * chaque variante de l'union intacte.
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
