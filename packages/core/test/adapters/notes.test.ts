import { describe, expect, it } from 'vitest'

import { MemologError } from '../../src/domain/errors.js'
import {
  createFolder,
  createNote,
  deleteEntry,
  moveEntry,
  normalizeContent,
  readNote,
  renameEntry,
  writeNote
} from '../../src/adapters/markdown/notes.js'
import { createTestVault } from '../helpers/memory-fs.js'

describe('normalizeContent', () => {
  it('convertit les fins de ligne et garantit un saut final', () => {
    expect(normalizeContent('a\r\nb')).toBe('a\nb\n')
    expect(normalizeContent('﻿a')).toBe('a\n')
    expect(normalizeContent('')).toBe('')
  })
})

describe('lecture et écriture', () => {
  it('lit une note et en déduit le titre', async () => {
    const { vault } = createTestVault({ 'Projets/Memolog.md': '# Memolog\n' })
    const note = await readNote(vault, 'Projets/Memolog.md')
    expect(note.title).toBe('Memolog')
    expect(note.content).toBe('# Memolog\n')
  })

  it('refuse un chemin hors du dossier de notes', async () => {
    const { vault } = createTestVault({})
    await expect(readNote(vault, '../ailleurs.md')).rejects.toThrow(MemologError)
  })

  it('refuse un fichier qui n est pas une note', async () => {
    const { vault } = createTestVault({ 'photo.png': 'binaire' })
    await expect(readNote(vault, 'photo.png')).rejects.toThrow(/pas une note/)
  })

  it('écrit et renvoie le nouveau mtime', async () => {
    const { vault } = createTestVault({ 'Note.md': 'avant\n' })
    const before = await readNote(vault, 'Note.md')
    const result = await writeNote(vault, 'Note.md', 'après', { baseMtimeMs: before.mtimeMs })
    expect(result.ok).toBe(true)
    expect((await readNote(vault, 'Note.md')).content).toBe('après\n')
  })

  it('détecte un conflit quand le disque a changé', async () => {
    const { vault } = createTestVault({ 'Note.md': 'version 1\n' })
    const opened = await readNote(vault, 'Note.md')

    // Un autre éditeur écrit dans le fichier pendant l'édition.
    await writeNote(vault, 'Note.md', 'version externe\n')

    const result = await writeNote(vault, 'Note.md', 'ma version\n', {
      baseMtimeMs: opened.mtimeMs
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.disk.content).toBe('version externe\n')
    }
    // Rien n'a été écrasé.
    expect((await readNote(vault, 'Note.md')).content).toBe('version externe\n')
  })
})

describe('création', () => {
  it('crée une note et évite les collisions de nom', async () => {
    const { vault } = createTestVault({})
    const first = await createNote(vault)
    const second = await createNote(vault)
    expect(first.path).toBe('Sans titre.md')
    expect(second.path).toBe('Sans titre 2.md')
  })

  it('crée un dossier', async () => {
    const { vault } = createTestVault({})
    expect(await createFolder(vault, '', 'Projets')).toBe('Projets')
  })

  it('refuse un nom invalide', async () => {
    const { vault } = createTestVault({})
    await expect(createNote(vault, '', 'a/b')).rejects.toThrow(MemologError)
  })
})

describe('renommage et déplacement', () => {
  it('renomme une note en conservant l extension', async () => {
    const { vault } = createTestVault({ 'Note.md': 'x\n' })
    expect(await renameEntry(vault, 'Note.md', 'Réunion produit')).toBe('Réunion produit.md')
  })

  it('refuse d écraser une note existante', async () => {
    const { vault } = createTestVault({ 'A.md': 'a\n', 'B.md': 'b\n' })
    await expect(renameEntry(vault, 'A.md', 'B')).rejects.toThrow(/porte déjà ce nom/)
  })

  it('déplace une note dans un sous-dossier', async () => {
    const { vault } = createTestVault({ 'Note.md': 'x\n' })
    expect(await moveEntry(vault, 'Note.md', 'Projets')).toBe('Projets/Note.md')
    expect((await readNote(vault, 'Projets/Note.md')).content).toBe('x\n')
  })

  it('refuse de déplacer un dossier dans lui-même', async () => {
    const { vault } = createTestVault({ 'Projets/Note.md': 'x\n' })
    await expect(moveEntry(vault, 'Projets', 'Projets/Sous')).rejects.toThrow(/dans lui-même/)
  })
})

describe('suppression', () => {
  it('passe par la corbeille, jamais par une suppression définitive', async () => {
    const { vault, fs } = createTestVault({ 'Note.md': 'x\n' })
    await deleteEntry(vault, 'Note.md')
    expect(fs.trashed).toHaveLength(1)
  })

  it('refuse de supprimer la racine', async () => {
    const { vault } = createTestVault({ 'Note.md': 'x\n' })
    await expect(deleteEntry(vault, '')).rejects.toThrow(MemologError)
  })
})
