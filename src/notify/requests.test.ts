import { describe, expect, it } from 'vitest'
import { bodyFor, type NotifyPlan } from './plan.ts'
import { parseSpotRequest, parseSpots } from './requests.ts'

const plan = (kind: NotifyPlan['kind'], moved: string[] = []): NotifyPlan => ({
  kind,
  title: 'Vidy · sam. 28 nov.',
  lines: [
    { id: 'bowl', text: 'Bowl 🟢 sec toute la journée' },
    { id: 'route', text: 'Route 🟢 sec toute la journée' },
  ],
  moved,
  next: {},
})

describe('notifications par spot', () => {
  it('chacun ne reçoit que ses spots', () => {
    expect(bodyFor(plan('daily'))).toBe('Bowl 🟢 sec toute la journée\nRoute 🟢 sec toute la journée')
    expect(bodyFor(plan('daily'), ['route'])).toBe('Route 🟢 sec toute la journée')
    expect(bodyFor(plan('daily'), [])).toBeNull()
  })

  it('une mise à jour ne part que si un de ses spots a changé', () => {
    expect(bodyFor(plan('update', ['bowl']), ['route'])).toBeNull()
    expect(bodyFor(plan('update', ['bowl']), ['bowl', 'route'])).toBe(
      'Changement :\nBowl 🟢 sec toute la journée\nRoute 🟢 sec toute la journée',
    )
  })
})

describe('validation', () => {
  it('choix de spots', () => {
    expect(parseSpots(['leysin', 'bowl', 'bowl'])).toEqual(['leysin', 'bowl'])
    expect(parseSpots([])).toEqual([])
    expect(parseSpots(['route', 'bowl'])).toEqual(['bowl']) // spot retiré : ignoré, le reste du choix est gardé
    expect(parseSpots(['plage'])).toEqual([])
    expect(parseSpots('bowl')).toBeNull()
    expect(parseSpots([3])).toBeNull()
  })

  it('demande de spot', () => {
    expect(parseSpotRequest({ name: '  Renens  ', place: 'Rue  du\nSimplon', note: 7 })).toEqual({
      name: 'Renens',
      place: 'Rue du Simplon',
      note: '',
    })
    expect(parseSpotRequest({ name: 'x' })).toBeNull()
    expect(parseSpotRequest({ name: 'a'.repeat(500) })?.name.length).toBe(80)
    expect(parseSpotRequest(null)).toBeNull()
  })
})
