import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Loader2, Search, X } from 'lucide-react'
import { createCalendarEvent, getCalendarUsers, updateCalendarEvent } from '../../services/calendarService'

const TYPES = [
  { key: 'meeting', label: 'Meeting' },
  { key: 'task', label: 'Task', roles: ['admin', 'depot_manager', 'manager'] },
  { key: 'interview', label: 'Interview', roles: ['admin', 'hr'] },
  { key: 'leave', label: 'Leave' },
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const blankForm = (date, type = 'meeting') => ({
  type, title: '', notes: '', event_date: date || new Date().toISOString().slice(0, 10),
  event_time: '09:00', duration_min: 60, is_all_day: false, leave_end_date: '',
  participantIds: [], recurrence_type: 'none', recurrence_interval: 1,
  recurrence_weekdays: [], recurrence_until: '',
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
  }
}

export default function EventModal({ open, event, initialDate, initialType, currentUser, onClose, onSaved }) {
  const [form, setForm] = useState(() => eventForm(event, initialDate, initialType))
  const [users, setUsers] = useState([])
  const [taskAssignable, setTaskAssignable] = useState([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setForm(eventForm(event, initialDate, initialType))
    setError('')
    getCalendarUsers().then(response => {
      setUsers(response.data || [])
      setTaskAssignable(response.meta?.taskAssignableUserIds || [])
    }).catch(() => setError('Users could not be loaded.'))
  }, [open, event, initialDate, initialType])

  const allowedTypes = TYPES.filter(type => !type.roles || type.roles.includes(currentUser?.role))
  const availableUsers = useMemo(() => users.filter(user => {
    if (user.id === currentUser?.id) return false
    if (form.type === 'task' && !taskAssignable.includes(user.id)) return false
    return `${user.name} ${user.department || ''} ${user.role || ''}`.toLowerCase().includes(search.toLowerCase())
  }), [users, currentUser?.id, form.type, taskAssignable, search])

  if (!open) return null

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const toggleParticipant = id => set('participantIds', form.participantIds.includes(id) ? form.participantIds.filter(item => item !== id) : [...form.participantIds, id])
  const toggleWeekday = day => set('recurrence_weekdays', form.recurrence_weekdays.includes(day) ? form.recurrence_weekdays.filter(item => item !== day) : [...form.recurrence_weekdays, day])

  const submit = async submitEvent => {
    submitEvent.preventDefault()
    setSaving(true)
    setError('')
    try {
      const participantRole = form.type === 'task' ? 'assignee' : form.type === 'interview' ? 'interviewer' : 'attendee'
      const payload = {
        type: form.type,
        title: form.title.trim(),
        notes: form.notes.trim() || null,
        event_date: form.event_date,
        event_time: form.type === 'leave' || form.is_all_day ? null : form.event_time,
        duration_min: form.type === 'leave' || form.is_all_day ? null : Number(form.duration_min),
        is_all_day: form.type === 'leave' ? true : form.is_all_day,
        leave_end_date: form.type === 'leave' ? (form.leave_end_date || form.event_date) : null,
        participants: form.type === 'leave' ? [] : form.participantIds.map(userId => ({ user_id: userId, role: participantRole })),
        recurrence_type: form.recurrence_type,
        recurrence_interval: Number(form.recurrence_interval),
        recurrence_weekdays: form.recurrence_type === 'weekly' ? form.recurrence_weekdays : null,
        recurrence_until: form.recurrence_type === 'none' ? null : (form.recurrence_until || null),
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onMouseDown={onClose}>
      <form onSubmit={submit} onMouseDown={event => event.stopPropagation()} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-white px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary-50 text-primary"><CalendarDays className="h-5 w-5" /></div>
          <div><h2 className="text-base font-extrabold text-secondary-700">{event ? 'Edit event' : 'New calendar event'}</h2><p className="text-xs text-neutral-400">{form.event_date}</p></div>
          <button type="button" onClick={onClose} className="ml-auto grid h-8 w-8 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100" title="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {allowedTypes.map(type => <button key={type.key} type="button" onClick={() => set('type', type.key)} className={`h-9 rounded-md border text-xs font-bold ${form.type === type.key ? 'border-primary bg-primary-50 text-primary' : 'border-neutral-200 text-neutral-500'}`}>{type.label}</button>)}
          </div>
          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600">{error}</div>}

          <label className="block"><span className="mb-1 block text-xs font-bold text-neutral-500">Title</span><input required maxLength={255} value={form.title} onChange={e => set('title', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm outline-none focus:border-primary" /></label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs font-bold text-neutral-500">Date</span><input required type="date" value={form.event_date} onChange={e => set('event_date', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm" /></label>
            {form.type === 'leave' ? <label><span className="mb-1 block text-xs font-bold text-neutral-500">Leave ends</span><input type="date" min={form.event_date} value={form.leave_end_date} onChange={e => set('leave_end_date', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm" /></label> : <label><span className="mb-1 block text-xs font-bold text-neutral-500">Time</span><input type="time" disabled={form.is_all_day} value={form.event_time} onChange={e => set('event_time', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm disabled:bg-neutral-50" /></label>}
          </div>

          {form.type !== 'leave' && <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-bold text-neutral-500">Duration (minutes)</span><input type="number" min="1" max="1440" disabled={form.is_all_day} value={form.duration_min} onChange={e => set('duration_min', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm disabled:bg-neutral-50" /></label><label className="flex items-end"><span className="flex h-10 w-full items-center gap-2 rounded-md border border-neutral-200 px-3 text-sm"><input type="checkbox" checked={form.is_all_day} onChange={e => set('is_all_day', e.target.checked)} /> All-day event</span></label></div>}

          {form.type !== 'leave' && <section className="rounded-md border border-neutral-200 p-3"><div className="mb-2 flex items-center gap-2"><Search className="h-4 w-4 text-neutral-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder={form.type === 'task' ? 'Search eligible assignee...' : 'Search participants...'} className="h-8 flex-1 text-sm outline-none" /></div><div className="grid max-h-36 gap-1 overflow-y-auto sm:grid-cols-2">{availableUsers.map(user => <button type="button" key={user.id} onClick={() => toggleParticipant(user.id)} className={`flex items-center gap-2 rounded-md px-2 py-2 text-left text-xs ${form.participantIds.includes(user.id) ? 'bg-primary-50 text-primary' : 'hover:bg-neutral-50 text-secondary-700'}`}><span className={`grid h-5 w-5 place-items-center rounded border ${form.participantIds.includes(user.id) ? 'border-primary bg-primary text-white' : 'border-neutral-200'}`}>{form.participantIds.includes(user.id) && <Check className="h-3 w-3" />}</span><span className="truncate font-semibold">{user.name}</span><span className="ml-auto shrink-0 text-[9px] text-neutral-400">{user.department}</span></button>)}</div></section>}

          <section className="rounded-md border border-neutral-200 p-3"><div className="grid gap-3 sm:grid-cols-3"><label><span className="mb-1 block text-xs font-bold text-neutral-500">Repeat</span><select value={form.recurrence_type} onChange={e => set('recurrence_type', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>{form.recurrence_type !== 'none' && <><label><span className="mb-1 block text-xs font-bold text-neutral-500">Every</span><input type="number" min="1" max="52" value={form.recurrence_interval} onChange={e => set('recurrence_interval', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm" /></label><label><span className="mb-1 block text-xs font-bold text-neutral-500">Repeat until</span><input type="date" min={form.event_date} value={form.recurrence_until} onChange={e => set('recurrence_until', e.target.value)} className="h-10 w-full rounded-md border border-neutral-200 px-3 text-sm" /></label></>}</div>{form.recurrence_type === 'weekly' && <div className="mt-3 flex flex-wrap gap-1">{WEEKDAYS.map((day, index) => <button type="button" key={day} onClick={() => toggleWeekday(index)} className={`h-8 min-w-10 rounded-md border px-2 text-xs font-bold ${form.recurrence_weekdays.includes(index) ? 'border-primary bg-primary text-white' : 'border-neutral-200 text-neutral-500'}`}>{day}</button>)}</div>}</section>

          <label className="block"><span className="mb-1 block text-xs font-bold text-neutral-500">Notes</span><textarea rows="3" maxLength={10000} value={form.notes} onChange={e => set('notes', e.target.value)} className="w-full resize-y rounded-md border border-neutral-200 p-3 text-sm outline-none focus:border-primary" /></label>
        </div>

        <footer className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-3"><button type="button" onClick={onClose} className="h-9 rounded-md border border-neutral-200 px-4 text-sm font-bold text-neutral-500">Cancel</button><button disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{event ? 'Save changes' : 'Create event'}</button></footer>
      </form>
    </div>
  )
}
