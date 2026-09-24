import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import AgendaView from '../components/calendar/AgendaView'
import CalendarGrid from '../components/calendar/CalendarGrid'
import CalendarHero from '../components/calendar/CalendarHero'
import DayDrawer from '../components/calendar/DayDrawer'
import EventModal from '../components/calendar/EventModal'
import KpiStrip from '../components/calendar/KpiStrip'
import TaskBoard from '../components/calendar/TaskBoard'
import TodayRail from '../components/calendar/TodayRail'
import WeekView from '../components/calendar/WeekView'
import { EVENT_TYPES, dateKey, isRecurring, parseKey } from '../components/calendar/calendarMeta'
import '../components/calendar/calendar.css'
import useCalendar from '../hooks/useCalendar'
import { deleteCalendarEvent, getCalendarStats, updateCalendarTaskProgress } from '../services/calendarService'

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' })
const VIEWS = [['month', 'Month'], ['week', 'Week'], ['agenda', 'Agenda']]

const startOfWeek = date => {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  start.setDate(start.getDate() - start.getDay())
  return start
}

// The month grid fetch covers 42 days around the 1st. Anchoring week view on
// the week's Wednesday keeps all seven days inside that fetched range.
const monthOfWeek = weekStart => {
  const wednesday = new Date(weekStart)
  wednesday.setDate(weekStart.getDate() + 3)
  return new Date(wednesday.getFullYear(), wednesday.getMonth(), 1)
}

