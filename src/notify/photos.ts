/** Photos des spots : règles partagées entre l'app et le Worker. */
import { SPOTS } from '../model/spots.ts'
import { addDays, weekdayLong, zurichStamp } from '../model/time.ts'

export const PHOTO_MAX_BYTES = 600_000 // après compression dans l'app (~1280 px, JPEG)
export const PHOTO_MAX_SIDE = 1280
export const PHOTO_TTL_DAYS = 7
export const CAPTION_MAX = 140
export const HIDE_AFTER_REPORTS = 2

/** Ce que tout le monde voit. */
export interface Photo {
  id: string
  spot: string
  caption: string
  at: number // ms epoch : heure de prise de vue (ou d'envoi si inconnue)
  posted?: number // ms epoch : heure de publication (absente sur les toutes premières photos)
}

/** Heure de prise acceptée : pas dans le futur (5 min de marge), pas plus vieille que la durée de vie. */
export function validTakenAt(taken: number, now = Date.now()): boolean {
  return Number.isFinite(taken) && taken <= now + 5 * 60_000 && taken >= now - PHOTO_TTL_DAYS * 86_400_000
}

export function isSpotId(v: unknown): v is string {
  return typeof v === 'string' && SPOTS.some((s) => s.id === v)
}

export function cleanCaption(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, CAPTION_MAX) : ''
}

/** Vrai JPEG (signature FF D8 FF) d'une taille raisonnable. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 100 && bytes.length <= PHOTO_MAX_BYTES && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

/** « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j ». */
export function ago(at: number, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - at) / 60_000))
  if (min < 1) return 'à l’instant'
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hier' : `il y a ${d} j`
}

/** « à 15h02 », « hier à 15h02 », « jeudi à 15h02 » (heure de Zurich). */
export function dayTime(at: number, now = Date.now()): string {
  const s = zurichStamp(new Date(at))
  const today = zurichStamp(new Date(now)).slice(0, 10)
  const day = s.slice(0, 10)
  const time = `${Number(s.slice(11, 13))}h${s.slice(14, 16)}`
  if (day === today) return `à ${time}`
  if (day === addDays(today, -1)) return `hier à ${time}`
  return `${weekdayLong(day)} à ${time}`
}

/** Ligne d'heure de la galerie : « Prise à 15h02 · publiée à 18h10 » (publication si ≥ 10 min d'écart). */
export function timesLine(p: Photo, now = Date.now()): string {
  const taken = `Prise ${dayTime(p.at, now)}`
  return p.posted && p.posted - p.at >= 10 * 60_000 ? `${taken} · publiée ${dayTime(p.posted, now)}` : taken
}
