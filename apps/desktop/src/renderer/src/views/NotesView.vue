<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import type { Task, TreeEntry } from '@shared/types'

import { api } from '../api'
import ConflictBanner from '../components/ConflictBanner.vue'
import MarkdownEditor from '../components/MarkdownEditor.vue'
import type { TaskCommand } from '../components/editor-extensions'
import TreeNode from '../components/TreeNode.vue'
import { useTasksStore } from '../stores/tasks'
import { useUiStore } from '../stores/ui'
import { useVaultStore } from '../stores/vault'

const vault = useVaultStore()
const tasks = useTasksStore()
const ui = useUiStore()

const editor = ref<InstanceType<typeof MarkdownEditor> | null>(null)
const refs = ref<Record<string, Task | null>>({})

const isTaskFile = computed(
  () => vault.note?.path === 'taches.md' || vault.note?.path.startsWith('taches/') === true
)

const saveLabel = computed(() => {
  switch (vault.saveState) {
    case 'saving':
      return 'Enregistrement…'
    case 'dirty':
      return 'Modifié'
    case 'error':
      return 'Échec de l’enregistrement'
    default:
      return 'Enregistré'
  }
})

onMounted(() => void vault.loadDir(''))

/** Résout les références `@tNN` du document pour les afficher en étiquettes. */
async function resolveRefs(content: string): Promise<void> {
  const ids = [...content.matchAll(/(^|[^\p{L}\p{N}_@])@t(\d+)\b/gu)].map((match) => `t${match[2]}`)
  const unique = [...new Set(ids)]
  if (unique.length === 0) {
    refs.value = {}
    return
  }
  const resolved = await api.tasks.resolve(unique)
  refs.value = Object.fromEntries(resolved.map((item) => [item.id, item.task]))
}

watch(
  () => vault.note?.path,
  () => void resolveRefs(vault.content)
)

/**
 * `/t Texte #projet` validé dans l'éditeur : la tâche est créée dans
 * `taches.md` et la ligne est remplacée par la référence `@tNN`.
 */
async function onTaskCommand(command: TaskCommand): Promise<void> {
  const project = /(^|\s)#([\p{L}][\p{L}\p{N}_/-]*)/u.exec(command.text)?.[2]
  const task = await tasks.create(command.text, project)
  if (task === null) {
    ui.notify(tasks.error ?? 'La tâche n’a pas pu être créée.', 'error')
    return
  }
  editor.value?.replaceRange(command.from, command.to, `@${task.id}`)
  refs.value = { ...refs.value, [task.id]: task }
  ui.notify(`Tâche ^${task.id} créée dans « ${task.project} ».`)
}

async function onToggleTask(id: string): Promise<void> {
  await tasks.cycle(id)
  if (vault.note !== null) await vault.openNote(vault.note.path)
}

async function newNote(): Promise<void> {
  const dir = currentDir()
  await vault.createNote(dir)
  editor.value?.focus()
}

async function newFolder(): Promise<void> {
  const name = window.prompt('Nom du nouveau dossier')
  if (name === null || name.trim() === '') return
  await vault.createFolder(currentDir(), name.trim())
}

function currentDir(): string {
  const selected = vault.selectedPath
  if (selected === null) return ''
  return selected.includes('/') ? selected.slice(0, selected.lastIndexOf('/')) : ''
}

async function onMenu(entry: TreeEntry, event: MouseEvent): Promise<void> {
  event.preventDefault()
  const action = window.prompt(
    `« ${entry.title} »\n\nTapez :\n  r  pour renommer\n  s  pour supprimer (corbeille)\n  d  pour déplacer`,
    'r'
  )
  if (action === null) return

  try {
    if (action === 'r') {
      const name = window.prompt('Nouveau nom', entry.title)
      if (name !== null && name.trim() !== '') await vault.rename(entry.path, name.trim())
    } else if (action === 's') {
      if (window.confirm(`Envoyer « ${entry.title} » à la corbeille du système ?`)) {
        await vault.remove(entry.path)
        ui.notify('Envoyé à la corbeille du système.')
      }
    } else if (action === 'd') {
      const target = window.prompt('Déplacer vers quel dossier ? (vide = racine)', '')
      if (target !== null) await vault.move(entry.path, target.trim())
    }
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), 'error')
  }
}
</script>

<template>
  <div class="notes">
    <aside class="tree">
      <header class="tree__header">
        <span class="tree__title">Notes</span>
        <span class="tree__actions">
          <button class="btn btn--ghost" type="button" title="Nouvelle note" @click="newNote">
            + note
          </button>
          <button class="btn btn--ghost" type="button" title="Nouveau dossier" @click="newFolder">
            + dossier
          </button>
        </span>
      </header>

      <ul class="tree__list" role="tree">
        <TreeNode
          v-for="entry in vault.rootEntries"
          :key="entry.path"
          :entry="entry"
          :depth="0"
          @open="vault.openNote($event)"
          @menu="onMenu"
        />
      </ul>
      <p v-if="vault.rootEntries.length === 0" class="empty faint">
        Aucune note pour l'instant. Créez-en une avec «&nbsp;+ note&nbsp;».
      </p>
    </aside>

    <section class="pane">
      <template v-if="vault.note">
        <header class="pane__header">
          <h1 class="pane__title">{{ vault.note.title }}</h1>
          <span class="pane__path mono faint">{{ vault.note.path }}</span>
          <span class="pane__state faint">{{ saveLabel }}</span>
        </header>

        <ConflictBanner
          v-if="vault.conflict"
          :disk="vault.conflict"
          :mine="vault.content"
          @keep="vault.resolveKeepMine()"
          @take="vault.resolveTakeDisk()"
        />

        <MarkdownEditor
          ref="editor"
          :model-value="vault.content"
          :refs="refs"
          :task-file="isTaskFile"
          :active-tasks="tasks.active"
          @update:model-value="vault.setContent($event)"
          @toggle-task="onToggleTask"
          @task-command="onTaskCommand"
          @open-task="ui.go('tasks')"
        />
      </template>

      <div v-else class="placeholder faint">
        <p>Sélectionnez une note à gauche, ou créez-en une nouvelle.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.notes {
  display: grid;
  grid-template-columns: 250px 1fr;
  height: 100%;
  min-height: 0;
}

.tree {
  border-right: 1px solid var(--border);
  background: var(--bg-sunken);
  overflow: auto;
  padding-bottom: 12px;
}

.tree__header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 10px 8px 8px 12px;
  background: var(--bg-sunken);
}

.tree__title {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.tree__actions {
  display: flex;
  gap: 2px;
}

.tree__actions .btn {
  padding: 2px 6px;
  font-size: 12px;
}

.tree__list {
  margin: 0;
  padding: 0 6px;
  list-style: none;
}

.empty {
  padding: 8px 14px;
  font-size: 12px;
  line-height: 1.5;
}

.pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.pane__header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
}

.pane__title {
  margin: 0;
  font-size: 16px;
}

.pane__path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane__state {
  font-size: 12px;
}

.placeholder {
  display: grid;
  place-items: center;
  height: 100%;
}
</style>
