import { createElement, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Plus, RefreshCw } from 'lucide-react'
import { EVENT_TYPES, TASK_MANAGER_ROLES, countdown, eventStart } from './calendarMeta'

const CREATE_HINTS = {
  meeting: 'Invite people, set a reminder',
  task: 'For yourself',
  taskAssign: 'Assign to your team',
  interview: 'Schedule a candidate',
  leave: 'Block days on your calendar',
}

/**
 * Page header: live clock, the next thing on the calendar with a countdown,
 * and a create menu scoped to what this role may add.
 */
export default function CalendarHero({ events, currentUser, loading, onRefresh, onCreate, onOpenEvent }) {
  const [now, setNow] = useState(() => new Date())
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    const close = event => {
      if (event.type === 'keydown' && event.key !== 'Escape') return
      if (event.type === 'mousedown' && menuRef.current?.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menuOpen])

  // The next timed, unfinished thing that has not started yet.
  const next = useMemo(() => events
    .filter(event => event.time && event.type !== 'leave' && !event.isDone)
    .map(event => ({ event, start: eventStart(event) }))
    .filter(item => item.start >= now)
    .sort((a, b) => a.start - b.start)[0] || null, [events, now])

  const canAssign = TASK_MANAGER_ROLES.includes(currentUser?.role)
  const options = [
    { type: 'meeting', ...EVENT_TYPES[0] },
    { type: 'task', ...EVENT_TYPES[1], hint: CREATE_HINTS.task },
    ...(canAssign ? [{ type: 'task', ...EVENT_TYPES[1], label: 'Assign a task', hint: CREATE_HINTS.taskAssign, assign: true }] : []),
    ...(['admin', 'hr'].includes(currentUser?.role) ? [{ type: 'interview', ...EVENT_TYPES[2] }] : []),
    { type: 'leave', ...EVENT_TYPES[3] },
  ]
  const firstName = currentUser?.name?.split(' ')[0]

  return (
    <header className="cal-hero">
      <span className="cal-hero-rings" aria-hidden="true" />
      <div>
        <p className="cal-hero-eyebrow">WORKSPACE / CALENDAR</p>
        <h1>{firstName ? `${firstName}'s calendar` : 'Calendar'}</h1>
        <p className="cal-hero-date">
          <span>{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span className="cal-hero-clock">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        </p>
      </div>

      <div className="cal-hero-actions">
        {next && (
          <button type="button" className="cal-next" data-type={next.event.type} onClick={() => onOpenEvent(next.event)}>
            <span className="cal-next-dot" aria-hidden="true" />
            <span style={{ minWidth: 0 }}>
              <small>Up next · {next.event.time.slice(0, 5)}</small>
              <strong>{next.event.title}</strong>
            </span>
            <em>{countdown(next.start, now)}</em>
          </button>
        )}

        <button type="button" className="cal-icon-btn" onClick={onRefresh} title="Refresh" aria-label="Refresh calendar">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>

        <div className="cal-create-wrap" ref={menuRef}>
          <button type="button" className="cal-create" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
            <Plus className="h-4 w-4" /> New <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="cal-create-menu" role="menu">
              {options.map(option => (
                <button
                  type="button"
                  role="menuitem"
                  key={`${option.type}-${option.label}`}
                  data-type={option.type}
                  onClick={() => { setMenuOpen(false); onCreate(option.type, option.assign) }}
                >
                  <i aria-hidden="true">{createElement(option.icon, { className: 'h-4 w-4' })}</i>
                  <span>{option.label}<small>{option.hint || CREATE_HINTS[option.type]}</small></span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
