/** Client du feed de photos (Worker, voir worker/photos.ts). */
import { PHOTO_MAX_BYTES, PHOTO_MAX_SIDE, type Photo } from '../notify/photos.ts'
import { exifTakenAt } from '../notify/exif.ts'
import { PUSH_API } from './push.ts'

export const photoUrl = (id: string) => `${PUSH_API}/photos/${id}`

export async function fetchFeed(): Promise<Photo[]> {
  const res = await fetch(`${PUSH_API}/photos`, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
  return (await res.json()) as Photo[]
}

/**
 * Redimensionne (≤ 1280 px) et réencode en JPEG dans le téléphone.
 * Le réencodage retire aussi les métadonnées (dont la position GPS).
 */
export async function compress(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file) // respecte l'orientation EXIF
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.82, 0.72, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality))
    if (blob && blob.size <= PHOTO_MAX_BYTES) return blob
  }
  throw new Error('trop lourde')
}

// Jetons de suppression de mes propres photos (renvoyés par le serveur à la publication).
const MINE = 'vidy:my-photos:v1'
function readMine(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MINE) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function writeMine(m: Record<string, string>): void {
  try {
    localStorage.setItem(MINE, JSON.stringify(m))
  } catch {
    /* navigation privée : on ne pourra pas supprimer depuis cet appareil */
  }
}
/** Jeton de suppression si la photo a été publiée depuis cet appareil. */
export const myToken = (id: string): string | undefined => readMine()[id]

export async function upload(jpeg: Blob, spot: string, caption: string, taken: number): Promise<Photo> {
  const q = new URLSearchParams({ spot, caption, taken: String(Math.round(taken)) })
  const res = await fetch(`${PUSH_API}/photos?${q}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg })
  if (res.status === 429) throw new Error('trop')
  if (res.status === 400 && (await res.clone().json().catch(() => ({}))).error === 'heure de prise invalide') throw new Error('heure')
  if (!res.ok) throw new Error(`serveur ${res.status}`)
  const { token, ...photo } = (await res.json()) as Photo & { token?: string }
  if (token) writeMine({ ...readMine(), [photo.id]: token })
  return photo
}

export async function report(id: string): Promise<void> {
  const res = await fetch(`${PUSH_API}/photos/${id}/report`, { method: 'POST' })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
}

export async function remove(id: string, token: string): Promise<void> {
  const res = await fetch(`${PUSH_API}/photos/${id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
  const mine = readMine()
  delete mine[id]
  writeMine(mine)
}

/**
 * Heure de prise : EXIF de la photo (fiable), sinon date du fichier si elle est nettement
 * antérieure à maintenant (indice seulement) ; null si inconnue.
 */
export async function takenAt(file: Blob): Promise<{ at: number; source: 'exif' | 'file' } | null> {
  try {
    const exif = exifTakenAt(await file.slice(0, 256 * 1024).arrayBuffer())
    if (exif) return { at: exif, source: 'exif' }
  } catch {
    /* EXIF illisible : on essaie la date du fichier */
  }
  const mod = file instanceof File ? file.lastModified : 0
  return mod && mod < Date.now() - 2 * 60_000 ? { at: mod, source: 'file' } : null
}
