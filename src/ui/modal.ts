import { useEffect, useRef } from 'preact/hooks'

let locks = 0
let savedY = 0

/**
 * Bloque le défilement de la page derrière une fenêtre.
 * Sur iPhone, `overflow: hidden` ne suffit pas : on fige le body à sa position et on la restaure.
 */
function lockScroll(): void {
  if (locks++ > 0) return
  savedY = window.scrollY
  const b = document.body.style
  b.position = 'fixed'
  b.top = `-${savedY}px`
  b.left = '0'
  b.right = '0'
  b.overflow = 'hidden'
}

function unlockScroll(): void {
  if (--locks > 0) return
  const b = document.body.style
  b.position = b.top = b.left = b.right = b.overflow = ''
  window.scrollTo(0, savedY)
}

/**
 * <dialog> modale pilotée par `open` :
 *  - le focus va sur la fenêtre elle-même (pas sur le premier bouton, qui s'affichait en surbrillance) ;
 *  - la page derrière ne défile plus.
 */
export function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d || !open) return
    if (!d.open) d.showModal()
    d.focus({ preventScroll: true })
    lockScroll()
    return () => {
      unlockScroll()
      if (d.open) d.close()
    }
  }, [open])
  return ref
}

/** Ferme seulement sur un tap en dehors de la feuille (le fond), pas dans ses marges. */
export function closeOnBackdrop(e: MouseEvent, onClose: () => void): void {
  const d = e.currentTarget as HTMLDialogElement
  if (e.target !== d) return
  const r = d.getBoundingClientRect()
  if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) onClose()
}

/**
 * « Balayer vers le bas pour fermer » (comme Photos / les feuilles iOS).
 * La fenêtre suit le doigt ; au relâchement, elle se ferme si on a tiré assez loin ou assez vite,
 * sinon elle revient en place. Les gestes horizontaux (galerie) ne sont pas interceptés.
 *
 * @param target  élément déplacé (la feuille, ou le contenu de la visionneuse)
 * @param handle  zone qui démarre le geste (par défaut : target)
 * @param fade    élément dont l'opacité suit le geste (fond noir de la visionneuse)
 */
export function useSwipeDown(
  target: { current: HTMLElement | null },
  onClose: () => void,
  opts: { handle?: { current: HTMLElement | null }; fade?: { current: HTMLElement | null }; active: boolean },
) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const el = target.current
    const zone = opts.handle?.current ?? el
    if (!opts.active || !el || !zone) return
    let x0 = 0
    let y0 = 0
    let t0 = 0
    let dy = 0
    let axis: 'none' | 'down' | 'other' = 'none'

    const paint = (y: number, animate: boolean) => {
      const ease = animate ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none'
      el.style.transition = ease
      el.style.transform = y ? `translateY(${y}px)` : ''
      const f = opts.fade?.current
      if (f) {
        f.style.transition = ease
        f.style.backgroundColor = y ? `rgba(0, 0, 0, ${Math.max(0.2, 1 - y / 400)})` : ''
      }
    }
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      x0 = e.touches[0]!.clientX
      y0 = e.touches[0]!.clientY
      t0 = performance.now()
      dy = 0
      axis = 'none'
    }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || axis === 'other') return
      const dx = t.clientX - x0
      const d = t.clientY - y0
      if (axis === 'none') {
        if (Math.abs(dx) < 8 && Math.abs(d) < 8) return
        // Vers le bas et plutôt vertical ; et, dans une feuille qui défile, seulement depuis le haut.
        axis = d > 0 && Math.abs(d) > Math.abs(dx) && el.scrollTop <= 0 ? 'down' : 'other'
        if (axis === 'other') return
      }
      e.preventDefault()
      dy = Math.max(0, d)
      paint(dy, false)
    }
    const end = () => {
      if (axis !== 'down') return
      axis = 'none'
      const speed = dy / Math.max(1, performance.now() - t0) // px/ms
      if (dy > 110 || (dy > 30 && speed > 0.6)) {
        paint(window.innerHeight, true)
        window.setTimeout(() => {
          paint(0, false)
          close.current()
        }, 200)
      } else paint(0, true)
    }

    zone.addEventListener('touchstart', start, { passive: true })
    zone.addEventListener('touchmove', move, { passive: false })
    zone.addEventListener('touchend', end)
    zone.addEventListener('touchcancel', end)
    return () => {
      zone.removeEventListener('touchstart', start)
      zone.removeEventListener('touchmove', move)
      zone.removeEventListener('touchend', end)
      zone.removeEventListener('touchcancel', end)
      paint(0, false)
    }
  }, [opts.active])
}
