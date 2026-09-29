import type {
  AppInfo,
  Conversation,
  ConversationState,
  ConversationSummary,
  IndexStatus,
  MemologEventName,
  MemologEvents,
  MemoryMetrics,
  NoteContent,
  SearchHit,
  Settings,
  ShortcutStatus,
  TreeEntry,
  VaultChangePreview,
  WriteOutcome
} from './types.js'

/**
 * Le contrat unique entre le renderer et le process principal.
 *
 * Le renderer n'a aucun accès au système de fichiers : il ne peut rien faire
 * d'autre qu'appeler ces méthodes, et chacune revalide ses arguments côté
 * principal avant de toucher au stockage.
 */
export interface MemologApi {
  settings: {
    get(): Promise<Settings>
    update(patch: Partial<Settings>): Promise<Settings>
  }

  vault: {
    choose(): Promise<string | null>
    previewChange(newRoot: string): Promise<VaultChangePreview>
    setRoot(newRoot: string, move: boolean): Promise<Settings>
    reveal(relPath?: string): Promise<void>
  }

  onboarding: {
    complete(root: string, launchAtLogin: boolean): Promise<Settings>
  }

  conversations: {
    list(): Promise<ConversationSummary[]>
    read(path: string): Promise<Conversation>
    create(name: string): Promise<ConversationSummary>
    /** Enregistre le corps. `baseMtimeMs` protège contre l'écrasement. */
    setContent(path: string, content: string, baseMtimeMs?: number): Promise<WriteOutcome>
    setState(path: string, state: ConversationState): Promise<Conversation>
    rename(path: string, name: string): Promise<string>
    remove(path: string): Promise<void>
    /** Jours de création connus, du plus récent au plus ancien. */
    days(): Promise<string[]>
  }

  /** Accès brut aux fichiers : l'échappatoire, pas un lieu de vie. */
  notes: {
    list(dir: string): Promise<TreeEntry[]>
    read(path: string): Promise<NoteContent>
    write(path: string, content: string, baseMtimeMs?: number): Promise<WriteOutcome>
    create(dir: string, name?: string): Promise<NoteContent>
    remove(path: string): Promise<void>
    all(): Promise<TreeEntry[]>
  }

  search: {
    query(text: string, limit?: number): Promise<SearchHit[]>
    status(): Promise<IndexStatus>
    rebuild(): Promise<IndexStatus>
  }

  app: {
    info(): Promise<AppInfo>
    metrics(): Promise<MemoryMetrics>
    hide(): Promise<void>
    quit(): Promise<void>
    testShortcut(shortcut: string): Promise<ShortcutStatus>
    openExternal(url: string): Promise<void>
  }

  /** Abonnement aux événements du principal. Renvoie la fonction de désabonnement. */
  on<E extends MemologEventName>(event: E, listener: (payload: MemologEvents[E]) => void): () => void
}

/** Noms de canaux IPC, partagés par le preload et le process principal. */
export const CHANNELS = {
  settingsGet: 'memolog:settings:get',
  settingsUpdate: 'memolog:settings:update',
  vaultChoose: 'memolog:vault:choose',
  vaultPreviewChange: 'memolog:vault:preview-change',
  vaultSetRoot: 'memolog:vault:set-root',
  vaultReveal: 'memolog:vault:reveal',
  onboardingComplete: 'memolog:onboarding:complete',

  conversationsList: 'memolog:conversations:list',
  conversationsRead: 'memolog:conversations:read',
  conversationsCreate: 'memolog:conversations:create',
  conversationsSetContent: 'memolog:conversations:set-content',
  conversationsSetState: 'memolog:conversations:set-state',
  conversationsRename: 'memolog:conversations:rename',
  conversationsRemove: 'memolog:conversations:remove',
  conversationsDays: 'memolog:conversations:days',

  notesList: 'memolog:notes:list',
  notesRead: 'memolog:notes:read',
  notesWrite: 'memolog:notes:write',
  notesCreate: 'memolog:notes:create',
  notesRemove: 'memolog:notes:remove',
  notesAll: 'memolog:notes:all',

  searchQuery: 'memolog:search:query',
  searchStatus: 'memolog:search:status',
  searchRebuild: 'memolog:search:rebuild',

  appInfo: 'memolog:app:info',
  appMetrics: 'memolog:app:metrics',
  appHide: 'memolog:app:hide',
  appQuit: 'memolog:app:quit',
  appTestShortcut: 'memolog:app:test-shortcut',
  appOpenExternal: 'memolog:app:open-external'
} as const

/** Canal unique pour les événements principal → renderer. */
export const EVENT_CHANNEL = 'memolog:event'
