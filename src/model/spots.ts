export type SpotKind = 'bowl' | 'route'

export interface Spot {
  id: SpotKind
  name: string
  short: string
  /** Point météo. ±300 m n'a pas d'importance à la résolution des modèles (1–2 km). */
  lat: number
  lon: number
}

export const SPOTS: readonly Spot[] = [
  { id: 'bowl', name: 'Bowl de Vidy', short: 'Bowl', lat: 46.517, lon: 6.595 },
  // Point central du trajet Ouchy (46.507, 6.627) → UNIL Dorigny (46.521, 6.578).
  { id: 'route', name: 'Route du lac · Ouchy → UNIL', short: 'Route', lat: 46.514, lon: 6.603 },
]
