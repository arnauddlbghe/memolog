<script setup lang="ts">
import { onMounted, ref } from 'vue'

import type { MemoryMetrics, ThemeSetting, VaultChangePreview } from '@shared/types'

import { api, errorMessage } from '../api'
import { useSettingsStore } from '../stores/settings'
import { useUiStore } from '../stores/ui'
import { useVaultStore } from '../stores/vault'

const settings = useSettingsStore()
const vault = useVaultStore()
const ui = useUiStore()

const capturing = ref<'shortcut' | 'journalShortcut' | null>(null)
const shortcutError = ref<string | null>(null)
const metrics = ref<MemoryMetrics | null>(null)
const pending = ref<{ root: string; preview: VaultChangePreview } | null>(null)
const busy = ref(false)

onMounted(async () => {
  if (settings.info?.isDev === true) metrics.value = await api.app.metrics()
})

async function patch(field: string, value: unknown): Promise<void> {
  await settings.update({ [field]: value })
}

// --- Dossier de rangement ---------------------------------------------------

async function chooseRoot(): Promise<void> {
  const picked = await api.vault.choose()
  if (picked === null || picked === settings.root) return
  pending.value = { root: picked, preview: await api.vault.previewChange(picked) }
}

async function confirmRoot(move: boolean): Promise<void> {
  if (pending.value === null) return
  busy.value = true
  try {
    await settings.setRoot(pending.value.root, move)
    await vault.reset()
    ui.notify(move ? 'Notes déplacées dans le nouveau dossier.' : 'Nouveau dossier ouvert.')
    pending.value = null
  } catch (error) {
    ui.notify(errorMessage(error), 'error')
  } finally {
    busy.value = false
  }
}

// --- Raccourcis --------------------------------------------------------------

/** Capture une combinaison de touches et la traduit en accélérateur Electron. */
async function onCapture(event: KeyboardEvent): Promise<void> {
  if (capturing.value === null) return
  event.preventDefault()

  const key = event.key
  if (key === 'Escape') {
    capturing.value = null
    return
  }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return

  const parts: string[] = []
  if (event.metaKey) parts.push('Command')
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(key === ' ' ? 'Space' : key.length === 1 ? key.toUpperCase() : key)

  const accelerator = parts.join('+')
  const status = await api.app.testShortcut(accelerator)
  if (!status.registered) {
    shortcutError.value = status.error ?? 'Ce raccourci est indisponible.'
    return
  }
  shortcutError.value = null
  await patch(capturing.value, accelerator)
  capturing.value = null
}

async function rebuildIndex(): Promise<void> {
  busy.value = true
  const status = await api.search.rebuild()
  busy.value = false
  ui.notify(`Index reconstruit : ${status.noteCount} note(s), ${status.taskCount} tâche(s).`)
}

async function refreshMetrics(): Promise<void> {
  metrics.value = await api.app.metrics()
}
</script>

