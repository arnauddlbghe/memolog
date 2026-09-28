/**
 * Sémantique des tags, indépendante de la façon dont ils sont écrits.
 *
 * La syntaxe `#tag` appartient au stockage Markdown (voir
 * `adapters/markdown/bullets.ts`) ; ici on ne manipule que des noms de tags
 * déjà extraits. Une base de données stockerait les mêmes valeurs dans une
 * table sans rien changer à ces règles.
 */

/**
 * Clé de comparaison d'un tag ou d'un nom de projet : minuscules, sans
 * accents, espaces et `_` ramenés à `-`. C'est elle qui fait que
 * `Client ACME`, `client-acme` et `#client-acme` désignent la même chose.
 */
export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(/[\s_]+/g, '-')
    .replace(/^#/, '')
}

export function sameTag(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b)
}

/** Union de deux listes de tags, sans doublon, en gardant la première forme vue. */
export function mergeTags(inherited: string[], own: string[]): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const tag of [...inherited, ...own]) {
    const key = normalizeKey(tag)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

/** Les tags de `needle` sont-ils tous présents dans `haystack` ? */
export function hasAllTags(haystack: string[], needle: string[]): boolean {
  const keys = new Set(haystack.map(normalizeKey))
  return needle.every((tag) => keys.has(normalizeKey(tag)))
}
