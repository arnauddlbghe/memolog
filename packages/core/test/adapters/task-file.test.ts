import { describe, expect, it } from 'vitest'

import {
  TASKS_FILE,
  addTaskToDocument,
  setTaskDescriptionInDocument,
  ensureTaskMetadata,
  formatTaskLine,
  parseTaskDocument,
  parseTaskLine,
  removeTasksFromDocument,
  renderTaskDocument,
  setTaskStateInDocument,
  setTaskTextInDocument
} from '../../src/adapters/markdown/task-file.js'
import { stateFromMark } from '../../src/adapters/markdown/task-marks.js'

const AT = new Date(2026, 8, 28) // 28 septembre 2026

const DOC = `# Mes tâches

## Infra

- [/] Relancer l'équipe infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]
- [ ] Documenter la bascule ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]

Une note libre entre deux sections, à ne pas perdre.

## Divers

- [x] Racheter du café ^t44 [créée:: 2026-09-12] [maj:: 2026-09-20]
`

describe('parseTaskLine', () => {
  it('décompose case, texte, identifiant et champs', () => {
    const parsed = parseTaskLine(
      "- [/] Relancer l'équipe #infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]"
    )
    expect(parsed).toMatchObject({
      state: 'en-cours',
      text: "Relancer l'équipe #infra",
      id: 't42',
      created: '2026-09-10',
      updated: '2026-09-14',
      indent: 0
    })
  })

  it('lit les cinq états, et ramène une marque inconnue à « à faire »', () => {
    expect(parseTaskLine('- [ ] a')?.state).toBe('a-faire')
    expect(parseTaskLine('- [/] a')?.state).toBe('en-cours')
    expect(parseTaskLine('- [>] a')?.state).toBe('reportee')
    expect(parseTaskLine('- [x] a')?.state).toBe('terminee')
    expect(parseTaskLine('- [X] a')?.state).toBe('terminee')
    expect(parseTaskLine('- [-] a')?.state).toBe('abandonnee')
    expect(stateFromMark('?')).toBe('a-faire')
  })

  it('préserve les champs en ligne inconnus', () => {
    const parsed = parseTaskLine('- [ ] Payer ^t3 [échéance:: 2026-10-01] [priorité:: haute]')
    expect(parsed?.extraFields).toEqual({ 'échéance': '2026-10-01', 'priorité': 'haute' })
    expect(parsed?.text).toBe('Payer')
  })

  it('accepte une clé sans accent ni casse exacte', () => {
    expect(parseTaskLine('- [ ] a ^t1 [Creee:: 2026-01-01] [MAJ:: 2026-02-02]')).toMatchObject({
      created: '2026-01-01',
      updated: '2026-02-02'
    })
  })

  it('ne confond pas une puce ordinaire avec une tâche', () => {
    expect(parseTaskLine('- Simple puce')).toBeNull()
    expect(parseTaskLine('## Titre')).toBeNull()
  })
})

describe('formatTaskLine', () => {
  it('écrit la forme canonique : texte, identifiant, puis champs', () => {
    expect(
      formatTaskLine({
        indent: 0,
        state: 'en-cours',
        text: 'Relancer',
        id: 't42',
        created: '2026-09-10',
        updated: '2026-09-14'
      })
    ).toBe('- [/] Relancer ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]')
  })

  it('conserve l indentation et les champs supplémentaires', () => {
    expect(
      formatTaskLine({
        indent: 2,
        state: 'a-faire',
        text: 'Sous-tâche',
        id: 't9',
        created: '2026-01-01',
        updated: '2026-01-01',
        extraFields: { 'échéance': '2026-02-01' }
      })
    ).toBe('  - [ ] Sous-tâche ^t9 [créée:: 2026-01-01] [maj:: 2026-01-01] [échéance:: 2026-02-01]')
  })
})

describe('parseTaskDocument', () => {
  const doc = parseTaskDocument(TASKS_FILE, DOC)

  it('rattache chaque tâche à sa section', () => {
    expect(doc.tasks.map((task) => [task.id, task.project])).toEqual([
      ['t42', 'Infra'],
      ['t47', 'Infra'],
      ['t44', 'Divers']
    ])
  })

  it('note le numéro de ligne de chaque tâche', () => {
    expect(doc.tasks[0]?.line).toBe(5)
  })

  it('range dans « Divers » une tâche écrite avant toute section', () => {
    const orphan = parseTaskDocument(TASKS_FILE, '- [ ] Sans section\n')
    expect(orphan.tasks[0]?.project).toBe('Divers')
  })

  it('relit sans rien perdre', () => {
    expect(renderTaskDocument(doc)).toBe(DOC)
  })
})

