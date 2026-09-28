import fsp from 'node:fs/promises'
import path from 'node:path'

import { shell } from 'electron'

import { MemologError, createVault, type Vault } from '@memolog/core'
import { createNodeFileSystem } from '@memolog/core/node'

/**
 * Construit le vault sur un dossier donné. La corbeille est celle du système
 * (`shell.trashItem`) : Memolog ne supprime jamais définitivement un fichier.
 */
export function openVault(root: string): Vault {
  const fs = createNodeFileSystem({
    trash: async (absPath) => {
      await shell.trashItem(absPath)
    }
  })
  return createVault(root, fs)
}

/** Crée le dossier de notes s'il n'existe pas encore. */
export async function ensureVaultRoot(root: string): Promise<void> {
  await fsp.mkdir(root, { recursive: true })
}

export interface MoveReport {
  moved: number
  skipped: string[]
}

/**
 * Déplace le contenu d'un dossier de notes vers un autre.
 *
 * Refuse d'écraser quoi que ce soit : un fichier qui existe déjà dans la
 * destination est laissé en place et signalé. L'ancien dossier n'est jamais
 * supprimé, même vide — c'est à l'utilisateur de le faire.
 */
export async function moveVaultContents(fromRoot: string, toRoot: string): Promise<MoveReport> {
  const from = path.resolve(fromRoot)
  const to = path.resolve(toRoot)

  if (from === to) return { moved: 0, skipped: [] }
  if (to.startsWith(`${from}${path.sep}`)) {
    throw new MemologError(
      'invalid-path',
      "Le nouveau dossier est à l'intérieur de l'ancien : déplacement impossible."
    )
  }

  await fsp.mkdir(to, { recursive: true })
  const report: MoveReport = { moved: 0, skipped: [] }
  await moveInto(from, to, report, '')
  return report
}

async function moveInto(
  fromDir: string,
  toDir: string,
  report: MoveReport,
  relative: string
): Promise<void> {
  let entries
  try {
    entries = await fsp.readdir(fromDir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    // Les fichiers temporaires d'écriture atomique ne suivent pas.
    if (entry.name.endsWith('.tmp')) continue

    const source = path.join(fromDir, entry.name)
    const target = path.join(toDir, entry.name)
    const rel = relative === '' ? entry.name : `${relative}/${entry.name}`

    if (entry.isDirectory()) {
      await fsp.mkdir(target, { recursive: true })
      await moveInto(source, target, report, rel)
      // Supprime le dossier d'origine seulement s'il est devenu vide.
      await fsp.rmdir(source).catch(() => undefined)
      continue
    }

    if (!entry.isFile()) continue

    try {
      await fsp.access(target)
      report.skipped.push(rel)
      continue
    } catch {
      // La destination est libre : on peut déplacer.
    }

    try {
      await fsp.rename(source, target)
    } catch {
      // Volumes différents : copie puis suppression de la source.
      await fsp.copyFile(source, target)
      await fsp.unlink(source)
    }
    report.moved += 1
  }
}

/** Le dossier visé est-il vide (ou inexistant) ? */
export async function isDirectoryEmpty(dir: string): Promise<{ exists: boolean; empty: boolean }> {
  try {
    const entries = await fsp.readdir(dir)
    const visible = entries.filter((name) => !name.startsWith('.'))
    return { exists: true, empty: visible.length === 0 }
  } catch {
    return { exists: false, empty: true }
  }
}
