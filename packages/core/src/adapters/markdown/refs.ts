/**
 * Références `@t42` : des liens vers une tâche, dans n'importe quelle note.
 *
 * Une référence ne crée ni ne modifie jamais la tâche. Le fichier ne contient
 * que `@t42` ; c'est l'affichage qui va chercher le titre et l'état actuels.
 */
import type { RelPath, TaskRef } from '../../domain/types.js'

/** `@t` suivi de chiffres, précédé d'un début de ligne ou d'un caractère neutre. */
const REF = /(^|[^\p{L}\p{N}_@])@t(\d+)\b/gu

const FENCE = /^\s*(```|~~~)/

/** Références trouvées dans un texte, avec leur position. */
export function extractRefs(path: RelPath, content: string): TaskRef[] {
  const refs: TaskRef[] = []
  const lines = content.split('\n')
  let inFence = false

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line === undefined) continue
    if (FENCE.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue

    for (const match of line.matchAll(REF)) {
      const digits = match[2]
      if (digits === undefined) continue
      const prefix = match[1] ?? ''
      refs.push({
        id: `t${digits}`,
        path,
        line: i + 1,
        column: (match.index ?? 0) + prefix.length + 1
      })
    }
  }

  return refs
}

/** Texte d'insertion d'une référence : `@t42`. */
export function formatRef(id: string): string {
  return `@${id}`
}

/** Le texte contient-il déjà cette référence ? */
export function hasRef(content: string, id: string): boolean {
  return extractRefs('', content).some((ref) => ref.id === id)
}
