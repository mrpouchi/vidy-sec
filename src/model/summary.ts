import { CAL } from './calibration.ts'
import type { Hour, Level, Nuance, SpotHour } from './drying.ts'
import { simulate } from './drying.ts'
import type { Spot } from './spots.ts'
import { addDays, capitalize, dayDiff, dayOf, hourOf, nowIndex, weekday, when } from './time.ts'

export interface SpotView {
  spot: Spot
  hours: Hour[]
  states: SpotHour[]
  now: number
}

export function buildView(spot: Spot, hours: Hour[], stamp: string, factor = 1): SpotView {
  const now = nowIndex(hours, stamp)
  return { spot, hours, states: simulate(hours, spot.id, factor, now), now }
}

// ─── Mots ────────────────────────────────────────────────────────────────────

export function statusWord(s: SpotHour): string {
  if (s.level === 'dry') return 'Sec'
  if (s.level === 'ride') return 'Rideable'
  if (s.nuance === 'rain') return 'Il pleut'
  if (s.nuance === 'snow') return 'Neige'
  if (s.nuance === 'ice') return 'Verglas possible'
  return 'Mouillé'
}

const NUANCE: Record<Nuance, string> = {
  puddles: 'flaques au fond',
  damp: 'humide par endroits',
  dew: 'rosée',
  rain: 'pluie',
  snow: 'neige',
  ice: 'verglas possible',
  wet: 'mouillé',
  flooded: 'fond inondé',
}
export const nuanceText = (n: Nuance | null): string => (n ? NUANCE[n] : '')

export function formatMm(mm: number): string {
  return mm.toLocaleString('fr-CH', { maximumFractionDigits: mm < 10 ? 1 : 0 })
}

// ─── Verdict ─────────────────────────────────────────────────────────────────

function findFrom(states: SpotHour[], from: number, test: (s: SpotHour) => boolean): number {
  for (let i = from; i < states.length; i++) if (test(states[i]!)) return i
  return -1
}

/** Une phrase : quand ça change pour ce spot. */
export function verdict(v: SpotView): string {
  const { states, now } = v
  const cur = states[now]!
  const ref = cur.time
  const at = (i: number) => when(states[i]!.time, ref)
  // Le créneau i couvre l'heure qui *finit* à states[i].time : un changement au créneau i commence à i − 1.
  const startOf = (i: number) => at(Math.max(now, i - 1))
  // Quand ça devient bon : une heure de jour, ou « d'ici demain matin » si ça arrive la nuit.
  const arrival = (i: number, prep: 'vers' | 'dès') => {
    if (v.hours[i]!.isDay) return `${prep} ${at(i)}`
    const k = v.hours.findIndex((h, x) => x >= i && h.isDay)
    if (k === -1) return `${prep} ${at(i)}`
    const morning = v.hours[k]!.time
    const d = dayDiff(ref, morning)
    return d === 0 ? "d'ici ce matin" : d === 1 ? "d'ici demain matin" : `d'ici ${weekday(dayOf(morning))} matin`
  }

  if (cur.level === 'dry') {
    const j = findFrom(states, now + 1, (s) => s.level !== 'dry')
    if (j === -1 || j - now > 48) return 'Sec pour les prochaines 48 h'
    return states[j]!.nuance === 'rain' ? `Sec jusqu'à ${startOf(j)}, pluie ensuite` : `Sec jusqu'à ${startOf(j)}`
  }

  if (cur.level === 'ride') {
    const base = capitalize(nuanceText(cur.nuance))
    const dry = findFrom(states, now + 1, (s) => s.level === 'dry')
    const wet = findFrom(states, now + 1, (s) => s.level === 'wet')
    if (dry !== -1 && (wet === -1 || dry < wet)) return `${base} · sec ${arrival(dry, 'vers')}`
    if (wet !== -1 && wet - now <= 24) return `${base} · mouillé dès ${startOf(wet)}`
    return base
  }

  const next = findFrom(states, now + 1, (s) => s.level !== 'wet')
  if (next === -1) return 'Pas de créneau sec dans les 7 jours'
  const s = states[next]!
  if (s.level === 'dry') return `Sec ${arrival(next, 'dès')}`
  return `Rideable ${arrival(next, 'dès')} · ${nuanceText(s.nuance)}`
}

