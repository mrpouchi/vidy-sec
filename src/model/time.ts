/** Helpers d'heure locale Europe/Zurich. Les heures sont des chaînes 'YYYY-MM-DDTHH:00'. */

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Zurich',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 'YYYY-MM-DDTHH:MM' en heure de Zurich. */
export function zurichStamp(d: Date = new Date()): string {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

/** Index de l'heure « en cours » : premier créneau qui se termine maintenant ou après. */
export function nowIndex(times: readonly { time: string }[], stamp: string): number {
  const i = times.findIndex((t) => t.time >= stamp)
  return i === -1 ? times.length - 1 : i
}

export const dayOf = (time: string): string => time.slice(0, 10)
export const hourOf = (time: string): number => Number(time.slice(11, 13))

export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / 86_400_000)
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const WEEKDAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'] as const
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const

const WEEKDAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const

/** Abrégé ('lun.') : seulement là où la place manque (graduations, tableau 7 jours). */
export function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]!
}

/** En toutes lettres ('lundi') : dans les phrases. */
export function weekdayLong(date: string): string {
  return WEEKDAYS_LONG[new Date(`${date}T12:00:00Z`).getUTCDay()]!
}

/** 'samedi 29 nov.' */
export function longDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${weekdayLong(date)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** '14h', 'demain 14h', 'jeudi 14h', 'minuit', 'dimanche minuit' — relatif à `ref`. */
export function when(time: string, ref: string): string {
  // 0h appartient à la veille dans le langage courant : « lundi 0h » → « dimanche minuit ».
  const midnight = hourOf(time) === 0
  const day = midnight ? addDays(dayOf(time), -1) : dayOf(time)
  const diff = dayDiff(ref, day)
  const h = midnight ? 'minuit' : `${hourOf(time)}h`
  if (diff === 0) return h
  if (diff === 1 && !midnight) return `demain ${h}` // « demain minuit » se lit mal : on nomme le jour
  return `${weekdayLong(day)} ${h}`
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
