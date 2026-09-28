/**
 * Cas d'usage du journal : ouvrir une journée, ajouter une entrée, fusionner
 * les entrées avec les événements d'activité pour la vue Jour.
 *
 * Écrit contre les ports uniquement.
 */
import { formatLocalDate } from '../domain/dates.js'
import type { ActivityLog, JournalDay, JournalRepository } from '../domain/ports.js'
import type { AnyActivityEvent, JournalEntry } from '../domain/types.js'
import type { ActionContext } from './task-service.js'

export interface JournalServiceDeps {
  journal: JournalRepository
  activity: ActivityLog
  clock?: () => Date
}

/** Un élément de la vue Jour : soit une entrée écrite, soit un événement. */
export type DayItem =
  | { kind: 'entry'; at: string; entry: JournalEntry }
  | { kind: 'event'; at: string; event: AnyActivityEvent }

export interface DayView {
  date: string
  path: string
  items: DayItem[]
  entryCount: number
  eventCount: number
}

export class JournalService {
  private readonly journal: JournalRepository
  private readonly activity: ActivityLog
  private readonly clock: () => Date

  constructor(deps: JournalServiceDeps) {
    this.journal = deps.journal
    this.activity = deps.activity
    this.clock = deps.clock ?? ((): Date => new Date())
  }

  open(date: Date = this.clock()): Promise<JournalDay> {
    return this.journal.open(date)
  }

  append(text: string, context: ActionContext = {}): ReturnType<JournalRepository['append']> {
    return this.journal.append(text, context.at ?? this.clock())
  }

  days(): Promise<string[]> {
    return this.journal.days()
  }

  /**
   * Vue Jour : les notes libres et les événements d'activité fusionnés dans
   * l'ordre chronologique. Les entrées n'ont qu'une heure `HH:MM`, les
   * événements une date-heure ISO : on compare sur l'heure locale.
   */
  async day(date: Date = this.clock()): Promise<DayView> {
    const [day, events] = await Promise.all([
      this.journal.open(date),
      this.activity.readDay(date)
    ])

    const items: DayItem[] = [
      ...day.entries.map((entry): DayItem => ({ kind: 'entry', at: entry.time, entry })),
      ...events.map((event): DayItem => ({ kind: 'event', at: timeOf(event), event }))
    ].sort((a, b) => (a.at === b.at ? order(a) - order(b) : a.at.localeCompare(b.at)))

    return {
      date: formatLocalDate(date),
      path: day.path,
      items,
      entryCount: day.entries.length,
      eventCount: events.length
    }
  }
}

/** `HH:MM` extrait d'un horodatage ISO local. */
function timeOf(event: AnyActivityEvent): string {
  const match = /T(\d{2}:\d{2})/.exec(event.ts)
  return match?.[1] ?? '00:00'
}

// À heure égale, l'entrée écrite passe avant l'événement qu'elle a provoqué.
function order(item: DayItem): number {
  return item.kind === 'entry' ? 0 : 1
}
