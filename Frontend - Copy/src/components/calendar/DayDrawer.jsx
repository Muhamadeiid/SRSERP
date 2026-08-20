import { CalendarDays, CheckCircle2, Clock3, Pencil, Plus, Repeat2, Trash2, Users, X } from 'lucide-react'

const TYPE_STYLES = {
  meeting: 'bg-[var(--cal-meeting-tint)] text-[var(--cal-meeting)]',
  task: 'bg-[var(--cal-task-tint)] text-[var(--cal-task)]',
  interview: 'bg-[var(--cal-interview-tint)] text-[var(--cal-interview)]',
  leave: 'bg-[var(--cal-leave-tint)] text-[var(--cal-leave)]',
}

const formatDay = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function DayDrawer({ date, events, selectedEventId, currentUser, onClose, onAdd, onEdit, onDelete, onToggleDone }) {
  if (!date) return null

  return (
    <div className="fixed inset-0 z-40 bg-black/25" onMouseDown={onClose}>
      <aside onMouseDown={event => event.stopPropagation()} className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary-50 text-primary"><CalendarDays className="h-5 w-5" /></div>
          <div><h2 className="text-base font-extrabold text-secondary-700">{formatDay(date)}</h2><p className="text-xs text-neutral-400">{events.length} event{events.length === 1 ? '' : 's'}</p></div>
          <button type="button" onClick={() => onAdd(date)} className="ml-auto grid h-8 w-8 place-items-center rounded-md bg-primary text-white" title="Add event"><Plus className="h-4 w-4" /></button>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-neutral-400 hover:bg-neutral-100" title="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {events.length === 0 && <div className="grid min-h-52 place-items-center text-center"><div><CalendarDays className="mx-auto mb-2 h-8 w-8 text-neutral-300" /><p className="text-sm font-bold text-neutral-500">Nothing planned for this day</p></div></div>}
          {events.map(event => {
            const canEdit = event.by?.id === currentUser?.id || currentUser?.role === 'admin'
            const canDelete = event.by?.id === currentUser?.id
            return (
              <article key={event.occurrenceKey || event.id} className={`rounded-lg border bg-white p-4 ${selectedEventId === event.id ? 'border-primary ring-2 ring-primary/10' : 'border-neutral-200'}`}>
                <div className="flex items-start gap-3">
                  <span className={`rounded-md px-2 py-1 text-[10px] font-extrabold uppercase ${TYPE_STYLES[event.type]}`}>{event.type}</span>
                  <div className="min-w-0 flex-1"><h3 className={`text-sm font-extrabold text-secondary-700 ${event.isDone ? 'line-through opacity-60' : ''}`}>{event.title}</h3>{event.by?.name && <p className="mt-0.5 text-xs text-neutral-400">Created by {event.by.name}</p>}</div>
                </div>

                <div className="mt-3 space-y-2 text-xs text-neutral-500">
                  {(event.time || event.isAllDay) && <p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5" />{event.isAllDay ? 'All day' : `${event.time} · ${event.dur || 0} minutes`}</p>}
                  {event.participants?.length > 0 && <p className="flex items-start gap-2"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{event.participants.map(user => user.name).join(', ')}</span></p>}
                  {event.recurrence?.type !== 'none' && <p className="flex items-center gap-2"><Repeat2 className="h-3.5 w-3.5" />Repeats {event.recurrence.type}{event.recurrence.until ? ` until ${event.recurrence.until}` : ''}</p>}
                  {event.note && <p className="rounded-md bg-neutral-50 p-2 leading-relaxed text-neutral-600">{event.note}</p>}
                </div>

                <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-neutral-100 pt-3">
                  {event.type === 'task' && <button type="button" onClick={() => onToggleDone(event)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 px-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />{event.isDone ? 'Reopen' : 'Mark done'}</button>}
                  {canEdit && <button type="button" onClick={() => onEdit(event)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 text-xs font-bold text-neutral-600"><Pencil className="h-3.5 w-3.5" />Edit</button>}
                  {canDelete && <button type="button" onClick={() => onDelete(event)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 px-2.5 text-xs font-bold text-red-600"><Trash2 className="h-3.5 w-3.5" />Delete</button>}
                </div>
              </article>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
