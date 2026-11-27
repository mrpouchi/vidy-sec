import { useEffect, useRef, useState } from 'preact/hooks'
import { CAL } from '../model/calibration.ts'
import { usable } from '../model/spots.ts'
import { formatMm, statusWord, type SpotView } from '../model/summary.ts'
import { capitalize, dayOf, hourOf, weekday, when } from '../model/time.ts'

const SPAN = 48
const RAIN_FULL = 3 // mm/h pour une barre de pluie pleine hauteur
const LINGER = 3000 // ms : au doigt, le détail reste affiché après avoir levé le doigt

/** Ruban des 48 prochaines heures. Glisser le doigt dessus affiche le détail. */
export function HourStrip({ view }: { view: SpotView }) {
  const { states, hours, now, spot } = view
  const end = Math.min(states.length, now + SPAN)
  const s = states.slice(now, end)
  const h = hours.slice(now, end)
  const n = s.length
  const [sel, setSel] = useState<number | null>(null)
  const area = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const timer = useRef<number>()
  useEffect(() => () => clearTimeout(timer.current), [])

  const pick = (e: PointerEvent) => {
    clearTimeout(timer.current)
    const r = area.current!.getBoundingClientRect()
    setSel(Math.min(n - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * n))))
  }
  const clear = () => {
    pressed.current = false
    clearTimeout(timer.current)
    setSel(null)
  }
  /** Doigt levé : on garde l'heure choisie lisible quelques secondes (un tap suffit). */
  const linger = () => {
    pressed.current = false
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setSel(null), LINGER)
  }

  let head = 'Prochaines 48 h'
  if (sel !== null) {
    const x = h[sel]!
    const parts = [capitalize(when(x.time, h[0]!.time)), statusWord(s[sel]!), `${formatMm(x.precip)} mm`, `${Math.round(x.temp)}°`]
    if (s[sel]!.risk && x.prob !== null && x.precip < CAL.rainHour) parts.push(`averse ${x.prob} %`)
    head = parts.join(' · ')
  }

  const ticks = h.flatMap((x, i) => {
    const hr = hourOf(x.time)
    if (i === 0) return [{ i, label: 'Maint.', first: true }]
    if (hr % 6 !== 0 || i < 7 || i > n - 3) return [] // pas collé à « Maint. » ni au bord droit
    return [{ i, label: hr === 0 ? weekday(dayOf(x.time)) : `${hr}h`, first: false }]
  })

  return (
    <div class="strip">
      <p class={`strip-head${sel !== null ? ' active' : ''}`} aria-live="polite">
        {head}
      </p>
      {/* Zone tactile : barres + heures, avec une marge invisible au-dessus et en dessous. */}
      <div
        class="strip-hit"
        role="img"
        aria-label="Statut heure par heure sur 48 heures"
        onPointerDown={(e) => {
          pressed.current = true
          pick(e)
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {
            /* pointeur déjà relâché : le détail s'affiche quand même */
          }
        }}
        onPointerMove={(e) => {
          if (pressed.current || e.pointerType === 'mouse') pick(e)
        }}
        onPointerUp={(e) => (e.pointerType === 'mouse' ? (pressed.current = false) : linger())}
        onPointerCancel={clear}
        onPointerLeave={(e) => e.pointerType === 'mouse' && clear()}
      >
        <div ref={area} class="strip-area">
          <div class="strip-rain" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {h.map((x) => (
              <i style={{ height: x.precip >= CAL.rainHour ? `${Math.max(2, Math.min(1, x.precip / RAIN_FULL) * 12)}px` : 0 }} />
            ))}
          </div>
          <div class="strip-bars" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {s.map((x, i) => (
              <i class={`l-${x.level}${usable(spot, h[i]!) ? '' : ' night'}${x.risk ? ' risk' : ''}`} />
            ))}
          </div>
          {sel !== null && <span class="strip-cursor" style={{ left: `${((sel + 0.5) / n) * 100}%` }} />}
        </div>
        <div class="strip-ticks" aria-hidden="true">
          {ticks.map((t) => (
            <span class={t.first ? 'first' : ''} style={t.first ? undefined : { left: `${((t.i + 0.5) / n) * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
