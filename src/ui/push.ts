/** Web Push : abonnement depuis l'app installée sur l'écran d'accueil (iOS ≥ 16.4). */
import { VAPID_PUBLIC } from '../notify/keys.ts'
import { fromB64u } from '../notify/webpush.ts'

/** Worker Cloudflare qui garde les abonnements et envoie les notifications (worker/index.ts). */
export const PUSH_API = 'https://spot-checker.spotchecker.workers.dev'

export type PushSupport = 'ok' | 'install' | 'none'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'none'
  if ('PushManager' in window && 'Notification' in window) return 'ok'
  // Sur iPhone, Safari n'expose Push qu'une fois le site ajouté à l'écran d'accueil.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return ios ? 'install' : 'none'
}

const workerUrl = () => `${import.meta.env.BASE_URL}sw.js`

// Dernière adresse d'abonnement connue : si iOS en donne une nouvelle, le serveur fait le lien.
const LAST_ENDPOINT = 'vidy:push-endpoint:v1'
const lastEndpoint = () => {
  try {
    return localStorage.getItem(LAST_ENDPOINT) ?? undefined
  } catch {
    return undefined
  }
}
const rememberEndpoint = (e: string) => {
  try {
    localStorage.setItem(LAST_ENDPOINT, e)
  } catch {
    /* navigation privée */
  }
}

async function register(sub: PushSubscription, spots: string[]): Promise<void> {
  await post('POST', { subscription: sub.toJSON(), spots, previous: lastEndpoint() })
  rememberEndpoint(sub.endpoint)
}

export function registerWorker(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(workerUrl()).catch(() => {})
}

export async function isSubscribed(): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration(workerUrl())
  return Boolean(await reg?.pushManager.getSubscription())
}

async function post(method: 'POST' | 'DELETE', body: unknown): Promise<void> {
  const res = await fetch(`${PUSH_API}/subscribe`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`serveur ${res.status}`)
}

/** Demande la permission, s'abonne et enregistre l'abonnement (et les spots choisis) sur le serveur. */
export async function subscribe(spots: string[]): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('refusé')
  const reg = await navigator.serviceWorker.register(workerUrl())
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(VAPID_PUBLIC) }))
  await register(sub, spots)
}

/** Met à jour les spots notifiés si l'appareil est abonné. */
export async function syncSpots(spots: string[]): Promise<void> {
  if (!(await isSubscribed())) return
  const reg = await navigator.serviceWorker.getRegistration(workerUrl())
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await register(sub, spots)
}

/** Au lancement : si iOS a changé l'adresse d'abonnement en silence, on prévient le serveur. */
export async function refreshSubscription(spots: string[]): Promise<void> {
  if (!(await isSubscribed())) return
  const reg = await navigator.serviceWorker.getRegistration(workerUrl())
  const sub = await reg?.pushManager.getSubscription()
  if (sub && sub.endpoint !== lastEndpoint()) await register(sub, spots)
}

/** Envoie une demande de nouveau spot. */
export async function requestSpot(ask: { name: string; place: string; note: string }): Promise<void> {
  const res = await fetch(`${PUSH_API}/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ask),
  })
  if (res.status === 429) throw new Error('trop')
  if (!res.ok) throw new Error(`serveur ${res.status}`)
}

export async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(workerUrl())
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await post('DELETE', { endpoint: sub.endpoint }).catch(() => {}) // le serveur nettoie aussi les abonnements morts
  await sub.unsubscribe()
}

/** Adresse d'abonnement de cet appareil (pour ne pas se notifier soi-même), ou null. */
export async function currentEndpoint(): Promise<string | null> {
  try {
    if (!(await isSubscribed())) return null
    const reg = await navigator.serviceWorker.getRegistration(workerUrl())
    return (await reg?.pushManager.getSubscription())?.endpoint ?? null
  } catch {
    return null
  }
}

/** Rend cet appareil propriétaire (notifs nouveaux utilisateurs, spots proposés, photos) avec un code à usage unique. */
export async function claimOwner(code: string): Promise<string> {
  const endpoint = await currentEndpoint()
  if (!endpoint) return 'Active d’abord les notifications sur cet appareil.'
  const res = await fetch(`${PUSH_API}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, endpoint }),
  }).catch(() => null)
  if (!res) return 'Pas de réseau.'
  if (res.ok) return 'C’est bon ✅'
  if (res.status === 429) return 'Attends une minute et réessaie.'
  return 'Code invalide ou expiré.'
}
