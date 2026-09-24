import { useEffect, useMemo, useState } from 'react'
import { dateKey, eventStart } from './calendarMeta'

/** Today as a vertical timeline; past items fade, the next one is ringed. */
export default function TodayRail({ events, onOpenEvent }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = dateKey(now)
  const items = useMemo(() => events
    .filter(event => event.date === today && event.type !== 'leave')
    .sort((a, b) => String(a.time || '00').localeCompare(String(b.time || '00'))), [events, today])
  const nextIndex = items.findIndex(event => event.time && eventStart(event) >= now)

  return (
    <section className="cal-card cal-timeline" aria-label="Today">
      <p className="cal-kicker">Today</p>
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-neutral-400">Nothing scheduled today</p>
      ) : (
        <ol>
          {items.map((event, index) => {
            const past = event.time ? eventStart(event) < now && index !== nextIndex : event.isDone
            return (
              <li key={event.occurrenceKey || event.id} data-type={event.type} data-past={past || undefined} data-now={index === nextIndex || undefined}>
                <button type="button" onClick={() => onOpenEvent(event)}>
                  <time>{event.time ? event.time.slice(0, 5) : 'Day'}</time>
                  <i aria-hidden="true" />
                  <strong style={event.isDone ? { textDecoration: 'line-through' } : undefined}>{event.title}</strong>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
