import { MemologError } from '../../domain/errors.js'
import {
  assertNotePath,
  assertValidName,
  baseName,
  joinRel,
  normalizeRelPath,
  parentOf,
  stripNoteExtension,
  titleFromPath,
  withNoteExtension
} from '../fs/paths.js'
import type { NoteContent, RelPath, WriteResult } from '../../domain/types.js'
import { abs, existsRel, statRel, type Vault } from '../fs/vault.js'

export const DEFAULT_NOTE_NAME = 'Sans titre'

/**
 * Normalise le contenu avant écriture : UTF-8 sans BOM, fins de ligne `\n`,
 * un saut de ligne final. C'est le contrat décrit dans `docs/format.md` ;
 * un fichier écrit par Memolog est toujours sous cette forme.
 */
export function normalizeContent(content: string): string {
  const withoutBom = content.replace(/^﻿/, '')
  const lf = withoutBom.replace(/\r\n?/g, '\n')
  if (lf === '') return ''
  return lf.endsWith('\n') ? lf : `${lf}\n`
}

export async function readNote(vault: Vault, relPath: string): Promise<NoteContent> {
  const rel = assertNotePath(normalizeRelPath(relPath))
  const stat = await statRel(vault, rel)
  if (stat === null) {
    throw new MemologError('not-found', `Note introuvable : ${rel}`)
  }
  if (stat.kind !== 'file') {
    throw new MemologError('not-a-note', `Ce chemin est un dossier : ${rel}`)
  }
  const raw = await vault.fs.readFile(abs(vault, rel))
  return {
    path: rel,
    title: titleFromPath(rel),
    content: raw.replace(/^﻿/, ''),
    mtimeMs: stat.mtimeMs,
    birthtimeMs: stat.birthtimeMs,
    size: stat.size
  }
}

export interface WriteOptions {
  /**
   * `mtimeMs` du fichier au moment où l'éditeur l'a chargé. S'il ne correspond
   * plus, l'écriture est refusée et la version disque est renvoyée : c'est ce
   * qui alimente le bandeau de conflit.
   */
  baseMtimeMs?: number
}

export async function writeNote(
  vault: Vault,
  relPath: string,
  content: string,
  options: WriteOptions = {}
): Promise<WriteResult> {
  const rel = assertNotePath(normalizeRelPath(relPath))
  const current = await statRel(vault, rel)

  if (options.baseMtimeMs !== undefined && current !== null) {
    if (current.mtimeMs !== options.baseMtimeMs) {
      const disk = await readNote(vault, rel)
      return { ok: false, reason: 'conflict', disk }
    }
  }

  await ensureDir(vault, parentOf(rel))
  await vault.fs.writeFile(abs(vault, rel), normalizeContent(content))

  const after = await statRel(vault, rel)
  return {
    ok: true,
    path: rel,
    mtimeMs: after?.mtimeMs ?? Date.now(),
    size: after?.size ?? 0
  }
}

/** Crée les dossiers manquants jusqu'à `dirRel` inclus. */
export async function ensureDir(vault: Vault, dirRel: string): Promise<void> {
  const rel = normalizeRelPath(dirRel)
  if (rel === '') {
    await vault.fs.mkdir(vault.root)
    return
  }
  await vault.fs.mkdir(abs(vault, rel))
}

/**
 * Trouve un nom libre dans `dirRel` : « Sans titre », puis « Sans titre 2 »…
 * Évite d'écraser un fichier existant sans jamais demander à l'utilisateur.
 */
export async function uniqueChildName(
  vault: Vault,
  dirRel: string,
  desiredName: string
): Promise<string> {
  const dir = normalizeRelPath(dirRel)
  const isNote = desiredName.toLowerCase().endsWith('.md')
  const stem = stripNoteExtension(desiredName)
  const suffix = isNote ? '.md' : ''

  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? `${stem}${suffix}` : `${stem} ${n}${suffix}`
    if (!(await existsRel(vault, joinRel(dir, candidate)))) {
      return candidate
    }
  }
  throw new MemologError('already-exists', `Impossible de trouver un nom libre pour ${desiredName}`)
}

export async function createNote(
  vault: Vault,
  dirRel = '',
  name: string = DEFAULT_NOTE_NAME,
  content = ''
): Promise<NoteContent> {
  const dir = normalizeRelPath(dirRel)
  const validated = withNoteExtension(assertValidName(name))
  const finalName = await uniqueChildName(vault, dir, validated)
  const rel = joinRel(dir, finalName)

  await ensureDir(vault, dir)
  await vault.fs.writeFile(abs(vault, rel), normalizeContent(content))
  return readNote(vault, rel)
}

export async function createFolder(vault: Vault, dirRel = '', name: string): Promise<RelPath> {
  const dir = normalizeRelPath(dirRel)
  const validated = assertValidName(name)
  const finalName = await uniqueChildName(vault, dir, validated)
  const rel = joinRel(dir, finalName)
  await vault.fs.mkdir(abs(vault, rel))
  return rel
}

/** Renomme une note ou un dossier sur place. Renvoie le nouveau chemin. */
export async function renameEntry(
  vault: Vault,
  relPath: string,
  newName: string
): Promise<RelPath> {
  const rel = normalizeRelPath(relPath)
  if (rel === '') {
    throw new MemologError('invalid-path', 'La racine ne peut pas être renommée.')
  }
  const stat = await statRel(vault, rel)
  if (stat === null) {
    throw new MemologError('not-found', `Introuvable : ${rel}`)
  }

  const validated = assertValidName(newName)
  const finalName = stat.kind === 'file' ? withNoteExtension(validated) : validated
  if (finalName === baseName(rel)) return rel

  const target = joinRel(parentOf(rel), finalName)
  if (await existsRel(vault, target)) {
    throw new MemologError('already-exists', `Un élément porte déjà ce nom : ${finalName}`)
  }
  await vault.fs.rename(abs(vault, rel), abs(vault, target))
  return target
}

/** Déplace une note ou un dossier vers `newDirRel`. Renvoie le nouveau chemin. */
export async function moveEntry(
  vault: Vault,
  relPath: string,
  newDirRel: string
): Promise<RelPath> {
  const rel = normalizeRelPath(relPath)
  const newDir = normalizeRelPath(newDirRel)
  if (rel === '') {
    throw new MemologError('invalid-path', 'La racine ne peut pas être déplacée.')
  }
  if (newDir === rel || newDir.startsWith(`${rel}/`)) {
    throw new MemologError('invalid-path', 'Un dossier ne peut pas être déplacé dans lui-même.')
  }
  if (parentOf(rel) === newDir) return rel

  const target = joinRel(newDir, baseName(rel))
  if (await existsRel(vault, target)) {
    throw new MemologError('already-exists', `Un élément porte déjà ce nom : ${baseName(rel)}`)
  }
  await ensureDir(vault, newDir)
  await vault.fs.rename(abs(vault, rel), abs(vault, target))
  return target
}

/** Envoie une note ou un dossier à la corbeille du système. Jamais de rm -rf. */
export async function deleteEntry(vault: Vault, relPath: string): Promise<void> {
  const rel = normalizeRelPath(relPath)
  if (rel === '') {
    throw new MemologError('invalid-path', 'La racine ne peut pas être supprimée.')
  }
  if ((await statRel(vault, rel)) === null) {
    throw new MemologError('not-found', `Introuvable : ${rel}`)
  }
  await vault.fs.trash(abs(vault, rel))
}
