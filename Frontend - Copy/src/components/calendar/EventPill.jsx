import { AlertTriangle, Check } from 'lucide-react'

const TYPE_STYLES = {
  meeting: 'border-[var(--cal-meeting)] bg-[var(--cal-meeting-tint)] text-[var(--cal-meeting)]',
  task: 'border-[var(--cal-task)] bg-[var(--cal-task-tint)] text-[var(--cal-task)]',
  interview: 'border-[var(--cal-interview)] bg-[var(--cal-interview-tint)] text-[var(--cal-interview)]',
  leave: 'border-[var(--cal-leave)] bg-[var(--cal-leave-tint)] text-[var(--cal-leave)]',
}

export default function EventPill({ event, onClick }) {
  const overdue = event.type === 'task' && !event.isDone && event.date < new Date().toISOString().slice(0, 10)
  const time = event.time ? event.time.slice(0, 5) : ''

  return (
    <button
      type="button"
      onClick={clickEvent => { clickEvent.stopPropagation(); onClick?.(event) }}
      title={`${event.title}${time ? ` - ${time}` : ''}`}
      className={`flex h-6 w-full items-center gap-1 overflow-hidden rounded-[4px] border-l-[3px] px-1.5 text-left text-[10px] font-semibold ${TYPE_STYLES[event.type] || TYPE_STYLES.meeting} ${overdue ? '!border-[var(--cal-overdue)] ring-1 ring-red-200' : ''}`}
    >
      {overdue && <AlertTriangle className="h-3 w-3 shrink-0 text-[var(--cal-overdue)]" />}
      {event.type === 'task' && event.isDone && <Check className="h-3 w-3 shrink-0" />}
      {time && <span className="shrink-0 font-bold">{time}</span>}
      <span className={`truncate ${event.isDone ? 'line-through opacity-60' : ''}`}>{event.title}</span>
    </button>
  )
}
