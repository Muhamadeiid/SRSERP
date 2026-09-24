import { createElement, useEffect, useMemo, useState } from 'react'
import { Bell, Check, ListChecks, Loader2, Plus, Repeat2, Search, Trash2, Users, X } from 'lucide-react'
import { createCalendarEvent, getCalendarUsers, updateCalendarEvent } from '../../services/calendarService'
import { EVENT_TYPES, PRIORITIES, REMINDER_OPTIONS, TASK_MANAGER_ROLES, dateKey, initials } from './calendarMeta'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_REMINDER = { meeting: 15, interview: 15, task: 30, leave: '' }

const blankForm = (date, type = 'meeting') => ({
  type, title: '', notes: '', event_date: date || dateKey(new Date()),
  event_time: '09:00', duration_min: 60, is_all_day: false, leave_end_date: '',
  participantIds: [], recurrence_type: 'none', recurrence_interval: 1,
  recurrence_weekdays: [], recurrence_until: '',
  priority: 'normal', reminder_minutes: DEFAULT_REMINDER[type] ?? '', checklist: [],
})

function eventForm(event, date, type) {
  if (!event) return blankForm(date, type)
  return {
    type: event.type,
    title: event.title || '',
    notes: event.note || '',
    event_date: event.startsOn || event.date,
    event_time: event.time || '09:00',
    duration_min: event.dur || 60,
    is_all_day: !!event.isAllDay,
    leave_end_date: event.leaveEnd || '',
    participantIds: (event.participants || []).filter(user => user.id !== event.by?.id).map(user => user.id),
    recurrence_type: event.recurrence?.type || 'none',
    recurrence_interval: event.recurrence?.interval || 1,
    recurrence_weekdays: event.recurrence?.weekdays || [],
    recurrence_until: event.recurrence?.until || '',
    priority: event.priority || 'normal',
    reminder_minutes: event.reminderMinutes ?? '',
    checklist: Array.isArray(event.checklist) ? event.checklist : [],
  }
}

