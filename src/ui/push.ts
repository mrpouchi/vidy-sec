/** Web Push : abonnement depuis l'app installée sur l'écran d'accueil (iOS ≥ 16.4). */

export const VAPID_PUBLIC =
  'BJaU-TwH4XmzRzr3G_us6rPP7hu04YYo3bhdIcrokHRktEWF0M_839ccgza13Khgb9Mydml0w6Wz5gk826D98mc'

export type PushSupport = 'ok' | 'install' | 'none'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return 'none'
  if ('PushManager' in window && 'Notification' in window) return 'ok'
  // Sur iPhone, Safari n'expose Push qu'une fois le site ajouté à l'écran d'accueil.
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
  return ios ? 'install' : 'none'
}

export function registerWorker(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
}

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

/** Demande la permission et renvoie l'abonnement (JSON) à copier dans le secret GitHub. */
export async function subscribe(): Promise<string> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('refusé')
  const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC) }))
  return JSON.stringify(sub)
}