describe('ensureTaskMetadata', () => {
  it('complète identifiant et dates d une tâche écrite à la main', () => {
    const doc = parseTaskDocument(TASKS_FILE, '## Infra\n\n- [ ] Écrite à la main\n')
    const result = ensureTaskMetadata(doc, 5, AT)

    expect(result.completed).toHaveLength(1)
    expect(result.nextId).toBe(6)
    expect(renderTaskDocument(result.doc)).toBe(
      '## Infra\n\n- [ ] Écrite à la main ^t5 [créée:: 2026-09-28] [maj:: 2026-09-28]\n'
    )
  })

  it('ne touche pas une tâche déjà complète', () => {
    const doc = parseTaskDocument(TASKS_FILE, DOC)
    const result = ensureTaskMetadata(doc, 50, AT)
    expect(result.completed).toHaveLength(0)
    expect(renderTaskDocument(result.doc)).toBe(DOC)
  })

  it('complète sans faire passer « maj » pour une modification', () => {
    const doc = parseTaskDocument(TASKS_FILE, '- [ ] a ^t1 [créée:: 2026-01-01]\n')
    const result = ensureTaskMetadata(doc, 2, AT)
    // `créée` est conservée telle quelle ; seul `maj`, absent, est ajouté.
    expect(result.completed[0]?.created).toBe('2026-01-01')
    expect(result.completed[0]?.updated).toBe('2026-09-28')
  })
})

describe('modifications', () => {
  it('change l état et met « maj » à jour, sans toucher « créée »', () => {
    const result = setTaskStateInDocument(parseTaskDocument(TASKS_FILE, DOC), 't42', 'terminee', AT)
    expect(result.changed).toBe(true)
    expect(result.previousState).toBe('en-cours')
    expect(result.task).toMatchObject({ state: 'terminee', created: '2026-09-10', updated: '2026-09-28' })
    expect(renderTaskDocument(result.doc)).toContain(
      "- [x] Relancer l'équipe infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-28]"
    )
  })

  it('ne réécrit rien si l état ne change pas', () => {
    const doc = parseTaskDocument(TASKS_FILE, DOC)
    const result = setTaskStateInDocument(doc, 't42', 'en-cours', AT)
    expect(result.changed).toBe(false)
    expect(renderTaskDocument(result.doc)).toBe(DOC)
  })

  it('change le texte en gardant l identifiant', () => {
    const result = setTaskTextInDocument(parseTaskDocument(TASKS_FILE, DOC), 't47', 'Rédiger la bascule', AT)
    expect(result.task.id).toBe('t47')
    expect(result.task.text).toBe('Rédiger la bascule')
    expect(result.previousText).toBe('Documenter la bascule')
  })

  it('préserve le texte libre entre les sections', () => {
    const result = setTaskStateInDocument(parseTaskDocument(TASKS_FILE, DOC), 't42', 'terminee', AT)
    expect(renderTaskDocument(result.doc)).toContain('Une note libre entre deux sections')
  })

  it('refuse une tâche inconnue', () => {
    expect(() => setTaskStateInDocument(parseTaskDocument(TASKS_FILE, DOC), 't999', 'terminee', AT)).toThrow(
      /introuvable/
    )
  })
})

describe('ajout', () => {
  it('ajoute à la fin de la section existante', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, DOC), 'Nouvelle tâche', 't50', {
      project: 'Infra',
      at: AT
    })
    const lines = renderTaskDocument(result.doc).split('\n')
    expect(lines[6]).toBe('- [ ] Nouvelle tâche ^t50 [créée:: 2026-09-28] [maj:: 2026-09-28]')
    expect(result.task.project).toBe('Infra')
  })

  it('crée la section quand le projet est nouveau', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, DOC), 'Première du projet', 't51', {
      project: 'Client ACME',
      at: AT
    })
    expect(renderTaskDocument(result.doc)).toContain('## Client ACME')
    expect(result.task.project).toBe('Client ACME')
  })

  it('retrouve la section malgré une différence d accents ou de casse', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, DOC), 'Encore une', 't52', {
      project: 'INFRA',
      at: AT
    })
    expect(renderTaskDocument(result.doc).match(/## Infra/g)).toHaveLength(1)
  })

  it('range dans « Divers » par défaut', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, ''), 'Sans projet', 't1', { at: AT })
    expect(result.task.project).toBe('Divers')
    expect(renderTaskDocument(result.doc)).toBe(
      '## Divers\n\n- [ ] Sans projet ^t1 [créée:: 2026-09-28] [maj:: 2026-09-28]\n'
    )
  })

  it('refuse un texte vide', () => {
    expect(() => addTaskToDocument(parseTaskDocument(TASKS_FILE, ''), '   ', 't1')).toThrow()
  })
})

