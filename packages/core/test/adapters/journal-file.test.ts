import { describe, expect, it } from 'vitest'

import {
  appendEntry,
  formatEntry,
  journalDateOf,
  journalPathFor,
  openJournalNote,
  parseEntries
} from '../../src/adapters/markdown/journal-file.js'
import { readNote } from '../../src/adapters/markdown/notes.js'
import { createTestVault } from '../helpers/memory-fs.js'

const AT = new Date(2026, 8, 28, 14, 32) // 28 septembre 2026, 14:32 (heure locale)

describe('chemins de journal', () => {
  it('utilise la date locale', () => {
    expect(journalPathFor(AT)).toBe('journal/2026-09-28.md')
    expect(journalPathFor(new Date(2026, 0, 5, 23, 59))).toBe('journal/2026-01-05.md')
  })

  it('reconnaît une note de journal', () => {
    expect(journalDateOf('journal/2026-09-28.md')?.getDate()).toBe(28)
    expect(journalDateOf('Projets/2026-09-28.md')).toBeNull()
    expect(journalDateOf('journal/notes.md')).toBeNull()
  })
})

describe('format des entrées', () => {
  it('écrit `- HH:MM — texte`', () => {
    expect(formatEntry('Appel client', AT)).toBe('- 14:32 — Appel client')
  })

  it('écrit les lignes suivantes comme des sous-puces', () => {
    expect(formatEntry('Ligne 1\nLigne 2', AT)).toBe('- 14:32 — Ligne 1\n  - Ligne 2')
    expect(formatEntry('Ligne 1\n- Déjà une puce', AT)).toBe('- 14:32 — Ligne 1\n  - Déjà une puce')
  })

  it('relit ses propres entrées', () => {
    const entries = parseEntries('- 09:05 — Café\n- 14:32 — Appel client\n')
    expect(entries.map((entry) => [entry.time, entry.text, entry.line])).toEqual([
      ['09:05', 'Café', 1],
      ['14:32', 'Appel client', 2]
    ])
  })

  it('rattache les sous-puces à leur entrée', () => {
    const entries = parseEntries(
      '- 14:32 — Point hebdo #infra\n  - Migration repoussée #urgent\n    - Prévenir le client\n- 16:05 — Relu la doc\n'
    )
    expect(entries).toHaveLength(2)
    expect(entries[0]?.children).toHaveLength(1)
    expect(entries[0]?.children[0]?.text).toBe('Migration repoussée #urgent')
  })

  it('fait hériter les tags de l entrée à ses sous-puces', () => {
    const [entry] = parseEntries(
      '- 14:32 — Point hebdo #infra\n  - Migration repoussée #urgent\n    - Prévenir le client\n'
    )
    expect(entry?.tags).toEqual(['infra'])
    expect(entry?.children[0]?.effectiveTags).toEqual(['infra', 'urgent'])
    expect(entry?.children[0]?.children[0]?.effectiveTags).toEqual(['infra', 'urgent'])
  })

  it('ignore une puce de premier niveau qui n est pas une entrée', () => {
    expect(parseEntries('- Pas d heure ici\n- 09:00 — Vraie entrée\n')).toHaveLength(1)
  })

  it('tolère les variantes écrites à la main', () => {
    const entries = parseEntries('* 9:05 - Café\n- 14:32 – Appel\n- pas une entrée\n')
    expect(entries.map((entry) => entry.time)).toEqual(['09:05', '14:32'])
  })
})

describe('appendEntry', () => {
  it('crée la note du jour puis ajoute les entrées dans l ordre', async () => {
    const { vault } = createTestVault({})

    const first = await appendEntry(vault, 'Première', new Date(2026, 8, 28, 9, 5))
    const second = await appendEntry(vault, 'Deuxième', AT)

    expect(first.path).toBe('journal/2026-09-28.md')
    expect(second.line).toBe(2)
    const note = await readNote(vault, 'journal/2026-09-28.md')
    expect(note.content).toBe('- 09:05 — Première\n- 14:32 — Deuxième\n')
  })

  it('ajoute à la suite d un contenu existant sans l abîmer', async () => {
    const { vault } = createTestVault({
      'journal/2026-09-28.md': '# Notes du jour\n\n- 08:00 — Réveil\n'
    })
    await appendEntry(vault, 'Appel client', AT)
    const note = await readNote(vault, 'journal/2026-09-28.md')
    expect(note.content).toBe('# Notes du jour\n\n- 08:00 — Réveil\n- 14:32 — Appel client\n')
  })

  it('n écrit rien pour un texte vide', async () => {
    const { vault } = createTestVault({})
    await appendEntry(vault, '   ', AT)
    const note = await readNote(vault, 'journal/2026-09-28.md')
    expect(note.content).toBe('')
  })
})

describe('openJournalNote', () => {
  it('est idempotent : deux appels ne créent qu une note', async () => {
    const { vault } = createTestVault({})
    const first = await openJournalNote(vault, AT)
    const second = await openJournalNote(vault, AT)
    expect(first.path).toBe(second.path)
    expect(second.path).toBe('journal/2026-09-28.md')
  })
})
