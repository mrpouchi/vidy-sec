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
  /** Une ligne par spot ; chaque abonné ne reçoit que celles de ses spots (voir `bodyFor`). */
  lines: { id: string; text: string }[]
  /** Spots dont le créneau a vraiment changé (pour les mises à jour). */
  moved: string[]
  next: NotifyState
}

/** Texte de la notification pour une sélection de spots ; null si aucun de ses spots n'est concerné. */
export function bodyFor(plan: NotifyPlan, spots?: readonly string[]): string | null {
  const mine = (id: string) => !spots || spots.includes(id)
  // Une mise à jour ne concerne que ceux dont un des spots a changé.
  if (plan.kind === 'update' && !plan.moved.some(mine)) return null
  const lines = plan.lines.filter((l) => mine(l.id)).map((l) => l.text)
  if (!lines.length) return null
  return plan.kind === 'update' ? `Changement :\n${lines.join('\n')}` : lines.join('\n')
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
  const movedIds = sameDay ? SPOTS.filter((s) => state.sent?.[s.id] && changed(state.sent[s.id]!, sigs[s.id]!)).map((s) => s.id) : []
  const moved = movedIds.length > 0
  const update = moved && hour >= DAILY_HOUR && hour < QUIET_FROM && (state.updates ?? 0) < MAX_UPDATES
  const kind = daily ? 'daily' : update ? 'update' : force ? 'forced' : 'none'

  // Le titre suit le jour décrit (tard le soir, les lignes parlent déjà de demain).
  const described = dayOf(views[0]!.hours[views[0]!.now]!.time)
  return {
    kind,
    title: `Vidy · ${longDate(described)}`,
    lines: lines.map(({ id, text }) => ({ id, text })),
    moved: movedIds,
    next: {
      date: today,
      sent: sigs,
      updates: daily || !sameDay ? 0 : (state.updates ?? 0) + (update ? 1 : 0),
    },
  }
}
