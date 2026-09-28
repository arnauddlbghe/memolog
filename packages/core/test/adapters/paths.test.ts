import { describe, expect, it } from 'vitest'

import { MemologError } from '../../src/domain/errors.js'
import {
  assertValidName,
  joinRel,
  normalizeRelPath,
  parentOf,
  resolveInRoot,
  titleFromPath,
  withNoteExtension
} from '../../src/adapters/fs/paths.js'

const ROOT = '/memolog-test'

describe('normalizeRelPath', () => {
  it('normalise les séparateurs et les segments inutiles', () => {
    expect(normalizeRelPath('./Projets//Memolog.md')).toBe('Projets/Memolog.md')
    expect(normalizeRelPath('Projets\\Memolog.md')).toBe('Projets/Memolog.md')
    expect(normalizeRelPath('')).toBe('')
  })

  it('refuse les chemins absolus', () => {
    expect(() => normalizeRelPath('/etc/passwd')).toThrow(MemologError)
    expect(() => normalizeRelPath('C:\\Windows\\system32')).toThrow(MemologError)
  })

  it('refuse toute remontée hors de la racine', () => {
    expect(() => normalizeRelPath('../secrets.md')).toThrow(/sort du dossier/)
    expect(() => normalizeRelPath('Projets/../../secrets.md')).toThrow(/sort du dossier/)
  })
})

describe('resolveInRoot', () => {
  it('résout sous la racine', () => {
    expect(resolveInRoot(ROOT, 'Projets/Memolog.md')).toBe(`${ROOT}/Projets/Memolog.md`)
    expect(resolveInRoot(ROOT, '')).toBe(ROOT)
  })

  it('bloque une évasion même déguisée', () => {
    expect(() => resolveInRoot(ROOT, '../memolog-test-autre/note.md')).toThrow(MemologError)
    // Un préfixe commun ne doit pas suffire à passer le contrôle.
    expect(() => resolveInRoot('/memolog', '../memolog-autre/note.md')).toThrow(MemologError)
  })
})

describe('assertValidName', () => {
  it('accepte un nom ordinaire', () => {
    expect(assertValidName('  Réunion produit  ')).toBe('Réunion produit')
  })

  it('refuse les noms dangereux ou impossibles selon l OS', () => {
    for (const name of ['', '.', '..', 'a/b', 'a:b', 'fin.', 'CON', 'NUL.md']) {
      expect(() => assertValidName(name), name).toThrow(MemologError)
    }
  })
})

describe('helpers de chemin', () => {
  it('déduit le titre du nom de fichier', () => {
    expect(titleFromPath('Projets/Réunion produit.md')).toBe('Réunion produit')
    expect(titleFromPath('journal/2026-09-28.md')).toBe('2026-09-28')
  })

  it('ajoute .md une seule fois', () => {
    expect(withNoteExtension('Note')).toBe('Note.md')
    expect(withNoteExtension('Note.md')).toBe('Note.md')
  })

  it('calcule parent et jointure', () => {
    expect(parentOf('Projets/Memolog.md')).toBe('Projets')
    expect(parentOf('Memolog.md')).toBe('')
    expect(joinRel('', 'Memolog.md')).toBe('Memolog.md')
    expect(joinRel('Projets', 'Memolog.md')).toBe('Projets/Memolog.md')
  })
})
