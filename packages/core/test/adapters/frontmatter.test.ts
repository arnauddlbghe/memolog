import { describe, expect, it } from 'vitest'

import {
  frontmatterLineCount,
  joinFrontmatter,
  splitFrontmatter,
  stripFrontmatter
} from '../../src/adapters/markdown/frontmatter.js'

const WITH_FM = `---
tags: [produit, q4]
---

# Réunion

Corps de la note.
`

describe('splitFrontmatter', () => {
  it('sépare un bloc YAML en tête', () => {
    const { frontmatter, body } = splitFrontmatter(WITH_FM)
    expect(frontmatter).toBe('---\ntags: [produit, q4]\n---\n')
    expect(body).toBe('\n# Réunion\n\nCorps de la note.\n')
  })

  it('garantit une reconstruction à l identique', () => {
    const { frontmatter, body } = splitFrontmatter(WITH_FM)
    expect(joinFrontmatter(frontmatter, body)).toBe(WITH_FM)
  })

  it('laisse intacte une note sans frontmatter', () => {
    const raw = '# Titre\n\n---\n\nUne ligne de séparation.\n'
    expect(splitFrontmatter(raw)).toEqual({ frontmatter: null, body: raw })
  })

  it('ne confond pas un délimiteur ouvert sans fermeture', () => {
    const raw = '---\ntags: [a]\n\nPas de fermeture.\n'
    expect(splitFrontmatter(raw).frontmatter).toBeNull()
  })

  it('compte les lignes du bloc pour recaler un numéro de ligne', () => {
    expect(frontmatterLineCount(splitFrontmatter(WITH_FM).frontmatter)).toBe(3)
    expect(frontmatterLineCount(null)).toBe(0)
  })

  it('retire le bloc pour l indexation', () => {
    expect(stripFrontmatter(WITH_FM)).not.toContain('tags:')
  })
})
