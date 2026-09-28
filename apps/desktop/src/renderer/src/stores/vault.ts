import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import type { NoteContent, TreeEntry } from '@shared/types'

import { api, errorMessage } from '../api'

const AUTOSAVE_DELAY = 600

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

/**
 * Arborescence et note ouverte.
 *
 * Une seule note est chargée en mémoire à la fois ; l'arbre ne connaît que
 * les dossiers effectivement dépliés.
 */
export const useVaultStore = defineStore('vault', () => {
  const children = ref<Record<string, TreeEntry[]>>({})
  const expanded = ref<Set<string>>(new Set(['']))
  const selectedPath = ref<string | null>(null)

  const note = shallowRef<NoteContent | null>(null)
  const content = ref('')
  const baseMtimeMs = ref(0)
  const saveState = ref<SaveState>('saved')
  const lastError = ref<string | null>(null)

  /** Version disque en attente d'arbitrage, quand la note a changé dehors. */
  const conflict = shallowRef<NoteContent | null>(null)

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  /** mtime des écritures que nous venons de faire, pour ignorer nos propres échos. */
  const ownWrites = new Set<number>()

  const isDirty = computed(() => saveState.value === 'dirty' || saveState.value === 'saving')
  const rootEntries = computed(() => children.value[''] ?? [])

  async function loadDir(dir: string): Promise<void> {
    try {
      children.value = { ...children.value, [dir]: await api.tree.list(dir) }
    } catch (error) {
      lastError.value = errorMessage(error)
    }
  }

  async function refreshDir(dir: string): Promise<void> {
    if (dir in children.value) await loadDir(dir)
  }

  function isExpanded(dir: string): boolean {
    return expanded.value.has(dir)
  }

  async function toggleDir(dir: string): Promise<void> {
    const next = new Set(expanded.value)
    if (next.has(dir)) {
      next.delete(dir)
    } else {
      next.add(dir)
      if (!(dir in children.value)) await loadDir(dir)
    }
    expanded.value = next
  }

  async function expandTo(path: string): Promise<void> {
    const parts = path.split('/').slice(0, -1)
    const next = new Set(expanded.value)
    let current = ''
    for (const part of parts) {
      current = current === '' ? part : `${current}/${part}`
      next.add(current)
      if (!(current in children.value)) await loadDir(current)
    }
    expanded.value = next
  }

  async function openNote(path: string, options: { reveal?: boolean } = {}): Promise<void> {
    await flushSave()
    try {
      const loaded = await api.notes.read(path)
      note.value = loaded
      content.value = loaded.content
      baseMtimeMs.value = loaded.mtimeMs
      selectedPath.value = path
      conflict.value = null
      saveState.value = 'saved'
      lastError.value = null
      if (options.reveal === true) await expandTo(path)
    } catch (error) {
      lastError.value = errorMessage(error)
    }
  }

  function closeNote(): void {
    note.value = null
    content.value = ''
    selectedPath.value = null
    conflict.value = null
  }

  function setContent(next: string): void {
    if (note.value === null || next === content.value) return
    content.value = next
    saveState.value = 'dirty'
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void save(), AUTOSAVE_DELAY)
  }

  /**
   * Enregistre la note ouverte. En cas de conflit, rien n'est écrit : la
   * version du disque est mise de côté pour que l'utilisateur tranche.
   */
  async function save(options: { force?: boolean } = {}): Promise<void> {
    const current = note.value
    if (current === null || saveState.value === 'saved') return
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }

    saveState.value = 'saving'
    try {
      const result = await api.notes.write(
        current.path,
        content.value,
        options.force === true ? undefined : baseMtimeMs.value
      )
      if (!result.ok) {
        conflict.value = result.conflict ?? null
        saveState.value = 'dirty'
        return
      }
      baseMtimeMs.value = result.mtimeMs
      ownWrites.add(result.mtimeMs)
      note.value = { ...current, mtimeMs: result.mtimeMs }
      saveState.value = 'saved'
      lastError.value = null
    } catch (error) {
      saveState.value = 'error'
      lastError.value = errorMessage(error)
    }
  }

  async function flushSave(): Promise<void> {
    if (saveState.value === 'dirty') await save()
  }

  // --- Conflits -------------------------------------------------------------

  /** Garde le texte de l'éditeur et écrase la version du disque. */
  async function resolveKeepMine(): Promise<void> {
    conflict.value = null
    await save({ force: true })
  }

  /** Abandonne les modifications locales au profit du fichier sur le disque. */
  function resolveTakeDisk(): void {
    const disk = conflict.value
    if (disk === null) return
    note.value = disk
    content.value = disk.content
    baseMtimeMs.value = disk.mtimeMs
    conflict.value = null
    saveState.value = 'saved'
  }

  /**
   * Réaction à une modification détectée sur le disque.
   * Sans modification locale en cours, le rechargement est silencieux ;
   * sinon on prépare le bandeau de conflit, sans rien écraser.
   */
  async function handleExternalChange(path: string): Promise<void> {
    const current = note.value
    if (current === null || current.path !== path) return

    let disk: NoteContent
    try {
      disk = await api.notes.read(path)
    } catch {
      return
    }
    if (disk.mtimeMs === baseMtimeMs.value) return
    if (ownWrites.has(disk.mtimeMs)) {
      ownWrites.delete(disk.mtimeMs)
      baseMtimeMs.value = disk.mtimeMs
      return
    }

    if (!isDirty.value) {
      note.value = disk
      content.value = disk.content
      baseMtimeMs.value = disk.mtimeMs
      return
    }
    conflict.value = disk
  }

  function handleExternalRemoval(path: string): void {
    if (note.value?.path === path) {
      lastError.value = 'Cette note a été supprimée ou déplacée en dehors de Memolog.'
      closeNote()
    }
  }

  // --- Opérations sur l'arborescence ---------------------------------------

  async function createNote(dir: string, name?: string): Promise<void> {
    const created = await api.notes.create(dir, name)
    await loadDir(dir)
    await openNote(created.path, { reveal: true })
  }

  async function createFolder(dir: string, name: string): Promise<void> {
    await api.notes.createFolder(dir, name)
    await loadDir(dir)
  }

  async function rename(path: string, newName: string): Promise<void> {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const next = await api.notes.rename(path, newName)
    await loadDir(parent)
    if (selectedPath.value === path) await openNote(next)
  }

  async function move(path: string, newDir: string): Promise<void> {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    const next = await api.notes.move(path, newDir)
    await Promise.all([loadDir(parent), loadDir(newDir)])
    if (selectedPath.value === path) await openNote(next, { reveal: true })
  }

  async function remove(path: string): Promise<void> {
    const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    await api.notes.remove(path)
    await loadDir(parent)
    if (selectedPath.value === path) closeNote()
  }

  async function openJournalToday(): Promise<void> {
    await flushSave()
    const today = await api.journal.today()
    await loadDir('journal')
    await openNote(today.path, { reveal: true })
  }

  /** Recharge tout : utilisé après un changement de dossier de rangement. */
  async function reset(): Promise<void> {
    children.value = {}
    expanded.value = new Set([''])
    closeNote()
    saveState.value = 'saved'
    await loadDir('')
  }

  return {
    children,
    expanded,
    selectedPath,
    note,
    content,
    saveState,
    lastError,
    conflict,
    isDirty,
    rootEntries,
    loadDir,
    refreshDir,
    isExpanded,
    toggleDir,
    expandTo,
    openNote,
    closeNote,
    setContent,
    save,
    flushSave,
    resolveKeepMine,
    resolveTakeDisk,
    handleExternalChange,
    handleExternalRemoval,
    createNote,
    createFolder,
    rename,
    move,
    remove,
    openJournalToday,
    reset
  }
})
