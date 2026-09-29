import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state'
import { describe, expect, it } from 'vitest'

import {
  TOOL_COMMANDS,
  editorContext,
  headingLevel,
  minimalChange
} from '../src/renderer/src/components/editor-commands'
import type { MarkdownTool } from '../src/renderer/src/components/editor-commands'
import { revealsMark } from '../src/renderer/src/components/editor-markdown'

/**
 * Les commandes d'écriture sont des `StateCommand` : elles ne touchent qu'à
 * l'état de l'éditeur, ce qui permet de les éprouver sans navigateur.
 */

function stateOf(doc: string, anchor: number, head = anchor): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions: [markdown({ base: markdownLanguage })]
  })
}

/** Applique un outil et rend le document obtenu, plus la sélection. */
function run(
  state: EditorState,
  tool: MarkdownTool
): { doc: string; from: number; to: number; ran: boolean } {
  let next = state
  const ran = TOOL_COMMANDS[tool]({
    state,
    dispatch: (tr: Transaction) => {
      next = tr.state
    }
  })
  const range = next.selection.main
  return { doc: next.doc.toString(), from: range.from, to: range.to, ran }
}

/** Repère `|` comme position du curseur, pour des cas lisibles. */
function at(doc: string): EditorState {
  const anchor = doc.indexOf('|')
  return stateOf(doc.replace('|', ''), anchor)
}

describe('gras', () => {
  it('entoure la sélection', () => {
    const result = run(stateOf('un mot ici', 3, 6), 'gras')
    expect(result.doc).toBe('un **mot** ici')
  })

  it('sur une sélection vide, laisse le curseur entre les marques', () => {
    const result = run(stateOf('', 0), 'gras')
    expect(result.doc).toBe('****')
    expect(result.from).toBe(2)
    expect(result.to).toBe(2)
  })

  it('entoure le mot sous le curseur quand rien n’est sélectionné', () => {
    const result = run(at('un m|ot ici'), 'gras')
    expect(result.doc).toBe('un **mot** ici')
  })

  it('dégraisse quand la sélection est à l’intérieur des marques', () => {
    const doc = 'un **mot** ici'
    const result = run(stateOf(doc, doc.indexOf('mot'), doc.indexOf('mot') + 3), 'gras')
    expect(result.doc).toBe('un mot ici')
  })

  it('laisse l’italique tranquille : il ne partage pas le même nœud', () => {
    const doc = 'un *mot* ici'
    const result = run(stateOf(doc, doc.indexOf('mot'), doc.indexOf('mot') + 3), 'gras')
    expect(result.doc).toBe('un ***mot*** ici')
  })
})

describe('italique', () => {
  it('ne défait pas un gras à la place d’un italique', () => {
    const doc = 'un **mot** ici'
    const result = run(stateOf(doc, doc.indexOf('mot'), doc.indexOf('mot') + 3), 'italique')
    expect(result.doc).toBe('un ***mot*** ici')
  })

  it('défait un italique existant', () => {
    const doc = 'un *mot* ici'
    const result = run(stateOf(doc, doc.indexOf('mot'), doc.indexOf('mot') + 3), 'italique')
    expect(result.doc).toBe('un mot ici')
  })
})

describe('titre', () => {
  it('parcourt les quatre niveaux puis revient au texte nu', () => {
    let doc = 'Réunion'
    for (const expected of ['# Réunion', '## Réunion', '### Réunion', 'Réunion']) {
      doc = run(stateOf(doc, 0), 'titre').doc
      expect(doc).toBe(expected)
    }
  })

  it('remplace le préfixe au lieu de l’empiler', () => {
    const result = run(stateOf('# Réunion', 0), 'titre')
    expect(result.doc).toBe('## Réunion')
  })

  it('aligne toutes les lignes sélectionnées sur le niveau de la première', () => {
    const doc = 'Un\nDeux'
    const result = run(stateOf(doc, 0, doc.length), 'titre')
    expect(result.doc).toBe('# Un\n# Deux')
  })

  it('lit le niveau d’une ligne', () => {
    expect(headingLevel('### Titre')).toBe(3)
    expect(headingLevel('Pas un titre')).toBe(0)
    expect(headingLevel('#pas-un-titre')).toBe(0)
  })
})

describe('liste et case à cocher', () => {
  it('pose puis retire une puce', () => {
    const posee = run(stateOf('acheter du pain', 0), 'liste')
    expect(posee.doc).toBe('- acheter du pain')
    expect(run(stateOf(posee.doc, 0), 'liste').doc).toBe('acheter du pain')
  })

  it('complète une puce existante au lieu d’en ajouter une', () => {
    const result = run(stateOf('- acheter du pain', 0), 'case')
    expect(result.doc).toBe('- [ ] acheter du pain')
  })

  it('retire tout le marqueur d’une case, cochée ou non', () => {
    expect(run(stateOf('- [x] fait', 0), 'case').doc).toBe('fait')
    expect(run(stateOf('- [ ] à faire', 0), 'liste').doc).toBe('à faire')
  })

  it('respecte l’indentation', () => {
    const result = run(stateOf('  sous-point', 0), 'liste')
    expect(result.doc).toBe('  - sous-point')
  })

  it('traite chaque ligne de la sélection', () => {
    const doc = 'un\ndeux'
    expect(run(stateOf(doc, 0, doc.length), 'liste').doc).toBe('- un\n- deux')
  })
})

