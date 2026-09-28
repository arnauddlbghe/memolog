<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { api, errorMessage } from '../api'
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const root = ref('')
const launchAtLogin = ref(false)
const busy = ref(false)
const error = ref<string | null>(null)

const shortcut = navigator.platform.includes('Mac') ? 'Cmd + Maj + Espace' : 'Ctrl + Maj + Espace'

onMounted(() => {
  root.value = settings.settings?.root ?? ''
})

async function choose(): Promise<void> {
  const picked = await api.vault.choose()
  if (picked !== null) root.value = picked
}

async function start(): Promise<void> {
  busy.value = true
  try {
    await settings.completeOnboarding(root.value, launchAtLogin.value)
    error.value = null
  } catch (cause) {
    error.value = errorMessage(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="onboarding">
    <div class="card">
      <h1>Memolog</h1>

      <p class="lead">
        Vos notes sont de simples fichiers Markdown sur votre ordinateur. Pas de compte, pas de
        serveur, rien n'est envoyé sur Internet. Vous pouvez les ouvrir, les sauvegarder ou les
        modifier avec n'importe quel autre éditeur.
      </p>

      <section class="field">
        <label for="root">Où ranger vos notes&nbsp;?</label>
        <div class="field__row">
          <input id="root" v-model="root" type="text" spellcheck="false" />
          <button class="btn" type="button" @click="choose">Parcourir…</button>
        </div>
        <p class="hint faint">
          Memolog y créera <code>journal/</code>, <code>taches.md</code> et vos dossiers. Tout votre
          contenu reste à cet endroit&nbsp;; seuls les réglages de l'application vivent ailleurs.
        </p>
      </section>

      <section class="explain">
        <h2>Comment ça marche</h2>
        <p>
          Memolog vit en arrière-plan&nbsp;: <strong>{{ shortcut }}</strong> l'affiche, le même
          raccourci la masque. Fermer la fenêtre ne quitte pas l'application — elle reste dans la
          barre système, prête à revenir instantanément.
        </p>
      </section>

      <section class="field field--check">
        <label class="check">
          <input v-model="launchAtLogin" type="checkbox" />
          <span>
            <strong>Lancer Memolog au démarrage de l'ordinateur</strong>
            <span class="hint faint">
              Décoché&nbsp;: l'application ne se lancera que lorsque vous l'ouvrirez vous-même.
              Modifiable à tout moment dans les paramètres.
            </span>
          </span>
        </label>
      </section>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button class="btn btn--primary" type="button" :disabled="busy || root.trim() === ''" @click="start">
          Commencer
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.onboarding {
  height: 100%;
  overflow: auto;
  display: grid;
  place-items: center;
  padding: 32px 20px;
  background: var(--bg-sunken);
}

.card {
  width: min(620px, 100%);
  padding: 28px 30px 24px;
  background: var(--bg-raised);
  border: 1px solid var(--border);
  border-radius: 12px;
}

h1 {
  margin: 0 0 12px;
  font-size: 26px;
  letter-spacing: -0.01em;
}

h2 {
  margin: 0 0 6px;
  font-size: 14px;
}

.lead {
  margin: 0 0 22px;
  color: var(--text-muted);
  line-height: 1.55;
}

.field {
  margin-bottom: 20px;
}

.field label {
  display: block;
  font-weight: 600;
  margin-bottom: 6px;
}

.field__row {
  display: flex;
  gap: 8px;
}

.field__row input {
  flex: 1;
  min-width: 0;
}

.hint {
  display: block;
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.5;
}

.explain {
  padding: 14px 16px;
  margin-bottom: 20px;
  background: var(--bg-sunken);
  border-radius: var(--radius);
}

.explain p {
  margin: 0;
  color: var(--text-muted);
  line-height: 1.55;
}

.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  font-weight: 400;
}

.check input {
  margin-top: 2px;
}

.check strong {
  display: block;
}

.error {
  color: var(--danger);
  margin: 0 0 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

code {
  font-family: var(--mono);
  font-size: 12px;
}
</style>
