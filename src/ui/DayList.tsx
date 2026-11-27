import { dayLabel, days, formatMm, nuanceText, windowRange, type DaySummary, type SpotView } from '../model/summary.ts'
import { dayOf } from '../model/time.ts'

function Pill({ day, spot }: { day: DaySummary; spot: string }) {
  const w = day.window
  if (!w) {
    return (
      <span class="pill none" aria-label={`${spot} : pas de créneau`}>
        —
      </span>
    )
  }
  const label = `${spot} : ${w.quality === 'dry' ? 'sec' : 'rideable'} ${windowRange(w)}${w.nuance ? `, ${nuanceText(w.nuance)}` : ''}`
  return (
    <span class="pill" aria-label={label}>
      <span class={`dot l-${w.quality}`} aria-hidden="true" />
      {windowRange(w)}
    </span>
  )
}

/** Meilleur créneau de jour pour chaque spot, sur 7 jours. */
export function DayList({ views }: { views: SpotView[] }) {
  const [first] = views
  if (!first) return null
  const today = dayOf(first.hours[first.now]!.time)
  const perSpot = views.map((v) => days(v))
  const rows = perSpot[0]!

  return (
    <section class="card days" aria-labelledby="days-title">
      <div class="days-row days-head">
        <h2 id="days-title" class="eyebrow">
          7 jours
        </h2>
        {views.map((v) => (
          <span>{v.spot.short}</span>
        ))}
        <span class="right">Pluie</span>
      </div>
      {rows.map((d, r) => (
        <div class="days-row" key={d.date}>
          <span class="day">{dayLabel(d.date, today)}</span>
          {views.map((v, k) => (
            <Pill day={perSpot[k]![r]!} spot={v.spot.short} />
          ))}
          <span class="right meta">
            {d.rain >= 0.1 ? `${formatMm(d.rain)} mm` : '0 mm'} · {Math.round(d.tmax)}°
          </span>
        </div>
      ))}
    </section>
  )
}
