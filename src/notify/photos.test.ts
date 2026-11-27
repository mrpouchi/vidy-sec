import { describe, expect, it } from 'vitest'
import { ago, cleanCaption, isJpeg, isSpotId, PHOTO_MAX_BYTES } from './photos.ts'

describe('photos', () => {
  it('accepte seulement un vrai JPEG de taille raisonnable', () => {
    const jpeg = new Uint8Array(1000).fill(1)
    jpeg.set([0xff, 0xd8, 0xff])
    expect(isJpeg(jpeg)).toBe(true)
    expect(isJpeg(new Uint8Array(1000))).toBe(false) // pas la signature
    const big = new Uint8Array(PHOTO_MAX_BYTES + 1)
    big.set([0xff, 0xd8, 0xff])
    expect(isJpeg(big)).toBe(false)
  })

  it('nettoie la légende et valide le spot', () => {
    expect(cleanCaption('  flaques\n au   fond ')).toBe('flaques au fond')
    expect(cleanCaption('a'.repeat(300)).length).toBe(140)
    expect(cleanCaption(undefined)).toBe('')
    expect(isSpotId('bowl')).toBe(true)
    expect(isSpotId('plage')).toBe(false)
  })

  it('affiche l’âge de la photo', () => {
    const now = Date.UTC(2026, 10, 28, 12)
    expect(ago(now - 20_000, now)).toBe('à l’instant')
    expect(ago(now - 25 * 60_000, now)).toBe('il y a 25 min')
    expect(ago(now - 3 * 3_600_000, now)).toBe('il y a 3 h')
    expect(ago(now - 26 * 3_600_000, now)).toBe('hier')
    expect(ago(now - 4 * 86_400_000, now)).toBe('il y a 4 j')
  })
})
