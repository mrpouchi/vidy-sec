import { useEffect, useRef } from 'preact/hooks'
import type { Said } from '../model/feedback.ts'
import { reason, statusWord, verdict, type SpotView } from '../model/summary.ts'
import type { Photo } from '../notify/photos.ts'
import { HourStrip } from './HourStrip.tsx'
import { PhotoRow } from './Photos.tsx'

interface Props {
  view: SpotView
  photos: Photo[]
  onReport: (said: Said) => void
  onOpenPhoto: (index: number) => void
  onAddPhoto: () => void
}

export function SpotCard({ view, photos, onReport, onOpenPhoto, onAddPhoto }: Props) {
  const cur = view.states[view.now]!
  const word = statusWord(cur)
  // Fondu uniquement quand le statut change, jamais au premier affichage.
  const prev = useRef(word)
  const changed = prev.current !== word
  useEffect(() => {
    prev.current = word
  }, [word])

  const id = `spot-${view.spot.id}`
  return (
    <section class="card spot" aria-labelledby={id}>
      <p class="eyebrow">{view.spot.name}</p>
      <div class="status" key={word} data-fade={changed || undefined}>
        <span class={`dot l-${cur.level}`} aria-hidden="true" />
        <h2 id={id}>{word}</h2>
      </div>
      <p class="verdict">{verdict(view)}</p>
      <p class="reason">{reason(view)}</p>
      <HourStrip view={view} />
      <PhotoRow photos={photos} onOpen={onOpenPhoto} />
      <div class="feedback">
        <span>Tu y es ?</span>
        <button type="button" class="feedback-photo" aria-label={`Ajouter une photo · ${view.spot.short}`} onClick={onAddPhoto}>
          <svg viewBox="0 0 24 20" width="22" height="18" aria-hidden="true">
            <path
              d="M3 5.5h3.6l1.7-2.5h7.4l1.7 2.5H21a1.5 1.5 0 0 1 1.5 1.5v10A1.5 1.5 0 0 1 21 18.5H3A1.5 1.5 0 0 1 1.5 17V7A1.5 1.5 0 0 1 3 5.5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.7"
              stroke-linejoin="round"
            />
            <circle cx="12" cy="11.5" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7" />
          </svg>
        </button>
        <button type="button" onClick={() => onReport('dry')}>
          Sec
        </button>
        <button type="button" onClick={() => onReport('wet')}>
          Mouillé
        </button>
      </div>
    </section>
  )
}

export function SkeletonCard() {
  return (
    <section class="card spot skeleton" aria-hidden="true">
      <p class="eyebrow">
        <i style={{ width: '45%' }} />
      </p>
      <div class="status">
        <i style={{ width: '50%', height: '34px' }} />
      </div>
      <p class="verdict">
        <i style={{ width: '70%' }} />
      </p>
      <p class="reason">
        <i style={{ width: '55%' }} />
      </p>
      <div class="strip">
        <p class="strip-head">
          <i style={{ width: '30%' }} />
        </p>
        <div class="strip-area">
          <div class="strip-rain" />
          <div class="strip-bars block" />
        </div>
        <div class="strip-ticks" />
      </div>
      <div class="feedback" />
    </section>
  )
}
