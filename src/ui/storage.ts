import { EMPTY_FEEDBACK, type Feedback } from '../model/feedback.ts'

const CACHE_KEY = 'vidy:forecast:v1'
const FEEDBACK_KEY = 'vidy:feedback:v1'

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
