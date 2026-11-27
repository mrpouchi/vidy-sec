import { CAL } from './calibration.ts'
import type { Level } from './drying.ts'
import type { SpotKind } from './spots.ts'

export type Said = 'dry' | 'wet'

export interface Report {
  at: string // 'YYYY-MM-DDTHH:MM' heure de Zurich
  spot: SpotKind
  said: Said
  predicted: Level
}

export interface Feedback {
  factors: Record<SpotKind, number>
  log: Report[]
}

export const EMPTY_FEEDBACK: Feedback = { factors: { bowl: 1, route: 1 }, log: [] }

/** Ajuste la vitesse de séchage du spot selon ce que l'utilisateur a constaté sur place. */
export function adjustFactor(factor: number, said: Said, predicted: Level): number {
  const f = CAL.feedback
  let m = 1
  if (said === 'dry' && predicted !== 'dry') m = f.up
  else if (said === 'wet' && predicted === 'dry') m = f.down
  else if (said === 'wet' && predicted === 'ride') m = f.soft
  return Math.min(f.max, Math.max(f.min, factor * m))
}

export function addReport(fb: Feedback, r: Report): Feedback {
  return {
    factors: { ...fb.factors, [r.spot]: adjustFactor(fb.factors[r.spot], r.said, r.predicted) },
    log: [...fb.log, r].slice(-200),
  }
}
