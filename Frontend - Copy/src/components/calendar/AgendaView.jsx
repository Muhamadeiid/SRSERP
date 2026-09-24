import { CalendarDays } from 'lucide-react'
import { STATUS_LABEL, dateKey, parseKey } from './calendarMeta'

/** The month as a chronological list — the fastest way to scan what is coming. */
export default function AgendaView({ cursor, events, enabledTypes, onEventClick }) {
  const today = dateKey(new Date())
  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`

  const byDay = events
    .filter(event => enabledTypes.has(event.type) && event.date.startsWith(monthPrefix))
    .sort((a, b) => `${a.date}${a.time || '99'}`.localeCompare(`${b.date}${b.time || '99'}`))
    .reduce((groups, event) => {
      ;(groups[event.date] ||= []).push(event)
      return groups
    }, {})
  const days = Object.keys(byDay)

  if (days.length === 0) {
    return (
      <div className="cal-agenda-empty">
        <CalendarDays className="mx-auto mb-3 h-8 w-8 text-neutral-300" />
        Nothing scheduled this month
      </div>
    )
  }

  return (
    <div className="cal-agenda">
      {days.map(key => {
        const date = parseKey(key)
        return (
          <section key={key} className="cal-agenda-day">
            <div className={`cal-agenda-date ${key === today ? 'cal-agenda-date--today' : ''}`}>
              <strong>{date.getDate()}</strong>
              <small>{key === today ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short', month: 'short' })}</small>
            </div>
            <div className="cal-agenda-rows">
              {byDay[key].map(event => (
                <button
                  type="button"
                  key={event.occurrenceKey || `${event.id}-${event.date}`}
                  className="cal-agenda-row"
                  data-type={event.type}
                  onClick={() => onEventClick(event)}
                >
                  <time>{event.time ? event.time.slice(0, 5) : 'All day'}</time>
                  <i aria-hidden="true" />
                  <span style={{ minWidth: 0 }}>
                    <strong style={event.isDone ? { textDecoration: 'line-through', opacity: .55 } : undefined}>{event.title}</strong>
                    <small>{event.type}{event.by?.name ? ` · by ${event.by.name}` : ''}</small>
                  </span>
                  {event.type === 'task'
                    ? <span className="cal-status" data-status={event.status || (event.isDone ? 'done' : 'todo')}>{STATUS_LABEL[event.status] || (event.isDone ? 'Done' : 'To do')}</span>
                    : <span className="cal-status">{event.dur ? `${event.dur} min` : '—'}</span>}
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
