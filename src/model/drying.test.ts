import { describe, expect, it } from 'vitest'
import type { Hour } from './drying.ts'
import { simulate } from './drying.ts'
import { RETIRED_SPOTS, SPOTS } from './spots.ts'
import { bestWindow, buildView, changed, todayLine, verdict } from './summary.ts'
import { addDays } from './time.ts'

// ─── Météo synthétique ───────────────────────────────────────────────────────

interface Climate {
  temp: number
  rh: number
  wind: number
  cloud: number
  sunPeak: number // W/m² à midi
  sunrise: number // première heure « de jour » (label)
  sunset: number // dernière heure « de jour » (label)
}

const NOVEMBER: Climate = { temp: 8, rh: 85, wind: 8, cloud: 70, sunPeak: 150, sunrise: 8, sunset: 17 }
const SUMMER: Climate = { temp: 24, rh: 50, wind: 10, cloud: 10, sunPeak: 800, sunrise: 6, sunset: 21 }

function dewPointOf(t: number, rh: number): number {
  const g = Math.log(rh / 100) + (17.27 * t) / (t + 237.3)
  return (237.3 * g) / (17.27 - g)
}

const START = '2026-11-20'
const D = 5 // index du jour « J » : 2026-11-25
const day = (d: number) => addDays(START, d)
const at = (d: number, hour: number) => `${day(d)}T${String(hour).padStart(2, '0')}:00`

/** 8 jours de météo ; `tweak` permet d'injecter pluie, froid, etc. */
function weather(c: Climate, tweak: (h: Hour, d: number, hour: number) => Partial<Hour> = () => ({})): Hour[] {
  const hours: Hour[] = []
  for (let d = 0; d < 8; d++) {
    for (let hour = 0; hour < 24; hour++) {
      const isDay = hour >= c.sunrise && hour <= c.sunset
      const mid = (c.sunrise + c.sunset) / 2
      const half = (c.sunset - c.sunrise) / 2 + 1
      const sw = isDay ? Math.max(0, c.sunPeak * Math.cos(((hour - mid) / half) * (Math.PI / 2))) : 0
      const base: Hour = {
        time: at(d, hour),
        precip: 0,
        prob: 0,
        snow: 0,
        temp: c.temp,
        rh: c.rh,
        dewPoint: dewPointOf(c.temp, c.rh),
        wind: c.wind,
        windDir: 200,
        sw,
        cloud: c.cloud,
        isDay,
      }
      const t = { ...base, ...tweak(base, d, hour) }
      if (t.temp !== base.temp || t.rh !== base.rh) t.dewPoint = dewPointOf(t.temp, t.rh)
      hours.push(t)
    }
  }
  return hours
}

const rainOn = (days: number[], from: number, to: number, mm: number) => (_: Hour, d: number, hour: number) =>
  days.includes(d) && hour >= from && hour <= to ? { precip: mm, cloud: 100, sw: 0, rh: 95 } : {}

function stateAt(hours: Hour[], kind: 'bowl' | 'route', time: string) {
  const states = simulate(hours, kind)
  const s = states.find((x) => x.time === time)
  if (!s) throw new Error(`heure absente : ${time}`)
  return s
}

// ─── Cibles de calibrage ─────────────────────────────────────────────────────

