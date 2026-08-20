import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Loader2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import MiniCalendar from '../calendar/MiniCalendar'
import { getCalendarEvents } from '../../services/calendarService'

const TYPE_DOTS = { meeting: 'bg-[var(--cal-meeting)]', task: 'bg-[var(--cal-task)]', interview: 'bg-[var(--cal-interview)]', leave: 'bg-[var(--cal-leave)]' }
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const monthRange = cursor => {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(1 - first.getDay())
  const end = new Date(start)
  end.setDate(start.getDate() + 41)
  return { from: dateKey(start), to: dateKey(end) }
}

export default function CalendarDashboardWidget() {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()))
  const [events, setEvents] = useState([])
  const [nonWorkingDays, setNonWorkingDays] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const range = monthRange(cursor)
      const response = await getCalendarEvents(range.from, range.to)
      setEvents(response.data || [])
      setNonWorkingDays(response.meta?.nonWorkingDays || [])
    } catch {
      setEvents([])
      setNonWorkingDays([])
    } finally {
      setLoading(false)
    }
  }, [cursor])

  useEffect(() => { load() }, [load])

  const selectedEvents = useMemo(() => events
    .filter(event => event.date === selectedDate)
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))), [events, selectedDate])
  const upcoming = useMemo(() => events
    .filter(event => event.date >= dateKey(new Date()))
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
    .slice(0, 5), [events])
  const shownEvents = selectedEvents.length ? selectedEvents : upcoming

  return (
    <section className="rounded-md border border-neutral-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /><span><h2 className="text-sm font-bold text-secondary-700">Calendar</h2><p className="text-[9px] text-neutral-400">Events visible to your account</p></span></span>
        <button type="button" onClick={() => navigate('/human-resources/work-calendar')} className="text-[10px] font-bold text-primary">Open calendar</button>
      </header>
      <div className="grid gap-3 p-3 md:grid-cols-[240px_minmax(0,1fr)]">
        <MiniCalendar
          cursor={cursor}
          events={events}
          nonWorkingDays={nonWorkingDays}
          selectedDate={selectedDate}
          onMonthChange={amount => setCursor(current => new Date(current.getFullYear(), current.getMonth() + amount, 1))}
          onSelectDate={setSelectedDate}
        />
        <div className="min-h-[230px] rounded-md border border-neutral-200">
          <div className="border-b border-neutral-100 px-3 py-2"><strong className="text-xs text-secondary-700">{selectedEvents.length ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Upcoming events'}</strong></div>
          {loading ? <div className="grid min-h-44 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : shownEvents.length ? <div className="divide-y divide-neutral-100">{shownEvents.map(event => (
            <button type="button" key={event.occurrenceKey || `${event.id}-${event.date}`} onClick={() => navigate(`/human-resources/work-calendar?date=${event.date}&event=${event.id}`)} className="flex w-full items-start gap-2.5 px-3 py-3 text-left hover:bg-neutral-50">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOTS[event.type] || 'bg-neutral-400'}`} />
              <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-secondary-700">{event.title}</strong><span className="mt-0.5 block text-[9px] capitalize text-neutral-400">{event.date} · {event.time || 'All day'} · {event.type}</span></span>
            </button>
          ))}</div> : <div className="grid min-h-44 place-items-center px-4 text-center text-xs text-neutral-400">No visible events for this date</div>}
        </div>
      </div>
    </section>
  )
}
