/**
 * Implémentation du port `ConversationRepository` : une conversation est un
 * fichier `conversations/<nom>.md`.
 *
 * Le dépôt ne fait que persister. Aucune règle métier, aucun événement
 * d'activité : c'est le `ConversationService` qui orchestre, au-dessus du
 * port.
 */
import { formatLocalDate } from '../../domain/dates.js'
import type { ConversationRepository } from '../../domain/ports.js'
import type {
  Conversation,
  ConversationState,
  ConversationSummary,
  RelPath,
  WriteResult
} from '../../domain/types.js'
import { assertValidName, joinRel, withNoteExtension } from '../fs/paths.js'
import { abs, statRel, type Vault } from '../fs/vault.js'
import { createNote, deleteEntry, ensureDir, readNote, renameEntry, writeNote } from './notes.js'
import {
  CONVERSATIONS_DIR,
  newConversation,
  parseConversation,
  renderConversation,
  summarize,
  withState
} from './conversation-file.js'

export class MarkdownConversationRepository implements ConversationRepository {
  constructor(private readonly vault: Vault) {}

  private async paths(): Promise<RelPath[]> {
    const entries = await this.vault.fs.readDir(abs(this.vault, CONVERSATIONS_DIR)).catch(() => [])
    return entries
      .filter(
        (entry) =>
          entry.kind === 'file' &&
          !entry.name.startsWith('.') &&
          entry.name.toLowerCase().endsWith('.md')
      )
      .map((entry) => joinRel(CONVERSATIONS_DIR, entry.name))
      .sort()
  }

  async list(): Promise<ConversationSummary[]> {
    const summaries: ConversationSummary[] = []
    for (const path of await this.paths()) {
      const conversation = await this.readOrNull(path)
      if (conversation !== null) summaries.push(summarize(conversation))
    }
    return summaries
  }

  async read(path: string): Promise<Conversation> {
    const note = await readNote(this.vault, path)
    return parseConversation(note.path, note.content, {
      mtimeMs: note.mtimeMs,
      fallbackCreated: formatLocalDate(new Date(note.mtimeMs))
    })
  }

  private async readOrNull(path: string): Promise<Conversation | null> {
    return this.read(path).catch(() => null)
  }

  async create(name: string): Promise<ConversationSummary> {
    const validated = withNoteExtension(assertValidName(name))
    await ensureDir(this.vault, CONVERSATIONS_DIR)

    const note = await createNote(this.vault, CONVERSATIONS_DIR, validated)
    const conversation = newConversation(note.path)
    await writeNote(this.vault, note.path, renderConversation(conversation))
    return summarize(await this.read(note.path))
  }

  /**
   * Remplace le corps. L'en-tête est relu puis réécrit à l'identique : le
   * corps est à l'utilisateur, les métadonnées à l'application.
   */
  async setContent(path: string, content: string, baseMtimeMs?: number): Promise<WriteResult> {
    const current = await this.read(path)
    return writeNote(
      this.vault,
      path,
      renderConversation({ ...current, content }),
      baseMtimeMs === undefined ? {} : { baseMtimeMs }
    )
  }

  async setState(path: string, state: ConversationState, at: Date): Promise<Conversation> {
    const current = await this.read(path)
    const next = withState(current, state, at)
    if (next === current) return current

    await writeNote(this.vault, path, renderConversation(next), { baseMtimeMs: current.mtimeMs })
    return this.read(path)
  }

  rename(path: string, name: string): Promise<RelPath> {
    return renameEntry(this.vault, path, name)
  }

  remove(path: string): Promise<void> {
    return deleteEntry(this.vault, path)
  }

  /** Le fichier existe-t-il déjà ? Utilisé avant une création. */
  async exists(path: string): Promise<boolean> {
    return (await statRel(this.vault, path)) !== null
  }
}
