/** Compteur anonyme d'utilisateurs : un identifiant tiré au hasard par appareil, un signal par jour. */

export type Mode = 'app' | 'web'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function parsePing(value: unknown): { id: string; mode: Mode } | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { id?: unknown; mode?: unknown }
  if (typeof v.id !== 'string' || !UUID.test(v.id)) return null
  if (v.mode !== 'app' && v.mode !== 'web') return null
  return { id: v.id, mode: v.mode }
}

/** Clé KV d'un signal : act:<jour>:<mode>:<id> (un seul par appareil, par jour et par mode). */
export const pingKey = (day: string, mode: Mode, id: string) => `act:${day}:${mode}:${id}`

export interface DayCount {
  day: string
  app: number
  web: number
}

/** Agrège des clés act:… : appareils actifs par jour, et appareils uniques sur la période. */
export function summarize(keys: string[]): { days: DayCount[]; unique: { app: number; web: number } } {
  const byDay = new Map<string, DayCount>()
  const seen = { app: new Set<string>(), web: new Set<string>() }
  for (const k of keys) {
    const [, day, mode, id] = k.split(':')
    if (!day || (mode !== 'app' && mode !== 'web') || !id) continue
    const d = byDay.get(day) ?? { day, app: 0, web: 0 }
    d[mode] += 1
    byDay.set(day, d)
    seen[mode].add(id)
  }
  return {
    days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)),
    unique: { app: seen.app.size, web: seen.web.size },
  }
}
