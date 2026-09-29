import type {
  AnyActivityEvent,
  Conversation,
  ConversationState,
  ConversationSummary,
  NoteContent,
  SearchHit,
  StateChange,
  TreeEntry
} from '@memolog/core/domain'

export type {
  AnyActivityEvent,
  Conversation,
  ConversationState,
  ConversationSummary,
  NoteContent,
  SearchHit,
  StateChange,
  TreeEntry
}

export type ThemeSetting = 'system' | 'light' | 'dark'

/** Mode d'écriture : rendu visuel, ou Markdown brut. */
export type EditorMode = 'rendu' | 'brut'

/**
 * Réglages de l'application. Stockés dans le dossier de config de l'OS,
 * **jamais** dans le dossier de notes : ils contiennent justement le chemin
 * de ce dossier.
 */
export interface Settings {
  version: number
  /** Dossier de rangement, chemin absolu. */
  root: string
  /** Raccourci global d'affichage/masquage, syntaxe Electron. */
  shortcut: string
  theme: ThemeSetting
  /** Mode d'écriture par défaut à l'ouverture d'une conversation. */
  editorMode: EditorMode
  /** Lancer Memolog à l'ouverture de session. Désactivé par défaut. */
  launchAtLogin: boolean
  /** Au lancement, rester dans la barre système sans ouvrir la fenêtre. */
  startHidden: boolean
  /** L'écran de première ouverture a été validé. */
  onboardingDone: boolean
  /** Minutes d'inactivité qui ferment une rafale d'édition. */
  burstWindowMinutes: number
  windowBounds: { width: number; height: number; x?: number; y?: number } | null
}

export interface VaultChangePreview {
  currentRoot: string
  noteCount: number
  folderCount: number
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
  totalMb: number
  perProcess: Array<{ type: string; mb: number }>
}

export interface IndexStatus {
  ready: boolean
  noteCount: number
  conversationCount: number
  lastSyncMs: number
}

export interface ShortcutStatus {
  shortcut: string
  registered: boolean
  error?: string
}

/** Événements poussés du process principal vers le renderer. */
export interface MemologEvents {
  'note:changed': { path: string; mtimeMs: number }
  'note:removed': { path: string }
  /** Une conversation a changé : la liste et le fil ouvert se rechargent. */
  'conversations:changed': { path?: string }
  'index:status': IndexStatus
  'settings:changed': Settings
  'shortcut:status': ShortcutStatus
  'navigate': { view: 'settings' | 'search'; path?: string }
}

export type MemologEventName = keyof MemologEvents
