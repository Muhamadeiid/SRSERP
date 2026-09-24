import { BriefcaseBusiness, CalendarCheck2, ClipboardCheck, UsersRound } from 'lucide-react'

/** Event types, in the order they appear in filters and the create menu. */
export const EVENT_TYPES = [
  { key: 'meeting', label: 'Meeting', plural: 'Meetings', icon: CalendarCheck2 },
  { key: 'task', label: 'Task', plural: 'Tasks', icon: ClipboardCheck },
  { key: 'interview', label: 'Interview', plural: 'Interviews', icon: UsersRound, roles: ['admin', 'hr'] },
  { key: 'leave', label: 'Leave', plural: 'Leave', icon: BriefcaseBusiness },
]

export const TYPE_BY_KEY = Object.fromEntries(EVENT_TYPES.map(type => [type.key, type]))

export const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' },
]

export const TASK_STATUSES = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

export const STATUS_LABEL = Object.fromEntries(TASK_STATUSES.map(status => [status.key, status.label]))

/** Must match the backend whitelist in CalendarEventController::validatedPayload. */
export const REMINDER_OPTIONS = [
  { value: '', label: 'No reminder' },
  { value: 0, label: 'At start time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
]

export const TASK_MANAGER_ROLES = ['admin', 'depot_manager', 'manager']

export const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const parseKey = key => {
  const [year, month, day] = String(key).slice(0, 10).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

/** Local Date for an event's start (all-day events start at 00:00). */
export const eventStart = event => {
  const start = parseKey(event.date)
  if (event.time) {
    const [hours, minutes] = event.time.split(':').map(Number)
    start.setHours(hours || 0, minutes || 0, 0, 0)
  }
  return start
}

/** Repeating events (daily stand-ups, weekly reports) are background rhythm, not news. */
export const isRecurring = event => !!event.recurrence?.type && event.recurrence.type !== 'none'

export const isOverdue = (event, todayKey) =>
  event.type === 'task' && !event.isDone && event.date < todayKey

export const initials = name => String(name || '?')
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map(part => part[0].toUpperCase())
  .join('')

/** "Today 14:00", "Tomorrow", "Overdue · 3d", "Thu 25 Sep". */
export function dueLabel(event, now = new Date()) {
  const todayKey = dateKey(now)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  const time = event.time ? ` ${event.time.slice(0, 5)}` : ''

  if (isOverdue(event, todayKey)) {
    const days = Math.round((parseKey(todayKey) - parseKey(event.date)) / 86400000)
    return `Overdue · ${days}d`
  }
  if (event.date === todayKey) return `Today${time}`
  if (event.date === dateKey(tomorrow)) return `Tomorrow${time}`
  return parseKey(event.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + time
}

/** "in 25 min", "in 2 h", "now". Null once the event has started. */
export function countdown(start, now = new Date()) {
  const minutes = Math.round((start - now) / 60000)
  if (minutes < 0) return null
  if (minutes === 0) return 'now'
  if (minutes < 60) return `in ${minutes} min`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`
}

export const checklistProgress = checklist => {
  const items = Array.isArray(checklist) ? checklist : []
  const done = items.filter(item => item.done).length
  return { done, total: items.length, percent: items.length ? Math.round((done / items.length) * 100) : 0 }
}

export const assignees = event =>
  (event.participants || []).filter(user => user.role === 'assignee')
