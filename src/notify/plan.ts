/**
 * Décide s'il faut notifier, et quoi.
 *  - Message du jour au premier passage ≥ 8h (heure de Zurich).
 *  - Mise à jour entre 8h et 21h si le créneau du jour change vraiment (max 3 / jour).
 */
import type { Hour } from '../model/drying.ts'
import { SPOTS } from '../model/spots.ts'
import { buildView, changed, todayLine, type TodaySignature } from '../model/summary.ts'
import { dayOf, longDate } from '../model/time.ts'

export const DAILY_HOUR = 8
export const QUIET_FROM = 21
export const MAX_UPDATES = 3

export interface NotifyState {
  date?: string
  sent?: Record<string, TodaySignature>
  updates?: number
}

export interface NotifyPlan {
  kind: 'daily' | 'update' | 'forced' | 'none'
  title: string
  body: string
  next: NotifyState
}

export function planNotification(all: Hour[][], stamp: string, state: NotifyState, force = false): NotifyPlan {
  const today = stamp.slice(0, 10)
  const hour = Number(stamp.slice(11, 13))
  const start = `${today}T${String(DAILY_HOUR).padStart(2, '0')}:00`

  const views = SPOTS.map((s, k) => buildView(s, all[k]!, stamp))
  const lines = views.map((v) => {
    const dayStart = Math.max(0, v.hours.findIndex((h) => h.time >= start))
    return { id: v.spot.id, ...todayLine(v, dayStart) }
  })
  const sigs = Object.fromEntries(lines.map((l) => [l.id, l.sig]))

  const sameDay = state.date === today
  const daily = !sameDay && hour >= DAILY_HOUR
  const moved = sameDay && SPOTS.some((s) => state.sent?.[s.id] && changed(state.sent[s.id]!, sigs[s.id]!))
  const update = moved && hour >= DAILY_HOUR && hour < QUIET_FROM && (state.updates ?? 0) < MAX_UPDATES
  const kind = daily ? 'daily' : update ? 'update' : force ? 'forced' : 'none'

  // Le titre suit le jour décrit (tard le soir, les lignes parlent déjà de demain).
  const described = dayOf(views[0]!.hours[views[0]!.now]!.time)
  const text = lines.map((l) => l.text).join('\n')
  return {
    kind,
    title: `Vidy · ${longDate(described)}`,
    body: kind === 'update' ? `Changement :\n${text}` : text,
    next: {
      date: today,
      sent: sigs,
      updates: daily || !sameDay ? 0 : (state.updates ?? 0) + (update ? 1 : 0),
    },
  }
}
