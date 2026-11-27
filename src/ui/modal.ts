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
