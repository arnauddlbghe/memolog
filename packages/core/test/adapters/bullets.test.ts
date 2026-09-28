import { describe, expect, it } from 'vitest'

import {
  extractTags,
  flattenBullets,
  parseBullets,
  stripTags
} from '../../src/adapters/markdown/bullets.js'

describe('extractTags', () => {
  it('trouve les tags et accepte lettres accentuées, chiffres et séparateurs', () => {
    expect(extractTags('Point #infra et #client/acme #compte-rendu #été')).toEqual([
      'infra',
      'client/acme',
      'compte-rendu',
      'été'
    ])
  })

  it('ignore ce qui ressemble à un tag sans en être un', () => {
    expect(extractTags('Écrit en C# et coûte 3#4')).toEqual([])
    expect(extractTags('# Titre Markdown')).toEqual([])
    expect(extractTags('Point #1 de la liste')).toEqual([])
  })

  it('dédoublonne sans tenir compte de la casse ni des accents', () => {
    expect(extractTags('#Infra puis #infra puis #INFRA')).toEqual(['Infra'])
  })

  it('reconnaît un tag après une parenthèse ou un guillemet', () => {
    expect(extractTags('(#infra) "#budget"')).toEqual(['infra', 'budget'])
  })
})

describe('stripTags', () => {
  it('retire les tags pour un affichage compact', () => {
    expect(stripTags('Point hebdo #infra #urgent')).toBe('Point hebdo')
  })
})

describe('parseBullets', () => {
  const CONTENT = `# Titre

- Point hebdo #infra
  - Migration repoussée #urgent
    - Prévenir le client
- Autre sujet #budget

\`\`\`md
- [ ] Faux tag #code
\`\`\`
`

  it('construit l arbre des puces', () => {
    const roots = parseBullets(CONTENT)
    expect(roots).toHaveLength(2)
    expect(roots[0]?.children).toHaveLength(1)
    expect(roots[0]?.children[0]?.children).toHaveLength(1)
  })

  it('fait hériter les tags de la puce parente', () => {
    const bullets = flattenBullets(parseBullets(CONTENT))
    const byText = (needle: string) => bullets.find((b) => b.text.startsWith(needle))

    expect(byText('Point hebdo')?.effectiveTags).toEqual(['infra'])
    expect(byText('Migration repoussée')?.effectiveTags).toEqual(['infra', 'urgent'])
    // Une puce sans tag propre hérite de toute la chaîne au-dessus d'elle.
    expect(byText('Prévenir le client')?.effectiveTags).toEqual(['infra', 'urgent'])
    // L'héritage ne traverse pas d'une puce de premier niveau à l'autre.
    expect(byText('Autre sujet')?.effectiveTags).toEqual(['budget'])
  })

  it('ignore les blocs de code', () => {
    const bullets = flattenBullets(parseBullets(CONTENT))
    expect(bullets.some((bullet) => bullet.text.includes('Faux tag'))).toBe(false)
  })

  it('compte une tabulation pour deux espaces', () => {
    const roots = parseBullets('- Parent\n\t- Enfant\n')
    expect(roots[0]?.children[0]?.indent).toBe(2)
  })
})
