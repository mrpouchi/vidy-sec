/**
 * Heure de prise de vue d'un JPEG (EXIF DateTimeOriginal), lue dans le téléphone avant que la
 * compression ne retire les métadonnées. Ne lit que ce champ (et son fuseau s'il existe).
 */

const SOI = 0xffd8
const APP1 = 0xffe1
const TAG_EXIF_IFD = 0x8769
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_OFFSET_TIME_ORIGINAL = 0x9011
const TAG_DATETIME = 0x0132 // repli : date de modification dans IFD0

/** Renvoie l'instant (ms) ou null si absent / illisible. */
export function exifTakenAt(buf: ArrayBuffer): number | null {
  const v = new DataView(buf)
  if (v.byteLength < 4 || v.getUint16(0) !== SOI) return null
  let pos = 2
  while (pos + 4 <= v.byteLength) {
    const marker = v.getUint16(pos)
    const size = v.getUint16(pos + 2)
    if ((marker & 0xff00) !== 0xff00 || size < 2) return null
    if (marker === APP1 && readAscii(v, pos + 4, 6) === 'Exif\0\0') return fromTiff(v, pos + 10)
    if (marker === 0xffda) return null // début de l'image : pas d'EXIF avant
    pos += 2 + size
  }
  return null
}

function fromTiff(v: DataView, tiff: number): number | null {
  const order = readAscii(v, tiff, 2)
  if (order !== 'II' && order !== 'MM') return null
  const le = order === 'II'
  const u16 = (o: number) => v.getUint16(tiff + o, le)
  const u32 = (o: number) => v.getUint32(tiff + o, le)
  if (u16(2) !== 42) return null

  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>()
    if (tiff + ifd + 2 > v.byteLength) return out
    const n = u16(ifd)
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12
      if (tiff + e + 12 > v.byteLength) break
      out.set(u16(e), { type: u16(e + 2), count: u32(e + 4), at: e + 8 })
    }
    return out
  }
  const ascii = (e?: { type: number; count: number; at: number }) => {
    if (!e || e.type !== 2) return null
    const at = e.count > 4 ? u32(e.at) : e.at
    if (tiff + at + e.count > v.byteLength) return null
    return readAscii(v, tiff + at, e.count).replace(/\0+$/, '')
  }

  const ifd0 = entries(u32(4))
  const exifPtr = ifd0.get(TAG_EXIF_IFD)
  const exif = exifPtr ? entries(u32(exifPtr.at)) : new Map()
  const stamp = ascii(exif.get(TAG_DATETIME_ORIGINAL)) ?? ascii(ifd0.get(TAG_DATETIME))
  return stamp ? parseStamp(stamp, ascii(exif.get(TAG_OFFSET_TIME_ORIGINAL))) : null
}

/** « 2026:11:28 15:02:31 » (+ « +01:00 » éventuel). Sans fuseau : heure locale du téléphone. */
export function parseStamp(stamp: string, offset: string | null): number | null {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(stamp)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number) as [number, number, number, number, number, number]
  if (y < 2000 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null
  const o = offset && /^([+-])(\d{2}):(\d{2})$/.exec(offset)
  if (o) {
    const sign = o[1] === '-' ? -1 : 1
    return Date.UTC(y, mo - 1, d, h, mi, s) - sign * (Number(o[2]) * 60 + Number(o[3])) * 60_000
  }
  return new Date(y, mo - 1, d, h, mi, s).getTime()
}

function readAscii(v: DataView, at: number, len: number): string {
  let s = ''
  for (let i = 0; i < len && at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(at + i))
  return s
}
