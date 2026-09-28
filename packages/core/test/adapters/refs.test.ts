import { describe, expect, it } from 'vitest'

import { extractRefs, formatRef, hasRef } from '../../src/adapters/markdown/refs.js'

describe('références @tNN', () => {
  it('trouve les références et leur position', () => {
    const refs = extractRefs('journal/2026-09-28.md', 'Vu avec @t42 puis @t7.\nRien ici.\n')
    expect(refs.map((ref) => [ref.id, ref.line, ref.column])).toEqual([
      ['t42', 1, 9],
      ['t7', 1, 19]
    ])
  })

  it('ne confond pas une adresse e-mail ou un mot collé', () => {
    expect(extractRefs('n.md', 'ecrire a@t42.fr et mot@t9')).toEqual([])
  })

  it('ignore les blocs de code', () => {
    expect(extractRefs('n.md', '```\n@t42\n```\n')).toEqual([])
  })

  it('formate et détecte une référence', () => {
    expect(formatRef('t42')).toBe('@t42')
    expect(hasRef('voir @t42', 't42')).toBe(true)
    expect(hasRef('voir @t42', 't4')).toBe(false)
  })
})
