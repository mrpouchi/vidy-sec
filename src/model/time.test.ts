import { describe, expect, it } from 'vitest'
import { longDate, when } from './time.ts'

describe('heures en toutes lettres', () => {
  const ref = '2026-11-28T00:30' // samedi
  it('aujourd’hui, demain, puis le jour en toutes lettres', () => {
    expect(when('2026-11-28T14:00', ref)).toBe('14h')
    expect(when('2026-11-29T14:00', ref)).toBe('demain 14h')
    expect(when('2026-11-30T14:00', ref)).toBe('lundi 14h')
  })

  it('0h se dit minuit, le soir d’avant', () => {
    expect(when('2026-11-29T00:00', ref)).toBe('minuit') // nuit de samedi à dimanche
    expect(when('2026-11-30T00:00', ref)).toBe('dimanche minuit')
    expect(when('2026-12-01T00:00', ref)).toBe('lundi minuit')
  })

  it('date longue des notifications', () => {
    expect(longDate('2026-11-28')).toBe('samedi 28 nov.')
  })
})
