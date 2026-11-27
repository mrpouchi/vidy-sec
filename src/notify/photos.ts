/** Photos des spots : règles partagées entre l'app et le Worker. */
import { SPOTS } from '../model/spots.ts'

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
  at: number // ms epoch
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
