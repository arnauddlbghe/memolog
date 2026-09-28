/**
 * Implémentation du port `JournalRepository` au-dessus de
 * `journal/AAAA-MM-JJ.md`.
 */
import { formatLocalDate } from '../../domain/dates.js'
import type { JournalAppendResult, JournalDay, JournalRepository } from '../../domain/ports.js'
import { abs, type Vault } from '../fs/vault.js'
import { JOURNAL_DIR, appendEntry, openJournalNote, parseEntries } from './journal-file.js'

export class MarkdownJournalRepository implements JournalRepository {
  constructor(private readonly vault: Vault) {}

  async open(date: Date = new Date()): Promise<JournalDay> {
    const note = await openJournalNote(this.vault, date)
    return {
      date: formatLocalDate(date),
      path: note.path,
      entries: parseEntries(note.content),
      content: note.content,
      mtimeMs: note.mtimeMs
    }
  }

  append(text: string, at: Date = new Date()): Promise<JournalAppendResult> {
    return appendEntry(this.vault, text, at)
  }

  /** Journées présentes sur le disque, de la plus récente à la plus ancienne. */
  async days(): Promise<string[]> {
    const entries = await this.vault.fs.readDir(abs(this.vault, JOURNAL_DIR)).catch(() => [])
    return entries
      .filter((entry) => entry.kind === 'file' && /^\d{4}-\d{2}-\d{2}\.md$/.test(entry.name))
      .map((entry) => entry.name.slice(0, -3))
      .sort()
      .reverse()
  }
}
