import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { addReport, type Said } from '../model/feedback.ts'
import { SPOTS } from '../model/spots.ts'
import { buildView, type SpotView } from '../model/summary.ts'
import { zurichStamp } from '../model/time.ts'
import { fetchForecast, parseForecast } from '../model/weather.ts'
import { DayList } from './DayList.tsx'
import { InstallHint } from './InstallHint.tsx'
import { isSubscribed, pushSupport, subscribe, syncSpots, unsubscribe } from './push.ts'
import { SkeletonCard, SpotCard } from './SpotCard.tsx'
import { SpotsSheet } from './SpotsSheet.tsx'
import { readCache, readFeedback, readSpots, writeCache, writeFeedback, writeSpots, type Cached } from './storage.ts'

const REFRESH_AFTER = 15 * 60_000
const STALE_AFTER = 3 * 3_600_000

function useToast() {
  const [toast, setToast] = useState<{ msg: string; on: boolean }>({ msg: '', on: false })
  const timer = useRef<number>()
  const show = useCallback((msg: string) => {
    clearTimeout(timer.current)
    setToast({ msg, on: true })
    timer.current = window.setTimeout(() => setToast((t) => ({ ...t, on: false })), 2000)
  }, [])
  return [toast, show] as const
}

export function App() {
  const [data, setData] = useState<Cached | null>(readCache)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [feedback, setFeedback] = useState(readFeedback)
  const [minute, setMinute] = useState(0)
  const [toast, showToast] = useToast()
  const [spots, setSpots] = useState(readSpots)
  const [sheet, setSheet] = useState(false)
  const dataRef = useRef(data)
  dataRef.current = data

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await fetchForecast(SPOTS)
      parseForecast(raw, SPOTS.length) // valide avant de remplacer le cache
      const next = { at: Date.now(), raw }
      writeCache(next)
      setData(next)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onVisible = () => {
      const d = dataRef.current
      if (document.visibilityState === 'visible' && (!d || Date.now() - d.at > REFRESH_AFTER)) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    const tick = window.setInterval(() => setMinute((m) => m + 1), 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(tick)
    }
  }, [refresh])

  const views = useMemo<SpotView[] | null>(() => {
    if (!data) return null
    try {
      const all = parseForecast(data.raw, SPOTS.length)
      const stamp = zurichStamp()
      return SPOTS.flatMap((s, k) => (spots.includes(s.id) ? [buildView(s, all[k]!, stamp, feedback.factors[s.id])] : []))
    } catch {
      return null
    }
    // `minute` fait avancer « maintenant » sans refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, feedback, minute, spots])

  const report = (view: SpotView, said: Said) => {
    const next = addReport(feedback, {
      at: zurichStamp(),
      spot: view.spot.id,
      said,
      predicted: view.states[view.now]!.level,
    })
    setFeedback(next)
    writeFeedback(next)
    showToast('Merci, j’ajuste.')
  }

  const copyReports = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(feedback, null, 2))
      showToast('Retours copiés')
    } catch {
      showToast('Impossible de copier')
    }
  }

  const support = pushSupport()
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => {
    void isSubscribed().then(setPushOn, () => {})
  }, [])
  const togglePush = async () => {
    setPushBusy(true)
    try {
      if (pushOn) {
        await unsubscribe()
        setPushOn(false)
        showToast('Notifications désactivées')
      } else {
        await subscribe(spots)
        setPushOn(true)
        showToast('Notifications activées')
      }
    } catch (e) {
      showToast(e instanceof Error && e.message === 'refusé' ? 'Notifications refusées' : 'Impossible pour l’instant')
    } finally {
      setPushBusy(false)
    }
  }

  const changeSpots = (ids: string[]) => {
    setSpots(ids)
    writeSpots(ids)
    // Les notifications suivent le choix ; en cas d'échec, l'affichage local reste à jour.
    void syncSpots(ids).catch(() => showToast('Notifications non mises à jour'))
  }

  const stale = data && Date.now() - data.at > STALE_AFTER
  const updated = data ? zurichStamp(new Date(data.at)).slice(11) : null

  return (
    <main class="app">
      <header class="top">
        <h1>Spot Checker</h1>
        <div class="top-meta">
          {updated && <span>Mis à jour {updated}</span>}
          <button type="button" class="icon-btn" aria-label="Mes spots" onClick={() => setSheet(true)}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path
                d="M3 6h7M14 6h3M3 14h3M10 14h7"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <circle cx="12" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="1.8" />
              <circle cx="8" cy="14" r="2" fill="none" stroke="currentColor" stroke-width="1.8" />
            </svg>
          </button>
          <button type="button" class="icon-btn" aria-label="Actualiser" onClick={() => void refresh()} disabled={loading}>
            <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
              <path
                d="M16.5 10a6.5 6.5 0 1 1-1.9-4.6M16.5 3.5v3.6h-3.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>
      </header>

      <InstallHint />

      {(stale || (failed && data)) && (
        <p class="notice">{failed ? 'Pas de connexion · ' : ''}Données de {updated}, peut-être dépassées.</p>
      )}

      {views && views.length === 0 ? (
        <section class="card empty">
          <p>Aucun spot affiché.</p>
          <button type="button" class="text-btn" onClick={() => setSheet(true)}>
            Choisir mes spots
          </button>
        </section>
      ) : views ? (
        views.map((v) => <SpotCard key={v.spot.id} view={v} onReport={(said) => report(v, said)} />)
      ) : failed ? (
        <section class="card error">
          <p>Impossible de charger la météo.</p>
          <button type="button" class="text-btn" onClick={() => void refresh()}>
            Réessayer
          </button>
        </section>
      ) : (
        spots.map((id) => <SkeletonCard key={id} />)
      )}

      {views && views.length > 0 && <DayList views={views} />}

      <footer class="foot">
        <p>Estimation : vérifie toujours sur place.</p>
        <p>
          Météo MeteoSwiss via <a href="https://open-meteo.com/">Open-Meteo</a>
        </p>
        {support === 'ok' && (
          <button type="button" class="text-btn" onClick={() => void togglePush()} disabled={pushBusy}>
            {pushOn ? 'Désactiver les notifications' : 'Activer les notifications'}
          </button>
        )}
        {support === 'install' && <p>Notifications : Partager → « Sur l’écran d’accueil », puis ouvre l’app.</p>}
        {feedback.log.length > 0 && (
          <button type="button" class="text-btn" onClick={() => void copyReports()}>
            Copier mes retours ({feedback.log.length})
          </button>
        )}
      </footer>

      <SpotsSheet open={sheet} selected={spots} onChange={changeSpots} onClose={() => setSheet(false)} />

      <div class={`toast${toast.on ? ' on' : ''}`} role="status" aria-live="polite">
        {toast.msg}
      </div>
    </main>
  )
}
