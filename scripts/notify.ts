/**
 * Notification ntfy, lancée toutes les heures par GitHub Actions.
 *  - Message du jour au premier passage ≥ 8h (heure de Zurich).
 *  - Mise à jour entre 8h et 21h si le créneau du jour change vraiment (max 3 / jour).
 *
 * Usage : tsx scripts/notify.ts [--dry-run] [--force]
 * Env   : NTFY_TOPIC, PUSH_SUBSCRIPTION + VAPID_PRIVATE (secrets, chacun optionnel), SITE_URL
 */
import { readFileSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'
import { SPOTS } from '../src/model/spots.ts'
import { buildView, changed, todayLine, type TodaySignature } from '../src/model/summary.ts'
import { dayOf, longDate, zurichStamp } from '../src/model/time.ts'
import { fetchForecast, parseForecast } from '../src/model/weather.ts'
import { VAPID_PUBLIC } from '../src/ui/push.ts'

const STATE_FILE = new URL('../state/notify.json', import.meta.url)
const DAILY_HOUR = 8
const QUIET_FROM = 21
const MAX_UPDATES = 3

interface State {
  date?: string
  sent?: Record<string, TodaySignature>
  updates?: number
}

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const force = args.has('--force')

function readState(): State {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as State
  } catch {
    return {}
  }
}

async function viaNtfy(topic: string, title: string, message: string): Promise<void> {
  // API JSON : les accents passent dans le titre (les en-têtes HTTP sont ASCII).
  const res = await fetch('https://ntfy.sh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, title, message, tags: ['skateboard'], click: process.env.SITE_URL || undefined }),
  })
  if (!res.ok) throw new Error(`ntfy ${res.status} ${await res.text()}`)
}

async function viaWebPush(subs: string, key: string, title: string, message: string): Promise<void> {
  webpush.setVapidDetails('https://github.com/mrpouchi/vidy-sec', VAPID_PUBLIC, key)
  const parsed = JSON.parse(subs) as webpush.PushSubscription | webpush.PushSubscription[]
  const list = Array.isArray(parsed) ? parsed : [parsed]
  const payload = JSON.stringify({ title, body: message, url: process.env.SITE_URL })
  await Promise.all(list.map((sub) => webpush.sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' })))
}

/** Envoie par tous les canaux configurés ; échoue seulement si aucun n'a marché. */
async function publish(title: string, message: string): Promise<void> {
  const { NTFY_TOPIC, PUSH_SUBSCRIPTION, VAPID_PRIVATE } = process.env
  const jobs: Promise<void>[] = []
  if (NTFY_TOPIC) jobs.push(viaNtfy(NTFY_TOPIC, title, message))
  if (PUSH_SUBSCRIPTION && VAPID_PRIVATE) jobs.push(viaWebPush(PUSH_SUBSCRIPTION, VAPID_PRIVATE, title, message))
  if (jobs.length === 0) throw new Error('aucun canal configuré (NTFY_TOPIC ou PUSH_SUBSCRIPTION + VAPID_PRIVATE)')
  const results = await Promise.allSettled(jobs)
  for (const r of results) if (r.status === 'rejected') console.error('Échec d’un canal :', r.reason)
  if (results.every((r) => r.status === 'rejected')) throw new Error('aucun canal n’a fonctionné')
}

async function main() {
  const stamp = zurichStamp()
  const today = stamp.slice(0, 10)
  const hour = Number(stamp.slice(11, 13))

  const all = parseForecast(await fetchForecast(SPOTS), SPOTS.length)
  const lines = SPOTS.map((s, k) => {
    const hours = all[k]!
    const dayStart = Math.max(0, hours.findIndex((h) => h.time >= `${today}T${String(DAILY_HOUR).padStart(2, '0')}:00`))
    return { id: s.id, ...todayLine(buildView(s, hours, stamp), dayStart) }
  })
  const sigs = Object.fromEntries(lines.map((l) => [l.id, l.sig]))

  const state = readState()
  const sameDay = state.date === today
  const daily = !sameDay && hour >= DAILY_HOUR
  const moved = sameDay && SPOTS.some((s) => state.sent?.[s.id] && changed(state.sent[s.id]!, sigs[s.id]!))
  const update = moved && hour >= DAILY_HOUR && hour < QUIET_FROM && (state.updates ?? 0) < MAX_UPDATES

  const title = `Vidy · ${longDate(dayOf(`${today}T00:00`))}`
  const body = lines.map((l) => l.text).join('\n')
  const send = force || daily || update
  const message = update && !daily && !force ? `Changement :\n${body}` : body

  console.log(`[${stamp}] ${send ? (daily ? 'quotidien' : update ? 'mise à jour' : 'forcé') : 'rien à envoyer'}`)
  console.log(`${title}\n${message}`)
  if (!send) return
  if (dryRun) return console.log('(dry-run : pas envoyé)')

  await publish(title, message)
  const next: State = {
    date: today,
    sent: sigs,
    updates: daily || !sameDay ? 0 : (state.updates ?? 0) + (update ? 1 : 0),
  }
  writeFileSync(STATE_FILE, `${JSON.stringify(next, null, 2)}\n`)
  console.log('Envoyé.')
}

main().catch((e: unknown) => {
  console.error(e)
  process.exit(1)
})
