import { describe, expect, it } from 'vitest'
import { newUserMessage, parsePing, pingKey, summarize } from './stats.ts'

const A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const B = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('compteur anonyme', () => {
  it('n’accepte qu’un identifiant aléatoire et un mode', () => {
    expect(parsePing({ id: A, mode: 'app' })).toEqual({ id: A, mode: 'app' })
    expect(parsePing({ id: 'youssef', mode: 'app' })).toBeNull()
    expect(parsePing({ id: A, mode: 'tv' })).toBeNull()
  })

  it('compte les appareils actifs par jour et les appareils uniques', () => {
    const keys = [
      pingKey('2026-11-27', 'app', A),
      pingKey('2026-11-28', 'app', A),
      pingKey('2026-11-28', 'app', B),
      pingKey('2026-11-28', 'web', B),
    ]
    expect(summarize(keys)).toEqual({
      days: [
        { day: '2026-11-28', app: 2, web: 1 },
        { day: '2026-11-27', app: 1, web: 0 },
      ],
      unique: { app: 2, web: 1 },
    })
  })
})

describe('notif nouvel utilisateur', () => {
  it('distingue installation et visite, avec le rang', () => {
    expect(newUserMessage('app', 1, 'u')).toEqual({
      title: 'Nouvelle installation 🎉',
      body: 'Quelqu’un a ajouté Spot Checker à son écran d’accueil · 1er appareil',
      url: 'u',
    })
    expect(newUserMessage('web', 4, 'u').body).toBe('Quelqu’un a ouvert Spot Checker dans le navigateur · 4e visiteur')
  })
})
