/**
 * Implémentation du port `NoteRepository` au-dessus de fichiers `.md`.
 *
 * Toute la logique de chemins, de corbeille et d'écriture atomique est déjà
 * dans `notes.ts` et `tree.ts` : cette classe ne fait que présenter ces
 * fonctions derrière le port, pour que rien au-dessus ne dépende d'elles.
 */
import type {
  CollectionSummary,
  NoteRepository,
  WalkedNote
} from '../../domain/ports.js'
import type { NoteContent, TreeEntry, WriteResult } from '../../domain/types.js'
import type { Vault } from '../fs/vault.js'
import { createNote, deleteEntry, readNote, writeNote } from './notes.js'
import { listDir, summarizeVault, walkNotes } from './tree.js'

export class MarkdownNoteRepository implements NoteRepository {
  constructor(private readonly vault: Vault) {}

  list(dir: string): Promise<TreeEntry[]> {
    return listDir(this.vault, dir)
  }

  read(path: string): Promise<NoteContent> {
    return readNote(this.vault, path)
  }

  write(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult> {
    return writeNote(this.vault, path, content, {
      ...(baseMtimeMs === undefined ? {} : { baseMtimeMs })
    })
  }

  create(dir: string, name?: string, content?: string): Promise<NoteContent> {
    return createNote(this.vault, dir, name, content)
  }




  remove(path: string): Promise<void> {
    return deleteEntry(this.vault, path)
  }

  walk(dir = ''): AsyncIterable<WalkedNote> {
    return walkNotes(this.vault, dir)
  }

  summarize(dir = ''): Promise<CollectionSummary> {
    return summarizeVault(this.vault, dir)
  }
}
