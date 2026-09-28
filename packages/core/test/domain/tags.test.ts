import { describe, expect, it } from 'vitest'

import { hasAllTags, mergeTags, normalizeKey, sameTag } from '../../src/domain/tags.js'

describe('normalizeKey', () => {
  it('replie accents, casse et séparateurs', () => {
    expect(normalizeKey('Client ACME')).toBe('client-acme')
    expect(normalizeKey('#Réunion_Équipe')).toBe('reunion-equipe')
    expect(normalizeKey('client-acme')).toBe('client-acme')
  })
})

describe('mergeTags', () => {
  it('fusionne sans doublon et garde la première forme vue', () => {
    expect(mergeTags(['Infra'], ['infra', 'urgent'])).toEqual(['Infra', 'urgent'])
    expect(mergeTags([], [])).toEqual([])
  })
})

describe('sameTag et hasAllTags', () => {
  it('compare sans tenir compte de la casse ni des accents', () => {
    expect(sameTag('#Réunion', 'reunion')).toBe(true)
    expect(hasAllTags(['Infra', 'Budget'], ['infra'])).toBe(true)
    expect(hasAllTags(['Infra'], ['infra', 'budget'])).toBe(false)
  })
})
