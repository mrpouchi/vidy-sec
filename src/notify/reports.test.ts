import { describe, expect, it } from 'vitest'
import { parseReport } from './reports.ts'

describe('retours terrain', () => {
  const ok = { spot: 'bowl', said: 'dry', predicted: 'ride', at: '2026-11-28T15:02', nuance: 'puddles' }

  it('accepte un retour complet', () => {
    expect(parseReport(ok)).toEqual(ok)
    expect(parseReport({ ...ok, nuance: undefined })).toEqual({ spot: 'bowl', said: 'dry', predicted: 'ride', at: '2026-11-28T15:02' })
  })

  it('refuse les retours invalides et ignore les champs inconnus', () => {
    expect(parseReport({ ...ok, spot: 'plage' })).toBeNull()
    expect(parseReport({ ...ok, said: 'peut-être' })).toBeNull()
    expect(parseReport({ ...ok, predicted: 'boue' })).toBeNull()
    expect(parseReport({ ...ok, at: 'hier' })).toBeNull()
    expect(parseReport({ ...ok, ip: '1.2.3.4' })).not.toHaveProperty('ip')
    expect(parseReport({ ...ok, nuance: '<script>' })).not.toHaveProperty('nuance')
  })
})
