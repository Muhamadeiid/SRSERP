import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, RefreshCw } from 'lucide-react'
import CalendarGrid from '../components/calendar/CalendarGrid'
import DayDrawer from '../components/calendar/DayDrawer'
import EventModal from '../components/calendar/EventModal'
import KpiStrip from '../components/calendar/KpiStrip'
import TodayRail from '../components/calendar/TodayRail'
import useCalendar from '../hooks/useCalendar'
import { deleteCalendarEvent, getCalendarStats, setCalendarTaskDone } from '../services/calendarService'

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const EVENT_TYPES = [
  { key: 'meeting', label: 'Meetings', color: 'bg-[var(--cal-meeting)]' },
  { key: 'task', label: 'Tasks', color: 'bg-[var(--cal-task)]' },
  { key: 'interview', label: 'Interviews', color: 'bg-[var(--cal-interview)]' },
  { key: 'leave', label: 'Leave', color: 'bg-[var(--cal-leave)]' },
]

export default function CalendarPage() {
  const currentUser = useSelector(state => state.auth.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const now = new Date()
  const requestedDate = searchParams.get('date')
  const requestedEvent = Number(searchParams.get('event')) || null
  const [cursor, setCursor] = useState(() => {
    const date = requestedDate ? new Date(`${requestedDate}T00:00:00`) : now
    return Number.isNaN(date.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1) : new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const [enabledTypes, setEnabledTypes] = useState(() => new Set(EVENT_TYPES.map(type => type.key)))
  const { events, nonWorkingDays, loading, error, refresh, range } = useCalendar(cursor)
  const [drawerDate, setDrawerDate] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [modal, setModal] = useState(null)
  const [actionError, setActionError] = useState('')
  const [stats, setStats] = useState({})
  const [statsLoading, setStatsLoading] = useState(true)
  const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`

  const refreshStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const response = await getCalendarStats(monthKey)
      setStats(response.data || {})
    } catch {
      setStats({})
    } finally {
      setStatsLoading(false)
    }
  }, [monthKey])

  useEffect(() => { refreshStats() }, [refreshStats])

  useEffect(() => {
    if (!requestedDate || !events.length) return
    setDrawerDate(requestedDate)
    setSelectedEventId(requestedEvent)
    setSearchParams({}, { replace: true })
  }, [events, requestedDate, requestedEvent, setSearchParams])

  const refreshAll = async () => {
    await Promise.all([refresh(), refreshStats()])
  }

  const eventCounts = useMemo(() => EVENT_TYPES.reduce((counts, type) => ({
    ...counts,
    [type.key]: events.filter(event => event.type === type.key && event.date.startsWith(monthKey)).length,
  }), {}), [events, monthKey])

  const moveMonth = amount => setCursor(current => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  const toggleType = type => setEnabledTypes(current => {
    const next = new Set(current)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return next
  })
  const drawerEvents = drawerDate ? events.filter(event => event.date === drawerDate) : []
  const openDay = date => { setDrawerDate(date); setSelectedEventId(null) }
  const openEvent = event => { setDrawerDate(event.date); setSelectedEventId(event.id) }
  const removeEvent = async event => {
    if (!window.confirm(`Delete "${event.title}"?`)) return
    setActionError('')
    try {
      await deleteCalendarEvent(event.id)
      await refreshAll()
      if (drawerEvents.length <= 1) setDrawerDate(null)
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'The event could not be deleted.')
    }
  }
  const toggleDone = async event => {
    setActionError('')
    try {
      await setCalendarTaskDone(event.id, !event.isDone)
      await refreshAll()
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'The task could not be updated.')
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-secondary-700"><CalendarDays className="h-5 w-5 text-primary" /> Calendar</h1>
          <p className="mt-1 text-sm text-neutral-400">Your meetings, tasks, interviews and leave in one place</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={refreshAll} className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50" title="Refresh calendar"><RefreshCw className={`h-4 w-4 ${loading || statsLoading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={() => setModal({ date: new Date().toISOString().slice(0, 10), type: 'meeting', event: null })} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-bold text-white"><Plus className="h-4 w-4" /> Add event</button>
        </div>
      </header>

      <KpiStrip stats={stats} loading={statsLoading} />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 rounded-lg border border-neutral-200 bg-white shadow-sm">
        {actionError && <div className="m-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{actionError}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => moveMonth(-1)} className="grid h-8 w-8 place-items-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="Previous month"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setCursor(new Date(now.getFullYear(), now.getMonth(), 1))} className="h-8 rounded-md border border-neutral-200 px-3 text-xs font-bold text-secondary-700 hover:bg-neutral-50">Today</button>
            <button type="button" onClick={() => moveMonth(1)} className="grid h-8 w-8 place-items-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="Next month"><ChevronRight className="h-4 w-4" /></button>
            <h2 className="ml-2 text-base font-extrabold text-secondary-700">{MONTH_FORMAT.format(cursor)}</h2>
          </div>
          <div className="flex h-8 rounded-md border border-neutral-200 bg-neutral-50 p-0.5 text-xs font-bold">
            <button type="button" className="rounded bg-white px-3 text-primary shadow-sm">Month</button>
            <button type="button" disabled className="px-3 text-neutral-300" title="Coming soon">Week</button>
            <button type="button" disabled className="px-3 text-neutral-300" title="Coming soon">Day</button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 px-4 py-3">
          {EVENT_TYPES.map(type => {
            const active = enabledTypes.has(type.key)
            return (
              <button type="button" key={type.key} onClick={() => toggleType(type.key)} className={`inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs font-bold transition-colors ${active ? 'border-neutral-300 bg-white text-secondary-700' : 'border-neutral-200 bg-neutral-50 text-neutral-300'}`}>
                <span className={`h-2 w-2 rounded-full ${type.color} ${active ? '' : 'opacity-30'}`} />
                {type.label} <span className="text-neutral-400">{eventCounts[type.key]}</span>
              </button>
            )
          })}
          <div className="ml-auto flex items-center gap-3 text-[10px] font-semibold text-neutral-400">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-neutral-200 cal-weekend-cell" /> Weekend / Off</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-teal-200 cal-leave-day" /> Leave day</span>
          </div>
        </div>

        {error && <div className="m-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
        {loading && events.length === 0 ? (
          <div className="grid min-h-[480px] place-items-center text-neutral-400"><div className="flex items-center gap-2 text-sm"><Loader2 className="h-5 w-5 animate-spin" /> Loading calendar...</div></div>
        ) : (
          <CalendarGrid cursor={cursor} range={range} events={events} nonWorkingDays={nonWorkingDays} enabledTypes={enabledTypes} onDayClick={openDay} onEventClick={openEvent} />
        )}
      </section>
      <TodayRail
        events={events}
        currentUser={currentUser}
        onAdd={(type, date) => setModal({ date, type, event: null })}
        onOpenEvent={openEvent}
      />
      </div>

      <DayDrawer
        date={drawerDate}
        events={drawerEvents}
        selectedEventId={selectedEventId}
        currentUser={currentUser}
        onClose={() => setDrawerDate(null)}
        onAdd={date => setModal({ date, type: 'meeting', event: null })}
        onEdit={event => setModal({ date: event.date, event })}
        onDelete={removeEvent}
        onToggleDone={toggleDone}
      />
      <EventModal
        open={!!modal}
        event={modal?.event}
        initialDate={modal?.date}
        initialType={modal?.type}
        currentUser={currentUser}
        onClose={() => setModal(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
