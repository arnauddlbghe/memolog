import { isNotePath, joinRel, normalizeRelPath, stripNoteExtension } from '../fs/paths.js'
import type { CollectionSummary, WalkedNote } from '../../domain/ports.js'
import type { TreeEntry } from '../../domain/types.js'
import { abs, statRel, type Vault } from '../fs/vault.js'

/** Dossiers ignorés partout : caches, métadonnées d'autres outils, VCS. */
const IGNORED_DIRS = new Set(['.git', '.obsidian', '.trash', 'node_modules'])

function isHidden(name: string): boolean {
  return name.startsWith('.')
}

/** Un fichier temporaire d'écriture atomique ne doit jamais apparaître. */
function isTemporary(name: string): boolean {
  return name.endsWith('.tmp') || name.endsWith('~')
}

export function isVisibleEntry(name: string, kind: 'file' | 'dir'): boolean {
  if (isHidden(name) || IGNORED_DIRS.has(name) || isTemporary(name)) return false
  return kind === 'dir' || isNotePath(name)
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/**
 * Contenu direct d'un dossier : dossiers d'abord, puis notes, chaque groupe
 * trié naturellement (« Note 2 » avant « Note 10 »).
 * Ne descend pas dans les sous-dossiers : l'arbre se charge à la demande,
 * pour ne jamais lire tout le vault d'un coup.
 */
export async function listDir(vault: Vault, dirRel = ''): Promise<TreeEntry[]> {
  const dir = normalizeRelPath(dirRel)
  const entries = await vault.fs.readDir(abs(vault, dir))
  const visible = entries.filter((entry) => isVisibleEntry(entry.name, entry.kind))

  const results: TreeEntry[] = []
  for (const entry of visible) {
    const rel = joinRel(dir, entry.name)
    const stat = await statRel(vault, rel)
    if (stat === null) continue
    results.push({
      path: rel,
      name: entry.name,
      title: stripNoteExtension(entry.name),
      kind: entry.kind === 'dir' ? 'folder' : 'note',
      mtimeMs: stat.mtimeMs,
      size: stat.kind === 'dir' ? 0 : stat.size
    })
  }

  return results.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return collator.compare(a.title, b.title)
  })
}

/**
 * Parcours récursif des notes. Générateur asynchrone : l'indexation traite les
 * notes une par une sans jamais construire la liste complète en mémoire.
 */
export async function* walkNotes(vault: Vault, dirRel = ''): AsyncGenerator<WalkedNote> {
  const dir = normalizeRelPath(dirRel)
  let entries
  try {
    entries = await vault.fs.readDir(abs(vault, dir))
  } catch {
    return
  }

  for (const entry of entries) {
    if (!isVisibleEntry(entry.name, entry.kind)) continue
    const rel = joinRel(dir, entry.name)
    if (entry.kind === 'dir') {
      yield* walkNotes(vault, rel)
      continue
    }
    const stat = await statRel(vault, rel)
    if (stat === null) continue
    yield { path: rel, mtimeMs: stat.mtimeMs, size: stat.size }
  }
}

/** Compte notes et dossiers — sert au récapitulatif avant un changement de dossier. */
export async function summarizeVault(vault: Vault, dirRel = ''): Promise<CollectionSummary> {
  const dir = normalizeRelPath(dirRel)
  let noteCount = 0
  let folderCount = 0

  let entries
  try {
    entries = await vault.fs.readDir(abs(vault, dir))
  } catch {
    return { noteCount, folderCount }
  }

  for (const entry of entries) {
    if (!isVisibleEntry(entry.name, entry.kind)) continue
    if (entry.kind === 'dir') {
      folderCount += 1
      const nested = await summarizeVault(vault, joinRel(dir, entry.name))
      noteCount += nested.noteCount
      folderCount += nested.folderCount
    } else {
      noteCount += 1
    }
  }

  return { noteCount, folderCount }
}
