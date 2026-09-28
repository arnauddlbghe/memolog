import { describe, expect, it } from 'vitest'

import { writeNote } from '../../src/adapters/markdown/notes.js'
import { SearchIndex, buildIndex, searchWithExcerpts, syncIndex } from '../../src/adapters/markdown/search.js'
import { TEST_ROOT, createTestVault } from '../helpers/memory-fs.js'

const FILES = {
  'Réunion produit.md': '---\ntags: [produit]\n---\n\nRoadmap du trimestre et budget.\n',
  'Projets/Memolog.md': 'Application de prise de notes locale en Markdown.\n',
  'journal/2026-09-28.md': '- 14:32 — Appel client au sujet de la roadmap\n'
}

describe('index de recherche', () => {
  it('indexe toutes les notes', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(index.size).toBe(3)
  })

  it('trouve par le contenu et par le titre', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(index.search('roadmap').map((hit) => hit.path)).toContain('Réunion produit.md')
    expect(index.search('memolog').map((hit) => hit.path)).toContain('Projets/Memolog.md')
  })

  it('tolère les fautes de frappe', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(index.search('roadmpa').map((hit) => hit.path)).toContain('Réunion produit.md')
  })

  it('n indexe pas le frontmatter comme du texte', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(index.search('tags')).toHaveLength(0)
  })
})

describe('synchronisation incrémentale', () => {
  it('ne relit rien quand rien n a changé', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(await syncIndex(vault, index)).toMatchObject({ added: 0, updated: 0, removed: 0 })
  })

  it('prend en compte ajout, modification et suppression', async () => {
    const { vault, fs } = createTestVault(FILES)
    const index = await buildIndex(vault)

    await writeNote(vault, 'Nouvelle.md', 'Contenu tout neuf sur les sardines.\n')
    await writeNote(vault, 'Projets/Memolog.md', 'Réécrit : gestion des soufflés.\n')
    await fs.trash(`${TEST_ROOT}/journal/2026-09-28.md`)

    const report = await syncIndex(vault, index)
    expect(report).toMatchObject({ added: 1, updated: 1, removed: 1 })
    expect(index.search('sardines').map((hit) => hit.path)).toEqual(['Nouvelle.md'])
    expect(index.search('soufflés').map((hit) => hit.path)).toEqual(['Projets/Memolog.md'])
    expect(index.search('appel')).toHaveLength(0)
  })
})

describe('cache sur disque', () => {
  it('se recharge sans relire les fichiers', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    const cache = JSON.parse(JSON.stringify(index.toCache(vault.root)))

    const restored = SearchIndex.fromCache(cache, vault.root)
    expect(restored).not.toBeNull()
    expect(restored?.size).toBe(3)
    expect(restored?.search('roadmap').length).toBeGreaterThan(0)
    expect(await syncIndex(vault, restored!)).toMatchObject({ added: 0, updated: 0 })
  })

  it('rejette un cache d une autre racine ou d une autre version', async () => {
    const { vault } = createTestVault(FILES)
    const cache = (await buildIndex(vault)).toCache(vault.root)
    expect(SearchIndex.fromCache(cache, '/ailleurs')).toBeNull()
    expect(SearchIndex.fromCache({ ...cache, version: 0 }, vault.root)).toBeNull()
    expect(SearchIndex.fromCache(null, vault.root)).toBeNull()
  })
})

describe('extraits', () => {
  it('centre l extrait sur le passage trouvé', async () => {
    const long = `${'blabla '.repeat(60)}une pépite rare${' blabla'.repeat(60)}`
    const { vault } = createTestVault({ 'Long.md': `${long}\n` })
    const index = await buildIndex(vault)

    const [hit] = await searchWithExcerpts(vault, index, 'pépite')
    expect(hit?.excerpt).toContain('pépite')
    expect(hit?.excerpt.startsWith('…')).toBe(true)
  })
})

describe('accents', () => {
  it('trouve un mot accentué en le tapant sans accent, et inversement', async () => {
    const { vault } = createTestVault(FILES)
    const index = await buildIndex(vault)
    expect(index.search('reunion').map((hit) => hit.path)).toContain('Réunion produit.md')
    expect(index.search('Réunion').map((hit) => hit.path)).toContain('Réunion produit.md')
  })
})