describe('calibrage', () => {
  it('C1 — novembre, 10 mm à J−2, rien à J−1 ni J : bowl rideable avec flaques au fond, route sèche (repère utilisateur)', () => {
    const w = weather(NOVEMBER, rainOn([D - 2], 12, 16, 2))
    expect(stateAt(w, 'bowl', at(D, 12))).toMatchObject({ level: 'ride', nuance: 'puddles' })
    expect(stateAt(w, 'route', at(D, 12))).toMatchObject({ level: 'dry' })
  })

  it('C2 — novembre, 48 h et plus sans pluie : bowl sec en journée', () => {
    const w = weather(NOVEMBER, rainOn([D - 3], 12, 16, 2))
    expect(stateAt(w, 'bowl', at(D, 12))).toMatchObject({ level: 'dry' })
  })

  it('C3 — novembre, pluie jusqu’à 18h la veille : bowl mouillé à 9h, route pas sèche', () => {
    const w = weather(NOVEMBER, rainOn([D - 1], 14, 18, 1.6))
    expect(stateAt(w, 'bowl', at(D, 9)).level).toBe('wet')
    expect(stateAt(w, 'route', at(D, 9)).level).not.toBe('dry')
  })

  it('C4 — été, averse de 3 mm à 14h : route sèche en ≤ 2 h, parois du bowl sèches en ≤ 3 h', () => {
    const w = weather(SUMMER, (_, d, hour) => (d === D && hour === 14 ? { precip: 3, cloud: 100, sw: 50 } : {}))
    expect(stateAt(w, 'route', at(D, 14)).level).toBe('wet')
    expect(stateAt(w, 'route', at(D, 16)).level).toBe('dry')
    expect(stateAt(w, 'bowl', at(D, 17)).level).not.toBe('wet')
  })

  it('C5 — nuit claire et calme : rosée au lever du jour, sec après ~2–3 h de soleil', () => {
    const w = weather({ ...NOVEMBER, cloud: 0, wind: 3, sunPeak: 300 }, (_, __, hour) =>
      hour < 8 || hour > 17 ? { temp: 4, rh: 95 } : {},
    )
    expect(stateAt(w, 'route', at(D, 8))).toMatchObject({ level: 'ride', nuance: 'dew' })
    expect(stateAt(w, 'route', at(D, 11)).level).toBe('dry')
  })

  it('C6 — 0.5 °C sur surface humide : verglas possible', () => {
    const w = weather(NOVEMBER, (_, d, hour) => {
      if (d === D - 1 && hour >= 14 && hour <= 18) return { precip: 1.6, cloud: 100, sw: 0 }
      if (d === D && hour < 9) return { temp: 0.5 }
      return {}
    })
    expect(stateAt(w, 'route', at(D, 6))).toMatchObject({ level: 'wet', nuance: 'ice' })
    expect(stateAt(w, 'bowl', at(D, 6))).toMatchObject({ level: 'wet', nuance: 'ice' })
  })

  it('C7 — pluie en cours : « il pleut »', () => {
    const w = weather(SUMMER, rainOn([D], 10, 12, 1))
    expect(stateAt(w, 'route', at(D, 11))).toMatchObject({ level: 'wet', nuance: 'rain' })
    expect(stateAt(w, 'bowl', at(D, 11))).toMatchObject({ level: 'wet', nuance: 'rain' })
  })
})

// ─── Textes ──────────────────────────────────────────────────────────────────

describe('verdicts', () => {
  const bowl = SPOTS[0]!
  const route = RETIRED_SPOTS.find((s) => s.id === 'route')! // modèle « enrobé », de jour

  it('annonce quand le bowl redevient rideable', () => {
    const w = weather(NOVEMBER, rainOn([D - 1], 14, 18, 1.6))
    const v = buildView(bowl, w, `${day(D)}T08:30`)
    expect(verdict(v)).toMatch(/^(Sec|Rideable) (dès|d'ici) /)
  })

  it('route sèche toute la journée en été', () => {
    const w = weather(SUMMER)
    const v = buildView(route, w, `${day(D)}T07:30`)
    expect(verdict(v)).toBe('Sec pour les prochaines 48 h')
    expect(todayLine(v).text).toBe('Route 🟢 sec toute la journée')
  })

  it('le créneau qui avance avec les heures ne compte pas comme un changement', () => {
    const w = weather(SUMMER)
    const from = w.findIndex((h) => h.time === at(D, 8))
    const morning = todayLine(buildView(route, w, `${day(D)}T08:30`), from).sig
    const afternoon = todayLine(buildView(route, w, `${day(D)}T15:30`), from).sig
    expect(changed(morning, afternoon)).toBe(false)
  })

  it('le bowl éclairé se ride jusqu’à 20h, la route seulement de jour', () => {
    const w = weather(NOVEMBER)
    const stamp = `${day(D)}T08:30`
    expect(bestWindow(buildView(bowl, w, stamp), day(D))).toMatchObject({ start: at(D, 8), end: at(D, 20) })
    expect(bestWindow(buildView(route, w, stamp), day(D))?.end).toBe(at(D, 17))
    // Après le coucher du soleil, le bowl a encore un créneau ce soir.
    expect(todayLine(buildView(bowl, w, `${day(D)}T18:30`)).text).toMatch(/^Bowl 🟢 sec/)
  })

  it('détecte un changement de créneau significatif', () => {
    expect(changed({ q: 'dry', s: 11, e: 16 }, { q: 'dry', s: 12, e: 16 })).toBe(false)
    expect(changed({ q: 'dry', s: 11, e: 16 }, { q: 'dry', s: 13, e: 16 })).toBe(true)
    expect(changed({ q: 'dry', s: 11, e: 16 }, { q: 'none', s: -1, e: -1 })).toBe(true)
    expect(changed({ q: 'none', s: -1, e: -1 }, { q: 'none', s: -1, e: -1 })).toBe(false)
  })
})
