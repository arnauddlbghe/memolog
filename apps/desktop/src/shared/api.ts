import type {
  AppInfo,
  DayView,
  IndexStatus,
  MemologEventName,
  MemologEvents,
  MemoryMetrics,
  NoteContent,
  ProjectDetail,
  ProjectSummary,
  ResolvedRef,
  SearchHit,
  Settings,
  ShortcutStatus,
  Task,
  TaskState,
  TaskWithAge,
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
    /** Ouvre le sélecteur de dossier natif. `null` si l'utilisateur annule. */
    choose(): Promise<string | null>
    /** Ce qu'implique un changement de dossier, avant de le décider. */
    previewChange(newRoot: string): Promise<VaultChangePreview>
    /** Change de dossier, en déplaçant ou non le contenu existant. */
    setRoot(newRoot: string, move: boolean): Promise<Settings>
    /** Ouvre le dossier de notes dans l'explorateur du système. */
    reveal(relPath?: string): Promise<void>
  }

  onboarding: {
    complete(root: string, launchAtLogin: boolean): Promise<Settings>
  }

  tree: {
    list(dir: string): Promise<TreeEntry[]>
  }

  notes: {
    read(path: string): Promise<NoteContent>
    write(path: string, content: string, baseMtimeMs?: number): Promise<WriteOutcome>
    create(dir: string, name?: string): Promise<NoteContent>
    createFolder(dir: string, name: string): Promise<string>
    rename(path: string, newName: string): Promise<string>
    move(path: string, newDir: string): Promise<string>
    remove(path: string): Promise<void>
  }

  journal: {
    /** Note du jour, créée si besoin. */
    today(): Promise<NoteContent>
    open(date: string): Promise<NoteContent>
    /** Ajoute une entrée horodatée à la journée en cours. */
    append(text: string): Promise<{ path: string; line: number }>
    /** Vue Jour : notes libres et activité fusionnées. */
    day(date?: string): Promise<DayView>
    /** Journées existantes, de la plus récente à la plus ancienne. */
    days(): Promise<string[]>
  }

  tasks: {
    list(options?: { includeClosed?: boolean; project?: string }): Promise<Task[]>
    /** Tâches actives sans mise à jour depuis le délai configuré. */
    dormant(days?: number): Promise<TaskWithAge[]>
    create(text: string, project?: string, description?: string): Promise<Task>
    setState(id: string, state: TaskState): Promise<Task>
    /** Clic sur la case : état suivant du cycle. */
    cycle(id: string): Promise<Task>
    rename(id: string, text: string): Promise<Task>
    describe(id: string, description: string): Promise<Task>
    /** Résout des références `@tNN` pour les afficher en étiquettes. */
    resolve(ids: string[]): Promise<ResolvedRef[]>
    archive(): Promise<{ archived: Task[]; targets: string[] }>
  }

  projects: {
    list(): Promise<ProjectSummary[]>
    detail(name: string): Promise<ProjectDetail | null>
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
    /** Teste un raccourci global sans l'enregistrer durablement. */
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
  treeList: 'memolog:tree:list',
  noteRead: 'memolog:note:read',
  noteWrite: 'memolog:note:write',
  noteCreate: 'memolog:note:create',
  folderCreate: 'memolog:folder:create',
  entryRename: 'memolog:entry:rename',
  entryMove: 'memolog:entry:move',
  entryRemove: 'memolog:entry:remove',
  journalToday: 'memolog:journal:today',
  journalOpen: 'memolog:journal:open',
  journalAppend: 'memolog:journal:append',
  journalDay: 'memolog:journal:day',
  journalDays: 'memolog:journal:days',
  tasksList: 'memolog:tasks:list',
  tasksDormant: 'memolog:tasks:dormant',
  tasksCreate: 'memolog:tasks:create',
  tasksSetState: 'memolog:tasks:set-state',
  tasksCycle: 'memolog:tasks:cycle',
  tasksRename: 'memolog:tasks:rename',
  tasksDescribe: 'memolog:tasks:describe',
  tasksResolve: 'memolog:tasks:resolve',
  tasksArchive: 'memolog:tasks:archive',
  projectsList: 'memolog:projects:list',
  projectsDetail: 'memolog:projects:detail',
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
