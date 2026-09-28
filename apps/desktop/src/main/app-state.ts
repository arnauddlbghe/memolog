import {
  EditBurstTracker,
  JournalService,
  ProjectService,
  TaskService,
  createMarkdownStorage,
  diffLines,
  parseLocalDate,
  type MarkdownStorage,
  type Vault
} from '@memolog/core'

import type { Settings } from '../shared/types.js'
import { emit } from './events.js'
import { IndexService } from './indexer.js'
import { getSettings, updateSettings } from './settings.js'
import { ensureVaultRoot, isDirectoryEmpty, moveVaultContents, openVault } from './vault.js'
import { VaultWatcher } from './watcher.js'

/** Fichiers dont on garde la dernière version connue, pour calculer les diffs. */
const KNOWN_CONTENT_LIMIT = 60

/** Fréquence de fermeture des rafales d'édition. */
const BURST_TICK_MS = 60_000

/**
 * État partagé du process principal : le stockage courant, les services
 * métier, l'index et la surveillance disque.
 *
 * Tout est reconstruit d'un bloc quand l'utilisateur change de dossier de
 * rangement. Le stockage passe par `createMarkdownStorage` : c'est le seul
 * endroit à changer le jour où les données vivront ailleurs.
 */
export class AppState {
  private vault: Vault
  private storage: MarkdownStorage
  private services: {
    tasks: TaskService
    journal: JournalService
    projects: ProjectService
  }

  readonly index = new IndexService()
  private readonly watcher: VaultWatcher
  private bursts: EditBurstTracker
  private burstTimer: NodeJS.Timeout | null = null

  /** Dernière version connue de chaque fichier suivi, pour attribuer les éditions. */
  private readonly knownContent = new Map<string, string>()

  constructor() {
    const settings = getSettings()
    this.vault = openVault(settings.root)
    this.storage = createMarkdownStorage(this.vault)
    this.services = this.buildServices()
    this.bursts = new EditBurstTracker(settings.burstWindowMinutes * 60_000)

    this.watcher = new VaultWatcher({
      noteChanged: (relPath) => void this.onExternalChange(relPath),
      noteRemoved: (relPath) => {
        this.index.remove(relPath)
        this.knownContent.delete(relPath)
        emit('note:removed', { path: relPath })
        emit('tasks:changed', {})
      },
      treeChanged: (dir) => emit('tree:changed', { dir })
    })

    this.index.setStatusListener((status) => emit('index:status', status))
  }

  private buildServices(): AppState['services'] {
    return {
      tasks: new TaskService({ tasks: this.storage.tasks, activity: this.storage.activity }),
      journal: new JournalService({
        journal: this.storage.journal,
        activity: this.storage.activity
      }),
      projects: new ProjectService({ index: this.storage.index, notes: this.storage.notes })
    }
  }

  get tasks(): TaskService {
    return this.services.tasks
  }

  get journal(): JournalService {
    return this.services.journal
  }

  get projects(): ProjectService {
    return this.services.projects
  }

  get notes(): MarkdownStorage['notes'] {
    return this.storage.notes
  }

  get noteIndex(): MarkdownStorage['index'] {
    return this.storage.index
  }

  getVault(): Vault {
    return this.vault
  }

  /** Ouvre un dossier : création si besoin, index, surveillance, archivage. */
  async attachRoot(root: string): Promise<void> {
    await ensureVaultRoot(root)
    this.vault = openVault(root)
    this.storage = createMarkdownStorage(this.vault)
    this.services = this.buildServices()
    this.knownContent.clear()

    this.watcher.watch(root)
    await this.index.attach(this.storage.index, root)

    // Les tâches écrites à la main reçoivent leur identifiant et leurs dates.
    const completed = await this.services.tasks.ensureMetadata()
    const settings = getSettings()
    if (settings.autoArchive) {
      await this.services.tasks.archiveClosed(settings.archiveAfterDays)
    }
    if (completed.length > 0 || settings.autoArchive) await this.index.sync()

    this.startBurstTimer()
  }

  applySettings(settings: Settings): void {
    this.bursts = new EditBurstTracker(settings.burstWindowMinutes * 60_000)
  }

