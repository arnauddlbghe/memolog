import { describe, expect, it } from 'vitest'

import {
  conversationName,
  isConversationPath,
  newConversation,
  parseConversation,
  renderConversation,
  summarize,
  withContent,
  withState
} from '../../src/adapters/markdown/conversation-file.js'

const PATH = 'conversations/Migration serveur.md'
const AT = new Date(2026, 8, 29)

const FILE = `---
créée: 2026-09-14
état: en-cours
historique:
  - 2026-09-14 a-faire
  - 2026-09-20 en-cours
  - 2026-09-28 a-reprendre
  - 2026-09-29 en-cours
---

# Migration serveur

Le client attend le devis signé.

- [x] Chiffrer la bascule
- [ ] Planifier la fenêtre
`

describe('identité', () => {
  it('déduit le nom du chemin', () => {
    expect(conversationName(PATH)).toBe('Migration serveur')
    expect(isConversationPath(PATH)).toBe(true)
    expect(isConversationPath('Idées.md')).toBe(false)
  })
})

describe('lecture', () => {
  const conversation = parseConversation(PATH, FILE, { mtimeMs: 1234 })

  it('lit les quatre métadonnées', () => {
    expect(conversation.name).toBe('Migration serveur')
    expect(conversation.created).toBe('2026-09-14')
    expect(conversation.state).toBe('en-cours')
    expect(conversation.history).toHaveLength(4)
  })

  it('garde l historique dans l ordre', () => {
    expect(conversation.history.map((change) => `${change.date} ${change.state}`)).toEqual([
      '2026-09-14 a-faire',
      '2026-09-20 en-cours',
      '2026-09-28 a-reprendre',
      '2026-09-29 en-cours'
    ])
  })

  it('rend le corps sans l en-tête', () => {
    expect(conversation.content.startsWith('# Migration serveur')).toBe(true)
    expect(conversation.content).not.toContain('état:')
    expect(conversation.content).toContain('- [ ] Planifier la fenêtre')
  })

  it('accepte un fichier sans en-tête', () => {
    const plain = parseConversation(PATH, 'Juste du texte.\n', { fallbackCreated: '2026-09-01' })
    expect(plain.state).toBe('a-faire')
    expect(plain.created).toBe('2026-09-01')
    expect(plain.history).toEqual([])
    expect(plain.content).toBe('Juste du texte.\n')
  })

  it('tolère accents et casse dans les clés et les états', () => {
    const written = parseConversation(PATH, '---\nCreee: 2026-01-02\nEtat: Terminé\n---\n\nx\n')
    expect(written.created).toBe('2026-01-02')
    expect(written.state).toBe('termine')
  })

  it('fait primer `état` sur la fin de l historique', () => {
    const diverging = parseConversation(
      PATH,
      '---\ncréée: 2026-01-01\nétat: termine\nhistorique:\n  - 2026-01-01 en-cours\n---\n\nx\n'
    )
    expect(diverging.state).toBe('termine')
  })

  it('préserve les clés inconnues', () => {
    const extra = parseConversation(PATH, '---\nétat: en-cours\ntags: infra\n---\n\nx\n')
    expect(extra.extraFrontmatter).toEqual({ tags: 'infra' })
  })
})

describe('écriture', () => {
  it('relit ce qu il écrit, à l identique', () => {
    const conversation = parseConversation(PATH, FILE)
    expect(renderConversation(conversation)).toBe(FILE)
  })

  it('n écrit pas d historique quand il n y en a pas', () => {
    const plain = parseConversation(PATH, 'Texte\n', { fallbackCreated: '2026-09-01' })
    expect(renderConversation(plain)).toBe('---\ncréée: 2026-09-01\nétat: a-faire\n---\n\nTexte\n')
  })

  it('remet les clés inconnues dans le fichier', () => {
    const extra = parseConversation(PATH, '---\ncréée: 2026-01-01\nétat: a-faire\ntags: infra\n---\n\nx\n')
    expect(renderConversation(extra)).toContain('tags: infra')
  })
})

describe('changer d état', () => {
  it('note le changement dans l historique, daté du jour', () => {
    const next = withState(parseConversation(PATH, FILE), 'termine', AT)
    expect(next.state).toBe('termine')
    expect(next.history[next.history.length - 1]).toEqual({ date: '2026-09-29', state: 'termine' })
  })

  it('ne note rien si l état ne change pas', () => {
    const conversation = parseConversation(PATH, FILE)
    expect(withState(conversation, 'en-cours', AT)).toBe(conversation)
  })
})

describe('corps', () => {
  it('se remplace sans toucher aux métadonnées', () => {
    const next = withContent(parseConversation(PATH, FILE), 'Tout autre chose.\n')
    expect(next.state).toBe('en-cours')
    expect(next.history).toHaveLength(4)
    expect(renderConversation(next)).toContain('Tout autre chose.')
    expect(renderConversation(next)).not.toContain('Chiffrer la bascule')
  })
})

describe('nouvelle conversation', () => {
  it('démarre à « à faire », avec son historique amorcé', () => {
    const fresh = newConversation(PATH, AT)
    expect(fresh.created).toBe('2026-09-29')
    expect(fresh.state).toBe('a-faire')
    expect(fresh.history).toEqual([{ date: '2026-09-29', state: 'a-faire' }])
    expect(renderConversation(fresh)).toBe(
      '---\ncréée: 2026-09-29\nétat: a-faire\nhistorique:\n  - 2026-09-29 a-faire\n---\n'
    )
  })
})

describe('résumé', () => {
  it('donne de quoi lister sans lire le corps', () => {
    expect(summarize(parseConversation(PATH, FILE, { mtimeMs: 42 }))).toEqual({
      path: PATH,
      name: 'Migration serveur',
      created: '2026-09-14',
      state: 'en-cours',
      lastChange: '2026-09-29',
      mtimeMs: 42
    })
  })
})