describe('position du curseur après une balise de ligne', () => {
  // Le curseur doit se retrouver *après* la balise, prêt à écrire.
  it('passe derrière la balise posée sur une ligne vide', () => {
    expect(run(stateOf('', 0), 'liste')).toMatchObject({ doc: '- ', from: 2, to: 2 })
    expect(run(stateOf('', 0), 'case')).toMatchObject({ doc: '- [ ] ', from: 6, to: 6 })
    expect(run(stateOf('', 0), 'citation')).toMatchObject({ doc: '> ', from: 2, to: 2 })
    expect(run(stateOf('', 0), 'titre')).toMatchObject({ doc: '# ', from: 2, to: 2 })
  })

  it('reste au même endroit du texte quand la ligne en a déjà', () => {
    // Curseur avant « abc » : après la puce, il est toujours juste avant « abc ».
    const result = run(stateOf('abc', 0), 'liste')
    expect(result.doc).toBe('- abc')
    expect(result.from).toBe(2)
  })

  it('suit le texte quand le curseur est au milieu', () => {
    const result = run(stateOf('abc', 2), 'liste')
    expect(result.doc).toBe('- abc')
    expect(result.from).toBe(4)
  })

  it('revient correctement quand on retire la balise', () => {
    const result = run(stateOf('- abc', 4), 'liste')
    expect(result.doc).toBe('abc')
    expect(result.from).toBe(2)
  })

  it('passe derrière le nouveau niveau de titre', () => {
    const result = run(stateOf('# Titre', 2), 'titre')
    expect(result.doc).toBe('## Titre')
    expect(result.from).toBe(3)
  })
})

describe('citation', () => {
  it('pose puis retire le chevron', () => {
    const posee = run(stateOf('cité', 0), 'citation')
    expect(posee.doc).toBe('> cité')
    expect(run(stateOf(posee.doc, 0), 'citation').doc).toBe('cité')
  })
})

describe('lien', () => {
  it('sélectionne l’URL à remplacer', () => {
    const result = run(stateOf('Memolog', 0, 7), 'lien')
    expect(result.doc).toBe('[Memolog](url)')
    expect(result.doc.slice(result.from, result.to)).toBe('url')
  })

  it('pose une coquille et place le curseur dans les crochets', () => {
    const result = run(stateOf('', 0), 'lien')
    expect(result.doc).toBe('[](url)')
    expect(result.from).toBe(1)
  })
})

describe('rechargement du document', () => {
  /** Rejoue la réécriture, pour vérifier qu'elle donne bien le texte attendu. */
  function apply(current: string, next: string): string {
    const change = minimalChange(current, next)
    if (change === null) return current
    return current.slice(0, change.from) + change.insert + current.slice(change.to)
  }

  it('ne touche à rien quand le texte est identique', () => {
    expect(minimalChange('abc', 'abc')).toBeNull()
  })

  it('ne réécrit que le saut de ligne ajouté par l’enregistrement', () => {
    // Le cas qui ramenait le curseur au début après chaque autosave.
    const change = minimalChange('Mon texte', 'Mon texte\n')
    expect(change).toEqual({ from: 9, to: 9, insert: '\n' })
  })

  it('ne réécrit que le milieu modifié', () => {
    const change = minimalChange('début MILIEU fin', 'début autre fin')
    expect(change?.from).toBe(6)
    expect(change?.insert).toBe('autre')
  })

  it('redonne exactement le texte visé', () => {
    const cas: Array<[string, string]> = [
      ['', 'tout neuf'],
      ['à supprimer', ''],
      ['# Titre\n\ncorps', '# Titre\n\ncorps\n'],
      ['aaa', 'aaaa'],
      ['aaaa', 'aaa'],
      ['un\ndeux\ntrois', 'un\nDEUX\ntrois']
    ]
    for (const [current, next] of cas) expect(apply(current, next)).toBe(next)
  })
})

describe('dévoilement de la syntaxe', () => {
  // `# Titre` : la marque est `#` + l'espace, soit 0..2 ; le titre va jusqu'à 7.
  const diese = { from: 0, to: 2 }
  const titre = { from: 0, to: 7 }
  const at = (pos: number): Array<{ from: number; to: number }> => [{ from: pos, to: pos }]

  it('cache la syntaxe quand l’éditeur n’a pas le focus', () => {
    // Sans focus, `ranges` est vide : une note s'ouvre toujours en rendu.
    expect(revealsMark([], diese, null)).toBe(false)
    expect(revealsMark([], diese, titre)).toBe(false)
  })

  it('ne montre le `#` que si le curseur est dessus', () => {
    expect(revealsMark(at(0), diese, null)).toBe(true)
    expect(revealsMark(at(2), diese, null)).toBe(true)
    // Écrire à la fin du titre ne doit plus le faire surgir.
    expect(revealsMark(at(6), diese, null)).toBe(false)
  })

  it('montre une marque en ligne dès qu’on est dans ce qu’elle délimite', () => {
    // `un **gras** ici` : les `**` en 3..5, le gras entier en 3..11.
    const etoiles = { from: 3, to: 5 }
    const gras = { from: 3, to: 11 }
    expect(revealsMark(at(7), etoiles, gras)).toBe(true)
    expect(revealsMark(at(13), etoiles, gras)).toBe(false)
  })

  it('dévoile ce qu’une sélection recouvre', () => {
    expect(revealsMark([{ from: 0, to: 20 }], diese, null)).toBe(true)
  })
})

describe('contexte du curseur', () => {
  it('reconnaît ce que le curseur touche', () => {
    expect([...editorContext(at('un **m|ot**')).tools]).toContain('gras')
    expect([...editorContext(at('- [ ] à f|aire')).tools]).toContain('case')
    expect([...editorContext(at('> ci|té')).tools]).toContain('citation')
    expect(editorContext(at('## Ti|tre')).heading).toBe(2)
    expect(editorContext(at('texte n|u')).tools.size).toBe(0)
  })
})
