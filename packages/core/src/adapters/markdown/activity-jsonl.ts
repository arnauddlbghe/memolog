/**
 * Stockage du journal d'activité en JSONL : `.memolog/activite/AAAA-MM-JJ.jsonl`.
 *
 * Fichier en **ajout seulement** : une ligne écrite n'est jamais modifiée ni
 * supprimée (`docs/format.md` §6). C'est une implémentation du port
 * `ActivityLog` : une base de données en fournirait une autre.
 */
import { formatLocalDate, formatLocalIso } from '../../domain/dates.js'
import type { EditBurst } from '../../domain/activity.js'
import type { ActivityLog } from '../../domain/ports.js'
import type {
  ActivityAuthor,
  ActivityPayload,
  AnyActivityEvent,
  RelPath
} from '../../domain/types.js'
import { joinRel } from '../fs/paths.js'
import { abs, type Vault } from '../fs/vault.js'


/** Dossier des données produites par l'application, dans le dossier de notes. */
export const MEMOLOG_DIR = '.memolog'

export const ACTIVITY_DIR: RelPath = joinRel(MEMOLOG_DIR, 'activite')

export function activityPathFor(date: Date = new Date()): RelPath {
  return joinRel(ACTIVITY_DIR, `${formatLocalDate(date)}.jsonl`)
}

/**
 * Ajoute un événement au journal du jour.
 *
 * L'écriture relit puis réécrit le fichier (le port système de fichiers n'a
 * pas d'ajout en place), mais **aucune ligne existante n'est modifiée** :
 * le contenu précédent est recopié à l'identique.
 */
export async function recordActivity(
  vault: Vault,
  author: ActivityAuthor,
  payload: ActivityPayload,
  at: Date = new Date()
): Promise<AnyActivityEvent> {
  const event = { ts: formatLocalIso(at), auteur: author, ...payload } as AnyActivityEvent
  const path = activityPathFor(at)
  const absPath = abs(vault, path)

  let existing = ''
  try {
    existing = await vault.fs.readFile(absPath)
  } catch {
    await vault.fs.mkdir(abs(vault, ACTIVITY_DIR))
  }

  const prefix = existing === '' || existing.endsWith('\n') ? existing : `${existing}\n`
  await vault.fs.writeFile(absPath, `${prefix}${JSON.stringify(event)}\n`)
  return event
}

/**
 * Événements d'une journée, dans l'ordre d'écriture.
 * Une ligne illisible est ignorée sans faire échouer la lecture : un journal
 * d'activité abîmé ne doit jamais empêcher l'application de démarrer.
 */
export async function readActivity(vault: Vault, date: Date = new Date()): Promise<AnyActivityEvent[]> {
  let raw: string
  try {
    raw = await vault.fs.readFile(abs(vault, activityPathFor(date)))
  } catch {
    return []
  }

  const events: AnyActivityEvent[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (typeof parsed === 'object' && parsed !== null && 'type' in parsed && 'ts' in parsed) {
        events.push(parsed as AnyActivityEvent)
      }
    } catch {
      // Ligne tronquée ou non JSON : on la laisse de côté.
    }
  }
  return events
}

/**
 * Implémentation JSONL du port `ActivityLog`.
 * L'auteur est un paramètre : l'application écrit `vous`, le futur CLI ou
 * le serveur MCP écriront `claude`, la surveillance disque `externe`.
 */
export class JsonlActivityLog implements ActivityLog {
  constructor(private readonly vault: Vault) {}

  append(author: ActivityAuthor, payload: ActivityPayload, at: Date = new Date()) {
    return recordActivity(this.vault, author, payload, at)
  }

  readDay(date: Date) {
    return readActivity(this.vault, date)
  }

  /** Écrit l'événement `fichier.edite` correspondant à une rafale terminée. */
  appendEditBurst(burst: EditBurst) {
    return this.append(
      burst.auteur,
      {
        type: 'fichier.edite',
        fichier: burst.fichier,
        ligne: burst.ligne,
        extrait: burst.extrait,
        lignes: burst.lignes
      },
      burst.lastTouch
    )
  }
}
