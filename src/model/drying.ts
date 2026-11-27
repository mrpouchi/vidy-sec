import { CAL } from './calibration.ts'
import type { SpotKind } from './spots.ts'

/** Une heure de météo. `time` = heure locale Europe/Zurich, fin de l'intervalle (convention Open-Meteo). */
export interface Hour {
  time: string // 'YYYY-MM-DDTHH:00'
  precip: number // mm sur l'heure écoulée
  prob: number | null // % (prévision uniquement)
  snow: number // cm
  temp: number // °C
  rh: number // %
  dewPoint: number // °C
  wind: number // km/h à 10 m
  windDir: number // degrés
  sw: number // W/m² rayonnement global
  cloud: number // %
  isDay: boolean
}

export type Level = 'dry' | 'ride' | 'wet'
export type Nuance = 'puddles' | 'damp' | 'dew' | 'rain' | 'snow' | 'ice' | 'wet' | 'flooded'

export interface SpotHour {
  time: string
  level: Level
  nuance: Nuance | null
  risk: boolean
}

/** Pression de vapeur saturante (kPa), formule de Tetens (FAO-56, éq. 11). */
function saturation(t: number): number {
  return 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
}

/**
 * Évaporation potentielle d'une surface mouillée (mm/h), Penman « eau libre ».
 * `sun` = part du rayonnement solaire reçue (ombre), `albedo` = réflectivité de la surface.
 */
export function evaporation(h: Hour, albedo: number, sun: number): number {
  const p = CAL.physics
  const es = saturation(h.temp)
  const ea = (es * h.rh) / 100
  const delta = (4098 * es) / (h.temp + 237.3) ** 2
  const u2 = (h.wind / 3.6) * p.windTo2m
  const cloud = h.cloud / 100
  const longwave = p.netLongwaveClear + (p.netLongwaveOvercast - p.netLongwaveClear) * cloud
  const rn = (1 - albedo) * h.sw * sun - longwave
  const radiative = ((delta / (delta + p.gamma)) * rn) / p.wattsPerMmHour
  const vpdHpa = Math.max(0, es - ea) * 10
  const aerodynamic = ((p.gamma / (delta + p.gamma)) * p.penmanWindA * (1 + p.penmanWindB * u2) * vpdHpa) / 24
  return Math.max(0, radiative + aerodynamic)
}

function dewDeposit(h: Hour): number {
  const d = CAL.dew
  const calm = !h.isDay && h.cloud <= d.maxCloud && h.wind <= d.maxWind && h.temp - h.dewPoint <= d.maxSpread
  return calm ? d.rate : 0
}

/**
 * Simule le bilan d'eau en surface, heure par heure.
 * `factor` multiplie la vitesse de séchage (retour terrain de l'utilisateur).
 * `nowIndex` : les heures à partir de cet index sont des prévisions (risque d'averse possible).
 */
export function simulate(hours: readonly Hour[], kind: SpotKind, factor = 1, nowIndex = 0): SpotHour[] {
  const p = CAL.physics
  let film = 0 // route : film d'eau ; bowl : parois
  let bottom = 0 // bowl : flaques au fond
  let snowpack = 0 // cm
  let lastInput: 'rain' | 'dew' = 'rain'
  const out: SpotHour[] = []

  hours.forEach((h, i) => {
    // 1. Apports
    const snowWater = h.snow * p.snowCmToMm
    let liquid = Math.max(0, h.precip - snowWater)
    snowpack += h.snow
    if (snowpack > 0 && h.temp > 0) {
      const melt = Math.min(snowpack, p.meltPerDegree * h.temp + p.meltPerWatt * h.sw)
      snowpack -= melt
      liquid += melt * p.snowCmToMm
    }
    if (liquid > 0) lastInput = 'rain'
    const dew = liquid > 0 ? 0 : dewDeposit(h)

    // 2. Bilan
    if (kind === 'route') {
      const c = CAL.route
      film = Math.min(c.capacity, film + liquid)
      if (dew > 0 && film < CAL.dew.max) {
        film = Math.min(CAL.dew.max, film + dew)
        lastInput = 'dew'
      }
      film = Math.max(0, film - evaporation(h, c.albedo, c.sun) * factor)
    } else {
      const c = CAL.bowl
      film += liquid
      const overflow = Math.max(0, film - c.wallCapacity)
      film = Math.min(film, c.wallCapacity)
      bottom = Math.min(c.bottomCapacity, bottom + overflow * c.runoffToBottom)
      if (dew > 0 && film < CAL.dew.max) {
        film = Math.min(CAL.dew.max, film + dew)
        lastInput = 'dew'
      }
      const e = evaporation(h, c.albedo, c.sun) * factor
      film = Math.max(0, film - e)
      bottom = Math.max(0, bottom - (e * c.bottomEvap + c.drain * factor))
    }

    // 3. Statut
    const risk = i >= nowIndex && (h.prob ?? 0) >= CAL.riskProbability
    out.push({ time: h.time, risk, ...classify(kind, h, film, bottom, snowpack, lastInput) })
  })
  return out
}

function classify(
  kind: SpotKind,
  h: Hour,
  film: number,
  bottom: number,
  snowpack: number,
  lastInput: 'rain' | 'dew',
): { level: Level; nuance: Nuance | null } {
  if (h.snow > 0 || snowpack > 0) return { level: 'wet', nuance: 'snow' }
  if (h.precip >= CAL.rainHour) return { level: 'wet', nuance: 'rain' }

  const c = kind === 'route' ? { dry: CAL.route.dry, wet: CAL.route.wet } : { dry: CAL.bowl.wallDry, wet: CAL.bowl.wallWet }
  const damp = film >= c.dry || (kind === 'bowl' && bottom >= CAL.bowl.puddles)
  if (damp && h.temp <= CAL.iceTemp) return { level: 'wet', nuance: 'ice' }
  if (film >= c.wet) return { level: 'wet', nuance: 'wet' }
  if (kind === 'bowl' && bottom >= CAL.bowl.flooded) return { level: 'wet', nuance: 'flooded' }
  if (film >= c.dry) return { level: 'ride', nuance: lastInput === 'dew' ? 'dew' : 'damp' }
  if (kind === 'bowl' && bottom >= CAL.bowl.puddles) return { level: 'ride', nuance: 'puddles' }
  return { level: 'dry', nuance: null }
}