// ─── Pourquoi ────────────────────────────────────────────────────────────────

function partOfDay(hour: number): string {
  if (hour <= 6) return 'nuit'
  if (hour < 12) return 'matin'
  if (hour < 18) return 'après-midi'
  return 'soir'
}

function rainAgo(endTime: string, nowTime: string, hoursAgo: number): string {
  if (hoursAgo <= 1) return 'il y a 1 h'
  const d = dayDiff(endTime, nowTime)
  const part = partOfDay(hourOf(endTime))
  if (d === 0) return part === 'nuit' ? 'cette nuit' : part === 'après-midi' ? 'cet après-midi' : `ce ${part}`
  if (d === 1) return part === 'nuit' ? 'la nuit dernière' : `hier ${part}`
  return `il y a ${d} jours`
}

/** Une ligne : dernière pluie + conditions de séchage actuelles. */
export function reason(v: SpotView): string {
  const { hours, now, states } = v
  const h = hours[now]!
  const parts: string[] = []

  // Dernier épisode de pluie (trous ≤ 3 h fusionnés).
  let end = -1
  for (let i = now; i >= 0; i--) if (hours[i]!.precip >= CAL.rainHour) { end = i; break }
  if (end === -1) {
    parts.push('Pas de pluie depuis plusieurs jours')
  } else {
    let sum = 0
    let gap = 0
    let start = end
    for (let i = end; i >= 0 && gap <= 3; i--) {
      const p = hours[i]!.precip
      if (p >= CAL.rainHour) { sum += p; gap = 0; start = i } else gap++
    }
    if (end === now) {
      parts.push(`Pluie en cours · ${formatMm(sum)} mm depuis ${when(hours[Math.max(0, start - 1)]!.time, h.time)}`)
    } else {
      const ago = rainAgo(hours[end]!.time, h.time, now - end)
      parts.push(sum < 0.5 ? `Un peu de bruine ${ago}` : `${formatMm(sum)} mm ${ago}`)
    }
  }

  if (h.precip < CAL.rainHour) {
    const cond: string[] = []
    if (!h.isDay) {
      if (states[now]!.level !== 'dry') cond.push('nuit, ça sèche peu')
    } else {
      if (h.sw >= 250) cond.push('soleil')
      else if (h.sw >= 100) cond.push('éclaircies')
      if (h.wind >= 15) cond.push(h.windDir >= 20 && h.windDir <= 100 ? 'bise' : 'vent')
      if (h.rh >= 90) cond.push('air très humide')
    }
    if (cond.length) parts.push(cond.join(' et '))
  }
  return parts.join(' · ')
}

// ─── Créneaux par jour ───────────────────────────────────────────────────────

export interface Window {
  start: string
  end: string
  /** 'dry' si au moins la moitié du créneau est sèche. */
  quality: Exclude<Level, 'wet'>
  /** Nuance des heures seulement rideables (flaques, rosée…), et quand elles tombent. */
  nuance: Nuance | null
  nuanceWhen: 'le matin' | "l'après-midi" | null
  /** Couvre toutes les heures de jour restantes. */
  allDay: boolean
}

export interface DaySummary {
  date: string
  window: Window | null
  rain: number
  tmax: number
  risk: boolean
}

