import MiniSearch from 'minisearch'

import { stripFrontmatter } from './frontmatter.js'
import { readNote } from './notes.js'
import { titleFromPath } from '../fs/paths.js'
import type { RelPath, SearchHit } from '../../domain/types.js'
import { walkNotes } from './tree.js'
import type { Vault } from '../fs/vault.js'

/** Incrémenter invalide tous les caches d'index existants. */
export const INDEX_CACHE_VERSION = 2

const PREVIEW_LENGTH = 220
const EXCERPT_RADIUS = 90

interface IndexDocument {
  id: RelPath
  title: string
  body: string
  preview: string
}

interface ManifestEntry {
  mtimeMs: number
  size: number
}

export interface SearchIndexCache {
  version: number
  /** Racine indexée : un cache d'un autre dossier est ignoré. */
  root: string
  manifest: Record<RelPath, ManifestEntry>
  miniSearch: unknown
}

/**
 * Repli des accents : en français, « reunion » doit trouver « Réunion ».
 * Appliqué à l'indexation comme à la recherche, donc tout changement ici
 * impose d'incrémenter INDEX_CACHE_VERSION.
 */
export function foldTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const MINISEARCH_OPTIONS = {
  idField: 'id',
  fields: ['title', 'body'],
  storeFields: ['title', 'preview'],
  processTerm: foldTerm
}

function makePreview(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length <= PREVIEW_LENGTH ? flat : `${flat.slice(0, PREVIEW_LENGTH)}…`
}

/**
 * Index plein texte des notes (moteur de recherche).
 *
 * Ne conserve en mémoire que les termes, le titre et un court aperçu : le
 * contenu complet des notes n'est jamais gardé. Les extraits précis sont
 * reconstruits à la demande en relisant les quelques fichiers affichés.
 */
export class SearchIndex {
  private mini: MiniSearch<IndexDocument>
  private manifest = new Map<RelPath, ManifestEntry>()

  private constructor(mini: MiniSearch<IndexDocument>, manifest?: Record<string, ManifestEntry>) {
    this.mini = mini
    for (const [path, entry] of Object.entries(manifest ?? {})) {
      this.manifest.set(path, entry)
    }
  }

  static create(): SearchIndex {
    return new SearchIndex(new MiniSearch<IndexDocument>({ ...MINISEARCH_OPTIONS }))
  }

  /** `null` si le cache est absent, d'une autre version ou d'un autre dossier. */
  static fromCache(cache: unknown, root: string): SearchIndex | null {
    if (typeof cache !== 'object' || cache === null) return null
    const candidate = cache as Partial<SearchIndexCache>
    if (candidate.version !== INDEX_CACHE_VERSION) return null
    if (candidate.root !== root) return null
    if (typeof candidate.miniSearch !== 'object' || candidate.miniSearch === null) return null

    try {
      const mini = MiniSearch.loadJS<IndexDocument>(candidate.miniSearch as never, {
        ...MINISEARCH_OPTIONS
      })
      return new SearchIndex(mini, candidate.manifest ?? {})
    } catch {
      return null
    }
  }

  /**
   * Recharge l'index depuis un cache, en place.
   * `false` si le cache est inutilisable : l'appelant reconstruira.
   */
  load(cache: unknown, root: string): boolean {
    const restored = SearchIndex.fromCache(cache, root)
    if (restored === null) return false
    this.mini = restored.mini
    this.manifest = restored.manifest
    return true
  }

  toCache(root: string): SearchIndexCache {
    return {
      version: INDEX_CACHE_VERSION,
      root,
      manifest: Object.fromEntries(this.manifest),
      miniSearch: this.mini.toJSON()
    }
  }

  get size(): number {
    return this.manifest.size
  }

  get paths(): RelPath[] {
    return [...this.manifest.keys()]
  }

  /** Le fichier est-il absent de l'index ou plus récent que la version indexée ? */
  isStale(path: RelPath, stat: ManifestEntry): boolean {
    const known = this.manifest.get(path)
    if (known === undefined) return true
    return known.mtimeMs !== stat.mtimeMs || known.size !== stat.size
  }

  upsert(path: RelPath, content: string, stat: ManifestEntry): void {
    const body = stripFrontmatter(content)
    const document: IndexDocument = {
      id: path,
      title: titleFromPath(path),
      body,
      preview: makePreview(body)
    }
    if (this.manifest.has(path)) this.mini.discard(path)
    this.mini.add(document)
    this.manifest.set(path, stat)
  }

