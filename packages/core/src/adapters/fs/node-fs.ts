import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { MemologError } from '../../domain/errors.js'
import type { DirEntry, FileStat, FileSystem } from './fs-port.js'

export interface NodeFileSystemOptions {
  /**
   * Mise à la corbeille du système. Le desktop injecte `shell.trashItem`
   * d'Electron ; le coeur ne supprime jamais définitivement de lui-même.
   */
  trash?: (absPath: string) => Promise<void>
}

function isErrnoException(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === code
  )
}

/**
 * Implémentation Node du port système de fichiers.
 * Seul fichier du coeur autorisé à importer `node:fs`.
 */
export function createNodeFileSystem(options: NodeFileSystemOptions = {}): FileSystem {
  return {
    async readFile(absPath) {
      try {
        return await fs.readFile(absPath, 'utf8')
      } catch (error) {
        if (isErrnoException(error, 'ENOENT')) {
          throw new MemologError('not-found', `Fichier introuvable : ${absPath}`)
        }
        throw new MemologError('io', `Lecture impossible : ${absPath}`)
      }
    },

    /**
     * Écriture atomique : fichier temporaire dans le même dossier puis
     * renommage. Une coupure de courant ne peut pas laisser une note à moitié
     * écrite, et les lecteurs externes ne voient jamais d'état intermédiaire.
     */
    async writeFile(absPath, content) {
      const dir = path.dirname(absPath)
      const temp = path.join(dir, `.${path.basename(absPath)}.${randomBytes(6).toString('hex')}.tmp`)
      await fs.mkdir(dir, { recursive: true })
      try {
        await fs.writeFile(temp, content, 'utf8')
        await fs.rename(temp, absPath)
      } catch (error) {
        await fs.rm(temp, { force: true }).catch(() => undefined)
        throw new MemologError('io', `Écriture impossible : ${absPath} (${String(error)})`)
      }
    },

    async stat(absPath): Promise<FileStat | null> {
      try {
        const stat = await fs.stat(absPath)
        return {
          mtimeMs: stat.mtimeMs,
          size: stat.size,
          kind: stat.isDirectory() ? 'dir' : 'file'
        }
      } catch (error) {
        if (isErrnoException(error, 'ENOENT') || isErrnoException(error, 'ENOTDIR')) {
          return null
        }
        throw new MemologError('io', `Accès impossible : ${absPath}`)
      }
    },

    async readDir(absPath): Promise<DirEntry[]> {
      try {
        const entries = await fs.readdir(absPath, { withFileTypes: true })
        const out: DirEntry[] = []
        for (const entry of entries) {
          if (entry.isDirectory()) out.push({ name: entry.name, kind: 'dir' })
          else if (entry.isFile()) out.push({ name: entry.name, kind: 'file' })
          // Les liens symboliques sont ignorés : ils pourraient pointer hors
          // du dossier de notes.
        }
        return out
      } catch (error) {
        if (isErrnoException(error, 'ENOENT')) return []
        throw new MemologError('io', `Lecture du dossier impossible : ${absPath}`)
      }
    },

    async mkdir(absPath) {
      await fs.mkdir(absPath, { recursive: true })
    },

    async rename(fromAbs, toAbs) {
      try {
        // `fs.rename` écrase silencieusement : on vérifie d'abord.
        await fs.access(toAbs)
        throw new MemologError('already-exists', `La destination existe déjà : ${toAbs}`)
      } catch (error) {
        if (error instanceof MemologError) throw error
        if (!isErrnoException(error, 'ENOENT')) {
          throw new MemologError('io', `Déplacement impossible : ${fromAbs}`)
        }
      }
      await fs.mkdir(path.dirname(toAbs), { recursive: true })
      await fs.rename(fromAbs, toAbs)
    },

    async trash(absPath) {
      if (!options.trash) {
        throw new MemologError(
          'io',
          "Aucune corbeille n'est configurée : suppression refusée par sécurité."
        )
      }
      await options.trash(absPath)
    }
  }
}
