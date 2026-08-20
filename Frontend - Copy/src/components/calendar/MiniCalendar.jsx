import { ChevronLeft, ChevronRight } from 'lucide-react'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const sameDay = (left, right) => dateKey(left) === dateKey(right)

export default function MiniCalendar({ cursor, events = [], nonWorkingDays = [], selectedDate, onMonthChange, onSelectDate }) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const first = new Date(year, month, 1)
  const start = new Date(year, month, 1 - first.getDay())
  const today = new Date()
  const eventDates = new Set(events.map(event => event.date))
  const offDates = new Set(nonWorkingDays.map(day => day.date))
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return date
  })

  return (
    <div className="rounded-md border border-neutral-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <button type="button" onClick={() => onMonthChange(-1)} className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <strong className="text-xs text-secondary-700">{cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
        <button type="button" onClick={() => onMonthChange(1)} className="grid h-7 w-7 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100" title="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map(day => <span key={day} className="pb-1 text-[8px] font-bold uppercase text-neutral-400">{day.slice(0, 1)}</span>)}
        {cells.map(date => {
          const key = dateKey(date)
          const currentMonth = date.getMonth() === month
          const active = selectedDate === key
          const hasEvent = eventDates.has(key)
          const off = offDates.has(key) || date.getDay() === 5
          return (
            <button
              type="button"
              key={key}
              onClick={() => onSelectDate(key)}
              className={`relative mx-auto my-0.5 grid h-7 w-7 place-items-center rounded-md text-[10px] font-semibold transition ${active ? 'bg-primary text-white' : sameDay(date, today) ? 'border border-primary text-primary' : off ? 'bg-neutral-100 text-neutral-500' : 'text-secondary-700 hover:bg-neutral-50'} ${currentMonth ? '' : 'opacity-30'}`}
            >
              {date.getDate()}
              {hasEvent && <span className={`absolute bottom-0.5 h-1 w-1 rounded-full ${active ? 'bg-white' : 'bg-primary'}`} />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
