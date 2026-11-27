import { useState } from 'preact/hooks'
import { SPOTS } from '../model/spots.ts'
import { useModal } from './modal.ts'

/** Premier lancement : on choisit ses spots avant tout, pour une app épurée dès le départ. */
export function Welcome({ open, onDone }: { open: boolean; onDone(ids: string[]): void }) {
  const dialog = useModal(open)
  const [picked, setPicked] = useState<string[]>([])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : SPOTS.map((s) => s.id).filter((x) => x === id || p.includes(x))))

  return (
    <dialog
      ref={dialog}
      class="welcome"
      tabIndex={-1}
      aria-labelledby="welcome-title"
      onCancel={(e) => e.preventDefault()} // il faut choisir
    >
      <div class="welcome-body">
        <img class="welcome-icon" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} alt="" width="64" height="64" />
        <h1 id="welcome-title">Tes spots</h1>
        <p class="welcome-sub">Choisis où tu rides. Tu verras s’ils sont secs, et quand ils le seront.</p>

        <ul class="group" aria-label="Spots">
          {SPOTS.map((s) => (
            <li>
              <label class="row">
                <span class="row-text">
                  <span class="row-title">{s.name}</span>
                  <span class="row-sub">{s.about}</span>
                </span>
                <input type="checkbox" role="switch" class="switch" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} />
              </label>
            </li>
          ))}
        </ul>
        <p class="group-note">Tu pourras changer plus tard avec le bouton en haut à droite.</p>
      </div>

      <div class="welcome-foot">
        <button type="button" class="btn-primary" disabled={picked.length === 0} onClick={() => onDone(picked)}>
          {picked.length === 0 ? 'Choisis au moins un spot' : 'C’est parti'}
        </button>
      </div>
    </dialog>
  )
}