<template>
  <div v-if="settings.settings" class="settings" @keydown="onCapture">
    <h1>Paramètres</h1>

    <!-- Dossier de rangement -->
    <section class="block">
      <h2>Dossier de rangement</h2>
      <p class="hint faint">
        Tout votre contenu est rangé ici&nbsp;: notes, <code>journal/</code>,
        <code>taches.md</code>, fiches projet. Seuls les réglages et le cache d'index vivent dans le
        dossier de configuration de l'application.
      </p>

      <div class="row">
        <input :value="settings.root" type="text" readonly aria-label="Dossier actuel" />
        <button class="btn" type="button" @click="chooseRoot">Parcourir…</button>
        <button class="btn" type="button" @click="api.vault.reveal()">Ouvrir</button>
      </div>

      <div v-if="pending" class="confirm" role="dialog" aria-label="Changer de dossier">
        <p>
          Nouveau dossier&nbsp;: <code>{{ pending.root }}</code>
        </p>
        <p>
          {{ pending.preview.noteCount }} note(s) et {{ pending.preview.folderCount }} dossier(s)
          sont actuellement dans <code>{{ pending.preview.currentRoot }}</code
          >.
          <span v-if="pending.preview.targetExists && !pending.preview.targetEmpty" class="warn">
            Le dossier visé contient déjà des fichiers&nbsp;; rien n'y sera écrasé.
          </span>
        </p>
        <div class="confirm__actions">
          <button class="btn btn--primary" type="button" :disabled="busy" @click="confirmRoot(true)">
            Déplacer mes notes
          </button>
          <button class="btn" type="button" :disabled="busy" @click="confirmRoot(false)">
            Laisser sur place
          </button>
          <button class="btn btn--ghost" type="button" :disabled="busy" @click="pending = null">
            Annuler
          </button>
        </div>
      </div>
    </section>

    <!-- Raccourcis -->
    <section class="block">
      <h2>Raccourcis globaux</h2>
      <div class="row">
        <label for="sc-show">Afficher / masquer</label>
        <button
          id="sc-show"
          class="btn shortcut"
          type="button"
          @click="capturing = capturing === 'shortcut' ? null : 'shortcut'"
        >
          {{ capturing === 'shortcut' ? 'Appuyez sur la combinaison…' : settings.settings.shortcut }}
        </button>
      </div>
      <div class="row">
        <label for="sc-journal">Note du jour</label>
        <button
          id="sc-journal"
          class="btn shortcut"
          type="button"
          @click="capturing = capturing === 'journalShortcut' ? null : 'journalShortcut'"
        >
          {{
            capturing === 'journalShortcut'
              ? 'Appuyez sur la combinaison…'
              : settings.settings.journalShortcut || 'Aucun'
          }}
        </button>
      </div>
      <p v-if="shortcutError" class="warn">{{ shortcutError }}</p>
      <p v-else-if="settings.shortcutIssue" class="warn">{{ settings.shortcutIssue.error }}</p>
    </section>

    <!-- Démarrage -->
    <section class="block">
      <h2>Démarrage</h2>
      <label class="check">
        <input
          type="checkbox"
          :checked="settings.settings.launchAtLogin"
          @change="patch('launchAtLogin', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <strong>Lancer Memolog au démarrage de l'ordinateur</strong>
          <span class="hint faint">
            Décoché, l'application ne démarre que lorsque vous l'ouvrez vous-même. Ce réglage est
            appliqué au système immédiatement, dans les deux sens.
          </span>
        </span>
      </label>
      <label class="check">
        <input
          type="checkbox"
          :checked="settings.settings.startHidden"
          @change="patch('startHidden', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <strong>Démarrer masqué dans la barre système</strong>
          <span class="hint faint">La fenêtre n'apparaît qu'au raccourci ou au clic sur l'icône.</span>
        </span>
      </label>
    </section>

    <!-- Tâches -->
    <section class="block">
      <h2>Tâches</h2>
      <div class="row">
        <label for="dormant">Une tâche «&nbsp;dort&nbsp;» après</label>
        <input
          id="dormant"
          class="number"
          type="number"
          min="1"
          max="365"
          :value="settings.settings.dormantAfterDays"
          @change="patch('dormantAfterDays', Number(($event.target as HTMLInputElement).value))"
        />
        <span class="faint">jours sans mise à jour</span>
      </div>
      <div class="row">
        <label for="archive">Archiver les tâches fermées après</label>
        <input
          id="archive"
          class="number"
          type="number"
          min="1"
          max="3650"
          :value="settings.settings.archiveAfterDays"
          @change="patch('archiveAfterDays', Number(($event.target as HTMLInputElement).value))"
        />
        <span class="faint">jours</span>
      </div>
      <label class="check">
        <input
          type="checkbox"
          :checked="settings.settings.autoArchive"
          @change="patch('autoArchive', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <strong>Archiver automatiquement au démarrage</strong>
          <span class="hint faint">
            Les tâches concernées sont déplacées vers <code>taches/archive-AAAA.md</code>&nbsp;;
            rien n'est supprimé.
          </span>
        </span>
      </label>
    </section>

    <!-- Journal d'activité -->
    <section class="block">
      <h2>Journal d'activité</h2>
      <div class="row">
        <label for="burst">Regrouper les éditions d'un même fichier pendant</label>
        <input
          id="burst"
          class="number"
          type="number"
          min="1"
          max="240"
          :value="settings.settings.burstWindowMinutes"
          @change="patch('burstWindowMinutes', Number(($event.target as HTMLInputElement).value))"
        />
        <span class="faint">minutes</span>
      </div>
      <p class="hint faint">
        Les événements sont écrits dans <code>.memolog/activite/</code>, en ajout seulement.
      </p>
    </section>

    <!-- Apparence -->
    <section class="block">
      <h2>Apparence</h2>
      <div class="row">
        <label for="theme">Thème</label>
        <select
          id="theme"
          :value="settings.settings.theme"
          @change="patch('theme', ($event.target as HTMLSelectElement).value as ThemeSetting)"
        >
          <option value="system">Système</option>
          <option value="light">Clair</option>
          <option value="dark">Sombre</option>
        </select>
      </div>
    </section>

    <!-- À propos -->
    <section class="block">
      <h2>À propos</h2>
      <p class="hint faint">
        Memolog est une application locale&nbsp;: pas de compte, pas de serveur, aucune donnée
        envoyée sur Internet. Vos notes sont des fichiers Markdown que n'importe quel éditeur peut
        lire. Elle vit en arrière-plan&nbsp;: <code>{{ settings.settings.shortcut }}</code> l'affiche
        et la masque, et fermer la fenêtre ne quitte pas l'application.
      </p>
      <dl class="about">
        <dt>Version</dt>
        <dd>{{ settings.info?.version }} · Electron {{ settings.info?.electron }}</dd>
        <dt>Dossier de notes</dt>
        <dd class="mono">{{ settings.info?.root }}</dd>
        <dt>Configuration</dt>
        <dd class="mono">{{ settings.info?.configDir }}</dd>
      </dl>
      <div class="row">
        <button class="btn" type="button" :disabled="busy" @click="rebuildIndex">
          Reconstruire l'index
        </button>
      </div>
    </section>

    <!-- Mesure mémoire, en développement -->
    <section v-if="settings.info?.isDev" class="block">
      <h2>Mémoire (développement)</h2>
      <div class="row">
        <button class="btn" type="button" @click="refreshMetrics">Mesurer</button>
        <span v-if="metrics" class="faint">{{ metrics.totalMb }} Mo au total</span>
      </div>
      <ul v-if="metrics" class="metrics mono faint">
        <li v-for="(item, index) in metrics.perProcess" :key="index">
          {{ item.type }} — {{ item.mb }} Mo
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.settings {
  height: 100%;
  overflow: auto;
  padding: 18px 24px 60px;
  max-width: 760px;
}

h1 {
  margin: 0 0 6px;
  font-size: 18px;
}

h2 {
  margin: 0 0 8px;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.block {
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.row input[type='text'] {
  flex: 1;
  min-width: 200px;
}

.number {
  width: 76px;
}

.shortcut {
  font-family: var(--mono);
  min-width: 220px;
}

.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 10px;
}

.check input {
  margin-top: 3px;
}

.check strong {
  display: block;
  font-weight: 600;
}

.hint {
  display: block;
  margin: 4px 0 10px;
  font-size: 12px;
  line-height: 1.55;
}

.warn {
  color: var(--danger);
  font-size: 12px;
}

.confirm {
  margin-top: 10px;
  padding: 12px 14px;
  background: var(--warning-bg);
  border: 1px solid var(--warning-border);
  border-radius: var(--radius);
}

.confirm p {
  margin: 0 0 8px;
  line-height: 1.5;
}

.confirm__actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.about {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 4px 12px;
  margin: 0 0 12px;
  font-size: 12px;
}

.about dt {
  color: var(--text-muted);
}

.about dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.metrics {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 12px;
}

code {
  font-family: var(--mono);
  font-size: 12px;
}
</style>
