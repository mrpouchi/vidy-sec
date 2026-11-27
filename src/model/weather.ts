import type { Hour } from './drying.ts'
import type { Spot } from './spots.ts'

/**
 * Modèles par ordre de préférence, fusionnés heure par heure :
 * MeteoSwiss ICON-CH1 (1 km, ~33 h) → ICON-CH2 (2 km, ~5 j) → best_match (au-delà).
 */
const MODELS = ['meteoswiss_icon_ch1', 'meteoswiss_icon_ch2', 'best_match'] as const
const VARS = [
  'precipitation',
  'precipitation_probability',
  'snowfall',
  'temperature_2m',
  'relative_humidity_2m',
  'dew_point_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'shortwave_radiation',
  'cloud_cover',
] as const

export const PAST_DAYS = 5
export const FORECAST_DAYS = 7

export function forecastUrl(spots: readonly Spot[]): string {
  const q = new URLSearchParams({
    latitude: spots.map((s) => s.lat).join(','),
    longitude: spots.map((s) => s.lon).join(','),
    timezone: 'Europe/Zurich',
    past_days: String(PAST_DAYS),
    forecast_days: String(FORECAST_DAYS),
    hourly: [...VARS, 'is_day'].join(','),
    models: MODELS.join(','),
  })
  return `https://api.open-meteo.com/v1/forecast?${q}`
}

type Series = Record<string, (number | null)[] | string[] | undefined>
interface Location {
  hourly: Series & { time: string[] }
}

/** Réponse brute → heures par spot (même ordre que `spots`). */
export function parseForecast(raw: unknown, count: number): Hour[][] {
  const locations = (Array.isArray(raw) ? raw : [raw]) as Location[]
  if (locations.length !== count) throw new Error('Réponse météo inattendue')
  return locations.map(parseLocation)
}

function parseLocation(loc: Location): Hour[] {
  const h = loc.hourly
  const num = (name: string, i: number): number | null => {
    const v = (h[name] as (number | null)[] | undefined)?.[i]
    return typeof v === 'number' ? v : null
  }
  const hours: Hour[] = []
  h.time.forEach((time, i) => {
    // Premier modèle qui a des données complètes pour cette heure.
    const model = MODELS.find((m) => num(`precipitation_${m}`, i) !== null && num(`temperature_2m_${m}`, i) !== null)
    if (!model) return
    const v = (name: (typeof VARS)[number]) => num(`${name}_${model}`, i) ?? num(`${name}_best_match`, i)
    const isDay = num(`is_day_${model}`, i) ?? num('is_day', i) ?? num('is_day_best_match', i)
    hours.push({
      time,
      precip: v('precipitation') ?? 0,
      prob: v('precipitation_probability'),
      snow: v('snowfall') ?? 0,
      temp: v('temperature_2m') ?? 10,
      rh: v('relative_humidity_2m') ?? 80,
      dewPoint: v('dew_point_2m') ?? 5,
      wind: v('wind_speed_10m') ?? 0,
      windDir: v('wind_direction_10m') ?? 0,
      sw: v('shortwave_radiation') ?? 0,
      cloud: v('cloud_cover') ?? 100,
      isDay: isDay === 1,
    })
  })
  return hours
}

export async function fetchForecast(spots: readonly Spot[]): Promise<unknown> {
  const res = await fetch(forecastUrl(spots))
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`)
  return res.json()
}
