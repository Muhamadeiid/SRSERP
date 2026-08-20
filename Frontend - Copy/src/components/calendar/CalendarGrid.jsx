import EventPill from './EventPill'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function CalendarGrid({ cursor, range, events, nonWorkingDays, enabledTypes, onDayClick, onEventClick }) {
  const today = dateKey(new Date())
  const eventsByDate = events.reduce((result, event) => {
    if (!enabledTypes.has(event.type)) return result
    ;(result[event.date] ||= []).push(event)
    return result
  }, {})
  const nonWorkingByDate = new Map(nonWorkingDays.map(item => [item.date, item]))
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(range.start)
    date.setDate(range.start.getDate() + index)
    return date
  })

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[900px]">
        <div className="grid grid-cols-7 border-b border-neutral-200 bg-neutral-50">
          {WEEKDAYS.map((day, index) => (
            <div key={day} className={`py-2.5 text-center text-[11px] font-bold uppercase ${index >= 5 ? 'text-red-500' : 'text-neutral-500'}`}>{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map(date => {
            const key = dateKey(date)
            const dayEvents = eventsByDate[key] || []
            const nonWorking = nonWorkingByDate.get(key)
            const outsideMonth = date.getMonth() !== cursor.getMonth()
            const weekend = date.getDay() === 5 || date.getDay() === 6
            const leaveDay = dayEvents.some(event => event.type === 'leave')

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => onDayClick?.(key)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') onDayClick?.(key)
                }}
                className={`relative min-h-[118px] border-b border-r border-neutral-200 p-2 text-left align-top transition-colors hover:bg-primary-50/40 ${outsideMonth ? 'bg-neutral-50/70' : 'bg-white'} ${weekend || nonWorking ? 'cal-weekend-cell' : ''} ${leaveDay ? 'cal-leave-day' : ''}`}
              >
                <div className="relative z-[1] mb-1.5 flex items-center justify-between gap-1">
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${key === today ? 'bg-red-700 text-white' : outsideMonth ? 'text-neutral-300' : weekend ? 'text-red-500' : 'text-secondary-700'}`}>{date.getDate()}</span>
                  {nonWorking && <span className="max-w-[82px] truncate text-[9px] font-semibold text-neutral-400" title={nonWorking.label}>{nonWorking.label}</span>}
                </div>
                <div className="relative z-[1] space-y-1">
                  {dayEvents.slice(0, 3).map(event => <EventPill key={event.occurrenceKey || `${event.id}-${event.date}`} event={event} onClick={onEventClick} />)}
                  {dayEvents.length > 3 && <span className="block px-1 text-[10px] font-bold text-neutral-500">+{dayEvents.length - 3} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
