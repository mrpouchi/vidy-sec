import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto'
// Implémentation de référence indépendante (dépendance de web-push) pour vérifier notre chiffrement.
// @ts-expect-error pas de types
import ece from 'http_ece'
import { describe, expect, it } from 'vitest'
import { VAPID_PUBLIC } from './keys.ts'
import { encryptPayload, fromB64u, parseSubscription, toB64u, vapidAuth } from './webpush.ts'

function fakeBrowser() {
  const ecdh = createECDH('prime256v1')
  ecdh.generateKeys()
  const auth = randomBytes(16)
  const sub = {
    endpoint: 'https://web.push.apple.com/abc',
    keys: { p256dh: toB64u(ecdh.getPublicKey()), auth: toB64u(auth) },
  }
  return { ecdh, auth, sub }
}

describe('web push', () => {
  it('chiffre un message que le navigateur sait déchiffrer (RFC 8291)', async () => {
    const { ecdh, auth, sub } = fakeBrowser()
    const body = await encryptPayload(sub, '{"title":"Vidy · sam. 28 nov.","body":"Bowl 🟢"}')
    const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ecdh, authSecret: auth })
    expect(plain.toString('utf8')).toBe('{"title":"Vidy · sam. 28 nov.","body":"Bowl 🟢"}')
  })

  it('signe un JWT VAPID valide (ES256) pour le bon service', async () => {
    const pair = createECDH('prime256v1')
    pair.generateKeys()
    const publicKey = toB64u(pair.getPublicKey())
    const header = await vapidAuth('https://web.push.apple.com/abc', {
      publicKey,
      privateKey: toB64u(pair.getPrivateKey()),
      subject: 'https://example.org',
    })
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)
    expect(m).not.toBeNull()
    const [, h, c, s, k] = m!
    expect(k).toBe(publicKey)
    expect(JSON.parse(Buffer.from(fromB64u(c!)).toString())).toMatchObject({ aud: 'https://web.push.apple.com' })
    const pub = fromB64u(publicKey)
    const key = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: toB64u(pub.slice(1, 33)), y: toB64u(pub.slice(33)) },
      format: 'jwk',
    })
    const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromB64u(s!)))
    expect(ok).toBe(true)
  })

  it('la clé publique VAPID est un point P-256 non compressé', () => {
    const k = fromB64u(VAPID_PUBLIC)
    expect(k.length).toBe(65)
    expect(k[0]).toBe(4)
  })

  it('refuse les abonnements invalides ou vers un service inconnu', () => {
    const { sub } = fakeBrowser()
    expect(parseSubscription(sub)).toEqual(sub)
    expect(parseSubscription({ ...sub, endpoint: 'https://evil.example.com/x' })).toBeNull()
    expect(parseSubscription({ ...sub, endpoint: 'http://web.push.apple.com/x' })).toBeNull()
    expect(parseSubscription({ ...sub, keys: { ...sub.keys, auth: 'AAAA' } })).toBeNull()
    expect(parseSubscription('nope')).toBeNull()
  })
})
