import { Check } from 'lucide-react'
import { dateKey, isOverdue, isRecurring } from './calendarMeta'

/**
 * Compact event chip for the month grid. Tasks get a checkbox glyph and a
 * priority dot so they read differently from meetings at a glance; overdue
 * tasks switch to the alert palette.
 */
export default function EventPill({ event, onClick }) {
  const isTask = event.type === 'task'
  const overdue = isOverdue(event, dateKey(new Date()))
  const time = event.time ? event.time.slice(0, 5) : ''
  const classes = ['cal-pill', isRecurring(event) && !overdue && 'cal-pill--routine', event.isDone && 'cal-pill--done', overdue && 'cal-pill--overdue'].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      data-type={event.type}
      data-priority={event.priority || 'normal'}
      onClick={clickEvent => { clickEvent.stopPropagation(); onClick?.(event) }}
      title={`${event.title}${time ? ` · ${time}` : ''}`}
      className={classes}
    >
      {isTask && <span className="cal-pill-check" aria-hidden="true">{event.isDone && <Check className="h-2 w-2" strokeWidth={4} />}</span>}
      {time && <time>{time}</time>}
      <span>{event.title}</span>
      {isTask && !event.isDone && ['high', 'urgent'].includes(event.priority) && <i className="cal-pill-flag" aria-label={`${event.priority} priority`} />}
    </button>
  )
}
