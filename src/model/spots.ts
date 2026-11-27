export type SpotKind = 'bowl' | 'route'

export interface Spot {
  id: SpotKind
  name: string
  short: string
  /** Point météo. ±300 m n'a pas d'importance à la résolution des modèles (1–2 km). */
  lat: number
  lon: number
  /** Heures où on peut rider (label horaire inclus) ; éclairé = rideable aussi la nuit dans ces heures. */
  open: number
  close: number
  lit: boolean
}

export const SPOTS: readonly Spot[] = [
  { id: 'bowl', name: 'Bowl de Vidy', short: 'Bowl', lat: 46.517, lon: 6.595, open: 8, close: 22, lit: true },
  // Point central du trajet Ouchy (46.507, 6.627) → UNIL Dorigny (46.521, 6.578).
  { id: 'route', name: 'Route du lac · Ouchy → UNIL', short: 'Route', lat: 46.514, lon: 6.603, open: 0, close: 24, lit: false },
]

/** Heure où l'on peut rider ce spot : ouvert, et de jour ou éclairé (bowl : 8h–22h, éclairé). */
export function usable(spot: Spot, h: { time: string; isDay: boolean }): boolean {
  const hour = Number(h.time.slice(11, 13))
  return hour >= spot.open && hour <= spot.close && (h.isDay || spot.lit)
}
