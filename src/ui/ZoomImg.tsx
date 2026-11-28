import { useEffect, useRef } from 'preact/hooks'

const MAX = 4
const DOUBLE = 2.5

/**
 * Photo zoomable : pincer pour zoomer, glisser pour se déplacer, double-tap pour zoomer / revenir.
 * Prévient la galerie (`onZoom`) pour qu'elle bloque le défilement et le « glisser pour fermer » pendant le zoom.
 */
export function ZoomImg(props: { src: string; alt: string; active: boolean; onZoom(zoomed: boolean): void }) {
  const img = useRef<HTMLImageElement>(null)
  const onZoom = useRef(props.onZoom)
  onZoom.current = props.onZoom
  const reset = useRef<() => void>(() => {})

  // Revient à 1× quand on passe à une autre photo.
  useEffect(() => {
    if (!props.active) reset.current()
  }, [props.active])

  useEffect(() => {
    const el = img.current
    const box = el?.parentElement
    if (!el || !box) return
    let s = 1
    let tx = 0
    let ty = 0
    let zoomed = false
    // Geste en cours
    let s0 = 1
    let t0 = { x: 0, y: 0 }
    let m0 = { x: 0, y: 0 }
    let d0 = 1
    let mode: 'none' | 'pinch' | 'pan' = 'none'
    let lastTap = { t: 0, x: 0, y: 0 }
    let moved = false

    const center = () => {
      const r = box.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }
    }
    const clamp = () => {
      const c = center()
      const mx = Math.max(0, (el.offsetWidth * s - c.w) / 2)
      const my = Math.max(0, (el.offsetHeight * s - c.h) / 2)
      tx = Math.min(mx, Math.max(-mx, tx))
      ty = Math.min(my, Math.max(-my, ty))
    }
    const paint = (animate: boolean) => {
      el.style.transition = animate ? 'transform 220ms ease-out' : 'none'
      el.style.transform = s === 1 ? '' : `translate(${tx}px, ${ty}px) scale(${s})`
      const z = s > 1
      if (z !== zoomed) {
        zoomed = z
        onZoom.current(z)
      }
    }
    /** Zoome à l'échelle `next` en gardant sous le doigt le point de l'image qui était en `m0` (avec s0, t0). */
    const zoomAround = (next: number, m: { x: number; y: number }) => {
      const c = center()
      const px = (m0.x - c.x - t0.x) / s0
      const py = (m0.y - c.y - t0.y) / s0
      s = next
      tx = m.x - c.x - px * s
      ty = m.y - c.y - py * s
      clamp()
    }
    reset.current = () => {
      s = 1
      tx = ty = 0
      paint(false)
    }

    const mid = (e: TouchEvent) => ({
      x: (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2,
      y: (e.touches[0]!.clientY + e.touches[1]!.clientY) / 2,
    })
    const dist = (e: TouchEvent) =>
      Math.hypot(e.touches[0]!.clientX - e.touches[1]!.clientX, e.touches[0]!.clientY - e.touches[1]!.clientY) || 1

    const start = (e: TouchEvent) => {
      s0 = s
      t0 = { x: tx, y: ty }
      moved = e.touches.length > 1
      if (e.touches.length === 2) {
        mode = 'pinch'
        m0 = mid(e)
        d0 = dist(e)
      } else if (e.touches.length === 1 && s > 1) {
        mode = 'pan'
        m0 = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
      } else mode = 'none'
      if (mode !== 'none') e.stopPropagation()
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (mode === 'none') return
      e.preventDefault()
      e.stopPropagation()
      if (mode === 'pinch' && e.touches.length === 2) {
        // Un peu d'élasticité sous 1× et au-delà du max.
        let next = (s0 * dist(e)) / d0
        if (next < 1) next = 1 - (1 - next) / 3
        if (next > MAX) next = MAX + (next - MAX) / 3
        zoomAround(next, mid(e))
        el.style.transition = 'none'
        el.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
      } else if (mode === 'pan' && t) {
        tx = t0.x + t.clientX - m0.x
        ty = t0.y + t.clientY - m0.y
        clamp()
        paint(false)
      }
    }
    const end = (e: TouchEvent) => {
      if (mode === 'pinch') {
        if (e.touches.length === 1 && s > 1) {
          // On lève un doigt : on continue en déplacement avec l'autre.
          mode = 'pan'
          s0 = s
          t0 = { x: tx, y: ty }
          m0 = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
          return
        }
        s = Math.min(MAX, Math.max(1, s))
        if (s < 1.05) s = 1
        if (s === 1) tx = ty = 0
        clamp()
        paint(true)
      }
      if (e.touches.length === 0) mode = 'none'

      // Double-tap
      const t = e.changedTouches[0]
      if (!t || e.touches.length || moved) return
      const now = performance.now()
      if (now - lastTap.t < 300 && Math.hypot(t.clientX - lastTap.x, t.clientY - lastTap.y) < 30) {
        lastTap = { t: 0, x: 0, y: 0 }
        if (s > 1) {
          s = 1
          tx = ty = 0
        } else {
          s0 = 1
          t0 = { x: 0, y: 0 }
          m0 = { x: t.clientX, y: t.clientY }
          zoomAround(DOUBLE, m0)
        }
        paint(true)
        e.preventDefault()
      } else lastTap = { t: now, x: t.clientX, y: t.clientY }
    }
    const touchMoved = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t && e.touches.length === 1 && Math.hypot(t.clientX - lastTouch.x, t.clientY - lastTouch.y) > 10) moved = true
    }
    let lastTouch = { x: 0, y: 0 }
    const firstTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) lastTouch = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY }
    }

    box.addEventListener('touchstart', firstTouch, { passive: true })
    box.addEventListener('touchmove', touchMoved, { passive: true })
    box.addEventListener('touchstart', start, { passive: false })
    box.addEventListener('touchmove', move, { passive: false })
    box.addEventListener('touchend', end, { passive: false })
    box.addEventListener('touchcancel', end, { passive: false })
    return () => {
      box.removeEventListener('touchstart', firstTouch)
      box.removeEventListener('touchmove', touchMoved)
      box.removeEventListener('touchstart', start)
      box.removeEventListener('touchmove', move)
      box.removeEventListener('touchend', end)
      box.removeEventListener('touchcancel', end)
    }
  }, [])

  return <img ref={img} src={props.src} alt={props.alt} draggable={false} />
}
