import { CheckCircle2, Repeat2, Users } from 'lucide-react'
import { assignees, dateKey, isOverdue, isRecurring } from './calendarMeta'

const sortByTime = (a, b) => String(a.time || '99').localeCompare(String(b.time || '99'))

/** Seven day columns with full-width event cards — easier to read than the month grid. */
export default function WeekView({ weekStart, events, nonWorkingDays, enabledTypes, onDayClick, onEventClick }) {
  const today = dateKey(new Date())
  const offDates = new Set(nonWorkingDays.map(day => day.date))
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setDate(weekStart.getDate() + index)
    return date
  })

  return (
    <div className="cal-week">
      {days.map(date => {
        const key = dateKey(date)
        const dayEvents = events.filter(event => event.date === key && enabledTypes.has(event.type)).sort(sortByTime)
        const classes = ['cal-week-col', (offDates.has(key) || date.getDay() === 5) && 'cal-week-col--off', key === today && 'cal-week-col--today'].filter(Boolean).join(' ')

        return (
          <section key={key} className={classes} aria-label={date.toDateString()}>
            <button type="button" className="cal-week-head" onClick={() => onDayClick(key)} style={{ width: '100%', textAlign: 'left' }}>
              <small>{date.toLocaleDateString('en-GB', { weekday: 'short' })}</small>
              <strong>{date.getDate()}</strong>
            </button>
            <div className="cal-week-list">
              {dayEvents.length === 0 && <p className="cal-week-empty">—</p>}
              {dayEvents.map(event => {
                const people = event.type === 'task' ? assignees(event) : (event.participants || [])
                return (
                  <button
                    type="button"
                    key={event.occurrenceKey || `${event.id}-${event.date}`}
                    className={`cal-week-card ${isRecurring(event) && !isOverdue(event, today) ? 'cal-week-card--routine' : ''}`}
                    data-type={isOverdue(event, today) ? undefined : event.type}
                    style={isOverdue(event, today) ? { '--accent': 'var(--cal-overdue)', '--accent-tint': '#fdecea' } : undefined}
                    onClick={() => onEventClick(event)}
                  >
                    <time>{event.time ? event.time.slice(0, 5) : 'All day'}{event.dur && event.time ? ` · ${event.dur}m` : ''}</time>
                    <strong style={event.isDone ? { textDecoration: 'line-through', opacity: .55 } : undefined}>{event.title}</strong>
                    <small style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {event.type === 'task' && event.isDone && <CheckCircle2 className="h-3 w-3" />}
                      {people.length > 0 && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Users className="h-3 w-3" />{people.length}</span>}
                      {event.recurrence?.type && event.recurrence.type !== 'none' && <Repeat2 className="h-3 w-3" />}
                      <span style={{ textTransform: 'capitalize' }}>{event.type === 'task' ? (event.priority || 'normal') : event.type}</span>
                    </small>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
