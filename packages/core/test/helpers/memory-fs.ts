import path from 'node:path'

import { MemologError } from '../../src/domain/errors.js'
import type { DirEntry, FileStat, FileSystem } from '../../src/adapters/fs/fs-port.js'
import { createVault, type Vault } from '../../src/adapters/fs/vault.js'

/**
 * Système de fichiers en mémoire pour les tests du coeur.
 * Les chemins sont absolus, comme ceux que reçoit l'implémentation Node.
 */
export interface MemoryFileSystem extends FileSystem {
  /** Fichiers envoyés à la corbeille, pour vérifier qu'on ne supprime jamais. */
  readonly trashed: string[]
  /** Horloge simulée : chaque écriture avance le `mtime` d'une milliseconde. */
  tick(): void
  dump(): Record<string, string>
}

interface Entry {
  kind: 'file' | 'dir'
  content: string
  mtimeMs: number
  /** Fixée à la première écriture : une réécriture ne la change pas. */
  birthtimeMs: number
}

export function createMemoryFileSystem(initial: Record<string, string> = {}): MemoryFileSystem {
  const entries = new Map<string, Entry>()
  const trashed: string[] = []
  let clock = 1_000

  const normalize = (p: string): string => path.resolve(p)

  const ensureParents = (absPath: string): void => {
    let current = path.dirname(normalize(absPath))
    while (current !== path.dirname(current)) {
      if (!entries.has(current)) {
        entries.set(current, { kind: 'dir', content: '', mtimeMs: clock, birthtimeMs: clock })
      }
      current = path.dirname(current)
    }
  }

  const setFile = (absPath: string, content: string): void => {
    ensureParents(absPath)
    clock += 1
    const key = normalize(absPath)
    entries.set(key, {
      kind: 'file',
      content,
      mtimeMs: clock,
      birthtimeMs: entries.get(key)?.birthtimeMs ?? clock
    })
  }

  for (const [absPath, content] of Object.entries(initial)) {
    setFile(absPath, content)
  }

  return {
    trashed,

    tick() {
      clock += 1
    },

    dump() {
      const out: Record<string, string> = {}
      for (const [key, entry] of entries) {
        if (entry.kind === 'file') out[key] = entry.content
      }
      return out
    },

    async readFile(absPath) {
      const entry = entries.get(normalize(absPath))
      if (!entry || entry.kind !== 'file') {
        throw new MemologError('not-found', `Fichier introuvable : ${absPath}`)
      }
      return entry.content
    },

    async writeFile(absPath, content) {
      setFile(absPath, content)
    },

    async stat(absPath): Promise<FileStat | null> {
      const entry = entries.get(normalize(absPath))
      if (!entry) return null
      return {
        kind: entry.kind,
        mtimeMs: entry.mtimeMs,
        birthtimeMs: entry.birthtimeMs,
        size: entry.kind === 'file' ? Buffer.byteLength(entry.content, 'utf8') : 0
      }
    },

    async readDir(absPath): Promise<DirEntry[]> {
      const dir = normalize(absPath)
      const out: DirEntry[] = []
      const seen = new Set<string>()
      for (const [key, entry] of entries) {
        if (path.dirname(key) !== dir || key === dir) continue
        const name = path.basename(key)
        if (seen.has(name)) continue
        seen.add(name)
        out.push({ name, kind: entry.kind })
      }
      return out
    },

    async mkdir(absPath) {
      ensureParents(path.join(normalize(absPath), 'x'))
      if (!entries.has(normalize(absPath))) {
        entries.set(normalize(absPath), {
          kind: 'dir',
          content: '',
          mtimeMs: clock,
          birthtimeMs: clock
        })
      }
    },

    async rename(fromAbs, toAbs) {
      const from = normalize(fromAbs)
      const to = normalize(toAbs)
      if (entries.has(to)) {
        throw new MemologError('already-exists', `La destination existe déjà : ${toAbs}`)
      }
      const moving = [...entries.entries()].filter(
        ([key]) => key === from || key.startsWith(`${from}${path.sep}`)
      )
      if (moving.length === 0) {
        throw new MemologError('not-found', `Introuvable : ${fromAbs}`)
      }
      ensureParents(to)
      for (const [key, entry] of moving) {
        entries.delete(key)
        entries.set(to + key.slice(from.length), entry)
      }
    },

    async trash(absPath) {
      const target = normalize(absPath)
      const removing = [...entries.keys()].filter(
        (key) => key === target || key.startsWith(`${target}${path.sep}`)
      )
      if (removing.length === 0) {
        throw new MemologError('not-found', `Introuvable : ${absPath}`)
      }
      for (const key of removing) entries.delete(key)
      trashed.push(target)
    }
  }
}

export const TEST_ROOT = path.resolve('/memolog-test')

export function createTestVault(files: Record<string, string> = {}): {
  vault: Vault
  fs: MemoryFileSystem
} {
  const absolute: Record<string, string> = {}
  for (const [rel, content] of Object.entries(files)) {
    absolute[path.join(TEST_ROOT, rel)] = content
  }
  const fs = createMemoryFileSystem(absolute)
  return { vault: createVault(TEST_ROOT, fs), fs }
}
