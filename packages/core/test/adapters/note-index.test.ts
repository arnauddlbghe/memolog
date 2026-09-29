import { describe, expect, it } from 'vitest'

import { MemoryNoteIndex } from '../../src/adapters/markdown/note-index.js'
import { createTestVault } from '../helpers/memory-fs.js'

const FILES = {
  'conversations/Migration serveur.md':
    '---\ncréée: 2026-09-29\nétat: en-cours\n---\n\nLe client attend le devis signé.\n',
  'conversations/Import CSV.md':
    '---\ncréée: 2026-09-29\nétat: a-reprendre\n---\n\nÉcrire le parseur.\n',
  'conversations/Recrutement.md': '---\ncréée: 2026-09-12\nétat: termine\n---\n\nAnnonce publiée.\n',
  'Idées.md': 'Une note libre, hors conversations.\n'
}

async function build(files = FILES) {
  const { vault } = createTestVault(files)
  const index = new MemoryNoteIndex(vault)
  await index.sync()
  return index
}

describe('synchronisation', () => {
  it('sépare les conversations des notes libres', async () => {
    const index = await build()
    expect(index.noteCount).toBe(4)
    expect(index.conversationCount).toBe(3)
  })

  it('ne relit rien quand rien n a changé', async () => {
    const index = await build()
    expect(await index.sync()).toMatchObject({ added: 0, updated: 0, removed: 0 })
  })

  it('oublie une conversation retirée', async () => {
    const index = await build()
    index.removeResource('conversations/Import CSV.md')
    expect(index.conversationCount).toBe(2)
    expect(index.conversation('conversations/Import CSV.md')).toBeNull()
  })
})

describe('liste', () => {
  it('trie de la plus récemment créée à la plus ancienne', async () => {
    const index = await build()
    expect(index.conversations().map((item) => item.name)).toEqual([
      'Import CSV',
      'Migration serveur',
      'Recrutement'
    ])
  })

  it('filtre par état et par jour de création', async () => {
    const index = await build()
    expect(index.conversations({ states: ['termine'] }).map((item) => item.name)).toEqual([
      'Recrutement'
    ])
    expect(index.conversations({ created: '2026-09-29' })).toHaveLength(2)
  })

  it('connaît les jours de création, du plus récent au plus ancien', async () => {
    const index = await build()
    expect(index.days()).toEqual(['2026-09-29', '2026-09-12'])
  })
})

describe('recherche', () => {
  it('trouve dans les conversations comme dans les notes libres', async () => {
    const index = await build()
    expect(index.search('parseur').map((hit) => hit.path)).toContain('conversations/Import CSV.md')
    expect(index.search('libre').map((hit) => hit.path)).toContain('Idées.md')
  })

  it('n indexe pas l en-tête comme du texte', async () => {
    const index = await build()
    expect(index.search('historique')).toHaveLength(0)
  })
})