export default function WorkCalendarPage() {
  const currentUser = useSelector(state => state.auth.user)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDate = searchParams.get('date')
  const requestedEvent = Number(searchParams.get('event')) || null

  const [view, setView] = useState('month')
  const [focus, setFocus] = useState(() => {
    const date = requestedDate ? parseKey(requestedDate) : new Date()
    return Number.isNaN(date.getTime()) ? new Date() : date
  })
  const weekStart = useMemo(() => startOfWeek(focus), [focus])
  const cursor = useMemo(
    () => (view === 'week' ? monthOfWeek(weekStart) : new Date(focus.getFullYear(), focus.getMonth(), 1)),
    [view, weekStart, focus]
  )

  const [enabledTypes, setEnabledTypes] = useState(() => new Set(EVENT_TYPES.map(type => type.key)))
  const [showRecurring, setShowRecurring] = useState(() => {
    try { return localStorage.getItem('cal-show-recurring') !== '0' } catch { return true }
  })
  const toggleRecurring = () => setShowRecurring(current => {
    try { localStorage.setItem('cal-show-recurring', current ? '0' : '1') } catch { /* private mode */ }
    return !current
  })
  const { events, nonWorkingDays, loading, error, refresh, range } = useCalendar(cursor)
  const [drawerDate, setDrawerDate] = useState(null)
  const [selectedEventId, setSelectedEventId] = useState(null)
  const [modal, setModal] = useState(null)
  const [actionError, setActionError] = useState('')
  const [stats, setStats] = useState({})
  const [statsLoading, setStatsLoading] = useState(true)
  const [boardKey, setBoardKey] = useState(0)
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

  // Deep links from notifications: ?date=YYYY-MM-DD&event=ID. Older
  // notifications carry only ?event=ID, so fall back to finding the event
  // in the loaded range.
  useEffect(() => {
    if ((!requestedDate && !requestedEvent) || loading) return
    const date = requestedDate || events.find(event => event.id === requestedEvent)?.date
    if (date) {
      setDrawerDate(date)
      setSelectedEventId(requestedEvent)
    }
    setSearchParams({}, { replace: true })
  }, [loading, events, requestedDate, requestedEvent, setSearchParams])

  const refreshAll = useCallback(async () => {
    setBoardKey(key => key + 1)
    await Promise.all([refresh(), refreshStats()])
  }, [refresh, refreshStats])

  const eventCounts = useMemo(() => EVENT_TYPES.reduce((counts, type) => ({
    ...counts,
    [type.key]: events.filter(event => event.type === type.key && event.date.startsWith(monthKey)).length,
  }), {}), [events, monthKey])

  const move = amount => setFocus(current => {
    if (view === 'week') {
      const next = new Date(current)
      next.setDate(current.getDate() + amount * 7)
      return next
    }
    return new Date(current.getFullYear(), current.getMonth() + amount, 1)
  })
  const toggleType = type => setEnabledTypes(current => {
    const next = new Set(current)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    return next
  })

  const drawerEvents = drawerDate ? events.filter(event => event.date === drawerDate) : []
  const viewEvents = useMemo(() => (showRecurring ? events : events.filter(event => !isRecurring(event))), [events, showRecurring])
  const recurringCount = useMemo(() => new Set(events.filter(isRecurring).map(event => event.id)).size, [events])
  const openDay = date => { setDrawerDate(date); setSelectedEventId(null) }
  const openEvent = event => {
    // Task-board items can sit outside the visible month; jump there first.
    const date = parseKey(event.date)
    if (event.date < range.from || event.date > range.to) setFocus(date)
    setDrawerDate(event.date)
    setSelectedEventId(event.id)
  }
  const openCreate = (type, assign = false, date = dateKey(new Date())) => setModal({ date, type, assign, event: null })

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

  const progress = async (event, payload) => {
    setActionError('')
    try {
      await updateCalendarTaskProgress(event.id, payload)
      await refreshAll()
    } catch (requestError) {
      setActionError(requestError.response?.data?.message || 'The task could not be updated.')
    }
  }

  const title = view === 'week'
    ? (() => {
        const end = new Date(weekStart)
        end.setDate(weekStart.getDate() + 6)
        const sameMonth = end.getMonth() === weekStart.getMonth()
        return `${weekStart.getDate()}${sameMonth ? '' : ` ${weekStart.toLocaleDateString('en-GB', { month: 'short' })}`} – ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
      })()
    : MONTH_FORMAT.format(cursor)

  return (
    <div className="cal-page mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      <CalendarHero
        events={events}
        currentUser={currentUser}
        loading={loading || statsLoading}
        onRefresh={refreshAll}
        onCreate={(type, assign) => openCreate(type, assign)}
        onOpenEvent={openEvent}
      />

      <KpiStrip stats={stats} loading={statsLoading} />

      <div className="cal-layout">
        <section className="cal-card" aria-label="Calendar">
          {actionError && <p className="cal-error m-4" role="alert">{actionError}</p>}

          <div className="cal-toolbar">
            <div className="cal-nav">
              <button type="button" onClick={() => move(-1)} aria-label={`Previous ${view === 'week' ? 'week' : 'month'}`}><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" onClick={() => setFocus(new Date())}>Today</button>
              <button type="button" onClick={() => move(1)} aria-label={`Next ${view === 'week' ? 'week' : 'month'}`}><ChevronRight className="h-4 w-4" /></button>
              <h2>{title}</h2>
              {loading && events.length > 0 && <Loader2 className="ml-1 h-4 w-4 animate-spin text-neutral-400" />}
            </div>
            <div className="cal-views" role="group" aria-label="Calendar view">
              {VIEWS.map(([key, label]) => (
                <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
              ))}
            </div>
          </div>

          <div className="cal-filters" role="group" aria-label="Show event types">
            {EVENT_TYPES.map(type => (
              <button type="button" key={type.key} className="cal-chip" data-type={type.key} aria-pressed={enabledTypes.has(type.key)} onClick={() => toggleType(type.key)}>
                <i aria-hidden="true" />{type.plural} <b>{eventCounts[type.key]}</b>
              </button>
            ))}
            {recurringCount > 0 && (
              <button type="button" className="cal-chip cal-chip--routine" aria-pressed={showRecurring} onClick={toggleRecurring} title="Daily and weekly repeating events">
                <i aria-hidden="true" />Recurring <b>{recurringCount}</b>
              </button>
            )}
            <div className="cal-legend">
              <span><i style={{ background: 'var(--cal-weekend-bg)' }} /> Off day</span>
              <span><i className="cal-leave-day" /> Leave</span>
            </div>
          </div>

          {error && <p className="cal-error m-4">{error}</p>}
          {loading && events.length === 0 ? (
            <div className="grid min-h-[480px] place-items-center text-sm text-neutral-400">
              <span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Loading calendar…</span>
            </div>
          ) : view === 'week' ? (
            <WeekView weekStart={weekStart} events={viewEvents} nonWorkingDays={nonWorkingDays} enabledTypes={enabledTypes} onDayClick={openDay} onEventClick={openEvent} />
          ) : view === 'agenda' ? (
            <AgendaView cursor={cursor} events={viewEvents} enabledTypes={enabledTypes} onEventClick={openEvent} />
          ) : (
            <CalendarGrid cursor={cursor} range={range} events={viewEvents} nonWorkingDays={nonWorkingDays} enabledTypes={enabledTypes} onDayClick={openDay} onEventClick={openEvent} />
          )}
        </section>

        <div className="grid gap-4">
          <TaskBoard
            currentUser={currentUser}
            refreshKey={boardKey}
            onOpen={openEvent}
            onCreate={assign => openCreate('task', assign)}
            onChanged={() => { refresh(); refreshStats() }}
          />
          <TodayRail events={events} onOpenEvent={openEvent} />
        </div>
      </div>

      <DayDrawer
        date={drawerDate}
        events={drawerEvents}
        selectedEventId={selectedEventId}
        currentUser={currentUser}
        onClose={() => setDrawerDate(null)}
        onAdd={date => openCreate('meeting', false, date)}
        onEdit={event => setModal({ date: event.date, event })}
        onDelete={removeEvent}
        onProgress={progress}
      />
      <EventModal
        open={!!modal}
        event={modal?.event}
        initialDate={modal?.date}
        initialType={modal?.type}
        assignMode={!!modal?.assign}
        currentUser={currentUser}
        onClose={() => setModal(null)}
        onSaved={refreshAll}
      />
    </div>
  )
}
