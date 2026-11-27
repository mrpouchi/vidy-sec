import { describe, expect, it } from 'vitest'
import { ago, cleanCaption, dayTime, followersAwake, followersOf, isJpeg, isSpotId, PHOTO_MAX_BYTES, timesLine, validTakenAt } from './photos.ts'

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

  it('accepte une heure de prise des 7 derniers jours, pas dans le futur', () => {
    const now = Date.UTC(2026, 10, 28, 18)
    expect(validTakenAt(now - 3 * 3_600_000, now)).toBe(true) // prise à 15h, envoyée à 18h
    expect(validTakenAt(now + 2 * 60_000, now)).toBe(true) // horloge du téléphone un peu en avance
    expect(validTakenAt(now + 3_600_000, now)).toBe(false)
    expect(validTakenAt(now - 8 * 86_400_000, now)).toBe(false)
    expect(validTakenAt(Number.NaN, now)).toBe(false)
  })

  it('affiche l’heure de prise, et celle de publication si elle est différente', () => {
    const now = Date.UTC(2026, 10, 28, 17, 30) // 18h30 à Zurich
    const at15 = Date.UTC(2026, 10, 28, 14, 2) // 15h02
    expect(dayTime(at15, now)).toBe('à 15h02')
    expect(dayTime(at15 - 86_400_000, now)).toBe('hier à 15h02')
    expect(dayTime(at15 - 3 * 86_400_000, now)).toBe('mercredi à 15h02')
    expect(timesLine({ id: 'a', spot: 'bowl', caption: '', at: at15, posted: at15 + 3 * 3_600_000 }, now)).toBe(
      'Prise à 15h02 · publiée à 18h02',
    )
    expect(timesLine({ id: 'a', spot: 'bowl', caption: '', at: at15, posted: at15 + 60_000 }, now)).toBe('Prise à 15h02')
  })

  it('prévient ceux qui suivent le spot, sauf le propriétaire et l’auteur', () => {
    const subs = [
      { key: 'a', rec: {} }, // tous les spots (jamais touché à « Mes spots »)
      { key: 'b', rec: { spots: ['bowl'] } },
      { key: 'c', rec: { spots: ['route', 'leysin'] } },
      { key: 'owner', rec: { spots: ['bowl'] } },
      { key: 'author', rec: {} },
    ]
    expect(followersOf(subs, 'bowl', new Set(['owner', 'author'])).map((s) => s.key)).toEqual(['a', 'b'])
    expect(followersOf(subs, 'leysin', new Set()).map((s) => s.key)).toEqual(['a', 'c', 'author'])
  })

  it('seulement en journée (8h–21h)', () => {
    expect(followersAwake(7)).toBe(false)
    expect(followersAwake(8)).toBe(true)
    expect(followersAwake(20)).toBe(true)
    expect(followersAwake(21)).toBe(false)
    expect(followersAwake(0)).toBe(false)
  })
})
