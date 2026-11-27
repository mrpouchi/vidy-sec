/** Envoi des retours terrain au serveur, avec une file d'attente si on est hors ligne (au spot, réseau faible). */
import type { SentReport } from '../notify/reports.ts'
import { PUSH_API } from './push.ts'

const QUEUE = 'vidy:reports-queue:v1'

function readQueue(): SentReport[] {
  try {
    const q = JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as unknown
    return Array.isArray(q) ? (q as SentReport[]) : []
  } catch {
    return []
  }
}

function writeQueue(q: SentReport[]): void {
  try {
    if (q.length) localStorage.setItem(QUEUE, JSON.stringify(q.slice(-50)))
    else localStorage.removeItem(QUEUE)
  } catch {
    /* navigation privée : le retour est perdu si l'envoi échoue */
  }
}

let flushing = false

/** Envoie ce qui attend ; garde ce qui n'est pas passé (réseau). Les retours refusés (400) sont abandonnés. */
export async function flushReports(): Promise<void> {
  if (flushing) return
  flushing = true
  try {
    const batch = readQueue()
    const left: SentReport[] = []
    for (const r of batch) {
      try {
        const res = await fetch(`${PUSH_API}/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(r),
          keepalive: true,
        })
        if (res.status >= 500) left.push(r)
      } catch {
        left.push(r)
      }
    }
    // Ceux qui n'ont pas pu partir + ceux ajoutés pendant l'envoi.
    writeQueue([...left, ...readQueue().slice(batch.length)])
  } finally {
    flushing = false
  }
}

export function sendReport(r: SentReport): void {
  writeQueue([...readQueue(), r])
  void flushReports()
}

const MIGRATED = 'vidy:reports-migrated:v1'

/** Une seule fois : envoie les retours enregistrés avant l'envoi automatique (ex-« Copier mes retours »). */
export function migrateLocalLog(log: readonly SentReport[]): void {
  try {
    if (localStorage.getItem(MIGRATED)) return
    localStorage.setItem(MIGRATED, '1')
  } catch {
    return
  }
  if (log.length) writeQueue([...readQueue(), ...log])
}
