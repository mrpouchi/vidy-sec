/**
 * Worker Cloudflare « spot-checker » :
 *  - POST   /subscribe  enregistre l'abonnement Web Push + les spots choisis (bienvenue au premier abonnement)
 *  - DELETE /subscribe  le supprime
 *  - POST   /request    demande d'un nouveau spot (notifiée aux abonnés « owner »)
 *  - /photos…           feed de photos des spots (voir worker/photos.ts)
 *  - POST   /reports    retour terrain anonyme « Sec / Mouillé » (recalibrage du modèle)
 *  - GET    /reports    liste des retours (ADMIN_TOKEN)
 *  - POST   /ping       signal anonyme quotidien d'un appareil (compteur d'utilisateurs)
 *  - GET    /stats      utilisateurs actifs par jour, uniques sur 7 et 30 jours (ADMIN_TOKEN)
 *  - GET    /requests   liste des demandes            ┐
 *  - POST   /run        envoi forcé (test)            ├ protégés par ADMIN_TOKEN
 *  - POST   /owner      marque un abonnement owner    ┘
 *  - cron horaire       message du jour / mises à jour (voir src/notify/plan.ts)
 */
import { SPOTS } from '../src/model/spots.ts'
import { zurichStamp } from '../src/model/time.ts'
import { fetchForecast, parseForecast } from '../src/model/weather.ts'
import { VAPID_PUBLIC } from '../src/notify/keys.ts'
import { bodyFor, planNotification, type NotifyState } from '../src/notify/plan.ts'
import { followersOf } from '../src/notify/photos.ts'
import { parseReport } from '../src/notify/reports.ts'
import { newUserMessage, parsePing, pingKey, summarize } from '../src/notify/stats.ts'
import { parseSpotRequest, parseSpots, type SpotRequest } from '../src/notify/requests.ts'
import { parseSubscription, sendPush, type PushSub, type Vapid } from '../src/notify/webpush.ts'
import { handlePhotos } from './photos.ts'

