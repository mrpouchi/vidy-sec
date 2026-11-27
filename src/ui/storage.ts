import { EMPTY_FEEDBACK, type Feedback } from '../model/feedback.ts'
import { SPOTS } from '../model/spots.ts'
import { parseSpots } from '../notify/requests.ts'

const CACHE_KEY = 'vidy:forecast:v1'
const FEEDBACK_KEY = 'vidy:feedback:v1'
const SPOTS_KEY = 'vidy:spots:v1'

export interface Cached {
  at: number
  raw: unknown
}

function read<T>(key: string): T | null {
  try {
    const s = localStorage.getItem(key)
    return s ? (JSON.parse(s) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Navigation privée ou stockage plein : l'app marche sans.
  }
}

export const readCache = () => read<Cached>(CACHE_KEY)
export const writeCache = (c: Cached) => write(CACHE_KEY, c)

export function readFeedback(): Feedback {
  const fb = read<Feedback>(FEEDBACK_KEY)
  return fb?.factors && Array.isArray(fb.log) ? { factors: { ...EMPTY_FEEDBACK.factors, ...fb.factors }, log: fb.log } : EMPTY_FEEDBACK
}
export const writeFeedback = (fb: Feedback) => write(FEEDBACK_KEY, fb)

/** Spots affichés et notifiés ; tous par défaut. */
export function readSpots(): string[] {
  return parseSpots(read<unknown>(SPOTS_KEY)) ?? SPOTS.map((s) => s.id)
}
export const writeSpots = (ids: string[]) => write(SPOTS_KEY, ids)

/** Vrai si l'utilisateur a déjà choisi ses spots (sinon : écran de bienvenue au lancement). */
export function hasChosenSpots(): boolean {
  return read<unknown>(SPOTS_KEY) !== null
}

/**
 * Sur iPhone, Safari et l'app de l'écran d'accueil ont des mémoires séparées : le choix fait dans
 * Safari voyage dans l'adresse (?spots=…) que l'iPhone enregistre à l'installation.
 * Au lancement, on l'adopte si rien n'est encore choisi.
 */
export function adoptSpotsFromUrl(): void {
  try {
    const raw = new URLSearchParams(location.search).get('spots')
    if (!raw) return
    const ids = parseSpots(raw.split(',').filter(Boolean))
    if (ids && ids.length && !hasChosenSpots()) writeSpots(ids)
  } catch {
    /* adresse illisible : l'écran de bienvenue s'affichera */
  }
}

/** Reporte le choix dans l'adresse et dans le manifeste, pour l'app que l'on va installer. */
export function carrySpotsToInstall(ids: string[]): void {
  try {
    const url = new URL(location.href)
    url.searchParams.set('spots', ids.join(','))
    history.replaceState(null, '', url)
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) return
    const base = new URL(import.meta.env.BASE_URL, location.origin).href
    const manifest = {
      name: 'Spot Checker',
      short_name: 'Spot Checker',
      lang: 'fr',
      start_url: url.href,
      scope: base,
      display: 'standalone',
      background_color: '#F2F2F7',
      theme_color: '#F2F2F7',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
      ],
    }
    link.href = `data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}`
  } catch {
    /* au pire, l'app installée redemandera les spots */
  }
}
