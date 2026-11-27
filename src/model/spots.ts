/** Modèle de séchage : bowl (parois + flaques au fond) ou surface plate en enrobé. */
export type SpotKind = 'bowl' | 'route'

export interface Spot {
  id: string
  /** Modèle de séchage utilisé (voir drying.ts). */
  kind: SpotKind
  name: string
  short: string
  /** Point météo. ±300 m n'a pas d'importance à la résolution des modèles (1–2 km). */
  lat: number
  lon: number
  /** Heures où on peut rider (label horaire inclus) ; éclairé = rideable aussi la nuit dans ces heures. */
  open: number
  close: number
  lit: boolean
  /** Une ligne pour la liste « Mes spots ». */
  about: string
  /** Dans une phrase : « Nouvelle photo partagée {at} ». */
  at: string
}

export const SPOTS: readonly Spot[] = [
  { id: 'bowl', kind: 'bowl', name: 'Bowl de Vidy', short: 'Bowl', lat: 46.517, lon: 6.595, open: 8, close: 22, lit: true, about: 'Bowl · éclairé jusqu’à 22h', at: 'au bowl de Vidy' },
  // Point central du trajet Ouchy (46.507, 6.627) → UNIL Dorigny (46.521, 6.578).
  { id: 'route', kind: 'route', name: 'Route du lac · Ouchy → UNIL', short: 'Route', lat: 46.514, lon: 6.603, open: 0, close: 24, lit: false, about: 'Bord du lac · de jour', at: 'sur la route du lac' },
  // Derrière la patinoire, ~1260 m (OpenStreetMap : leisure=track, cycling=pump_track, surface=asphalt).
  // Enrobé qui draine bien : même modèle que le bitume. Neige en hiver (simulée) ; pas d'éclairage connu.
  {
    id: 'leysin',
    kind: 'route',
    name: 'Pumptrack de Leysin',
    short: 'Leysin',
    lat: 46.3399,
    lon: 7.0187,
    open: 0,
    close: 24,
    lit: false,
    about: 'Pumptrack · enrobé · 1260 m · de jour',
    at: 'au pumptrack de Leysin',
  },
]

/** Heure où l'on peut rider ce spot : ouvert, et de jour ou éclairé (bowl : 8h–22h, éclairé). */
export function usable(spot: Spot, h: { time: string; isDay: boolean }): boolean {
  const hour = Number(h.time.slice(11, 13))
  return hour >= spot.open && hour <= spot.close && (h.isDay || spot.lit)
}
