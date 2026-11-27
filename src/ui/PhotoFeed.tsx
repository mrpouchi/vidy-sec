import { useEffect, useRef, useState } from 'preact/hooks'
import { SPOTS } from '../model/spots.ts'
import { CAPTION_MAX, PHOTO_TTL_DAYS, ago, type Photo } from '../notify/photos.ts'
import { compress, fetchFeed, photoUrl, remove, report, upload } from './photos.ts'

const spotName = (id: string) => SPOTS.find((s) => s.id === id)?.short ?? id

/** <dialog> modale pilotée par `open`. */
function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return ref
}

interface Props {
  spots: string[] // spots affichés : le feed ne montre que ceux-là
  toast(msg: string): void
}

/** « Photos » : état des spots montré par tout le monde, 7 derniers jours. */
export function PhotoFeed({ spots, toast }: Props) {
  const [feed, setFeed] = useState<Photo[] | null>(null)
  const [viewing, setViewing] = useState<{ photo: Photo; del?: string } | null>(null)
  const [draft, setDraft] = useState<{ file: Blob; preview: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)

  const load = () => fetchFeed().then(setFeed, () => setFeed((f) => f ?? []))

  useEffect(() => {
    void load()
    const onVisible = () => document.visibilityState === 'visible' && void load()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Lien de modération reçu en notification : ?photo=<id>&del=<token>
  useEffect(() => {
    if (!feed) return
    const q = new URLSearchParams(location.search)
    const id = q.get('photo')
    const del = q.get('del')
    if (!id) return
    history.replaceState(null, '', location.pathname)
    const photo = feed.find((p) => p.id === id) ?? { id, spot: '', caption: '', at: 0 } // masquée : absente du feed public
    setViewing({ photo, del: del ?? undefined })
  }, [feed !== null])

  const pick = (e: Event) => {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    ;(e.currentTarget as HTMLInputElement).value = ''
    if (file) setDraft({ file, preview: URL.createObjectURL(file) })
  }
  const closeDraft = () => {
    if (draft) URL.revokeObjectURL(draft.preview)
    setDraft(null)
  }

  const shown = (feed ?? []).filter((p) => spots.includes(p.spot))

  return (
    <section class="card photos" aria-labelledby="photos-title">
      <div class="photos-head">
        <h2 id="photos-title" class="eyebrow">
          Photos
        </h2>
        <button type="button" class="text-btn" onClick={() => input.current?.click()}>
          Ajouter
        </button>
        <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
      </div>

      {feed === null ? (
        <div class="photo-strip" aria-hidden="true">
          {[0, 1, 2].map(() => (
            <span class="photo-thumb skeleton-block" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <p class="photos-empty">Aucune photo cette semaine. Montre l’état du spot quand tu y es.</p>
      ) : (
        <div class="photo-strip">
          {shown.map((p) => (
            <button type="button" class="photo-item" onClick={() => setViewing({ photo: p })} aria-label={`Photo ${spotName(p.spot)}, ${ago(p.at)}`}>
              <img class="photo-thumb" src={photoUrl(p.id)} alt="" loading="lazy" width="112" height="112" />
              <span class="photo-meta">
                <b>{spotName(p.spot)}</b> · {ago(p.at)}
              </span>
            </button>
          ))}
        </div>
      )}

      <Compose
        draft={draft}
        spots={spots}
        onClose={closeDraft}
        onDone={(p) => {
          setFeed((f) => [p, ...(f ?? [])])
          closeDraft()
          toast('Photo publiée')
        }}
        toast={toast}
      />
      <Viewer
        state={viewing}
        onClose={() => setViewing(null)}
        onReported={() => {
          setViewing(null)
          toast('Merci, c’est signalé')
        }}
        onDeleted={(id) => {
          setFeed((f) => (f ?? []).filter((p) => p.id !== id))
          setViewing(null)
          toast('Photo supprimée')
        }}
        toast={toast}
      />
    </section>
  )
}

function Compose(props: {
  draft: { file: Blob; preview: string } | null
  spots: string[]
  onClose(): void
  onDone(p: Photo): void
  toast(msg: string): void
}) {
  const { draft, onClose } = props
  const dialog = useModal(draft !== null)
  const choices = SPOTS.filter((s) => props.spots.includes(s.id))
  const list = choices.length ? choices : SPOTS
  const [spot, setSpot] = useState(list[0]!.id)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (draft) {
      setSpot(list[0]!.id)
      setCaption('')
    }
  }, [draft])

  const publish = async (e: Event) => {
    e.preventDefault()
    if (!draft) return
    setBusy(true)
    try {
      props.onDone(await upload(await compress(draft.file), spot, caption))
    } catch (err) {
      const m = err instanceof Error ? err.message : ''
      props.toast(m === 'trop' ? 'Une photo par minute' : m === 'trop lourde' ? 'Photo trop lourde' : 'Envoi impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialog} class="sheet" aria-labelledby="compose-title" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <form onSubmit={(e) => void publish(e)}>
        <div class="sheet-head">
          <button type="button" class="text-btn muted" onClick={onClose}>
            Annuler
          </button>
          <h2 id="compose-title">Nouvelle photo</h2>
          <button type="submit" class="text-btn" disabled={busy}>
            {busy ? 'Envoi…' : 'Publier'}
          </button>
        </div>
        {draft && <img class="compose-preview" src={draft.preview} alt="Aperçu de la photo" />}
        {list.length > 1 && (
          <div class="segmented" role="radiogroup" aria-label="Spot">
            {list.map((s) => (
              <button type="button" role="radio" aria-checked={spot === s.id} class={spot === s.id ? 'on' : ''} onClick={() => setSpot(s.id)}>
                {s.short}
              </button>
            ))}
          </div>
        )}
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

function Viewer(props: {
  state: { photo: Photo; del?: string } | null
  onClose(): void
  onReported(): void
  onDeleted(id: string): void
  toast(msg: string): void
}) {
  const { state, onClose } = props
  const dialog = useModal(state !== null)
  const [busy, setBusy] = useState(false)

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

  const p = state?.photo
  return (
    <dialog ref={dialog} class="viewer" aria-label="Photo" onClose={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      {p && (
        <>
          <img class="viewer-img" src={photoUrl(p.id)} alt={p.caption || `Photo ${spotName(p.spot)}`} />
          <div class="viewer-bar">
            <div class="viewer-text">
              {p.spot && (
                <p class="viewer-title">
                  {spotName(p.spot)} · {ago(p.at)}
                </p>
              )}
              {p.caption && <p class="viewer-caption">{p.caption}</p>}
            </div>
            {state.del ? (
              <button type="button" class="text-btn danger" disabled={busy} onClick={() => void act(() => remove(p.id, state.del!), () => props.onDeleted(p.id))}>
                Supprimer
              </button>
            ) : (
              <button type="button" class="text-btn muted" disabled={busy} onClick={() => void act(() => report(p.id), props.onReported)}>
                Signaler
              </button>
            )}
            <button type="button" class="text-btn" onClick={onClose}>
              OK
            </button>
          </div>
        </>
      )}
    </dialog>
  )
}