export default function EventModal({ open, event, initialDate, initialType, assignMode = false, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(() => eventForm(event, initialDate, initialType))
  const [reminderTouched, setReminderTouched] = useState(false)
  const [users, setUsers] = useState([])
  const [taskAssignable, setTaskAssignable] = useState([])
  const [search, setSearch] = useState('')
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(eventForm(event, initialDate, initialType))
    setReminderTouched(!!event)
    setSearch('')
    setNewItem('')
    setError('')
    getCalendarUsers().then(response => {
      setUsers(response.data || [])
      setTaskAssignable(response.meta?.taskAssignableUserIds || [])
    }).catch(() => setError('Users could not be loaded.'))
  }, [open, event, initialDate, initialType])

  useEffect(() => {
    if (!open) return undefined
    const onKey = keyEvent => { if (keyEvent.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const allowedTypes = EVENT_TYPES.filter(type => !type.roles || type.roles.includes(currentUser?.role))
  const canAssignTasks = TASK_MANAGER_ROLES.includes(currentUser?.role)
  const isTask = form.type === 'task'
  const isLeave = form.type === 'leave'
  const timed = !isLeave && !form.is_all_day
  const showPeople = !isLeave && (!isTask || canAssignTasks)
  const usersById = useMemo(() => new Map(users.map(user => [user.id, user])), [users])
  const availableUsers = useMemo(() => users.filter(user => {
    if (user.id === currentUser?.id) return false
    if (isTask && !taskAssignable.includes(user.id)) return false
    return `${user.name} ${user.department || ''} ${user.role || ''}`.toLowerCase().includes(search.toLowerCase())
  }), [users, currentUser?.id, isTask, taskAssignable, search])

  if (!open) return null

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setType = type => setForm(current => ({
    ...current,
    type,
    reminder_minutes: reminderTouched ? current.reminder_minutes : (DEFAULT_REMINDER[type] ?? ''),
  }))
  const toggleParticipant = id => set('participantIds', form.participantIds.includes(id) ? form.participantIds.filter(item => item !== id) : [...form.participantIds, id])
  const toggleWeekday = day => set('recurrence_weekdays', form.recurrence_weekdays.includes(day) ? form.recurrence_weekdays.filter(item => item !== day) : [...form.recurrence_weekdays, day])
  const addItem = () => {
    const text = newItem.trim()
    if (!text) return
    set('checklist', [...form.checklist, { text, done: false }])
    setNewItem('')
  }

  const submit = async submitEvent => {
    submitEvent.preventDefault()
    setSaving(true)
    setError('')
    try {
      const participantRole = isTask ? 'assignee' : form.type === 'interview' ? 'interviewer' : 'attendee'
      const payload = {
        type: form.type,
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        event_date: form.event_date,
        event_time: timed ? form.event_time : null,
        duration_min: timed ? Number(form.duration_min) : null,
        is_all_day: isLeave ? true : form.is_all_day,
        leave_end_date: isLeave ? (form.leave_end_date || form.event_date) : null,
        participants: showPeople ? form.participantIds.map(userId => ({ user_id: userId, role: participantRole })) : [],
        recurrence_type: form.recurrence_type,
        recurrence_interval: Number(form.recurrence_interval),
        recurrence_weekdays: form.recurrence_type === 'weekly' ? form.recurrence_weekdays : null,
        recurrence_until: form.recurrence_type === 'none' ? null : (form.recurrence_until || null),
        priority: isTask ? form.priority : 'normal',
        reminder_minutes: timed && form.reminder_minutes !== '' ? Number(form.reminder_minutes) : null,
        checklist: isTask ? form.checklist : null,
      }
      if (event) await updateCalendarEvent(event.id, payload)
      else await createCalendarEvent(payload)
      await onSaved?.()
      onClose()
    } catch (requestError) {
      const validation = requestError.response?.data?.errors
      setError(validation ? Object.values(validation).flat()[0] : requestError.response?.data?.message || 'The event could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const peopleLabel = isTask ? 'Assign to' : form.type === 'interview' ? 'Interviewers' : 'Invite people'
  const reminderText = timed && form.reminder_minutes !== ''
    ? REMINDER_OPTIONS.find(option => String(option.value) === String(form.reminder_minutes))?.label
    : null
  const notifiedCount = showPeople ? form.participantIds.length : 0

  return (
    <div className="cal-overlay" onMouseDown={onClose}>
      <div className="cal-modal-wrap">
        <form
          onSubmit={submit}
          onMouseDown={mouseEvent => mouseEvent.stopPropagation()}
          className="cal-modal"
          role="dialog"
          aria-modal="true"
          aria-label={event ? 'Edit event' : 'New calendar event'}
        >
          <header className="cal-modal-head">
            <h2>{event ? 'Edit' : isTask && assignMode ? 'Assign a task' : 'Create'} {!(isTask && assignMode && !event) && (EVENT_TYPES.find(type => type.key === form.type)?.label.toLowerCase() || 'event')}</h2>
            <p>{new Date(`${form.event_date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            <button type="button" className="cal-modal-close" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button>
            {!event && (
              <div className="cal-type-picker" role="group" aria-label="Event type">
                {allowedTypes.map(type => (
                  <button key={type.key} type="button" data-type={type.key} aria-pressed={form.type === type.key} onClick={() => setType(type.key)}>
                    {createElement(type.icon, { className: 'h-4 w-4' })}{type.label}
                  </button>
                ))}
              </div>
            )}
          </header>

          <div className="cal-modal-body">
            {error && <div className="cal-error" role="alert">{error}</div>}

            <label className="cal-field">
              <span>Title</span>
              <input required autoFocus maxLength={255} value={form.title} onChange={e => set('title', e.target.value)} className="cal-input cal-input--title" placeholder={isTask ? 'What needs to be done?' : 'What is it about?'} />
            </label>

            <div className="cal-grid-2">
              <label className="cal-field"><span>{isLeave ? 'From' : isTask ? 'Due date' : 'Date'}</span><input required type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)} className="cal-input" /></label>
              {isLeave ? (
                <label className="cal-field"><span>Until</span><input type="date" min={form.event_date} value={form.leave_end_date} onChange={e => set('leave_end_date', e.target.value)} className="cal-input" /></label>
              ) : (
                <label className="cal-field"><span>{isTask ? 'Due time' : 'Start time'}</span><input type="time" disabled={form.is_all_day} value={form.event_time} onChange={e => set('event_time', e.target.value)} className="cal-input" /></label>
              )}
              {!isLeave && (
                <label className="cal-field"><span>Duration (min)</span><input type="number" min="1" max="1440" disabled={form.is_all_day} value={form.duration_min} onChange={e => set('duration_min', e.target.value)} className="cal-input" /></label>
              )}
            </div>

            {!isLeave && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <label className="cal-toggle"><input type="checkbox" checked={form.is_all_day} onChange={e => set('is_all_day', e.target.checked)} /> All day</label>
                {timed && (
                  <label className="cal-toggle" style={{ flex: '1 1 240px' }}>
                    <Bell className="h-4 w-4 text-neutral-400" />
                    <select
                      value={form.reminder_minutes}
                      onChange={e => { setReminderTouched(true); set('reminder_minutes', e.target.value === '' ? '' : Number(e.target.value)) }}
                      className="cal-input"
                      style={{ height: 36 }}
                      aria-label="Reminder"
                    >
                      {REMINDER_OPTIONS.map(option => <option key={option.label} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
            )}

            {isTask && (
              <div className="cal-field" data-priority={form.priority}>
                <span>Priority</span>
                <div className="cal-segment" role="group" aria-label="Priority">
                  {PRIORITIES.map(priority => (
                    <button type="button" key={priority.key} data-priority={priority.key} aria-pressed={form.priority === priority.key} onClick={() => set('priority', priority.key)}>
                      {priority.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isTask && !canAssignTasks && <p className="cal-hint">This task goes on your own list. You will get a reminder before it is due.</p>}

            {showPeople && (
              <section className="cal-section">
                <p className="cal-section-title"><Users className="h-4 w-4" />{peopleLabel}{isTask && <span className="ml-auto text-[10.5px] font-medium text-neutral-400">Leave empty to keep it on your own list</span>}</p>
                {form.participantIds.length > 0 && (
                  <div className="cal-selected">
                    {form.participantIds.map(id => (
                      <button type="button" key={id} onClick={() => toggleParticipant(id)} title="Remove">
                        <span className="cal-avatar" style={{ width: 20, height: 20, border: 0 }}>{initials(usersById.get(id)?.name)}</span>
                        {usersById.get(id)?.name || 'User'} <X className="h-3 w-3" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isTask ? 'Search your team…' : 'Search people…'} className="cal-input" style={{ paddingLeft: 36, height: 36 }} />
                </div>
                <div className="cal-people">
                  {availableUsers.map(user => {
                    const selected = form.participantIds.includes(user.id)
                    return (
                      <button type="button" key={user.id} className="cal-person" aria-pressed={selected} onClick={() => toggleParticipant(user.id)}>
                        <span className="cal-avatar" style={{ border: 0, background: selected ? '#005782' : undefined, color: selected ? '#fff' : undefined }}>
                          {selected ? <Check className="h-3 w-3" /> : initials(user.name)}
                        </span>
                        <span className="truncate font-semibold">{user.name}</span>
                        <small>{user.department}</small>
                      </button>
                    )
                  })}
                  {availableUsers.length === 0 && <p className="px-2 py-3 text-xs text-neutral-400">{isTask ? 'No one on your team matches.' : 'No matches.'}</p>}
                </div>
              </section>
            )}

            {isTask && (
              <section className="cal-section">
                <p className="cal-section-title"><ListChecks className="h-4 w-4" />Checklist<span className="ml-auto text-[10.5px] font-medium text-neutral-400">Break the task into steps</span></p>
                <div className="cal-check-edit">
                  {form.checklist.map((item, index) => (
                    <div key={index}>
                      <input type="checkbox" checked={!!item.done} onChange={() => set('checklist', form.checklist.map((entry, position) => position === index ? { ...entry, done: !entry.done } : entry))} aria-label="Done" style={{ width: 16, height: 16, accentColor: '#005782' }} />
                      <input type="text" value={item.text} maxLength={255} onChange={e => set('checklist', form.checklist.map((entry, position) => position === index ? { ...entry, text: e.target.value } : entry))} className="cal-input" />
                      <button type="button" className="cal-btn" onClick={() => set('checklist', form.checklist.filter((_, position) => position !== index))} aria-label="Remove step"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))}
                  {form.checklist.length < 30 && (
                    <div>
                      <Plus className="h-4 w-4 shrink-0 text-neutral-400" />
                      <input
                        type="text"
                        value={newItem}
                        maxLength={255}
                        placeholder="Add a step and press Enter"
                        onChange={e => setNewItem(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem() } }}
                        className="cal-input"
                      />
                      <button type="button" className="cal-btn" onClick={addItem} disabled={!newItem.trim()}>Add</button>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section className="cal-section">
              <p className="cal-section-title"><Repeat2 className="h-4 w-4" />Repeat</p>
              <div className="cal-grid-2">
                <select value={form.recurrence_type} onChange={e => set('recurrence_type', e.target.value)} className="cal-input" aria-label="Repeat">
                  <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
                {form.recurrence_type !== 'none' && <>
                  <label className="cal-field"><span>Every</span><input type="number" min="1" max="52" value={form.recurrence_interval} onChange={e => set('recurrence_interval', e.target.value)} className="cal-input" /></label>
                  <label className="cal-field"><span>Until</span><input type="date" min={form.event_date} value={form.recurrence_until} onChange={e => set('recurrence_until', e.target.value)} className="cal-input" /></label>
                </>}
              </div>
              {form.recurrence_type === 'weekly' && (
                <div className="cal-weekday-picks" role="group" aria-label="Weekdays">
                  {WEEKDAYS.map((day, index) => <button type="button" key={day} aria-pressed={form.recurrence_weekdays.includes(index)} onClick={() => toggleWeekday(index)}>{day}</button>)}
                </div>
              )}
            </section>

            <label className="cal-field"><span>Notes</span><textarea rows="3" maxLength={10000} value={form.notes} onChange={e => set('notes', e.target.value)} className="cal-input" placeholder="Agenda, links, context…" /></label>
          </div>

          <footer className="cal-modal-foot">
            <p>
              {[reminderText && `Reminder: ${reminderText.toLowerCase()}`, notifiedCount > 0 && `${notifiedCount} ${notifiedCount === 1 ? 'person' : 'people'} notified`].filter(Boolean).join(' · ')}
            </p>
            <button type="button" className="cal-btn" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={saving} className="cal-btn cal-btn--primary">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {event ? 'Save changes' : isTask && form.participantIds.length ? 'Assign task' : 'Create'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
