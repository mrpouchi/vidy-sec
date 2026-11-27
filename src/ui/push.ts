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

/** Demande la permission, s'abonne et enregistre l'abonnement sur le serveur. */
export async function subscribe(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('refusé')
  const reg = await navigator.serviceWorker.register(workerUrl())
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(VAPID_PUBLIC) }))
  await post('POST', sub.toJSON())
}

export async function unsubscribe(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(workerUrl())
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await post('DELETE', { endpoint: sub.endpoint }).catch(() => {}) // le serveur nettoie aussi les abonnements morts
  await sub.unsubscribe()
}
