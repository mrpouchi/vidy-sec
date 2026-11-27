/**
 * Web Push sans dépendance, en WebCrypto pur (marche dans un Worker Cloudflare et dans Node ≥ 20).
 *  - Chiffrement du message : RFC 8291 (aes128gcm, RFC 8188).
 *  - Authentification du serveur : VAPID, RFC 8292 (JWT ES256).
 */

export interface PushSub {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface Vapid {
  publicKey: string // base64url, point P-256 non compressé (65 octets)
  privateKey: string // base64url, scalaire d (32 octets)
  subject: string // https://… ou mailto:…
}

type Bytes = Uint8Array<ArrayBuffer>
const text = new TextEncoder()

export function toB64u(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64u(b64: string): Bytes {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8))
}

/** Corps chiffré aes128gcm d'une notification (un seul enregistrement). */
export async function encryptPayload(sub: PushSub, payload: string): Promise<Bytes> {
  const uaPublic = fromB64u(sub.keys.p256dh)
  const authSecret = fromB64u(sub.keys.auth)
  const salt = crypto.getRandomValues(new Uint8Array(16))

  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])) as CryptoKeyPair
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey))
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256))

  const ikm = await hkdf(authSecret, shared, concat(text.encode('WebPush: info\0'), uaPublic, asPublic), 32)
  const cek = await hkdf(salt, ikm, text.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, text.encode('Content-Encoding: nonce\0'), 12)

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  const padded = concat(text.encode(payload), new Uint8Array([2])) // 0x02 : dernier enregistrement
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, padded))

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, cipher)
}

/** En-tête `Authorization` VAPID pour le service push de cet abonnement. */
export async function vapidAuth(endpoint: string, vapid: Vapid, now = Date.now()): Promise<string> {
  const pub = fromB64u(vapid.publicKey)
  const jwk: JsonWebKey = {
    kty: 'EC',
    crv: 'P-256',
    x: toB64u(pub.slice(1, 33)),
    y: toB64u(pub.slice(33, 65)),
    d: vapid.privateKey,
    ext: true,
  }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const head = toB64u(text.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: vapid.subject }
  const body = toB64u(text.encode(JSON.stringify(claims)))
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, text.encode(`${head}.${body}`)))
  return `vapid t=${head}.${body}.${toB64u(sig)}, k=${vapid.publicKey}`
}

/** Envoie une notification ; renvoie le code HTTP du service push (201 = acceptée, 404/410 = abonnement mort). */
export async function sendPush(sub: PushSub, payload: string, vapid: Vapid, ttl = 6 * 3600): Promise<number> {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body: await encryptPayload(sub, payload),
  })
  return res.status
}

const PUSH_HOSTS = /(^|\.)(push\.apple\.com|fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com)$/

/** Valide un abonnement reçu d'un navigateur (forme + service push connu). */
export function parseSubscription(value: unknown): PushSub | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<PushSub>
  if (typeof v.endpoint !== 'string' || typeof v.keys?.p256dh !== 'string' || typeof v.keys.auth !== 'string') return null
  try {
    const url = new URL(v.endpoint)
    if (url.protocol !== 'https:' || !PUSH_HOSTS.test(url.hostname)) return null
    if (fromB64u(v.keys.p256dh).length !== 65 || fromB64u(v.keys.auth).length !== 16) return null
  } catch {
    return null
  }
  return { endpoint: v.endpoint, keys: { p256dh: v.keys.p256dh, auth: v.keys.auth } }
}
