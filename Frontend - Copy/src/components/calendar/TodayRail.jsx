import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Clock3, Plus } from 'lucide-react'

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const TYPE_DOTS = { meeting: 'bg-[var(--cal-meeting)]', task: 'bg-[var(--cal-task)]', interview: 'bg-[var(--cal-interview)]', leave: 'bg-[var(--cal-leave)]' }

export default function TodayRail({ events, currentUser, onAdd, onOpenEvent }) {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const today = dateKey(now)
  const nextWeek = new Date(now)
  nextWeek.setDate(now.getDate() + 7)
  const nextWeekKey = dateKey(nextWeek)
  const todayEvents = useMemo(() => events.filter(event => event.date === today).sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))), [events, today])
  const upcoming = useMemo(() => events.filter(event => event.date > today && event.date <= nextWeekKey).sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`)).slice(0, 7), [events, today, nextWeekKey])
  const actions = [
    { type: 'meeting', label: 'Meeting' },
    ...(['admin', 'depot_manager', 'manager'].includes(currentUser?.role) ? [{ type: 'task', label: 'Task' }] : []),
    ...(['admin', 'hr'].includes(currentUser?.role) ? [{ type: 'interview', label: 'Interview' }] : []),
    { type: 'leave', label: 'Leave' },
  ]

  const EventRow = ({ event, showDate = false }) => (
    <button type="button" onClick={() => onOpenEvent(event)} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-50">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOTS[event.type]}`} />
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-secondary-700">{event.title}</span><span className="block text-[10px] text-neutral-400">{showDate ? event.date : (event.time || 'All day')} · {event.type}</span></span>
    </button>
  )

  return (
    <aside className="space-y-3">
      <section className="rounded-lg border border-neutral-200 bg-white shadow-sm">
        <header className="border-b border-neutral-200 px-4 py-3"><p className="text-[10px] font-bold uppercase text-neutral-400">Today</p><div className="mt-1 flex items-end justify-between"><h2 className="text-base font-extrabold text-secondary-700">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</h2><span className="flex items-center gap-1 text-xs font-bold text-primary"><Clock3 className="h-3.5 w-3.5" />{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></div></header>
        <div className="max-h-56 overflow-y-auto p-2">{todayEvents.length ? todayEvents.map(event => <EventRow key={event.occurrenceKey || event.id} event={event} />) : <p className="px-2 py-8 text-center text-xs text-neutral-400">No events today</p>}</div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-white shadow-sm"><header className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3"><CalendarPlus className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-extrabold text-secondary-700">Upcoming</h3><p className="text-[10px] text-neutral-400">Next 7 days</p></div></header><div className="max-h-64 overflow-y-auto p-2">{upcoming.length ? upcoming.map(event => <EventRow key={event.occurrenceKey || event.id} event={event} showDate />) : <p className="px-2 py-8 text-center text-xs text-neutral-400">Nothing upcoming</p>}</div></section>

      <section className="rounded-lg border border-neutral-200 bg-white p-3 shadow-sm"><p className="mb-2 text-[10px] font-bold uppercase text-neutral-400">Quick add</p><div className="grid grid-cols-2 gap-2">{actions.map(action => <button type="button" key={action.type} onClick={() => onAdd(action.type, today)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 text-xs font-bold text-secondary-700 hover:border-primary hover:text-primary"><Plus className="h-3.5 w-3.5" />{action.label}</button>)}</div></section>
    </aside>
  )
}
