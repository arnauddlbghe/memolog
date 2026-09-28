/**
 * Assemblage du stockage Markdown.
 *
 * C'est **le seul point à remplacer** pour changer de stockage : une
 * `createSqliteStorage(db)` ou `createApiStorage(client)` renverrait le même
 * objet `Storage`, et ni le domaine ni les services ne bougeraient.
 */
import type { Storage } from '../../domain/ports.js'
import type { Vault } from '../fs/vault.js'
import { JsonlActivityLog } from './activity-jsonl.js'
import { MarkdownJournalRepository } from './journal-repository.js'
import { MemoryNoteIndex } from './note-index.js'
import { MarkdownNoteRepository } from './note-repository.js'
import { MarkdownTaskRepository } from './task-repository.js'

export interface MarkdownStorage extends Storage {
  notes: MarkdownNoteRepository
  tasks: MarkdownTaskRepository
  journal: MarkdownJournalRepository
  activity: JsonlActivityLog
  /** Exposé concrètement pour le cache d'index, qui est propre à cette implémentation. */
  index: MemoryNoteIndex
}

export function createMarkdownStorage(vault: Vault): MarkdownStorage {
  return {
    notes: new MarkdownNoteRepository(vault),
    tasks: new MarkdownTaskRepository(vault),
    journal: new MarkdownJournalRepository(vault),
    activity: new JsonlActivityLog(vault),
    index: new MemoryNoteIndex(vault)
  }
}
