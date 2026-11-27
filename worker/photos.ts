/**
 * Feed de photos :
 *  - POST   /photos?spot=bowl&caption=…   corps = JPEG (compressé par l'app)
 *  - GET    /photos                      feed public (7 jours, photos signalées masquées)
 *  - GET    /photos/:id                  l'image
 *  - POST   /photos/:id/report           signalement (1 par IP et par photo)
 *  - DELETE /photos/:id?token=…          suppression (lien envoyé au propriétaire, ou ADMIN_TOKEN)
 *
 * Images en KV (expiration 7 jours) ; l'index du feed est un seul document KV, relu à chaque GET
 * (les lectures KV sont bon marché, les « list » non).
 */
import { SPOTS } from '../src/model/spots.ts'
import {
  HIDE_AFTER_REPORTS,
  PHOTO_MAX_BYTES,
  PHOTO_TTL_DAYS,
  cleanCaption,
  isJpeg,
  isSpotId,
  type Photo,
} from '../src/notify/photos.ts'

export interface PhotoKV {
  get(key: string): Promise<string | null>
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  put(key: string, value: string | ArrayBuffer, opts?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

/** Entrée d'index : publique + champs privés (jamais renvoyés au public). */
interface Entry extends Photo {
  reports: number
  token: string
}

const TTL = PHOTO_TTL_DAYS * 24 * 3600
const FEED = 'feed'

async function readFeed(kv: PhotoKV): Promise<Entry[]> {
  const all = JSON.parse((await kv.get(FEED)) ?? '[]') as Entry[]
  const since = Date.now() - TTL * 1000
  return all.filter((e) => e.at > since)
}

const publicView = (e: Entry): Photo => ({ id: e.id, spot: e.spot, caption: e.caption, at: e.at })

type Reply = (body: unknown, status: number, extra?: { [k: string]: string }) => Response

export interface PhotoDeps {
  kv: PhotoKV
  reply: Reply
  isAdmin: boolean
  ip: string
  /** Prévient le propriétaire (notification avec lien de suppression). */
  notifyOwner(title: string, body: string, url: string): Promise<unknown>
  siteUrl: string
  waitUntil(p: Promise<unknown>): void
}

export async function handlePhotos(req: Request, url: URL, d: PhotoDeps): Promise<Response | null> {
  const parts = url.pathname.split('/').filter(Boolean) // ['photos', id?, 'report'?]
  if (parts[0] !== 'photos') return null
  const id = parts[1]

  // Feed public
  if (!id && req.method === 'GET') {
    const feed = (await readFeed(d.kv)).filter((e) => e.reports < HIDE_AFTER_REPORTS).map(publicView)
    return d.reply(feed, 200, { 'Cache-Control': 'public, max-age=30' })
  }

  // Publication
  if (!id && req.method === 'POST') {
    const spot = url.searchParams.get('spot')
    if (!isSpotId(spot)) return d.reply({ error: 'spot inconnu' }, 400)
    if (Number(req.headers.get('Content-Length') ?? 0) > PHOTO_MAX_BYTES) return d.reply({ error: 'photo trop lourde' }, 413)
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (!isJpeg(bytes)) return d.reply({ error: 'photo invalide' }, 400)
    // Anti-spam : une photo par minute et par adresse IP (60 s = durée minimale en KV).
    if (await d.kv.get(`rlp:${d.ip}`)) return d.reply({ error: 'trop de photos' }, 429)
    await d.kv.put(`rlp:${d.ip}`, '1', { expirationTtl: 60 })

    const entry: Entry = {
      id: `${Date.now().toString(36)}${crypto.randomUUID().slice(0, 6)}`,
      spot,
      caption: cleanCaption(url.searchParams.get('caption')),
      at: Date.now(),
      reports: 0,
      token: crypto.randomUUID(),
    }
    await d.kv.put(`img:${entry.id}`, bytes.buffer, { expirationTtl: TTL })
    const feed = await readFeed(d.kv)
    await d.kv.put(FEED, JSON.stringify([entry, ...feed].slice(0, 200)))

    const name = SPOTS.find((s) => s.id === spot)!.short
    const link = `${d.siteUrl}?photo=${entry.id}&del=${entry.token}`
    d.waitUntil(d.notifyOwner(`Nouvelle photo · ${name}`, entry.caption || 'Touche pour la voir ou la supprimer.', link))
    return d.reply(publicView(entry), 201)
  }

  if (!id || !/^[a-z0-9]{6,20}$/.test(id)) return d.reply({ error: 'introuvable' }, 404)

  // Image
  if (parts.length === 2 && req.method === 'GET') {
    const img = await d.kv.get(`img:${id}`, 'arrayBuffer')
    if (!img) return d.reply({ error: 'introuvable' }, 404)
    return new Response(img, {
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=604800, immutable', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Signalement
  if (parts[2] === 'report' && req.method === 'POST') {
    const seen = `rep:${id}:${d.ip}`
    if (await d.kv.get(seen)) return d.reply({ ok: true }, 200)
    await d.kv.put(seen, '1', { expirationTtl: TTL })
    const feed = await readFeed(d.kv)
    const e = feed.find((x) => x.id === id)
    if (!e) return d.reply({ error: 'introuvable' }, 404)
    e.reports += 1
    await d.kv.put(FEED, JSON.stringify(feed))
    if (e.reports === HIDE_AFTER_REPORTS) {
      const name = SPOTS.find((s) => s.id === e.spot)?.short ?? e.spot
      d.waitUntil(d.notifyOwner(`Photo masquée · ${name}`, 'Signalée 2 fois. Touche pour la supprimer.', `${d.siteUrl}?photo=${e.id}&del=${e.token}`))
    }
    return d.reply({ ok: true }, 200)
  }

  // Suppression
  if (parts.length === 2 && req.method === 'DELETE') {
    const feed = await readFeed(d.kv)
    const e = feed.find((x) => x.id === id)
    if (!e) return d.reply(null, 204)
    if (!d.isAdmin && url.searchParams.get('token') !== e.token) return d.reply({ error: 'non autorisé' }, 401)
    await d.kv.delete(`img:${id}`)
    await d.kv.put(FEED, JSON.stringify(feed.filter((x) => x.id !== id)))
    return d.reply(null, 204)
  }

  return d.reply({ error: 'introuvable' }, 404)
}
