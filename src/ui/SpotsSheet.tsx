import { useEffect, useState } from 'preact/hooks'
import { SPOTS } from '../model/spots.ts'
import { REQUEST_LIMITS } from '../notify/requests.ts'
import { closeOnBackdrop, useModal } from './modal.ts'
import { requestSpot } from './push.ts'

interface Props {
  open: boolean
  selected: string[]
  onChange(ids: string[]): void
  onClose(): void
}

type AskState = 'closed' | 'form' | 'sending' | 'sent'

/** Feuille « Mes spots » : afficher / masquer chaque spot, et proposer un nouveau spot. */
export function SpotsSheet({ open, selected, onChange, onClose }: Props) {
  const dialog = useModal(open)
  const [ask, setAsk] = useState<AskState>('closed')
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', place: '', note: '' })

  // À la fermeture, on repart d'un formulaire propre (sauf texte en cours de saisie).
  useEffect(() => {
    if (!open && (ask === 'sent' || ask === 'sending')) setAsk('closed')
  }, [open])

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : SPOTS.map((s) => s.id).filter((x) => x === id || selected.includes(x)))

  const send = async (e: Event) => {
    e.preventDefault()
    if (form.name.trim().length < 2) return setError('Donne au moins un nom au spot.')
    setError('')
    setAsk('sending')
    try {
      await requestSpot(form)
      setForm({ name: '', place: '', note: '' })
      setAsk('sent')
    } catch (err) {
      setError(err instanceof Error && err.message === 'trop' ? 'Une demande par minute, réessaie dans un instant.' : 'Envoi impossible, réessaie plus tard.')
      setAsk('form')
    }
  }

  const field = (key: keyof typeof form) => ({
    value: form[key],
    maxLength: REQUEST_LIMITS[key],
    onInput: (e: Event) => setForm({ ...form, [key]: (e.currentTarget as HTMLInputElement).value }),
  })

  return (
    <dialog
      ref={dialog}
      class="sheet"
      tabIndex={-1}
      aria-labelledby="sheet-title"
      onClose={onClose}
      onClick={(e) => closeOnBackdrop(e, onClose)}
    >
      <div class="sheet-head">
        <h2 id="sheet-title">Mes spots</h2>
        <button type="button" class="text-btn" onClick={onClose}>
          OK
        </button>
      </div>

      <ul class="group" aria-label="Spots affichés">
        {SPOTS.map((s) => (
          <li>
            <label class="row">
              <span class="row-text">
                <span class="row-title">{s.name}</span>
                <span class="row-sub">{s.about}</span>
              </span>
              <input type="checkbox" role="switch" class="switch" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
            </label>
          </li>
        ))}
      </ul>
      <p class="group-note">Les spots masqués disparaissent aussi des notifications.</p>

      <div class="group">
        {ask === 'closed' && (
          <button type="button" class="row row-btn" onClick={() => setAsk('form')}>
            Proposer un spot
          </button>
        )}
        {ask === 'sent' && (
          <div class="row">
            <span class="row-text">
              <span class="row-title">Merci !</span>
              <span class="row-sub">Je règle chaque spot à la main, il arrivera dans la liste.</span>
            </span>
            <button type="button" class="text-btn" onClick={() => setAsk('form')}>
              Un autre
            </button>
          </div>
        )}
        {(ask === 'form' || ask === 'sending') && (
          <form class="ask" onSubmit={(e) => void send(e)}>
            <label>
              <span>Nom du spot</span>
              <input type="text" required placeholder="Ex. skatepark de Renens" autoComplete="off" {...field('name')} />
            </label>
            <label>
              <span>Où ?</span>
              <input type="text" placeholder="Adresse ou lien Google Maps" autoComplete="off" {...field('place')} />
            </label>
            <label>
              <span>Infos utiles</span>
              <textarea rows={3} placeholder="Bowl, park, rue… Couvert, à l’ombre, éclairé, horaires" {...field('note')} />
            </label>
            {error && <p class="ask-error">{error}</p>}
            <div class="ask-actions">
              <button type="button" class="text-btn muted" onClick={() => setAsk('closed')}>
                Annuler
              </button>
              <button type="submit" class="text-btn" disabled={ask === 'sending'}>
                {ask === 'sending' ? 'Envoi…' : 'Envoyer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}
