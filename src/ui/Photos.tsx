import { useEffect, useRef, useState } from 'preact/hooks'
import { SPOTS } from '../model/spots.ts'
import { CAPTION_MAX, PHOTO_TTL_DAYS, ago, timesLine, validTakenAt, type Photo } from '../notify/photos.ts'
import { ZoomImg } from './ZoomImg.tsx'
import { closeOnBackdrop, useModal, useSwipeDown } from './modal.ts'
import { compress, fetchFeed, myToken, photoUrl, remove, report, upload } from './photos.ts'

const spotName = (id: string) => SPOTS.find((s) => s.id === id)?.name ?? ''

/** Feed des 7 derniers jours, rechargé quand l'app revient au premier plan. */
export function usePhotos() {
  const [feed, setFeed] = useState<Photo[] | null>(null)
  useEffect(() => {
    const load = () => fetchFeed().then(setFeed, () => setFeed((f) => f ?? []))
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  return {
    feed,
    add: (p: Photo) => setFeed((f) => [p, ...(f ?? [])]),
    drop: (id: string) => setFeed((f) => (f ?? []).filter((p) => p.id !== id)),
  }
}

const PREVIEW = 3

/** Aperçu dans la carte du spot : quelques vignettes, la plus récente d'abord. */
export function PhotoRow({ photos, onOpen }: { photos: Photo[]; onOpen(index: number): void }) {
  if (!photos.length) return null
  const shown = photos.slice(0, PREVIEW)
  const more = photos.length - shown.length
  return (
    <div class="photo-row">
      <div class="photo-row-thumbs">
        {shown.map((p, i) => (
          <button type="button" class="photo-row-item" onClick={() => onOpen(i)} aria-label={`Voir la photo ${i + 1} sur ${photos.length}`}>
            <img src={photoUrl(p.id)} alt="" loading="lazy" width="56" height="56" />
            {i === shown.length - 1 && more > 0 && <span class="photo-row-more">+{more}</span>}
          </button>
        ))}
      </div>
      <button type="button" class="photo-row-meta" onClick={() => onOpen(0)}>
        <span>
          {photos.length} photo{photos.length > 1 ? 's' : ''}
          <br />
          <span class="photo-row-ago">{ago(photos[0]!.at)}</span>
        </span>
        <svg viewBox="0 0 8 14" width="8" height="14" aria-hidden="true">
          <path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
  )
}

export interface GalleryState {
  photos: Photo[]
  index: number
  /** Jeton de suppression (lien reçu par le propriétaire). */
  del?: string
}

/** Plein écran, on glisse entre les photos du spot. */
export function Gallery(props: {
  state: GalleryState | null
  onClose(): void
  onReported(): void
  onDeleted(id: string): void
  toast(msg: string): void
}) {
  const { state, onClose } = props
  const dialog = useModal(state !== null)
  const track = useRef<HTMLDivElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  useSwipeDown(body, onClose, { fade: dialog, active: state !== null && !zoomed })
  useEffect(() => setConfirm(false), [index, state])
  useEffect(() => setZoomed(false), [state])
  const [busy, setBusy] = useState(false)

  // Ouvre directement sur la photo touchée.
  useEffect(() => {
    if (!state) return
    setIndex(state.index)
    requestAnimationFrame(() => {
      const t = track.current
      if (t) t.scrollLeft = state.index * t.clientWidth
    })
  }, [state])

  const onScroll = () => {
    const t = track.current
    if (t) setIndex(Math.min((state?.photos.length ?? 1) - 1, Math.max(0, Math.round(t.scrollLeft / t.clientWidth))))
  }

  const act = async (fn: () => Promise<void>, done: () => void) => {
    setBusy(true)
    try {
      await fn()
      done()
    } catch {
      props.toast('Impossible pour l’instant')
    } finally {
      setBusy(false)
    }
  }

  const photos = state?.photos ?? []
  const p = photos[index]
  return (
    <dialog ref={dialog} class="viewer" tabIndex={-1} aria-label="Photos du spot" onCancel={(e) => { e.preventDefault(); onClose() }} onClick={(e) => e.target === dialog.current && onClose()}>
      {state && (
        <div ref={body} class="viewer-body">
          <div class="viewer-top">
            <span>{photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}</span>
            <button type="button" class="text-btn" onClick={onClose}>
              OK
            </button>
          </div>
          <div ref={track} class={zoomed ? 'gallery zoomed' : 'gallery'} onScroll={onScroll}>
            {photos.map((x, i) => (
              <div class="gallery-slide" onClick={(e) => e.target === e.currentTarget && onClose()}>
                <ZoomImg src={photoUrl(x.id)} alt={x.caption || `Photo ${spotName(x.spot)}`} active={i === index} onZoom={setZoomed} />
              </div>
            ))}
          </div>
          {p && (
            <div class="viewer-bar">
              <div class="viewer-text">
                {p.spot && (
                  <p class="viewer-title">
                    {spotName(p.spot)} · {ago(p.at)}
                  </p>
                )}
                {p.at > 0 && <p class="viewer-times">{timesLine(p)}</p>}
                {p.caption && <p class="viewer-caption">{p.caption}</p>}
              </div>
              {(() => {
                // Supprimer : l'auteur (jeton gardé sur son téléphone) ou le propriétaire (lien de notification).
                const token = state.del ?? myToken(p.id)
                if (!token) {
                  return (
                    <button type="button" class="text-btn muted" disabled={busy} onClick={() => void act(() => report(p.id), props.onReported)}>
                      Signaler
                    </button>
                  )
                }
                return (
                  <button
                    type="button"
                    class="text-btn danger"
                    disabled={busy}
                    onClick={() => (confirm ? void act(() => remove(p.id, token), () => props.onDeleted(p.id)) : setConfirm(true))}
                  >
                    {confirm ? 'Confirmer' : 'Supprimer'}
                  </button>
                )
              })()}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}

export interface Draft {
  file: Blob
  preview: string
  spot: string
  /** Heure de prise : lue dans la photo (EXIF) ou, à défaut, date du fichier. */
  taken: { at: number; source: 'exif' | 'file' } | null
}

/** ms ↔ valeur d'un <input type="datetime-local"> (heure locale du téléphone). */
const pad = (n: number) => String(n).padStart(2, '0')
function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const fromLocalInput = (v: string) => new Date(v).getTime()

/** Publier une photo pour un spot (choisi depuis sa carte). */
export function Compose(props: { draft: Draft | null; onClose(): void; onDone(p: Photo): void; toast(msg: string): void }) {
  const { draft, onClose } = props
  const dialog = useModal(draft !== null)
  useSwipeDown(dialog, onClose, { active: draft !== null })
  const [caption, setCaption] = useState('')
  const [when, setWhen] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!draft) return
    setCaption('')
    // Heure de la photo si elle est lisible et plausible, sinon maintenant.
    setWhen(toLocalInput(draft.taken && validTakenAt(draft.taken.at) ? draft.taken.at : Date.now()))
  }, [draft])

  const takenMs = fromLocalInput(when)
  const takenOk = validTakenAt(takenMs)
  const auto = draft?.taken && validTakenAt(draft.taken.at) && Math.abs(draft.taken.at - takenMs) < 60_000 ? draft.taken.source : null

  const publish = async (e: Event) => {
    e.preventDefault()
    if (!draft || !takenOk) return
    setBusy(true)
    try {
      props.onDone(await upload(await compress(draft.file), draft.spot, caption, takenMs))
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      props.toast(
        m === 'trop lourde' ? 'Photo trop lourde' : m === 'heure' ? 'Heure de prise invalide' : 'Envoi impossible',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} class="sheet" tabIndex={-1} aria-labelledby="compose-title" onCancel={(e) => { e.preventDefault(); onClose() }} onClick={(e) => closeOnBackdrop(e, onClose)}>
      <form onSubmit={(e) => void publish(e)}>
        <div class="grabber" aria-hidden="true" />
        <div class="sheet-head">
          <button type="button" class="text-btn muted" onClick={onClose}>
            Annuler
          </button>
          <h2 id="compose-title">{draft ? spotName(draft.spot) : 'Nouvelle photo'}</h2>
          <button type="submit" class="text-btn" disabled={busy || !takenOk}>
            {busy ? 'Envoi…' : 'Publier'}
          </button>
        </div>
        {draft && <img class="compose-preview" src={draft.preview} alt="Aperçu de la photo" />}
        <label class="compose-when">
          <span class="compose-when-label">Prise</span>
          <input
            type="datetime-local"
            value={when}
            min={toLocalInput(Date.now() - PHOTO_TTL_DAYS * 86_400_000)}
            max={toLocalInput(Date.now())}
            onInput={(e) => setWhen(e.currentTarget.value)}
          />
        </label>
        <p class={`compose-when-hint${takenOk ? '' : ' bad'}`}>
          {!takenOk
            ? takenMs > Date.now()
              ? 'Cette heure est dans le futur.'
              : `Photo de plus de ${PHOTO_TTL_DAYS} jours : trop ancienne pour l’état du spot.`
            : auto === 'exif'
              ? `Heure lue dans la photo · ${ago(takenMs)}`
              : auto === 'file'
                ? `Heure du fichier · ${ago(takenMs)} · vérifie-la`
                : draft?.taken == null && Math.abs(Date.now() - takenMs) < 2 * 60_000
                  ? 'Heure inconnue : ajuste-la si tu as pris la photo plus tôt.'
                  : ago(takenMs)}
        </p>
        <input
          class="compose-caption"
          type="text"
          placeholder="Légende (facultatif) · ex. flaques au fond"
          maxLength={CAPTION_MAX}
          value={caption}
          onInput={(e) => setCaption(e.currentTarget.value)}
        />
        <p class="group-note">Visible par tous pendant {PHOTO_TTL_DAYS} jours. Évite les visages reconnaissables.</p>
      </form>
    </dialog>
  )
}
