import { describe, expect, it } from 'vitest'

import { MemoryNoteIndex } from '../../src/adapters/markdown/note-index.js'
import { createTestVault } from '../helpers/memory-fs.js'

const FILES = {
  'taches.md':
    '## Infra\n\n- [/] Migrer le serveur ^t1 [créée:: 2026-09-01] [maj:: 2026-09-10]\n- [x] Commander le disque ^t2 [créée:: 2026-09-01] [maj:: 2026-09-05]\n\n## Client ACME\n\n- [ ] Envoyer le devis ^t3 [créée:: 2026-09-20] [maj:: 2026-09-20]\n',
  'journal/2026-09-28.md':
    '- 09:12 — Point hebdo #infra\n  - Migration repoussée #urgent\n- 14:32 — Appel client, voir @t3 #client-acme\n',
  'journal/2026-09-27.md': '- 10:00 — Rangement du bureau\n',
  'projets/infra.md': 'Tout ce qui touche aux serveurs.\n',
  'Notes libres.md': 'Une note ordinaire qui parle de migration.\n'
}

async function buildIndex(files: Record<string, string> = FILES) {
  const { vault } = createTestVault(files)
  const index = new MemoryNoteIndex(vault)
  await index.sync()
  return { index, vault }
}

describe('synchronisation', () => {
  it('indexe toutes les notes et toutes les tâches', async () => {
    const { index } = await buildIndex()
    expect(index.noteCount).toBe(5)
    expect(index.taskCount).toBe(3)
  })

  it('ne relit rien quand rien n a changé', async () => {
    const { index } = await buildIndex()
    expect(await index.sync()).toMatchObject({ added: 0, updated: 0, removed: 0 })
  })

  it('oublie un fichier retiré', async () => {
    const { index } = await buildIndex()
    index.removeResource('taches.md')
    expect(index.taskCount).toBe(0)
    expect(index.task('t1')).toBeNull()
  })
})

describe('tâches', () => {
  it('ne considère comme tâches que celles de taches.md', async () => {
    const { index } = await buildIndex({
      ...FILES,
      'Notes libres.md': '- [ ] Une case cochable dans une note libre\n'
    })
    expect(index.taskCount).toBe(3)
  })

  it('filtre par état, par activité et par projet', async () => {
    const { index } = await buildIndex()
    expect(index.tasks({ active: true }).map((task) => task.id)).toEqual(['t1', 't3'])
    expect(index.tasks({ states: ['terminee'] }).map((task) => task.id)).toEqual(['t2'])
    expect(index.tasks({ project: 'client acme' }).map((task) => task.id)).toEqual(['t3'])
  })
})

describe('références', () => {
  it('relie une note à la tâche qu elle cite', async () => {
    const { index } = await buildIndex()
    expect(index.refsTo('t3')).toHaveLength(1)
    expect(index.refsTo('t3')[0]).toMatchObject({ path: 'journal/2026-09-28.md', line: 3 })
    expect(index.refsTo('t1')).toEqual([])
  })
})

describe('journal et tags', () => {
  it('connaît les jours de journal, du plus récent au plus ancien', async () => {
    const { index } = await buildIndex()
    expect(index.journalDays()).toEqual(['2026-09-28', '2026-09-27'])
  })

  it('retrouve les jours où un tag apparaît, héritage compris', async () => {
    const { index } = await buildIndex()
    expect(index.daysForTag('infra')).toEqual(['2026-09-28'])
    // `#urgent` n'est écrit que sur une sous-puce, mais le jour compte quand même.
    expect(index.daysForTag('urgent')).toEqual(['2026-09-28'])
    expect(index.daysForTag('inconnu')).toEqual([])
  })
})

describe('projets', () => {
  it('réunit sections de tâches, tags du journal et fiches', async () => {
    const { index } = await buildIndex()
    const byKey = Object.fromEntries(index.projects().map((project) => [project.key, project]))

    expect(byKey['infra']).toMatchObject({
      openTaskCount: 1,
      closedTaskCount: 1,
      notePath: 'projets/infra.md'
    })
    expect(byKey['client-acme']).toMatchObject({ openTaskCount: 1, journalEntryCount: 1 })
    // Un tag sans tâche ni fiche est quand même un projet.
    expect(byKey['urgent']).toMatchObject({ openTaskCount: 0, journalEntryCount: 1 })
  })

  it('trie par dernière activité', async () => {
    const { index } = await buildIndex()
    const keys = index.projects().map((project) => project.key)
    expect(keys.indexOf('client-acme')).toBeLessThan(keys.indexOf('infra'))
  })
})

describe('recherche', () => {
  it('trouve dans le contenu, tolère les fautes et les accents', async () => {
    const { index } = await buildIndex()
    expect(index.search('migration').map((hit) => hit.path)).toContain('Notes libres.md')
    expect(index.search('hebdo').map((hit) => hit.path)).toContain('journal/2026-09-28.md')
  })
})
