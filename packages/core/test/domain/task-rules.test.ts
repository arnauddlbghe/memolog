import { describe, expect, it } from 'vitest'

import { TASKS_FILE, parseTaskDocument } from '../../src/adapters/markdown/task-file.js'
import {
  archivableTasks,
  archiveYearOf,
  dormantTasks,
  highestTaskId,
  nextState
} from '../../src/domain/task-rules.js'

const AT = new Date(2026, 8, 28)

/**
 * Les règles sont pures ; on se sert du parseur Markdown seulement pour
 * fabriquer commodément un jeu de tâches réaliste.
 */
const DOC = `## Infra

- [/] Relancer l'équipe infra ^t42 [créée:: 2026-09-10] [maj:: 2026-09-14]
- [ ] Documenter la bascule ^t47 [créée:: 2026-09-21] [maj:: 2026-09-21]

## Divers

- [x] Racheter du café ^t44 [créée:: 2026-09-12] [maj:: 2026-09-20]
`

describe('règles des tâches', () => {
  const tasks = parseTaskDocument(TASKS_FILE, DOC).tasks

  it('cycle d états au clic', () => {
    expect(nextState('a-faire')).toBe('en-cours')
    expect(nextState('en-cours')).toBe('terminee')
    expect(nextState('terminee')).toBe('a-faire')
    // Les états hors cycle y reviennent par « à faire ».
    expect(nextState('reportee')).toBe('a-faire')
    expect(nextState('abandonnee')).toBe('a-faire')
  })

  it('repère les tâches qui dorment', () => {
    // t42 : maj 2026-09-14, soit 14 jours ; t47 : 7 jours.
    expect(dormantTasks(tasks, 7, AT).map((task) => task.id)).toEqual(['t42', 't47'])
    expect(dormantTasks(tasks, 10, AT).map((task) => task.id)).toEqual(['t42'])
  })

  it('n archive que les tâches fermées et assez anciennes', () => {
    expect(archivableTasks(tasks, 7, AT).map((task) => task.id)).toEqual(['t44'])
    expect(archivableTasks(tasks, 30, AT)).toEqual([])
  })

  it('archive dans l année de la date de mise à jour', () => {
    expect(archiveYearOf(tasks[2]!, AT)).toBe('2026')
  })

  it('connaît le plus grand identifiant utilisé', () => {
    expect(highestTaskId(tasks)).toBe(47)
  })
})
