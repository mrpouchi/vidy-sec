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

export async function upload(jpeg: Blob, spot: string, caption: string, taken: number): Promise<Photo> {
  const q = new URLSearchParams({ spot, caption, taken: String(Math.round(taken)) })
  const res = await fetch(`${PUSH_API}/photos?${q}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: jpeg })
  if (res.status === 429) throw new Error('trop')
  if (res.status === 400 && (await res.clone().json().catch(() => ({}))).error === 'heure de prise invalide') throw new Error('heure')
  if (!res.ok) throw new Error(`serveur ${res.status}`)
  return (await res.json()) as Photo
}

export async function report(id: string): Promise<void> {
  const res = await fetch(`${PUSH_API}/photos/${id}/report`, { method: 'POST' })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
}

export async function remove(id: string, token: string): Promise<void> {
  const res = await fetch(`${PUSH_API}/photos/${id}?token=${encodeURIComponent(token)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
}

/** Heure de prise de vue lue dans l'EXIF (avant compression) ; null si absente. */
export async function takenAt(file: Blob): Promise<number | null> {
  try {
    return exifTakenAt(await file.slice(0, 256 * 1024).arrayBuffer())
  } catch {
    return null
  }
}
