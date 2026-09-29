/**
 * Implémentation en mémoire du port `NoteIndex`, alimentée par les fichiers
 * Markdown du dossier.
 *
 * Ce qui est gardé en mémoire est volontairement maigre : le résumé de
 * chaque conversation. Le texte n'est jamais conservé — seul l'index inversé
 * de la recherche l'est, sous forme de termes.
 *
 * Une implémentation SQLite du même port remplacerait ce fichier sans rien
 * changer au domaine ni aux services.
 */
import { formatLocalDate } from '../../domain/dates.js'
import type { ConversationFilter, IndexReport, NoteIndex } from '../../domain/ports.js'
import type { ConversationSummary, RelPath, SearchHit } from '../../domain/types.js'
import type { Vault } from '../fs/vault.js'
import {
  isConversationPath,
  parseConversation,
  summarize
} from './conversation-file.js'
import { readNote } from './notes.js'
import { SearchIndex, type SearchIndexCache } from './search.js'
import { walkNotes } from './tree.js'

export class MemoryNoteIndex implements NoteIndex {
  constructor(private readonly vault: Vault) {}

  private readonly search_ = SearchIndex.create()
  private readonly known = new Set<RelPath>()
  private readonly summaries = new Map<RelPath, ConversationSummary>()

  get noteCount(): number {
    return this.search_.size
  }

  get conversationCount(): number {
    return this.summaries.size
  }

  get paths(): RelPath[] {
    return [...this.known]
  }

  /** Cache sérialisable de la seule partie coûteuse à reconstruire. */
  toSearchCache(root: string): SearchIndexCache {
    return this.search_.toCache(root)
  }

  loadSearchCache(cache: unknown, root: string): boolean {
    return this.search_.load(cache, root)
  }

  async sync(): Promise<IndexReport> {
    const seen = new Set<RelPath>()
    let added = 0
    let updated = 0

    for await (const note of walkNotes(this.vault)) {
      seen.add(note.path)
      const stat = { mtimeMs: note.mtimeMs, size: note.size }
      const wasKnown = this.known.has(note.path)
      if (wasKnown && !this.search_.isStale(note.path, stat)) continue

      try {
        const content = await readNote(this.vault, note.path)
        this.updateResource(note.path, content.content, stat)
        if (wasKnown) updated += 1
        else added += 1
      } catch {
        // Fichier disparu entre le parcours et la lecture : on l'ignore.
      }
    }

    let removed = 0
    for (const path of [...this.known]) {
      if (!seen.has(path)) {
        this.removeResource(path)
        removed += 1
      }
    }

    return {
      added,
      updated,
      removed,
      noteCount: this.noteCount,
      conversationCount: this.conversationCount
    }
  }

  updateResource(path: RelPath, content: string, stat: { mtimeMs: number; size: number }): void {
    this.search_.upsert(path, content, stat)
    this.known.add(path)

    if (!isConversationPath(path)) {
      this.summaries.delete(path)
      return
    }

    this.summaries.set(
      path,
      summarize(
        parseConversation(path, content, {
          mtimeMs: stat.mtimeMs,
          fallbackCreated: formatLocalDate(new Date(stat.mtimeMs))
        })
      )
    )
  }

  removeResource(path: RelPath): void {
    this.search_.remove(path)
    this.summaries.delete(path)
    this.known.delete(path)
  }

  search(query: string, limit = 30): SearchHit[] {
    return this.search_.search(query, limit)
  }

  suggest(query: string, limit = 5): string[] {
    return this.search_.suggest(query, limit)
  }

  /** De la plus récemment créée à la plus ancienne. */
  conversations(filter: ConversationFilter = {}): ConversationSummary[] {
    return [...this.summaries.values()]
      .filter((item) => filter.states === undefined || filter.states.includes(item.state))
      .filter((item) => filter.created === undefined || item.created === filter.created)
      .sort((a, b) => b.created.localeCompare(a.created) || b.mtimeMs - a.mtimeMs)
  }

  conversation(path: RelPath): ConversationSummary | null {
    return this.summaries.get(path) ?? null
  }

  days(): string[] {
    return [...new Set([...this.summaries.values()].map((item) => item.created))]
      .sort()
      .reverse()
  }
}

export function createNoteIndex(vault: Vault): MemoryNoteIndex {
  return new MemoryNoteIndex(vault)
}
