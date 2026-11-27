import { describe, expect, it } from 'vitest'
import { exifTakenAt, parseStamp } from './exif.ts'

/** JPEG minimal : SOI + APP1 Exif (IFD0 → Exif IFD → DateTimeOriginal [+ OffsetTimeOriginal]) + SOS. */
function jpegWithExif(stamp: string, offset: string | null, le: boolean): ArrayBuffer {
  const tiff: number[] = []
  const u16 = (n: number) => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff])
  const u32 = (n: number) => (le ? [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24] : [n >>> 24, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff])
  const str = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0)

  const exifTags = offset ? 2 : 1
  const ifd0 = 8 // juste après l'en-tête TIFF
  const exifIfd = ifd0 + 2 + 12 + 4
  const data = exifIfd + 2 + exifTags * 12 + 4
  const dt = str(stamp) // 20 octets
  const off = offset ? str(offset) : []

  tiff.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0))
  tiff.push(...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd), ...u32(0))
  tiff.push(...u16(exifTags), ...u16(0x9003), ...u16(2), ...u32(dt.length), ...u32(data))
  if (offset) tiff.push(...u16(0x9011), ...u16(2), ...u32(off.length), ...u32(data + dt.length))
  tiff.push(...u32(0), ...dt, ...off)

  const app1 = [...'Exif'].map((c) => c.charCodeAt(0)).concat(0, 0, ...tiff)
  const len = app1.length + 2
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...app1, 0xff, 0xda, 0, 2]).buffer
}

describe('heure de prise de vue (EXIF)', () => {
  it('lit DateTimeOriginal avec fuseau (iPhone récent)', () => {
    const at = exifTakenAt(jpegWithExif('2026:11:28 15:02:31', '+01:00', false))
    expect(at).toBe(Date.UTC(2026, 10, 28, 14, 2, 31))
  })

  it('lit aussi un EXIF « little endian » sans fuseau (heure locale)', () => {
    const at = exifTakenAt(jpegWithExif('2026:11:28 15:02:31', null, true))
    expect(at).toBe(new Date(2026, 10, 28, 15, 2, 31).getTime())
  })

  it('renvoie null sans EXIF ou sur des données invalides', () => {
    expect(exifTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 2]).buffer)).toBeNull()
    expect(exifTakenAt(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull()
    expect(exifTakenAt(jpegWithExif('pas une date        ', null, true))).toBeNull()
    expect(parseStamp('2026:13:01 10:00:00', null)).toBeNull()
  })
})
