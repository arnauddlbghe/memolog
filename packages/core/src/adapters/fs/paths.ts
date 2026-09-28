import path from 'node:path'

import { MemologError } from '../../domain/errors.js'
import type { RelPath } from '../../domain/types.js'

export const NOTE_EXTENSION = '.md'

/** Caractères interdits dans un nom de fichier, sur au moins un des trois OS. */
const INVALID_NAME_CHARS = /[\\/:*?"<>|]/
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001f]')
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_NAME_LENGTH = 120

/**
 * Normalise un chemin fourni par le renderer (ou plus tard par le CLI) en
 * chemin relatif POSIX sûr. Rejette l'absolu, les `..` et les caractères de
 * contrôle. La chaîne vide représente la racine du dossier de notes.
 */
export function normalizeRelPath(input: string): RelPath {
  if (typeof input !== 'string') {
    throw new MemologError('invalid-path', 'Chemin attendu sous forme de chaîne.')
  }
  const raw = input.replace(/\\/g, '/').trim()
  if (CONTROL_CHARS.test(raw)) {
    throw new MemologError('invalid-path', 'Le chemin contient des caractères de contrôle.')
  }
  if (raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) {
    throw new MemologError('invalid-path', `Chemin absolu refusé : ${input}`)
  }
  const parts = raw.split('/').filter((part) => part !== '' && part !== '.')
  if (parts.includes('..')) {
    throw new MemologError('outside-root', `Le chemin sort du dossier de notes : ${input}`)
  }
  return parts.join('/')
}

/**
 * Résout un chemin relatif en chemin absolu, en garantissant qu'il reste
 * sous la racine. Dernier rempart avant toute opération disque.
 */
export function resolveInRoot(root: string, relPath: string): string {
  const rel = normalizeRelPath(relPath)
  const rootAbs = path.resolve(root)
  const abs = path.resolve(rootAbs, rel)
  const back = path.relative(rootAbs, abs)
  if (back !== '' && (back.startsWith('..') || path.isAbsolute(back))) {
    throw new MemologError('outside-root', `Le chemin sort du dossier de notes : ${relPath}`)
  }
  return abs
}

/** Valide un nom de fichier ou de dossier saisi par l'utilisateur. */
export function assertValidName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed === '') {
    throw new MemologError('invalid-name', 'Le nom ne peut pas être vide.')
  }
  if (trimmed === '.' || trimmed === '..') {
    throw new MemologError('invalid-name', `Nom réservé : ${name}`)
  }
  if (INVALID_NAME_CHARS.test(trimmed) || CONTROL_CHARS.test(trimmed)) {
    throw new MemologError('invalid-name', `Le nom contient un caractère interdit : ${name}`)
  }
  if (trimmed.endsWith('.')) {
    throw new MemologError('invalid-name', 'Le nom ne peut pas se terminer par un point.')
  }
  if (WINDOWS_RESERVED.test(stripNoteExtension(trimmed))) {
    throw new MemologError('invalid-name', `Nom réservé par Windows : ${name}`)
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new MemologError('invalid-name', `Le nom dépasse ${MAX_NAME_LENGTH} caractères.`)
  }
  return trimmed
}

export function isNotePath(relPath: string): boolean {
  return relPath.toLowerCase().endsWith(NOTE_EXTENSION)
}

export function assertNotePath(relPath: RelPath): RelPath {
  if (!isNotePath(relPath)) {
    throw new MemologError('not-a-note', `Ce chemin n'est pas une note .md : ${relPath}`)
  }
  return relPath
}

export function stripNoteExtension(name: string): string {
  return name.toLowerCase().endsWith(NOTE_EXTENSION) ? name.slice(0, -NOTE_EXTENSION.length) : name
}

/** Ajoute `.md` si le nom ne l'a pas déjà. */
export function withNoteExtension(name: string): string {
  return name.toLowerCase().endsWith(NOTE_EXTENSION) ? name : `${name}${NOTE_EXTENSION}`
}

/** Titre affiché d'une note : son nom de fichier sans l'extension. */
export function titleFromPath(relPath: RelPath): string {
  return stripNoteExtension(baseName(relPath))
}

export function baseName(relPath: RelPath): string {
  const parts = relPath.split('/')
  return parts[parts.length - 1] ?? ''
}

/** Dossier parent, ou chaîne vide si l'entrée est à la racine. */
export function parentOf(relPath: RelPath): RelPath {
  const index = relPath.lastIndexOf('/')
  return index === -1 ? '' : relPath.slice(0, index)
}

export function joinRel(dir: RelPath, name: string): RelPath {
  return dir === '' ? name : `${dir}/${name}`
}
