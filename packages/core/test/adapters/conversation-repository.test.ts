import { describe, expect, it } from 'vitest'

import { MarkdownConversationRepository } from '../../src/adapters/markdown/conversation-repository.js'
import { readNote } from '../../src/adapters/markdown/notes.js'
import { createTestVault } from '../helpers/memory-fs.js'

const AT = new Date(2026, 8, 29)
const PATH = 'conversations/Migration serveur.md'

const FILES = {
  'conversations/Migration serveur.md':
    '---\ncréée: 2026-09-14\nétat: en-cours\nhistorique:\n  - 2026-09-14 a-faire\n  - 2026-09-20 en-cours\n---\n\nLe client attend le devis.\n',
  'conversations/Recrutement.md': '---\ncréée: 2026-09-12\nétat: termine\n---\n\nAnnonce publiée.\n'
}

function repo(files: Record<string, string> = FILES) {
  const { vault, fs } = createTestVault(files)
  return { repo: new MarkdownConversationRepository(vault), vault, fs }
}

describe('lister', () => {
  it('trouve les conversations avec leur état', async () => {
    const list = await repo().repo.list()
    expect(list.map((item) => [item.name, item.state, item.created])).toEqual([
      ['Migration serveur', 'en-cours', '2026-09-14'],
      ['Recrutement', 'termine', '2026-09-12']
    ])
  })

  it('ignore ce qui n est pas dans conversations/', async () => {
    const list = await repo({ ...FILES, 'Idées.md': 'note libre\n' }).repo.list()
    expect(list).toHaveLength(2)
  })
})

describe('créer', () => {
  it('écrit un en-tête complet et un corps vide', async () => {
    const { repo: conversations, vault } = repo({})
    const created = await conversations.create('Nouveau sujet')

    expect(created.path).toBe('conversations/Nouveau sujet.md')
    expect(created.state).toBe('a-faire')
    expect((await readNote(vault, created.path)).content).toMatch(
      /^---\ncréée: \d{4}-\d{2}-\d{2}\nétat: a-faire\nhistorique:\n {2}- \d{4}-\d{2}-\d{2} a-faire\n---\n$/
    )
  })

  it('apparaît aussitôt dans la liste, relisible', async () => {
    const { repo: conversations } = repo({})
    const created = await conversations.create('Migration serveur')

    const reread = await conversations.read(created.path)
    expect(reread.name).toBe('Migration serveur')
    expect(reread.history).toHaveLength(1)
    expect((await conversations.list()).map((item) => item.name)).toEqual(['Migration serveur'])
  })

  it('ne réutilise pas un nom déjà pris', async () => {
    const { repo: conversations } = repo(FILES)
    const created = await conversations.create('Migration serveur')
    expect(created.path).toBe('conversations/Migration serveur 2.md')
  })
})

describe('changer d état', () => {
  it('écrit l état et ajoute une ligne d historique', async () => {
    const { repo: conversations, vault } = repo()
    const after = await conversations.setState(PATH, 'termine', AT)

    expect(after.state).toBe('termine')
    expect(after.history).toHaveLength(3)

    const raw = (await readNote(vault, PATH)).content
    expect(raw).toContain('état: termine')
    expect(raw).toContain('  - 2026-09-29 termine')
    // Le corps n'a pas bougé.
    expect(raw).toContain('Le client attend le devis.')
  })

  it('ne touche à rien quand l état ne change pas', async () => {
    const { repo: conversations, vault } = repo()
    const before = (await readNote(vault, PATH)).content
    await conversations.setState(PATH, 'en-cours', AT)
    expect((await readNote(vault, PATH)).content).toBe(before)
  })
})

describe('corps', () => {
  it('se remplace sans abîmer les métadonnées', async () => {
    const { repo: conversations, vault } = repo()
    const result = await conversations.setContent(PATH, '# Tout neuf\n\nUne autre idée.\n')

    expect(result.ok).toBe(true)
    const raw = (await readNote(vault, PATH)).content
    expect(raw).toContain('état: en-cours')
    expect(raw).toContain('  - 2026-09-20 en-cours')
    expect(raw).toContain('# Tout neuf')
    expect(raw).not.toContain('Le client attend')
  })

  it('refuse d écraser une version plus récente', async () => {
    const { repo: conversations, vault, fs } = repo()
    const stale = (await readNote(vault, PATH)).mtimeMs
    fs.tick()
    await fs.writeFile(`${vault.root}/${PATH}`, '---\nétat: en-cours\n---\n\nAilleurs.\n')

    const result = await conversations.setContent(PATH, 'Ma version', stale)
    expect(result.ok).toBe(false)
  })
})

describe('renommer et supprimer', () => {
  it('renomme le fichier', async () => {
    const { repo: conversations } = repo()
    expect(await conversations.rename(PATH, 'Bascule serveur')).toBe(
      'conversations/Bascule serveur.md'
    )
  })

  it('supprime par la corbeille, jamais définitivement', async () => {
    const { repo: conversations, fs } = repo()
    await conversations.remove(PATH)
    expect(fs.trashed).toHaveLength(1)
  })
})
