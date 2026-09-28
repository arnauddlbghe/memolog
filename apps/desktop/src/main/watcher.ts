import path from 'node:path'

import chokidar, { type FSWatcher } from 'chokidar'

const IGNORED_DIRS = new Set(['.git', '.obsidian', '.trash', 'node_modules'])

export interface WatcherEvents {
  /** Une note a été créée ou modifiée sur le disque. */
  noteChanged: (relPath: string) => void
  /** Une note a disparu. */
  noteRemoved: (relPath: string) => void
  /** Le contenu d'un dossier a changé (ajout, suppression, renommage). */
  treeChanged: (relDir: string) => void
}

/**
 * Surveillance du dossier de notes.
 *
 * Tout ce qui arrive par ici vient de l'extérieur *ou* de Memolog lui-même :
 * on ne cherche pas à distinguer les deux ici. C'est l'éditeur qui compare le
 * `mtime` reçu au sien pour savoir s'il doit s'inquiéter.
 */
export class VaultWatcher {
  private watcher: FSWatcher | null = null
  private root = ''
  private readonly pending = new Map<string, NodeJS.Timeout>()

  constructor(private readonly events: WatcherEvents) {}

  watch(root: string): void {
    this.close()
    this.root = root
    this.watcher = chokidar.watch(root, {
      ignoreInitial: true,
      followSymlinks: false,
      // Attendre que le fichier soit stable évite de lire une écriture en cours.
      awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
      ignored: (target: string) => {
        const base = path.basename(target)
        if (base === path.basename(root)) return false
        return base.startsWith('.') || base.endsWith('.tmp') || IGNORED_DIRS.has(base)
      }
    })

    this.watcher
      .on('add', (file) => this.onFile(file, 'changed'))
      .on('change', (file) => this.onFile(file, 'changed'))
      .on('unlink', (file) => this.onFile(file, 'removed'))
      .on('addDir', (dir) => this.onDir(dir))
      .on('unlinkDir', (dir) => this.onDir(dir))
      .on('error', () => undefined)
  }

  private toRel(absPath: string): string | null {
    const rel = path.relative(this.root, absPath)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null
    return rel.split(path.sep).join('/')
  }

  /** Regroupe les rafales d'événements : un éditeur externe en émet plusieurs. */
  private debounce(key: string, run: () => void): void {
    const existing = this.pending.get(key)
    if (existing !== undefined) clearTimeout(existing)
    const timer = setTimeout(() => {
      this.pending.delete(key)
      run()
    }, 120)
    timer.unref?.()
    this.pending.set(key, timer)
  }

  private onFile(absPath: string, kind: 'changed' | 'removed'): void {
    if (!absPath.toLowerCase().endsWith('.md')) return
    const rel = this.toRel(absPath)
    if (rel === null) return

    this.debounce(`file:${rel}`, () => {
      if (kind === 'removed') this.events.noteRemoved(rel)
      else this.events.noteChanged(rel)
      this.events.treeChanged(parentDir(rel))
    })
  }

  private onDir(absPath: string): void {
    const rel = this.toRel(absPath)
    if (rel === null) return
    this.debounce(`dir:${rel}`, () => this.events.treeChanged(parentDir(rel)))
  }

  close(): void {
    for (const timer of this.pending.values()) clearTimeout(timer)
    this.pending.clear()
    void this.watcher?.close()
    this.watcher = null
  }
}

function parentDir(relPath: string): string {
  const index = relPath.lastIndexOf('/')
  return index === -1 ? '' : relPath.slice(0, index)
}
