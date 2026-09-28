import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { app } from 'electron'

import type { Settings, ThemeSetting } from '../shared/types.js'

export const SETTINGS_VERSION = 1
const FILE_NAME = 'settings.json'

/** Dossier de config de l'app : réglages et cache d'index, rien d'autre. */
export function configDir(): string {
  return app.getPath('userData')
}

export function settingsPath(): string {
  return path.join(configDir(), FILE_NAME)
}

export function defaultRoot(): string {
  return path.join(os.homedir(), 'Memolog')
}

export function defaultSettings(): Settings {
  return {
    version: SETTINGS_VERSION,
    root: defaultRoot(),
    shortcut: 'CommandOrControl+Shift+Space',
    journalShortcut: 'CommandOrControl+Shift+J',
    theme: 'system',
    // Aucun réglage système n'est appliqué sans une action explicite.
    launchAtLogin: false,
    startHidden: false,
    onboardingDone: false,
    dormantAfterDays: 7,
    archiveAfterDays: 30,
    autoArchive: false,
    burstWindowMinutes: 10,
    windowBounds: null
  }
}

/** Un réglage numérique venu du disque ou de l'IPC reste dans ses bornes. */
function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

function coerce(raw: unknown): Settings {
  const base = defaultSettings()
  if (typeof raw !== 'object' || raw === null) return base
  const input = raw as Partial<Settings>

  const themes: ThemeSetting[] = ['system', 'light', 'dark']
  const bounds = input.windowBounds

  return {
    version: SETTINGS_VERSION,
    root: typeof input.root === 'string' && input.root.trim() !== '' ? input.root : base.root,
    shortcut: typeof input.shortcut === 'string' ? input.shortcut : base.shortcut,
    journalShortcut:
      typeof input.journalShortcut === 'string' ? input.journalShortcut : base.journalShortcut,
    theme: themes.includes(input.theme as ThemeSetting) ? (input.theme as ThemeSetting) : base.theme,
    launchAtLogin: input.launchAtLogin === true,
    startHidden: input.startHidden === true,
    onboardingDone: input.onboardingDone === true,
    dormantAfterDays: clampNumber(input.dormantAfterDays, base.dormantAfterDays, 1, 365),
    archiveAfterDays: clampNumber(input.archiveAfterDays, base.archiveAfterDays, 1, 3650),
    autoArchive: input.autoArchive === true,
    burstWindowMinutes: clampNumber(input.burstWindowMinutes, base.burstWindowMinutes, 1, 240),
    windowBounds:
      bounds && typeof bounds.width === 'number' && typeof bounds.height === 'number'
        ? bounds
        : null
  }
}

let current: Settings | null = null

export function loadSettings(): Settings {
  if (current !== null) return current
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8')
    current = coerce(JSON.parse(raw))
  } catch {
    // Premier lancement, fichier absent ou illisible : on repart des défauts.
    current = defaultSettings()
  }
  return current
}

export function getSettings(): Settings {
  return loadSettings()
}

/** Écriture atomique : un réglage corrompu ne doit pas empêcher le démarrage. */
function persist(settings: Settings): void {
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true })
  const temp = path.join(dir, `.${FILE_NAME}.${randomBytes(4).toString('hex')}.tmp`)
  fs.writeFileSync(temp, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  fs.renameSync(temp, settingsPath())
}

type Listener = (settings: Settings) => void
const listeners = new Set<Listener>()

export function onSettingsChanged(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const next = coerce({ ...loadSettings(), ...patch })
  current = next
  persist(next)
  for (const listener of listeners) listener(next)
  return next
}
