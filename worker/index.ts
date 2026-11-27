/**
 * Worker Cloudflare « spot-checker » :
 *  - POST   /subscribe  enregistre l'abonnement Web Push envoyé par l'app (+ notification de bienvenue)
 *  - DELETE /subscribe  le supprime
 *  - POST   /run        envoi forcé (test), protégé par ADMIN_TOKEN
 *  - cron horaire       message du jour / mises à jour (voir src/notify/plan.ts)
 */
import { SPOTS } from '../src/model/spots.ts'
import { zurichStamp } from '../src/model/time.ts'
import { fetchForecast, parseForecast } from '../src/model/weather.ts'
import { VAPID_PUBLIC } from '../src/notify/keys.ts'
import { planNotification, type NotifyState } from '../src/notify/plan.ts'
import { parseSubscription, sendPush, type PushSub, type Vapid } from '../src/notify/webpush.ts'

// Types minimaux du runtime Workers (évite d'importer tout @cloudflare/workers-types).
interface KV {
  get(key: string): Promise<string | null>
  put(key: string, value: string): Promise<void>
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

const ORIGINS = new Set(['https://mrpouchi.github.io', 'http://localhost:5173', 'http://localhost:4173'])
const SUBJECT = 'https://github.com/mrpouchi/spot-checker'

const vapid = (env: Env): Vapid => ({ publicKey: VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: SUBJECT })

async function subKey(endpoint: string): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)))
  return `sub:${Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')}`
}

async function allSubs(env: Env): Promise<{ key: string; sub: PushSub }[]> {
  const out: { key: string; sub: PushSub }[] = []
  let cursor: string | undefined
  do {
    const page = await env.SUBS.list({ prefix: 'sub:', cursor })
    for (const { name } of page.keys) {
      const raw = await env.SUBS.get(name)
      const sub = raw ? parseSubscription(JSON.parse(raw)) : null
      if (sub) out.push({ key: name, sub })
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return out
}

async function run(env: Env, force: boolean) {
  const stamp = zurichStamp()
  const all = parseForecast(await fetchForecast(SPOTS), SPOTS.length)
  const state = JSON.parse((await env.SUBS.get('state')) ?? '{}') as NotifyState
  const plan = planNotification(all, stamp, state, force)
  if (plan.kind === 'none') return { stamp, kind: plan.kind }

  const payload = JSON.stringify({ title: plan.title, body: plan.body, url: env.SITE_URL })
  const subs = await allSubs(env)
  const results = await Promise.all(
    subs.map(async ({ key, sub }) => {
      const status = await sendPush(sub, payload, vapid(env)).catch(() => 0)
      if (status === 404 || status === 410) await env.SUBS.delete(key) // désabonné côté appareil
      return status
    }),
  )
  if (plan.kind !== 'forced') await env.SUBS.put('state', JSON.stringify(plan.next))
  return {
    stamp,
    kind: plan.kind,
    title: plan.title,
    body: plan.body,
    sent: results.filter((s) => s >= 200 && s < 300).length,
    gone: results.filter((s) => s === 404 || s === 410).length,
    failed: results.filter((s) => s < 200 || (s >= 300 && s !== 404 && s !== 410)).length,
  }
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
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

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin') ?? ''
    const cors: Record<string, string> = ORIGINS.has(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, DELETE', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {}

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

    if (url.pathname === '/subscribe' && req.method === 'POST') {
      const sub = parseSubscription(await readJson(req))
      if (!sub) return json({ error: 'abonnement invalide' }, 400, cors)
      await env.SUBS.put(await subKey(sub.endpoint), JSON.stringify(sub))
      const welcome = { title: 'Spot Checker', body: 'Notifications activées. Prochain message demain vers 8h.', url: env.SITE_URL }
      ctx.waitUntil(sendPush(sub, JSON.stringify(welcome), vapid(env)).catch(() => 0))
      return json({ ok: true }, 201, cors)
    }

    if (url.pathname === '/subscribe' && req.method === 'DELETE') {
      const body = (await readJson(req)) as { endpoint?: unknown } | null
      if (typeof body?.endpoint !== 'string') return json({ error: 'endpoint manquant' }, 400, cors)
      await env.SUBS.delete(await subKey(body.endpoint))
      return json(null, 204, cors)
    }

    if (url.pathname === '/run' && req.method === 'POST') {
      if (!env.ADMIN_TOKEN || req.headers.get('Authorization') !== `Bearer ${env.ADMIN_TOKEN}`) {
        return json({ error: 'non autorisé' }, 401, {})
      }
      return json(await run(env, true), 200, {})
    }

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