describe('retrait', () => {
  it('enlève les lignes visées et garde le reste', () => {
    const next = removeTasksFromDocument(parseTaskDocument(TASKS_FILE, DOC), ['t44'])
    expect(next.tasks.map((task) => task.id)).toEqual(['t42', 't47'])
    expect(renderTaskDocument(next)).toContain('## Divers')
  })
})

describe('description', () => {
  const WITH_DESC = `## Infra

- [/] Relancer ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]
  Ils attendent le devis signé.
  Contact : Camille.
- [ ] Documenter ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]
`

  it('rattache les lignes plus indentées à la tâche', () => {
    const doc = parseTaskDocument(TASKS_FILE, WITH_DESC)
    expect(doc.tasks[0]?.description).toBe('Ils attendent le devis signé.\nContact : Camille.')
    expect(doc.tasks[1]?.description).toBe('')
  })

  it('s arrête à une ligne vide ou moins indentée', () => {
    const doc = parseTaskDocument(TASKS_FILE, '- [ ] A ^t1 [créée:: 2026-01-01] [maj:: 2026-01-01]\n  Décrit\n\n  Plus loin\n')
    expect(doc.tasks[0]?.description).toBe('Décrit')
  })

  it('ne confond pas une sous-tâche avec une description', () => {
    const doc = parseTaskDocument(
      TASKS_FILE,
      '- [ ] Parent ^t1 [créée:: 2026-01-01] [maj:: 2026-01-01]\n  - [ ] Enfant ^t2 [créée:: 2026-01-01] [maj:: 2026-01-01]\n'
    )
    expect(doc.tasks).toHaveLength(2)
    expect(doc.tasks[0]?.description).toBe('')
    expect(doc.tasks[1]?.indent).toBe(2)
  })

  it('relit le document sans rien perdre', () => {
    expect(renderTaskDocument(parseTaskDocument(TASKS_FILE, WITH_DESC))).toBe(WITH_DESC)
  })

  it('remplace le bloc entier quand la description change', () => {
    const result = setTaskDescriptionInDocument(
      parseTaskDocument(TASKS_FILE, WITH_DESC),
      't42',
      'Devis signé, bascule planifiée.',
      AT
    )
    expect(result.changed).toBe(true)
    expect(renderTaskDocument(result.doc)).toBe(`## Infra

- [/] Relancer ^t42 [créée:: 2026-09-10] [maj:: 2026-09-28]
  Devis signé, bascule planifiée.
- [ ] Documenter ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]
`)
  })

  it('emporte la description quand l état change', () => {
    const result = setTaskStateInDocument(parseTaskDocument(TASKS_FILE, WITH_DESC), 't42', 'terminee', AT)
    expect(renderTaskDocument(result.doc)).toContain('  Ils attendent le devis signé.')
    expect(result.task.description).toContain('Contact : Camille.')
  })

  it('écrit la description à la création', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, ''), 'Nouvelle', 't1', {
      description: 'Deux lignes\nde contexte.',
      at: AT
    })
    expect(renderTaskDocument(result.doc)).toBe(
      '## Divers\n\n- [ ] Nouvelle ^t1 [créée:: 2026-09-28] [maj:: 2026-09-28]\n  Deux lignes\n  de contexte.\n'
    )
  })

  it('retire la description avec la tâche', () => {
    const next = removeTasksFromDocument(parseTaskDocument(TASKS_FILE, WITH_DESC), ['t42'])
    const text = renderTaskDocument(next)
    expect(text).not.toContain('Camille')
    expect(text).toContain('^t47')
  })

  it('insère une nouvelle tâche après le bloc de la précédente', () => {
    const result = addTaskToDocument(parseTaskDocument(TASKS_FILE, WITH_DESC), 'Encore', 't50', {
      project: 'Infra',
      at: AT
    })
    const lines = renderTaskDocument(result.doc).split('\n')
    // La tâche arrive après « Documenter », pas au milieu d'une description.
    expect(lines[6]).toBe('- [ ] Encore ^t50 [créée:: 2026-09-28] [maj:: 2026-09-28]')
  })
})