/** Plus long créneau rideable de jour, à partir de `from`. */
export function bestWindow(v: SpotView, date: string, from = 0): Window | null {
  const idx: number[] = []
  v.hours.forEach((h, i) => { if (i >= from && dayOf(h.time) === date && h.isDay) idx.push(i) })
  let best: number[] = []
  let run: number[] = []
  for (const i of idx) {
    const s = v.states[i]!
    if (s.level !== 'wet' && (run.length === 0 || i === run[run.length - 1]! + 1)) run.push(i)
    else run = s.level !== 'wet' ? [i] : []
    if (run.length > best.length) best = [...run]
  }
  if (!best.length) return null
  const ride = best.filter((i) => v.states[i]!.level === 'ride')
  const rideHour = ride.reduce((a, i) => a + hourOf(v.hours[i]!.time), 0) / (ride.length || 1)
  return {
    start: v.hours[best[0]!]!.time,
    end: v.hours[best[best.length - 1]!]!.time,
    quality: ride.length * 2 > best.length ? 'ride' : 'dry',
    nuance: ride.length ? v.states[ride[0]!]!.nuance : null,
    nuanceWhen: ride.length ? (rideHour < 12 ? 'le matin' : "l'après-midi") : null,
    allDay: best.length === idx.length,
  }
}

export function days(v: SpotView, count = 7): DaySummary[] {
  const today = dayOf(v.hours[v.now]!.time)
  return Array.from({ length: count }, (_, d) => {
    const date = addDays(today, d)
    const hs = v.hours.map((h, i) => ({ h, i })).filter(({ h }) => dayOf(h.time) === date)
    return {
      date,
      window: bestWindow(v, date, d === 0 ? v.now : 0),
      rain: hs.reduce((a, { h }) => a + h.precip, 0),
      tmax: hs.reduce((a, { h }) => Math.max(a, h.temp), -Infinity),
      risk: hs.some(({ i }) => v.states[i]!.risk && v.hours[i]!.isDay),
    }
  }).filter((d) => Number.isFinite(d.tmax))
}

export function windowRange(w: Window): string {
  const a = hourOf(w.start)
  const b = hourOf(w.end)
  return a === b ? `${a}h` : `${a}–${b}h`
}

export function dayLabel(date: string, today: string): string {
  const d = dayDiff(today, date)
  if (d === 0) return 'Auj.'
  if (d === 1) return 'Dem.'
  return `${capitalize(weekday(date))} ${Number(date.slice(8, 10))}`
}

// ─── Notification ────────────────────────────────────────────────────────────

export interface TodaySignature {
  q: 'dry' | 'ride' | 'none'
  s: number
  e: number
}

const hoursRange = (w: Window) => {
  const a = hourOf(w.start)
  const b = hourOf(w.end)
  return a === b ? `${a}h` : `${a}h–${b}h`
}

/** Ligne de notification pour un spot + signature pour détecter les changements. */
export function todayLine(v: SpotView): { text: string; sig: TodaySignature } {
  const today = dayOf(v.hours[v.now]!.time)
  const w = bestWindow(v, today, v.now)
  const name = v.spot.short
  if (w) {
    const range = hoursRange(w)
    const emoji = w.quality === 'dry' ? '🟢' : '🟡'
    const what = w.quality === 'dry' ? (w.allDay ? 'sec toute la journée' : `sec ${range}`) : `rideable ${range}`
    const extra = !w.nuance ? '' : w.quality === 'ride' ? ` · ${nuanceText(w.nuance)}` : ` · ${nuanceText(w.nuance)} ${w.nuanceWhen}`
    return { text: `${name} ${emoji} ${what}${extra}`, sig: { q: w.quality, s: hourOf(w.start), e: hourOf(w.end) } }
  }
  for (let d = 1; d < 7; d++) {
    const date = addDays(today, d)
    const n = bestWindow(v, date)
    if (n) {
      const day = d === 1 ? 'demain' : weekday(date)
      return {
        text: `${name} 🔴 pas de créneau aujourd'hui · ${day} ${hoursRange(n)}`,
        sig: { q: 'none', s: -1, e: -1 },
      }
    }
  }
  return { text: `${name} 🔴 pas de créneau sec cette semaine`, sig: { q: 'none', s: -1, e: -1 } }
}

/** Changement significatif entre deux signatures (créneau qui apparaît, disparaît ou bouge de ≥ 2 h). */
export function changed(a: TodaySignature, b: TodaySignature): boolean {
  if (a.q !== b.q) return true
  if (a.q === 'none') return false
  return Math.abs(a.s - b.s) >= 2 || Math.abs(a.e - b.e) >= 2
}
