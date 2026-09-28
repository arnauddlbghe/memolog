import { describe, expect, it } from 'vitest'

import { readNote } from '../../src/adapters/markdown/notes.js'
import { readVaultState } from '../../src/adapters/markdown/state.js'
import { MarkdownTaskRepository } from '../../src/adapters/markdown/task-repository.js'
import { createTestVault } from '../helpers/memory-fs.js'

const AT = new Date(2026, 8, 28, 14, 32)

function repo(files: Record<string, string> = {}) {
  const { vault, fs } = createTestVault(files)
  return { repo: new MarkdownTaskRepository(vault), vault, fs }
}

describe('écriture dans taches.md', () => {
  it('crée le fichier et attribue le premier identifiant', async () => {
    const { repo: tasks, vault } = repo()
    const task = await tasks.add({ text: 'Relancer l’infra', project: 'Infra' }, AT)

    expect(task.id).toBe('t1')
    expect((await readNote(vault, 'taches.md')).content).toBe(
      '## Infra\n\n- [ ] Relancer l’infra ^t1 [créée:: 2026-09-28] [maj:: 2026-09-28]\n'
    )
  })

  it('n attribue jamais deux fois le même identifiant', async () => {
    const { repo: tasks, vault } = repo()
    const first = await tasks.add({ text: 'A', project: 'Infra' }, AT)
    const second = await tasks.add({ text: 'B' }, AT)
    expect([first.id, second.id]).toEqual(['t1', 't2'])
    expect((await readVaultState(vault)).nextTaskId).toBe(3)
  })

  it('ne réutilise pas un identifiant même sans fichier d état', async () => {
    const { repo: tasks } = repo({
      'taches.md': '## Infra\n\n- [x] Ancienne ^t17 [créée:: 2026-01-01] [maj:: 2026-01-02]\n'
    })
    expect((await tasks.add({ text: 'Nouvelle', project: 'Infra' }, AT)).id).toBe('t18')
  })

  it('signale une modification sans effet plutôt que de réécrire', async () => {
    const { repo: tasks } = repo()
    const task = await tasks.add({ text: 'Relancer' }, AT)
    expect((await tasks.setState(task.id, 'a-faire', AT)).changed).toBe(false)
    expect((await tasks.setState(task.id, 'en-cours', AT)).changed).toBe(true)
  })

  it('complète les tâches écrites à la main, une seule fois', async () => {
    const { repo: tasks, vault } = repo({
      'taches.md': '## Infra\n\n- [ ] Écrite dans un autre éditeur\n'
    })
    expect(await tasks.ensureMetadata(AT)).toHaveLength(1)
    expect((await readNote(vault, 'taches.md')).content).toContain(
      '^t1 [créée:: 2026-09-28] [maj:: 2026-09-28]'
    )
    expect(await tasks.ensureMetadata(AT)).toHaveLength(0)
  })
})

describe('lecture', () => {
  const FILES = {
    'taches.md':
      '## Infra\n\n- [ ] Ouverte ^t1 [créée:: 2026-09-01] [maj:: 2026-09-01]\n- [x] Fermée ^t2 [créée:: 2026-09-01] [maj:: 2026-09-02]\n\n## Divers\n\n- [/] En cours ^t3 [créée:: 2026-09-03] [maj:: 2026-09-03]\n',
    'taches/archive-2025.md': '## Infra\n\n- [x] Vieille ^t0 [créée:: 2025-01-01] [maj:: 2025-01-02]\n'
  }

  it('lit taches.md, sans les archives par défaut', async () => {
    const { repo: tasks } = repo(FILES)
    expect((await tasks.all()).map((task) => task.id)).toEqual(['t1', 't2', 't3'])
  })

  it('peut inclure les archives', async () => {
    const { repo: tasks } = repo(FILES)
    expect((await tasks.all({ includeArchived: true })).map((task) => task.id)).toContain('t0')
  })

  it('filtre par état ouvert et par projet', async () => {
    const { repo: tasks } = repo(FILES)
    expect((await tasks.all({ includeClosed: false })).map((task) => task.id)).toEqual(['t1', 't3'])
    expect((await tasks.all({ project: 'INFRA' })).map((task) => task.id)).toEqual(['t1', 't2'])
  })

  it('retrouve une tâche par identifiant, archives comprises', async () => {
    const { repo: tasks } = repo(FILES)
    expect((await tasks.find('t0'))?.text).toBe('Vieille')
    expect(await tasks.find('t99')).toBeNull()
  })
})

describe('archivage', () => {
  it('recopie la ligne telle quelle dans l archive de son année', async () => {
    const { repo: tasks, vault } = repo({
      'taches.md':
        '## Infra\n\n- [ ] Ouverte ^t1 [créée:: 2026-01-01] [maj:: 2026-09-28]\n- [x] Finie ^t2 [créée:: 2026-01-01] [maj:: 2026-02-01]\n'
    })
    const closed = (await tasks.all()).filter((task) => task.id === 't2')
    const report = await tasks.archive(closed, AT)

    expect(report.targets).toEqual(['taches/archive-2026.md'])
    expect((await readNote(vault, 'taches.md')).content).not.toContain('^t2')
    expect((await readNote(vault, 'taches/archive-2026.md')).content).toBe(
      '## Infra\n\n- [x] Finie ^t2 [créée:: 2026-01-01] [maj:: 2026-02-01]\n'
    )
  })
})
