/**
 * Frontmatter YAML **optionnel**.
 *
 * Memolog n'en écrit jamais spontanément : une note créée ici est du Markdown
 * nu. Mais si un fichier en contient un (venu d'Obsidian, d'un script, de
 * Claude plus tard), il est conservé octet pour octet — on ne le reformate pas
 * et on ne l'indexe pas comme du texte.
 */
export interface SplitDocument {
  /** Le bloc complet, délimiteurs et saut de ligne final inclus, ou `null`. */
  frontmatter: string | null
  /** Le corps Markdown, sans le bloc. */
  body: string
}

const DELIMITER = /^(---|\.\.\.)\s*$/

/**
 * Sépare un éventuel bloc de frontmatter du corps.
 * Garantit `frontmatter + body === raw`.
 */
export function splitFrontmatter(raw: string): SplitDocument {
  if (!raw.startsWith('---')) {
    return { frontmatter: null, body: raw }
  }
  const lines = raw.split('\n')
  if (lines[0]?.trim() !== '---') {
    return { frontmatter: null, body: raw }
  }
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line !== undefined && DELIMITER.test(line)) {
      const consumed = lines.slice(0, i + 1).join('\n')
      // On rattache le saut de ligne qui suit le délimiteur au frontmatter,
      // pour que la concaténation redonne exactement le fichier d'origine.
      const hasNewline = consumed.length < raw.length
      const frontmatter = hasNewline ? `${consumed}\n` : consumed
      return { frontmatter, body: raw.slice(frontmatter.length) }
    }
  }
  // Délimiteur ouvrant sans fermeture : ce n'est pas un frontmatter.
  return { frontmatter: null, body: raw }
}

/** Corps seul, pour l'indexation plein texte. */
export function stripFrontmatter(raw: string): string {
  return splitFrontmatter(raw).body
}

/** Nombre de lignes occupées par le frontmatter, pour recaler un numéro de ligne. */
export function frontmatterLineCount(frontmatter: string | null): number {
  if (frontmatter === null) return 0
  const withoutTrailing = frontmatter.endsWith('\n') ? frontmatter.slice(0, -1) : frontmatter
  return withoutTrailing.split('\n').length
}

/** Réassemble un document en préservant le bloc d'origine. */
export function joinFrontmatter(frontmatter: string | null, body: string): string {
  return frontmatter === null ? body : `${frontmatter}${body}`
}
