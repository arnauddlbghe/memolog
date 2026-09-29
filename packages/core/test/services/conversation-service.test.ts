import { describe, expect, it } from 'vitest'

import { JsonlActivityLog } from '../../src/adapters/markdown/activity-jsonl.js'
import { MarkdownConversationRepository } from '../../src/adapters/markdown/conversation-repository.js'
import { MemoryNoteIndex } from '../../src/adapters/markdown/note-index.js'
import { readNote } from '../../src/adapters/markdown/notes.js'
import { ConversationService } from '../../src/services/conversation-service.js'
import { createTestVault } from '../helpers/memory-fs.js'

const AT = new Date(2026, 8, 29, 11, 40)
const PATH = 'conversations/Migration serveur.md'

async function makeService(files: Record<string, string> = {}) {
  const { vault } = createTestVault(files)
  const index = new MemoryNoteIndex(vault)
  await index.sync()
  const activity = new JsonlActivityLog(vault)
  const service = new ConversationService({
    conversations: new MarkdownConversationRepository(vault),
    activity,
    index,
    clock: () => AT
  })
  return { service, vault, activity, index }
}

describe('créer', () => {
  it('journalise la création', async () => {
    const { service, activity } = await makeService()
    const created = await service.create('Migration serveur')

    expect(created.name).toBe('Migration serveur')
    expect((await activity.readDay(AT))[0]).toMatchObject({
      type: 'conversation.creee',
      auteur: 'vous',
      nom: 'Migration serveur'
    })
  })

  it('accepte un autre auteur, pour le futur CLI ou Claude', async () => {
    const { service, activity } = await makeService()
    await service.create('Écrite ailleurs', { author: 'claude' })
    expect((await activity.readDay(AT))[0]).toMatchObject({ auteur: 'claude' })
  })
})

describe('changer d état', () => {
  const FILES = {
    [PATH]: '---\ncréée: 2026-09-14\nétat: en-cours\n---\n\nLe client attend.\n'
  }

  it('écrit l état, l historique, et journalise', async () => {
    const { service, vault, activity } = await makeService(FILES)
    const after = await service.setState(PATH, 'a-reprendre')

    expect(after.state).toBe('a-reprendre')
    expect((await readNote(vault, PATH)).content).toContain('  - 2026-09-29 a-reprendre')
    expect((await activity.readDay(AT))[0]).toMatchObject({
      type: 'conversation.etat',
      de: 'en-cours',
      vers: 'a-reprendre'
    })
  })

  it('ne journalise rien quand l état ne change pas', async () => {
    const { service, activity } = await makeService(FILES)
    await service.setState(PATH, 'en-cours')
    expect(await activity.readDay(AT)).toEqual([])
  })
})

describe('corps', () => {
  it('enregistre le texte tel quel', async () => {
    const { service, vault } = await makeService({
      [PATH]: '---\ncréée: 2026-09-14\nétat: en-cours\n---\n\nAvant.\n'
    })
    await service.setContent(PATH, '# Après\n\nDu texte.\n')

    const raw = (await readNote(vault, PATH)).content
    expect(raw).toContain('# Après')
    expect(raw).toContain('état: en-cours')
  })
})
