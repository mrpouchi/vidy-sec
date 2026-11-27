/** Retours terrain (« Sec » / « Mouillé ») envoyés au serveur pour recalibrer le modèle. */
import type { Report } from '../model/feedback.ts'
import { isSpotId } from './photos.ts'

const LEVELS = new Set(['dry', 'ride', 'wet'])
const NUANCES = new Set(['puddles', 'damp', 'dew', 'rain', 'snow', 'ice', 'wet', 'flooded', 'none'])

/** Retour anonyme : spot, ce qui a été constaté, ce que l'app prévoyait, et quand. */
export interface SentReport extends Report {
  nuance?: string
}

export function parseReport(value: unknown): SentReport | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { [k: string]: unknown }
  if (!isSpotId(v.spot)) return null
  if (v.said !== 'dry' && v.said !== 'wet') return null
  if (typeof v.predicted !== 'string' || !LEVELS.has(v.predicted)) return null
  if (typeof v.at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v.at)) return null
  const out: SentReport = { spot: v.spot, said: v.said, predicted: v.predicted as Report['predicted'], at: v.at }
  if (typeof v.nuance === 'string' && NUANCES.has(v.nuance)) out.nuance = v.nuance
  return out
}
