/** Signal anonyme quotidien (compteur d'utilisateurs) : un identifiant aléatoire, rien d'autre. */
import { PUSH_API } from './push.ts'

const ID = 'vidy:device:v1'
const LAST = 'vidy:ping-day:v1'

export function ping(): void {
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return // développement : pas compté
  try {
    const standalone =
      matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    const mode = standalone ? 'app' : 'web'
    const today = new Date().toISOString().slice(0, 10)
    if (localStorage.getItem(LAST) === `${today}:${mode}`) return // déjà compté aujourd'hui
    let id = localStorage.getItem(ID)
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem(ID, id)
    }
    void fetch(`${PUSH_API}/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, mode }),
      keepalive: true,
    }).then((r) => r.ok && localStorage.setItem(LAST, `${today}:${mode}`), () => {})
  } catch {
    /* stockage indisponible (navigation privée) : pas compté */
  }
}