  /**
   * Change de dossier de rangement, en déplaçant ou non le contenu existant.
   * Rien n'est jamais écrasé : les fichiers déjà présents dans la destination
   * sont laissés en place.
   */
  async setRoot(newRoot: string, move: boolean): Promise<Settings> {
    const previous = getSettings().root
    await this.flushBursts()
    if (move && previous !== newRoot) await moveVaultContents(previous, newRoot)

    const settings = updateSettings({ root: newRoot })
    await this.attachRoot(newRoot)
    emit('tree:changed', { dir: '' })
    emit('tasks:changed', {})
    return settings
  }

  async previewRootChange(newRoot: string): Promise<{
    noteCount: number
    folderCount: number
    targetExists: boolean
    targetEmpty: boolean
  }> {
    const summary = await this.storage.notes.summarize()
    const target = await isDirectoryEmpty(newRoot)
    return { ...summary, targetExists: target.exists, targetEmpty: target.empty }
  }

  // --- Journal d'activité ---------------------------------------------------

  /**
   * Une écriture faite par l'application : elle alimente l'index, la rafale
   * d'édition au nom de « vous », et devient la nouvelle version connue.
   */
  noteWritten(relPath: string, content: string, stat: { mtimeMs: number; size: number }): void {
    const previous = this.knownContent.get(relPath)
    if (previous !== undefined) {
      const diff = diffLines(previous, content)
      if (diff !== null) this.bursts.touch(relPath, 'vous', diff)
    }
    this.remember(relPath, content)
    this.index.update(relPath, content, stat)
  }

  /**
   * Une modification venue d'ailleurs : on relit, on compare à la dernière
   * version connue, et on l'attribue à « externe ».
   *
   * Si le fichier n'était pas suivi, on se contente de mémoriser son contenu :
   * une modification faite pendant que Memolog était éteint ne produit pas
   * d'événement (`docs/format.md` §6.3).
   */
  private async onExternalChange(relPath: string): Promise<void> {
    let content: string
    let stat: { mtimeMs: number; size: number }
    try {
      const note = await this.storage.notes.read(relPath)
      content = note.content
      stat = { mtimeMs: note.mtimeMs, size: note.size }
    } catch {
      return
    }

    const previous = this.knownContent.get(relPath)
    if (previous !== undefined && previous !== content) {
      const diff = diffLines(previous, content)
      if (diff !== null) this.bursts.touch(relPath, 'externe', diff)
    }
    this.remember(relPath, content)
    this.index.update(relPath, content, stat)

    emit('note:changed', { path: relPath, mtimeMs: stat.mtimeMs })
    if (relPath === 'taches.md' || relPath.startsWith('taches/')) emit('tasks:changed', {})
  }

  private remember(relPath: string, content: string): void {
    // Cache borné : on ne garde que les fichiers récemment touchés.
    this.knownContent.delete(relPath)
    this.knownContent.set(relPath, content)
    while (this.knownContent.size > KNOWN_CONTENT_LIMIT) {
      const oldest = this.knownContent.keys().next().value
      if (oldest === undefined) break
      this.knownContent.delete(oldest)
    }
  }

  private startBurstTimer(): void {
    if (this.burstTimer !== null) return
    this.burstTimer = setInterval(() => {
      void this.collectBursts()
    }, BURST_TICK_MS)
    this.burstTimer.unref?.()
  }

  /** Écrit les événements des rafales d'édition terminées. */
  private async collectBursts(): Promise<void> {
    for (const burst of this.bursts.collectExpired()) {
      await this.storage.activity.appendEditBurst(burst)
      emit('activity:changed', { date: burst.lastTouch.toISOString().slice(0, 10) })
    }
  }

  /** Vide les rafales en cours : fermeture de l'app, changement de dossier. */
  async flushBursts(): Promise<void> {
    for (const burst of this.bursts.flushAll()) {
      await this.storage.activity.appendEditBurst(burst).catch(() => undefined)
    }
  }

  /** Vue Jour, avec la date donnée ou aujourd'hui. */
  dayView(date?: string): ReturnType<JournalService['day']> {
    const parsed = date === undefined ? null : parseLocalDate(date)
    return this.services.journal.day(parsed ?? new Date())
  }

  async dispose(): Promise<void> {
    if (this.burstTimer !== null) clearInterval(this.burstTimer)
    this.watcher.close()
    await this.flushBursts()
    await this.index.saveCache()
    this.index.dispose()
  }
}
