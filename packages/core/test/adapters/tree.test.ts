import { describe, expect, it } from 'vitest'

import { listDir, summarizeVault, walkNotes } from '../../src/adapters/markdown/tree.js'
import { createTestVault } from '../helpers/memory-fs.js'

const FILES = {
  'Note 10.md': 'a\n',
  'Note 2.md': 'b\n',
  'Projets/Memolog.md': 'c\n',
  'Projets/Archive/Vieux.md': 'd\n',
  'journal/2026-09-28.md': 'e\n',
  '.cache/rien.md': 'f\n',
  'photo.png': 'g',
  '.Note.md.abc.tmp': 'h'
}

describe('listDir', () => {
  it('range les dossiers avant les notes, avec un tri naturel', async () => {
    const { vault } = createTestVault(FILES)
    const entries = await listDir(vault, '')
    expect(entries.map((entry) => entry.path)).toEqual([
      'journal',
      'Projets',
      'Note 2.md',
      'Note 10.md'
    ])
  })

  it('masque les fichiers cachés, temporaires et non-Markdown', async () => {
    const { vault } = createTestVault(FILES)
    const names = (await listDir(vault, '')).map((entry) => entry.name)
    expect(names).not.toContain('photo.png')
    expect(names).not.toContain('.cache')
    expect(names.some((name) => name.endsWith('.tmp'))).toBe(false)
  })

  it('ne descend pas dans les sous-dossiers', async () => {
    const { vault } = createTestVault(FILES)
    const entries = await listDir(vault, 'Projets')
    expect(entries.map((entry) => entry.path)).toEqual([
      'Projets/Archive',
      'Projets/Memolog.md'
    ])
  })
})

describe('walkNotes', () => {
  it('parcourt récursivement toutes les notes visibles', async () => {
    const { vault } = createTestVault(FILES)
    const found: string[] = []
    for await (const note of walkNotes(vault)) found.push(note.path)
    expect(found.sort()).toEqual([
      'Note 10.md',
      'Note 2.md',
      'Projets/Archive/Vieux.md',
      'Projets/Memolog.md',
      'journal/2026-09-28.md'
    ])
  })
})

describe('summarizeVault', () => {
  it('compte notes et dossiers pour le récapitulatif de déménagement', async () => {
    const { vault } = createTestVault(FILES)
    expect(await summarizeVault(vault)).toEqual({ noteCount: 5, folderCount: 3 })
  })
})
