import { randomBytes } from 'node:crypto'
import fsp from 'node:fs/promises'
import path from 'node:path'

import type { MemoryNoteIndex } from '@memolog/core'

import type { IndexStatus } from '../shared/types.js'
import { configDir } from './settings.js'

const CACHE_FILE = 'index.cache.json'

/**
 * Cycle de vie de l'index côté application : cache de démarrage, état
 * observable, écriture différée.
 *
 * L'index lui-même vient du coeur (`MemoryNoteIndex`) ; ce service ne gère
 * que ce qui est propre au desktop. Le cache disque n'est qu'une
 * optimisation : il est jetable, revalidé fichier par fichier, et
 * reconstruit intégralement s'il est absent ou périmé.
 */
export class IndexService {
  private index: MemoryNoteIndex | null = null
  private root = ''
  private status: IndexStatus = { ready: false, noteCount: 0, taskCount: 0, lastSyncMs: 0 }
  private saveTimer: NodeJS.Timeout | null = null
  private onStatus: (status: IndexStatus) => void = () => undefined

  setStatusListener(listener: (status: IndexStatus) => void): void {
    this.onStatus = listener
  }

  getStatus(): IndexStatus {
    return this.status
  }

  private cachePath(): string {
    return path.join(configDir(), CACHE_FILE)
  }

  /** Branche un index sur un dossier : cache, puis synchronisation. */
  async attach(index: MemoryNoteIndex, root: string): Promise<IndexStatus> {
    this.index = index
    this.root = root
    this.setStatus({ ...this.status, ready: false })

    try {
      const raw = await fsp.readFile(this.cachePath(), 'utf8')
      index.loadSearchCache(JSON.parse(raw), root)
    } catch {
      // Pas de cache utilisable : la synchronisation relira tout.
    }
    return this.sync()
  }

  async sync(): Promise<IndexStatus> {
    if (this.index === null) return this.status
    const started = Date.now()
    const report = await this.index.sync()
    this.setStatus({
      ready: true,
      noteCount: report.noteCount,
      taskCount: report.taskCount,
      lastSyncMs: Date.now() - started
    })
    this.scheduleSave()
    return this.status
  }

  /** Reconstruction complète, sur demande depuis les paramètres. */
  async rebuild(): Promise<IndexStatus> {
    await fsp.rm(this.cachePath(), { force: true }).catch(() => undefined)
    for (const path of this.index?.paths ?? []) this.index?.removeResource(path)
    return this.sync()
  }

  /** Réindexe une ressource dont on connaît déjà le contenu. */
  update(relPath: string, content: string, stat: { mtimeMs: number; size: number }): void {
    if (this.index === null) return
    this.index.updateResource(relPath, content, stat)
    this.refreshCounts()
  }

  remove(relPath: string): void {
    if (this.index === null) return
    this.index.removeResource(relPath)
    this.refreshCounts()
  }

  private refreshCounts(): void {
    if (this.index === null) return
    this.setStatus({
      ...this.status,
      noteCount: this.index.noteCount,
      taskCount: this.index.taskCount
    })
    this.scheduleSave()
  }

  private setStatus(status: IndexStatus): void {
    this.status = status
    this.onStatus(status)
  }

  /** L'écriture du cache est différée : elle ne doit jamais gêner la frappe. */
  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void this.saveCache()
    }, 5_000)
    this.saveTimer.unref?.()
  }

  async saveCache(): Promise<void> {
    if (this.index === null) return
    const dir = configDir()
    const temp = path.join(dir, `.${CACHE_FILE}.${randomBytes(4).toString('hex')}.tmp`)
    try {
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(temp, JSON.stringify(this.index.toSearchCache(this.root)), 'utf8')
      await fsp.rename(temp, this.cachePath())
    } catch {
      await fsp.rm(temp, { force: true }).catch(() => undefined)
    }
  }

  dispose(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer)
  }
}
