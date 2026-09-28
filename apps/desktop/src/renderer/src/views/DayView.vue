<script setup lang="ts">
import { computed, onMounted } from 'vue'

import type { AnyActivityEvent, DayItem } from '@shared/types'

import { useDayStore } from '../stores/day'
import { useUiStore } from '../stores/ui'
import { useVaultStore } from '../stores/vault'

const day = useDayStore()
const ui = useUiStore()
const vault = useVaultStore()

onMounted(() => void day.load())

const heading = computed(() => {
  const [year, month, date] = day.date.split('-').map(Number)
  const parsed = new Date(year ?? 2026, (month ?? 1) - 1, date ?? 1)
  const label = parsed.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
})

/** Les jours à proposer dans le calendrier : ceux qui existent réellement. */
const calendar = computed(() => day.days.slice(0, 30))

function describe(event: AnyActivityEvent): string {
  switch (event.type) {
    case 'tache.creee':
      return `Tâche créée : ${String(event['titre'] ?? '')} (${String(event['projet'] ?? '')})`
    case 'tache.etat':
      return `Tâche ${String(event['tache'] ?? '')} : ${label(String(event['de'] ?? ''))} → ${label(String(event['vers'] ?? ''))}`
    case 'tache.modifiee':
      return `Tâche ${String(event['tache'] ?? '')} renommée : ${String(event['titre'] ?? '')}`
    case 'fichier.edite':
      return `${String(event['fichier'] ?? '')} — ${String(event['lignes'] ?? 0)} ligne(s) modifiée(s)`
    default:
      return event.type
  }
}

function label(state: string): string {
  const labels: Record<string, string> = {
    'a-faire': 'à faire',
    'en-cours': 'en cours',
    reportee: 'reportée',
    terminee: 'terminée',
    abandonnee: 'abandonnée'
  }
  return labels[state] ?? state
}

function authorLabel(author: string): string {
  return author === 'vous' ? 'vous' : author === 'claude' ? 'Claude' : 'hors Memolog'
}

function excerptOf(item: DayItem): string | null {
  if (item.kind !== 'event' || item.event.type !== 'fichier.edite') return null
  const excerpt = String(item.event['extrait'] ?? '').trim()
  return excerpt === '' ? null : excerpt
}

async function openNote(): Promise<void> {
  if (day.view === null) return
  await vault.openNote(day.view.path, { reveal: true })
  ui.go('notes')
}
</script>

<template>
  <div class="day">
    <header class="day__header">
      <div class="day__nav">
        <button class="btn" type="button" title="Jour précédent" @click="day.shift(-1)">‹</button>
        <h1>{{ heading }}</h1>
        <button class="btn" type="button" title="Jour suivant" @click="day.shift(1)">›</button>
        <button v-if="!day.isToday()" class="btn" type="button" @click="day.goToday()">
          Aujourd'hui
        </button>
      </div>

      <div class="day__tools">
        <label class="sr-only" for="day-calendar">Aller à une journée</label>
        <select
          id="day-calendar"
          class="calendar"
          :value="day.date"
          @change="day.load(($event.target as HTMLSelectElement).value)"
        >
          <option v-if="!day.days.includes(day.date)" :value="day.date">{{ day.date }}</option>
          <option v-for="date in calendar" :key="date" :value="date">{{ date }}</option>
        </select>
        <button class="btn" type="button" @click="openNote">Ouvrir la note</button>
      </div>
    </header>

    <p v-if="day.error" class="error" role="alert">{{ day.error }}</p>

    <ol v-if="day.view && day.view.items.length > 0" class="timeline">
      <li
        v-for="(item, index) in day.view.items"
        :key="`${item.kind}-${index}`"
        class="item"
        :class="`item--${item.kind}`"
      >
        <span class="item__time mono">{{ item.at }}</span>

        <div v-if="item.kind === 'entry'" class="item__body">
          <p class="item__text">{{ item.entry.text }}</p>
          <ul v-if="item.entry.children.length > 0" class="sub">
            <li v-for="child in item.entry.children" :key="child.line">{{ child.text }}</li>
          </ul>
          <p v-if="item.entry.effectiveTags.length > 0" class="tags">
            <button
              v-for="tag in item.entry.effectiveTags"
              :key="tag"
              class="tag"
              type="button"
              @click="ui.openProject(tag)"
            >
              #{{ tag }}
            </button>
          </p>
        </div>

        <div v-else class="item__body item__body--event">
          <p class="item__text">
            {{ describe(item.event) }}
            <span class="faint">· {{ authorLabel(item.event.auteur) }}</span>
          </p>
          <p v-if="excerptOf(item)" class="excerpt mono faint">{{ excerptOf(item) }}</p>
        </div>
      </li>
    </ol>

    <p v-else-if="!day.loading" class="empty faint">
      Rien pour cette journée. Utilisez la saisie rapide en haut pour noter quelque chose.
    </p>
  </div>
</template>

<style scoped>
.day {
  height: 100%;
  overflow: auto;
  padding: 18px 24px 40px;
}

.day__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

.day__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.day__nav h1 {
  margin: 0;
  font-size: 18px;
}

.day__tools {
  display: flex;
  gap: 8px;
  align-items: center;
}

.calendar {
  max-width: 160px;
}

.timeline {
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 820px;
}

.item {
  display: flex;
  gap: 14px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
}

.item__time {
  flex: none;
  width: 44px;
  color: var(--text-faint);
  padding-top: 2px;
}

.item__body {
  min-width: 0;
  flex: 1;
}

.item--event .item__text {
  color: var(--text-muted);
}

.item__text {
  margin: 0;
  line-height: 1.5;
  word-break: break-word;
}

.sub {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--text-muted);
}

.tags {
  margin: 5px 0 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
}

.excerpt {
  margin: 3px 0 0;
  padding-left: 10px;
  border-left: 2px solid var(--border);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty {
  max-width: 520px;
  line-height: 1.6;
}

.error {
  color: var(--danger);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