  remove(path: RelPath): void {
    if (!this.manifest.has(path)) return
    this.mini.discard(path)
    this.manifest.delete(path)
  }

  rename(fromPath: RelPath, toPath: RelPath, content: string, stat: ManifestEntry): void {
    this.remove(fromPath)
    this.upsert(toPath, content, stat)
  }

  /** Résultats immédiats, extrait tiré de l'aperçu conservé en mémoire. */
  search(query: string, limit = 30): SearchHit[] {
    const trimmed = query.trim()
    if (trimmed === '') return []

    return this.mini
      .search(trimmed, {
        prefix: true,
        fuzzy: 0.3,
        boost: { title: 3 },
        combineWith: 'AND'
      })
      .slice(0, limit)
      .map((result) => ({
        path: String(result.id),
        title: String((result as unknown as { title?: string }).title ?? titleFromPath(String(result.id))),
        score: result.score,
        excerpt: String((result as unknown as { preview?: string }).preview ?? '')
      }))
  }

  /** Suggestions de complétion pour la barre de recherche. */
  suggest(query: string, limit = 5): string[] {
    const trimmed = query.trim()
    if (trimmed === '') return []
    return this.mini
      .autoSuggest(trimmed, { fuzzy: 0.3 })
      .slice(0, limit)
      .map((suggestion) => suggestion.suggestion)
  }
}

export interface SyncReport {
  added: number
  updated: number
  removed: number
  total: number
}

/**
 * Met l'index en phase avec le disque : ajoute les nouvelles notes, réindexe
 * celles dont `mtime`/taille ont changé, retire celles qui ont disparu.
 * Au démarrage sur un cache à jour, ne relit aucun fichier.
 */
export async function syncIndex(vault: Vault, index: SearchIndex): Promise<SyncReport> {
  const seen = new Set<RelPath>()
  let added = 0
  let updated = 0

  for await (const note of walkNotes(vault)) {
    seen.add(note.path)
    const stat = { mtimeMs: note.mtimeMs, size: note.size }
    if (!index.isStale(note.path, stat)) continue

    const existed = index.paths.includes(note.path)
    try {
      const content = await readNote(vault, note.path)
      index.upsert(note.path, content.content, stat)
      if (existed) updated += 1
      else added += 1
    } catch {
      // Fichier supprimé ou illisible entre le parcours et la lecture : on passe.
    }
  }

  let removed = 0
  for (const path of index.paths) {
    if (!seen.has(path)) {
      index.remove(path)
      removed += 1
    }
  }

  return { added, updated, removed, total: index.size }
}

export async function buildIndex(vault: Vault): Promise<SearchIndex> {
  const index = SearchIndex.create()
  await syncIndex(vault, index)
  return index
}

/**
 * Recherche avec extraits précis : relit uniquement les fichiers affichés
 * pour montrer le passage qui correspond, pas seulement le début de la note.
 */
export async function searchWithExcerpts(
  vault: Vault,
  index: SearchIndex,
  query: string,
  limit = 30
): Promise<SearchHit[]> {
  const hits = index.search(query, limit)
  const terms = query
    .trim()
    .split(/\s+/)
    .map(foldTerm)
    .filter((term) => term.length >= 2)

  return Promise.all(
    hits.map(async (hit) => {
      try {
        const note = await readNote(vault, hit.path)
        const excerpt = buildExcerpt(stripFrontmatter(note.content), terms)
        return excerpt === null ? hit : { ...hit, excerpt }
      } catch {
        return hit
      }
    })
  )
}

/** Extrait centré sur la première occurrence d'un des termes. */
export function buildExcerpt(body: string, terms: string[]): string | null {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat === '') return null

  // Replié comme les termes, pour retrouver « réunion » en cherchant « reunion ».
  const haystack = foldTerm(flat)
  let position = -1
  for (const term of terms) {
    const found = haystack.indexOf(term)
    if (found !== -1 && (position === -1 || found < position)) position = found
  }
  if (position === -1) return makePreview(flat)

  const start = Math.max(0, position - EXCERPT_RADIUS)
  const end = Math.min(flat.length, position + EXCERPT_RADIUS)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < flat.length ? '…' : ''
  return `${prefix}${flat.slice(start, end).trim()}${suffix}`
}
