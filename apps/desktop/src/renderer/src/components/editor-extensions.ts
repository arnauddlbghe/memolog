import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'

import type { Task } from '@shared/types'

/** `/t Texte #projet` en début de ligne : commande de création de tâche. */
export const TASK_COMMAND = /^\s*\/t\s+(.+?)\s*$/i

export interface TaskCommand {
  /** Texte de la tâche, tags compris. */
  text: string
  /** Début et fin de la ligne à remplacer par la référence. */
  from: number
  to: number
}

/**
 * Entrée validant une commande `/t`.
 *
 * On intercepte `Entrée` : si la ligne courante est une commande, on la
 * signale au parent, qui créera la tâche et remplacera la ligne par la
 * référence `@tNN`. Sinon, on laisse `Entrée` faire son travail habituel.
 */
export function taskCommandKeymap(run: (command: TaskCommand) => void): Extension {
  return keymap.of([
    {
      key: 'Enter',
      run: (view) => {
        const line = view.state.doc.lineAt(view.state.selection.main.head)
        const match = TASK_COMMAND.exec(line.text)
        if (match === null) return false
        run({ text: (match[1] ?? '').trim(), from: line.from, to: line.to })
        return true
      }
    }
  ])
}

/**
 * Autocomplétion des références `@t…` sur les tâches actives.
 * La liste est fournie par le parent, qui la tient de l'index.
 */
export function refCompletion(tasks: () => Task[]): Extension {
  return autocompletion({
    override: [
      (context: CompletionContext): CompletionResult | null => {
        const before = context.matchBefore(/@t?\w*/)
        if (before === null || (before.from === before.to && !context.explicit)) return null

        const options: Completion[] = tasks().map((task) => ({
          label: `@${task.id}`,
          detail: task.project,
          info: task.text,
          apply: `@${task.id}`
        }))

        return { from: before.from, options, validFor: /^@t?\w*$/ }
      }
    ]
  })
}

/** Rendu des étiquettes et des métadonnées atténuées. */
export const editorTheme = EditorView.baseTheme({
  '.memolog-dim': { opacity: '0.42' },
  '.memolog-ref': {
    padding: '0 6px',
    borderRadius: '999px',
    background: 'var(--accent-soft)',
    color: 'var(--accent)',
    fontSize: '0.9em',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  '.memolog-ref--orphan': {
    background: 'transparent',
    border: '1px dashed var(--border-strong)',
    color: 'var(--text-faint)'
  }
})
