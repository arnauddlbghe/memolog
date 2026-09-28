import type {
  AnyActivityEvent,
  JournalEntry,
  NoteContent,
  ProjectSummary,
  SearchHit,
  Task,
  TaskRef,
  TaskState,
  TreeEntry
} from '@memolog/core/domain'

export type {
  AnyActivityEvent,
  JournalEntry,
  NoteContent,
  ProjectSummary,
  SearchHit,
  Task,
  TaskRef,
  TaskState,
  TreeEntry
}

export type ThemeSetting = 'system' | 'light' | 'dark'

/**
 * Réglages de l'application. Stockés dans le dossier de config de l'OS,
 * **jamais** dans le dossier de notes : ils contiennent justement le chemin
 * de ce dossier.
 */
export interface Settings {
  /** Version du fichier de réglages, pour les migrations futures. */
  version: number
  /** Dossier de rangement des notes, chemin absolu. */
  root: string
  /** Raccourci global d'affichage/masquage, syntaxe Electron. */
  shortcut: string
  /** Raccourci global d'ajout d'entrée au journal. Vide = désactivé. */
  journalShortcut: string
  theme: ThemeSetting
  /** Lancer Memolog à l'ouverture de session. Désactivé par défaut. */
  launchAtLogin: boolean
  /** Au lancement, rester dans la barre système sans ouvrir la fenêtre. */
  startHidden: boolean
  /** L'écran de première ouverture a été validé. */
  onboardingDone: boolean
  /** Une tâche active sans mise à jour depuis N jours « dort ». */
  dormantAfterDays: number
  /** Une tâche fermée depuis N jours part à l'archive. */
  archiveAfterDays: number
  /** Archiver automatiquement au démarrage. */
  autoArchive: boolean
  /** Minutes d'inactivité qui ferment une rafale d'édition. */
  burstWindowMinutes: number
  windowBounds: { width: number; height: number; x?: number; y?: number } | null
}

export interface VaultChangePreview {
  /** Dossier actuel. */
  currentRoot: string
  noteCount: number
  folderCount: number
  /** Le dossier visé est-il vide (ou inexistant) ? */
  targetEmpty: boolean
  targetExists: boolean
}

export interface WriteOutcome {
  ok: boolean
  path: string
  mtimeMs: number
  /** Version du disque si l'écriture a été refusée pour conflit. */
  conflict?: NoteContent
}

export interface AppInfo {
  version: string
  electron: string
  platform: string
  root: string
  configDir: string
  isDev: boolean
}

export interface MemoryMetrics {
  /** Mémoire vive utilisée par l'ensemble des process, en Mo. */
  totalMb: number
  perProcess: Array<{ type: string; mb: number }>
}

export interface IndexStatus {
  ready: boolean
  noteCount: number
  taskCount: number
  /** Durée de la dernière synchronisation, en millisecondes. */
  lastSyncMs: number
}

/** Un élément de la vue Jour : une note libre ou un événement d'activité. */
export type DayItem =
  | { kind: 'entry'; at: string; entry: JournalEntry }
  | { kind: 'event'; at: string; event: AnyActivityEvent }

export interface DayView {
  date: string
  path: string
  items: DayItem[]
  entryCount: number
  eventCount: number
}

export interface TaskWithAge {
  task: Task
  ageDays: number | null
}

export interface ProjectGroup {
  state: TaskState
  label: string
  tasks: TaskWithAge[]
}

export interface ProjectDetail {
  summary: ProjectSummary
  note: { path: string; content: string } | null
  groups: ProjectGroup[]
  days: string[]
}

/** Référence `@tNN` résolue, pour l'affichage en étiquette. */
export interface ResolvedRef {
  id: string
  task: Task | null
}

export interface ShortcutStatus {
  shortcut: string
  registered: boolean
  /** Message lisible si l'enregistrement a échoué. */
  error?: string
}

/** Événements poussés du process principal vers le renderer. */
export interface MemologEvents {
  'note:changed': { path: string; mtimeMs: number }
  'note:removed': { path: string }
  'tree:changed': { dir: string }
  'index:status': IndexStatus
  'tasks:changed': Record<string, never>
  'activity:changed': { date: string }
  'settings:changed': Settings
  'shortcut:status': ShortcutStatus
  'navigate': { view: 'journal' | 'settings' | 'tasks' | 'search'; path?: string }
}

export type MemologEventName = keyof MemologEvents
