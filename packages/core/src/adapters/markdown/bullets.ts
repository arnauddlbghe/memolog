/**
 * Syntaxe Markdown des puces et des tags `#tag`, avec héritage.
 *
 * C'est l'implémentation de référence de `docs/format.md` §2 et §3 : le CLI
 * et le serveur MCP l'utiliseront telle quelle plutôt que de refaire une
 * expression régulière approchante. La *sémantique* des tags (comparaison,
 * fusion) vit dans le domaine, pas ici.
 */
import { mergeTags, normalizeKey } from '../../domain/tags.js'
import type { Bullet } from '../../domain/types.js'

/**
 * Un tag : `#` précédé d'un début de ligne ou d'un blanc, suivi d'au moins une
 * lettre, puis de lettres, chiffres, `-`, `_` ou `/`.
 * Le premier caractère ne peut pas être un chiffre, pour ne pas confondre avec
 * une numérotation (`#1`, `#42`).
 */
const TAG = /(^|[\s(\[{'"])#([\p{L}][\p{L}\p{N}_/-]*)/gu

const FENCE = /^\s*(```|~~~)/

/** Tags écrits dans un texte, dans l'ordre d'apparition, sans doublon. */
export function extractTags(text: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  for (const match of text.matchAll(TAG)) {
    const tag = match[2]
    if (tag === undefined) continue
    const key = normalizeKey(tag)
    if (seen.has(key)) continue
    seen.add(key)
    found.push(tag)
  }
  return found
}

/** Le texte sans ses tags, pour un affichage compact. */
export function stripTags(text: string): string {
  return text.replace(TAG, '$1').replace(/\s{2,}/g, ' ').trim()
}

const BULLET = /^(\s*)[-*+]\s+(.*)$/

export interface ParsedBullet extends Bullet {
  children: ParsedBullet[]
}

/**
 * Découpe un texte Markdown en arbre de puces, avec héritage des tags.
 *
 * Les lignes qui ne sont pas des puces (titres, paragraphes) sont ignorées :
 * elles ne portent pas de tags héritables et ne cassent pas l'arbre.
 * Les blocs de code sont sautés intégralement.
 */
export function parseBullets(content: string, inheritedTags: string[] = []): ParsedBullet[] {
  const lines = content.split('\n')
  const roots: ParsedBullet[] = []
  /** Pile des puces ouvertes, de la moins indentée à la plus indentée. */
  const stack: ParsedBullet[] = []
  let inFence = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined) continue
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const match = BULLET.exec(line)
    if (match === null) continue

    const indent = indentWidth(match[1] ?? '')
    const text = (match[2] ?? '').trim()
    const tags = extractTags(text)

    while (stack.length > 0 && (stack[stack.length - 1]?.indent ?? 0) >= indent) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    const inherited = parent?.effectiveTags ?? inheritedTags

    const bullet: ParsedBullet = {
      line: i + 1,
      indent,
      text,
      tags,
      effectiveTags: mergeTags(inherited, tags),
      children: []
    }

    if (parent === undefined) roots.push(bullet)
    else parent.children.push(bullet)
    stack.push(bullet)
  }

  return roots
}

/** Une tabulation vaut deux espaces, comme dans le reste du format. */
export function indentWidth(prefix: string): number {
  let width = 0
  for (const char of prefix) width += char === '\t' ? 2 : 1
  return width
}

/** Toutes les puces d'un arbre, dans l'ordre du fichier. */
export function flattenBullets(bullets: ParsedBullet[]): ParsedBullet[] {
  const out: ParsedBullet[] = []
  const walk = (list: ParsedBullet[]): void => {
    for (const bullet of list) {
      out.push(bullet)
      walk(bullet.children)
    }
  }
  walk(bullets)
  return out
}
