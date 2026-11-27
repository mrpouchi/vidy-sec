/** Validation partagée app ↔ Worker : choix de spots et demandes de nouveaux spots. */
import { SPOTS } from '../model/spots.ts'

export interface SpotRequest {
  name: string
  place: string
  note: string
}

export const REQUEST_LIMITS = { name: 80, place: 300, note: 500 } as const

/** Identifiants de spots connus, sans doublon (un spot retiré est simplement ignoré) ; null si ce n'est pas une liste. */
export function parseSpots(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string')) return null
  const known = new Set(SPOTS.map((s) => s.id))
  return [...new Set(value as string[])].filter((id) => known.has(id))
}

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

/** Demande de spot : un nom est obligatoire, le reste est facultatif. */
export function parseSpotRequest(value: unknown): SpotRequest | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { [k: string]: unknown }
  const name = clean(v.name, REQUEST_LIMITS.name)
  if (name.length < 2) return null
  return { name, place: clean(v.place, REQUEST_LIMITS.place), note: clean(v.note, REQUEST_LIMITS.note) }
}
