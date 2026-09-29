import { describe, expect, it } from 'vitest'

import { JsonlActivityLog, activityPathFor } from '../../src/adapters/markdown/activity-jsonl.js'
import { createTestVault } from '../helpers/memory-fs.js'

const AT = new Date(2026, 8, 29, 14, 32, 5)
const FILE = 'conversations/Migration serveur.md'

describe('journal d activité JSONL', () => {
  it('écrit un objet par ligne dans le fichier du jour', async () => {
    const { vault } = createTestVault({})
    const log = new JsonlActivityLog(vault)

    await log.append('vous', { type: 'conversation.creee', fichier: FILE, nom: 'Migration' }, AT)
    await log.append(
      'externe',
      { type: 'conversation.etat', fichier: FILE, nom: 'Migration', de: 'a-faire', vers: 'en-cours' },
      AT
    )

    const raw = await vault.fs.readFile(`${vault.root}/${activityPathFor(AT)}`)
    const lines = raw.trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]!)).toMatchObject({ type: 'conversation.creee', auteur: 'vous' })
    expect(JSON.parse(lines[1]!)).toMatchObject({ auteur: 'externe', vers: 'en-cours' })
  })

  it('horodate en ISO local, avec le décalage', async () => {
    const { vault } = createTestVault({})
    const event = await new JsonlActivityLog(vault).append(
      'vous',
      { type: 'conversation.creee', fichier: FILE, nom: 'Migration' },
      AT
    )
    expect(event.ts).toMatch(/^2026-09-29T14:32:05[+-]\d{2}:\d{2}$/)
  })

  it('n écrase jamais les lignes déjà écrites', async () => {
    const { vault } = createTestVault({})
    const log = new JsonlActivityLog(vault)
    await log.append('vous', { type: 'conversation.creee', fichier: FILE, nom: 'A' }, AT)
    const before = await vault.fs.readFile(`${vault.root}/${activityPathFor(AT)}`)

    await log.append('vous', { type: 'conversation.creee', fichier: FILE, nom: 'B' }, AT)
    const after = await vault.fs.readFile(`${vault.root}/${activityPathFor(AT)}`)
    expect(after.startsWith(before)).toBe(true)
  })

  it('relit les événements du jour', async () => {
    const { vault } = createTestVault({})
    const log = new JsonlActivityLog(vault)
    await log.append('vous', { type: 'conversation.creee', fichier: FILE, nom: 'A' }, AT)
    expect(await log.readDay(AT)).toHaveLength(1)
  })

  it('ignore une ligne abîmée plutôt que d échouer', async () => {
    const { vault } = createTestVault({
      '.memolog/activite/2026-09-29.jsonl':
        '{"ts":"2026-09-29T09:00:00+02:00","auteur":"vous","type":"conversation.creee"}\nligne tronquée {\n'
    })
    expect(await new JsonlActivityLog(vault).readDay(AT)).toHaveLength(1)
  })

  it('renvoie une liste vide quand il n y a pas de fichier', async () => {
    const { vault } = createTestVault({})
    expect(await new JsonlActivityLog(vault).readDay(AT)).toEqual([])
  })

  it('écrit l événement d une rafale d édition terminée', async () => {
    const { vault } = createTestVault({})
    const event = await new JsonlActivityLog(vault).appendEditBurst({
      fichier: FILE,
      auteur: 'externe',
      ligne: 12,
      extrait: 'Une ligne changée ailleurs',
      lignes: 3,
      lastTouch: AT,
      startedAt: AT
    })
    expect(event).toMatchObject({ type: 'fichier.edite', auteur: 'externe', lignes: 3 })
  })
})