// Types minimaux du runtime Workers (évite d'importer tout @cloudflare/workers-types).
interface KV {
  get(key: string): Promise<string | null>
  get(key: string, type: 'arrayBuffer'): Promise<ArrayBuffer | null>
  put(key: string, value: string | ArrayBuffer, opts?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list(opts: { prefix: string; cursor?: string }): Promise<{
    keys: { name: string }[]
    list_complete: boolean
    cursor?: string
  }>
}
interface Env {
  SUBS: KV
  VAPID_PRIVATE: string
  ADMIN_TOKEN?: string
  SITE_URL: string
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void
}

/** Ce qu'on stocke par appareil. `spots` absent = tous les spots. */
interface Record {
  sub: PushSub
  spots?: string[]
}

const ORIGINS = new Set(['https://mrpouchi.github.io', 'http://localhost:5173', 'http://localhost:4173'])
const SUBJECT = 'https://github.com/mrpouchi/spot-checker'

const vapid = (env: Env): Vapid => ({ publicKey: VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: SUBJECT })

async function subKey(endpoint: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return `sub:${Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

function parseRecord(raw: string | null): Record | null {
  if (!raw) return null
  const v = JSON.parse(raw) as { sub?: unknown; spots?: unknown; endpoint?: unknown }
  // Ancien format : l'abonnement seul.
  const sub = parseSubscription(v.endpoint ? v : v.sub)
  return sub ? { sub, spots: parseSpots(v.spots) ?? undefined } : null
}

async function allRecords(env: Env, prefix = 'sub:'): Promise<{ key: string; rec: Record }[]> {
  const out: { key: string; rec: Record }[] = []
  let cursor: string | undefined
  do {
    const page = await env.SUBS.list({ prefix, cursor })
    for (const { name } of page.keys) {
      const rec = parseRecord(await env.SUBS.get(name))
      if (rec) out.push({ key: name, rec })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

/** Envoie à chaque appareil son propre texte ; nettoie les abonnements morts. */
async function broadcast(env: Env, targets: { key: string; rec: Record }[], message: (r: Record) => object | null) {
  const results = await Promise.all(
    targets.map(async ({ key, rec }) => {
      const payload = message(rec)
      if (!payload) return -1
      const status = await sendPush(rec.sub, JSON.stringify(payload), vapid(env)).catch(() => 0)
      if (status === 404 || status === 410) await env.SUBS.delete(key)
      return status
    }),
  )
  return {
    sent: results.filter((s) => s >= 200 && s < 300).length,
    skipped: results.filter((s) => s === -1).length,
    gone: results.filter((s) => s === 404 || s === 410).length,
    failed: results.filter((s) => s === 0 || (s >= 300 && s !== 404 && s !== 410)).length,
  }
}

async function run(env: Env, force: boolean) {
  const stamp = zurichStamp()
  const all = parseForecast(await fetchForecast(SPOTS), SPOTS.length)
  const state = JSON.parse((await env.SUBS.get('state')) ?? '{}') as NotifyState
  const plan = planNotification(all, stamp, state, force)
  if (plan.kind === 'none') return { stamp, kind: plan.kind }

  const result = await broadcast(env, await allRecords(env), (rec) => {
    const body = bodyFor(plan, rec.spots)
    return body ? { title: plan.title, body, url: env.SITE_URL } : null
  })
  if (plan.kind !== 'forced') await env.SUBS.put('state', JSON.stringify(plan.next))
  return { stamp, kind: plan.kind, title: plan.title, lines: plan.lines, ...result }
}

async function owners(env: Env): Promise<{ key: string; rec: Record }[]> {
  const keys = JSON.parse((await env.SUBS.get('owners')) ?? '[]') as string[]
  const out: { key: string; rec: Record }[] = []
  for (const key of keys) {
    const rec = parseRecord(await env.SUBS.get(key))
    if (rec) out.push({ key, rec })
  }
  return out
}

function json(body: unknown, status: number, headers: { [k: string]: string }): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { ...headers, ...(body === null ? {} : { 'Content-Type': 'application/json' }) },
  })
}

async function readJson(req: Request): Promise<unknown> {
  const raw = await req.text()
  if (raw.length > 4096) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const isAdmin = (req: Request, env: Env) =>
  Boolean(env.ADMIN_TOKEN) && req.headers.get('Authorization') === `Bearer ${env.ADMIN_TOKEN}`

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin') ?? ''
    const cors: { [k: string]: string } = ORIGINS.has(origin)
      ? {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, X-Push-Endpoint',
          Vary: 'Origin',
        }
      : {}

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (url.pathname === '/subscribe' && req.method === 'POST') {
      const body = (await readJson(req)) as
        | { subscription?: unknown; spots?: unknown; endpoint?: unknown; previous?: unknown }
        | null
      // Accepte { subscription, spots } ou l'abonnement seul (anciennes versions de l'app).
      const sub = parseSubscription(body?.endpoint ? body : body?.subscription)
      if (!sub) return json({ error: 'abonnement invalide' }, 400, cors)
      const spots = body?.spots === undefined ? undefined : parseSpots(body.spots)
      if (spots === null) return json({ error: 'spots invalides' }, 400, cors)
      const key = await subKey(sub.endpoint)
      const isNew = (await env.SUBS.get(key)) === null
      const rec: Record = { sub, ...(spots ? { spots } : {}) }
      await env.SUBS.put(key, JSON.stringify(rec))
      // L'appareil s'est réabonné (nouvelle adresse) : on retire l'ancienne et on garde son rôle « owner ».
      if (typeof body?.previous === 'string' && body.previous !== sub.endpoint) {
        const prev = await subKey(body.previous)
        if (await env.SUBS.get(prev)) await env.SUBS.delete(prev)
        const list = JSON.parse((await env.SUBS.get('owners')) ?? '[]') as string[]
        if (list.includes(prev)) await env.SUBS.put('owners', JSON.stringify([...new Set(list.map((k) => (k === prev ? key : k)))]))
      }
      if (isNew) {
        const welcome = { title: 'Spot Checker', body: 'Notifications activées. Prochain message demain vers 8h.', url: env.SITE_URL }
        ctx.waitUntil(sendPush(sub, JSON.stringify(welcome), vapid(env)).catch(() => 0))
      }
      return json({ ok: true }, isNew ? 201 : 200, cors)
    }

    if (url.pathname === '/subscribe' && req.method === 'DELETE') {
      const body = (await readJson(req)) as { endpoint?: unknown } | null
      if (typeof body?.endpoint !== 'string') return json({ error: 'endpoint manquant' }, 400, cors)
      await env.SUBS.delete(await subKey(body.endpoint))
      return json(null, 204, cors)
    }

    if (url.pathname === '/request' && req.method === 'POST') {
      const ask = parseSpotRequest(await readJson(req))
      if (!ask) return json({ error: 'demande invalide' }, 400, cors)
      // Anti-spam simple : une demande par minute et par adresse IP.
      const ip = req.headers.get('CF-Connecting-IP') ?? 'inconnue'
      if (await env.SUBS.get(`rl:${ip}`)) return json({ error: 'trop de demandes' }, 429, cors)
      await env.SUBS.put(`rl:${ip}`, '1', { expirationTtl: 60 })
      const stored: SpotRequest & { at: string } = { ...ask, at: zurichStamp() }
      await env.SUBS.put(`req:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify(stored))
      ctx.waitUntil(
        owners(env).then((list) =>
          broadcast(env, list, () => ({
            title: 'Nouveau spot proposé',
            body: [ask.name, ask.place, ask.note].filter(Boolean).join(' · '),
            url: env.SITE_URL,
          })),
        ),
      )
      return json({ ok: true }, 201, cors)
    }

    if (url.pathname === '/reports' && req.method === 'POST') {
      const report = parseReport(await readJson(req))
      if (!report) return json({ error: 'retour invalide' }, 400, cors)
      // Anonyme : ni IP ni abonnement. Gardé un an pour recalibrer le modèle sur plusieurs saisons.
      await env.SUBS.put(`fb:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`, JSON.stringify({ ...report, received: Date.now() }), {
        expirationTtl: 365 * 86_400,
      })
      return json({ ok: true }, 201, cors)
    }

    if (url.pathname === '/reports' && req.method === 'GET') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const items: unknown[] = []
      let cursor: string | undefined
      do {
        const page = await env.SUBS.list({ prefix: 'fb:', cursor })
        for (const { name } of page.keys) items.push(JSON.parse((await env.SUBS.get(name)) ?? 'null'))
        cursor = page.list_complete ? undefined : page.cursor
      } while (cursor)
      return json(items, 200, {})
    }

    if (url.pathname === '/ping' && req.method === 'POST') {
      const ping = parsePing(await readJson(req))
      if (!ping) return json({ error: 'signal invalide' }, 400, cors)
      const key = pingKey(zurichStamp().slice(0, 10), ping.mode, ping.id)
      // Une écriture par appareil et par jour au plus (l'app ne signale qu'une fois par jour).
      if (!(await env.SUBS.get(key))) await env.SUBS.put(key, '1', { expirationTtl: 90 * 86_400 })
      // Premier signal de cet appareil dans ce mode → nouveau visiteur / nouvelle installation : notif au propriétaire.
      const dev = `dev:${ping.mode}:${ping.id}`
      if (!(await env.SUBS.get(dev))) {
        await env.SUBS.put(dev, '1')
        const total = Number((await env.SUBS.get(`devcount:${ping.mode}`)) ?? '0') + 1
        await env.SUBS.put(`devcount:${ping.mode}`, String(total))
        ctx.waitUntil(owners(env).then((list) => broadcast(env, list, () => newUserMessage(ping.mode, total, env.SITE_URL))))
      }
      return json(null, 204, cors)
    }

    if (url.pathname === '/stats' && req.method === 'GET') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const page = await env.SUBS.list({ prefix: 'act:', cursor })
        keys.push(...page.keys.map((k) => k.name))
        cursor = page.list_complete ? undefined : page.cursor
      } while (cursor)
      const today = zurichStamp().slice(0, 10)
      const since = (n: number) => {
        const d = new Date(`${today}T12:00:00Z`)
        d.setUTCDate(d.getUTCDate() - n + 1)
        return d.toISOString().slice(0, 10)
      }
      const within = (n: number) => keys.filter((k) => k.split(':')[1]! >= since(n))
      const all = summarize(keys)
      return json(
        {
          today: all.days.find((d) => d.day === today) ?? { day: today, app: 0, web: 0 },
          last7: summarize(within(7)).unique,
          last30: summarize(within(30)).unique,
          notifications: (await allRecords(env)).length,
          days: all.days.slice(0, 30),
        },
        200,
        {},
      )
    }

    if (url.pathname === '/requests' && req.method === 'GET') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const list = await env.SUBS.list({ prefix: 'req:' })
      const items = await Promise.all(list.keys.map(async ({ name }) => JSON.parse((await env.SUBS.get(name)) ?? 'null')))
      return json(items, 200, {})
    }

    if (url.pathname === '/owner' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const body = (await readJson(req)) as { endpoint?: unknown } | null
      if (typeof body?.endpoint !== 'string') return json({ error: 'endpoint manquant' }, 400, {})
      const key = await subKey(body.endpoint)
      const keys = new Set(JSON.parse((await env.SUBS.get('owners')) ?? '[]') as string[])
      keys.add(key)
      await env.SUBS.put('owners', JSON.stringify([...keys]))
      return json({ owners: keys.size }, 200, {})
    }

    // Propriétaire : l'admin génère un code à usage unique (15 min) ; le propriétaire le tape dans l'app
    // (appui long sur le titre) et cet appareil devient le seul à recevoir les notifs propriétaire.
    if (url.pathname === '/claim-code' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 100_000_000
      const code = String(n).padStart(8, '0')
      await env.SUBS.put(`claim:${code}`, '1', { expirationTtl: 900 })
      return json({ code }, 200, {})
    }

    if (url.pathname === '/claim' && req.method === 'POST') {
      const ip = req.headers.get('CF-Connecting-IP') ?? 'inconnue'
      if (await env.SUBS.get(`rlc:${ip}`)) return json({ error: 'attends un peu' }, 429, cors)
      await env.SUBS.put(`rlc:${ip}`, '1', { expirationTtl: 60 })
      const body = (await readJson(req)) as { code?: unknown; endpoint?: unknown } | null
      const code = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''
      if (typeof body?.endpoint !== 'string' || code.length !== 8 || !(await env.SUBS.get(`claim:${code}`))) {
        return json({ error: 'code invalide' }, 403, cors)
      }
      const key = await subKey(body.endpoint)
      const rec = parseRecord(await env.SUBS.get(key))
      if (!rec) return json({ error: 'notifications pas activées' }, 404, cors)
      await env.SUBS.delete(`claim:${code}`)
      await env.SUBS.put('owners', JSON.stringify([key]))
      ctx.waitUntil(
        sendPush(rec.sub, JSON.stringify({ title: 'C’est bon ✅', body: 'Tu recevras ici les nouveaux utilisateurs, spots proposés et photos.', url: env.SITE_URL }), vapid(env)).catch(() => 0),
      )
      return json({ ok: true }, 200, cors)
    }

    // Diagnostic : envoie une notif de test à un abonnement précis et renvoie le code d'Apple/Google.
    if (url.pathname === '/test' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      const body = (await readJson(req)) as { key?: unknown; title?: unknown; body?: unknown } | null
      const key = typeof body?.key === 'string' ? body.key : ''
      const rec = parseRecord(await env.SUBS.get(key))
      if (!rec) return json({ error: 'abonnement inconnu' }, 404, {})
      const payload = { title: String(body?.title ?? 'Test'), body: String(body?.body ?? ''), url: env.SITE_URL }
      const status = await sendPush(rec.sub, JSON.stringify(payload), vapid(env)).catch(() => 0)
      return json({ status }, 200, {})
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      if (!isAdmin(req, env)) return json({ error: 'non autorisé' }, 401, {})
      return json(await run(env, true), 200, {})
    }

    const photos = await handlePhotos(req, url, {
      kv: env.SUBS,
      reply: (body, status, extra = {}) => json(body, status, { ...cors, ...extra }),
      isAdmin: isAdmin(req, env),
      ip: req.headers.get('CF-Connecting-IP') ?? 'inconnue',
      notifyOwner: async (title, body, link) => broadcast(env, await owners(env), () => ({ title, body, url: link })),
      notifyFollowers: async (spot, title, body, link, exceptEndpoint) => {
        const skip = new Set((await owners(env)).map((o) => o.key)) // le propriétaire a déjà sa version
        if (exceptEndpoint) skip.add(await subKey(exceptEndpoint)) // pas l'auteur de la photo
        return broadcast(env, followersOf(await allRecords(env), spot, skip), () => ({ title, body, url: link }))
      },
      siteUrl: env.SITE_URL,
      waitUntil: (p) => ctx.waitUntil(p),
    })
    if (photos) return photos

    if (url.pathname === '/') return new Response('Spot Checker · notifications', { headers: cors })
    return json({ error: 'introuvable' }, 404, cors)
  },

  async scheduled(_: unknown, env: Env, ctx: Ctx): Promise<void> {
    ctx.waitUntil(
      run(env, false).then(
        (r) => console.log(JSON.stringify(r)),
        (e: unknown) => console.error(e),
      ),
    )
  },
}
