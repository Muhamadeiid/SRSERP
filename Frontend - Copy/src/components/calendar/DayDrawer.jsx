import { useEffect } from 'react'
import { Bell, CalendarDays, Clock3, ExternalLink, Flag, Pencil, Plus, Repeat2, Trash2, UserRound, Users, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { REMINDER_OPTIONS, TASK_STATUSES, TYPE_BY_KEY, assignees, parseKey } from './calendarMeta'

const reminderLabel = minutes => REMINDER_OPTIONS.find(option => option.value === minutes)?.label

export default function DayDrawer({ date, events, selectedEventId, currentUser, onClose, onAdd, onEdit, onDelete, onProgress }) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!date) return undefined
    const onKey = event => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [date, onClose])

  if (!date) return null
  const day = parseKey(date)

  return (
    <div className="cal-overlay" onMouseDown={onClose}>
      <aside className="cal-drawer" role="dialog" aria-modal="true" aria-label={day.toDateString()} onMouseDown={event => event.stopPropagation()}>
        <header className="cal-drawer-head">
          <span className="cal-drawer-date">
            <small>{day.toLocaleDateString('en-GB', { month: 'short' })}</small>
            <strong>{day.getDate()}</strong>
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{day.toLocaleDateString('en-GB', { weekday: 'long' })}</h2>
            <p className="text-xs text-neutral-500">{events.length ? `${events.length} item${events.length === 1 ? '' : 's'}` : 'Nothing planned yet'}</p>
          </div>
          <button type="button" className="cal-btn cal-btn--primary" onClick={() => onAdd(date)}><Plus className="h-3.5 w-3.5" /> Add</button>
          <button type="button" className="cal-btn" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="cal-drawer-body">
          {events.length === 0 && (
            <div className="grid min-h-60 place-items-center text-center text-sm text-neutral-400">
              <div><CalendarDays className="mx-auto mb-2 h-8 w-8 text-neutral-300" />A free day. Add something to plan it.</div>
            </div>
          )}

          {events.map(event => {
            const isMaintenanceTask = event.source === 'maintenance_task'
            const isOwner = event.by?.id === currentUser?.id
            const isAssignee = assignees(event).some(user => user.id === currentUser?.id)
            const canEdit = !isMaintenanceTask && (isOwner || currentUser?.role === 'admin')
            const canWork = event.type === 'task' && !isMaintenanceTask && (isOwner || isAssignee || currentUser?.role === 'admin')
            const status = event.status || (event.isDone ? 'done' : 'todo')
            const checklist = Array.isArray(event.checklist) ? event.checklist : []
            const people = event.participants?.filter(user => user.id !== event.by?.id) || []

            return (
              <article
                key={event.occurrenceKey || event.id}
                data-type={event.type}
                className={`cal-detail ${selectedEventId === event.id ? 'cal-detail--selected' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cal-type-tag">{TYPE_BY_KEY[event.type]?.label || event.type}</span>
                  {event.type === 'task' && event.priority && event.priority !== 'normal' && (
                    <span className="cal-prio" data-priority={event.priority}>{event.priority}</span>
                  )}
                </div>
                <h3 className={`mt-2 text-[15px] font-bold leading-snug ${event.isDone ? 'text-neutral-400 line-through' : ''}`}>{event.title}</h3>

                <div className="cal-detail-rows">
                  {(event.time || event.isAllDay) && (
                    <p><Clock3 className="h-3.5 w-3.5" />{event.isAllDay || !event.time ? 'All day' : `${event.time.slice(0, 5)}${event.dur ? ` · ${event.dur} min` : ''}`}</p>
                  )}
                  {event.reminderMinutes != null && <p><Bell className="h-3.5 w-3.5" />Reminder: {reminderLabel(event.reminderMinutes) || `${event.reminderMinutes} min before`}</p>}
                  {event.by?.name && <p><UserRound className="h-3.5 w-3.5" />{event.type === 'task' && people.length ? `Assigned by ${event.by.name}` : `Created by ${event.by.name}`}</p>}
                  {people.length > 0 && <p><Users className="h-3.5 w-3.5" /><span>{people.map(user => user.name).join(', ')}</span></p>}
                  {event.recurrence?.type && event.recurrence.type !== 'none' && (
                    <p><Repeat2 className="h-3.5 w-3.5" />Repeats {event.recurrence.type}{event.recurrence.until ? ` until ${event.recurrence.until}` : ''}</p>
                  )}
                  {event.completedBy && event.isDone && <p><Flag className="h-3.5 w-3.5" />Completed by {event.completedBy.name}</p>}
                  {event.note && <p className="cal-note">{event.note}</p>}
                </div>

                {event.type === 'task' && !isMaintenanceTask && (
                  <>
                    {canWork && (
                      <div className="cal-status-switch" role="group" aria-label="Task status">
                        {TASK_STATUSES.map(option => (
                          <button
                            type="button"
                            key={option.key}
                            data-status={option.key}
                            aria-pressed={status === option.key}
                            onClick={() => status !== option.key && onProgress(event, { status: option.key })}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                    {checklist.length > 0 && (
                      <div className="cal-checklist">
                        {checklist.map((item, index) => (
                          <label key={`${index}-${item.text}`}>
                            <input
                              type="checkbox"
                              checked={!!item.done}
                              disabled={!canWork}
                              onChange={() => onProgress(event, {
                                checklist: checklist.map((entry, position) => position === index ? { ...entry, done: !entry.done } : entry),
                              })}
                            />
                            <span>{item.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {(isMaintenanceTask || canEdit) && (
                  <div className="cal-detail-actions">
                    {isMaintenanceTask && <button type="button" className="cal-btn cal-btn--primary" onClick={() => navigate(event.href)}><ExternalLink className="h-3.5 w-3.5" />Open task</button>}
                    {canEdit && <button type="button" className="cal-btn" onClick={() => onEdit(event)}><Pencil className="h-3.5 w-3.5" />Edit</button>}
                    {isOwner && !isMaintenanceTask && <button type="button" className="cal-btn cal-btn--danger" onClick={() => onDelete(event)}><Trash2 className="h-3.5 w-3.5" />Delete</button>}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
