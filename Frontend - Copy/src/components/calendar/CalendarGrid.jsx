import EventPill from './EventPill'
import { dateKey } from './calendarMeta'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const VISIBLE_PER_DAY = 3

export default function CalendarGrid({ cursor, range, events, nonWorkingDays, enabledTypes, onDayClick, onEventClick }) {
  const today = dateKey(new Date())
  const eventsByDate = events.reduce((result, event) => {
    if (!enabledTypes.has(event.type)) return result
    ;(result[event.date] ||= []).push(event)
    return result
  }, {})
  const nonWorkingByDate = new Map(nonWorkingDays.map(item => [item.date, item]))
  const firstOfMonth = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const weeks = Math.ceil((firstOfMonth.getDay() + daysInMonth) / 7)
  const days = Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(range.start)
    date.setDate(range.start.getDate() + index)
    return date
  })

  return (
    <div className="cal-month">
      <div className="cal-month-inner">
        <div className="cal-weekdays">
          {WEEKDAYS.map((day, index) => <span key={day} data-weekend={index === 5 || undefined}>{day}</span>)}
        </div>

        <div className="cal-days">
          {days.map(date => {
            const key = dateKey(date)
            const dayEvents = eventsByDate[key] || []
            const nonWorking = nonWorkingByDate.get(key)
            const classes = [
              'cal-cell',
              date.getMonth() !== cursor.getMonth() && 'cal-cell--outside',
              (nonWorking || date.getDay() === 5) && 'cal-cell--off',
              dayEvents.some(event => event.type === 'leave') && 'cal-cell--leave',
              key === today && 'cal-cell--today',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`${date.toDateString()}, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`}
                onClick={() => onDayClick?.(key)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onDayClick?.(key) }
                }}
                className={classes}
              >
                <div className="cal-cell-head">
                  <span className="cal-daynum">{date.getDate()}</span>
                  {nonWorking && <span className="cal-offlabel" title={nonWorking.label}>{nonWorking.label}</span>}
                </div>
                <div className="cal-cell-events">
                  {dayEvents.slice(0, VISIBLE_PER_DAY).map(event => (
                    <EventPill key={event.occurrenceKey || `${event.id}-${event.date}`} event={event} onClick={onEventClick} />
                  ))}
                  {dayEvents.length > VISIBLE_PER_DAY && (
                    <span className="cal-more">+{dayEvents.length - VISIBLE_PER_DAY} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
