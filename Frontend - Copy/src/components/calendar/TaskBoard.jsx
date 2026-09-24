import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bell, Check, ClipboardCheck, ListChecks, Loader2, Plus, UserRound } from 'lucide-react'
import { getCalendarTasks, updateCalendarTaskProgress } from '../../services/calendarService'
import {
  STATUS_LABEL, TASK_MANAGER_ROLES, assignees, checklistProgress, dateKey, dueLabel, initials, isOverdue,
} from './calendarMeta'

const NEXT_STATUS = { todo: 'in_progress', in_progress: 'done', done: 'todo' }
const NEXT_STATUS_HINT = { todo: 'Start task', in_progress: 'Mark done', done: 'Reopen' }

/**
 * Month-independent task list.
 *   My tasks        — assigned to me, plus tasks I set for myself
 *   Assigned by me  — tasks I handed to my team (managers only)
 * The round check cycles To do → In progress → Done, so progress is one click
 * and the person who assigned the task is notified on start and completion.
 */
export default function TaskBoard({ currentUser, refreshKey, onOpen, onCreate, onChanged }) {
  const canAssign = TASK_MANAGER_ROLES.includes(currentUser?.role)
  const [scope, setScope] = useState('mine')
  const [filter, setFilter] = useState('open')
  const [tasks, setTasks] = useState({ mine: [], assigned: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mine, assigned] = await Promise.all([
        getCalendarTasks('mine'),
        canAssign ? getCalendarTasks('assigned') : Promise.resolve({ data: [] }),
      ])
      setTasks({ mine: mine.data || [], assigned: assigned.data || [] })
      setError('')
    } catch {
      setError('Tasks could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [canAssign])

  useEffect(() => { load() }, [load, refreshKey])

  const today = dateKey(new Date())
  const list = useMemo(() => tasks[scope] || [], [tasks, scope])
  const openCount = scope => (tasks[scope] || []).filter(task => !task.isDone).length
  const overdueCount = list.filter(task => isOverdue(task, today)).length
  const visible = useMemo(() => list.filter(task => {
    if (filter === 'open') return !task.isDone
    if (filter === 'today') return !task.isDone && task.date <= today
    return task.isDone
  }), [list, filter, today])

  const advance = async task => {
    const status = NEXT_STATUS[task.status] || 'in_progress'
    setBusyId(task.id)
    // Optimistic: the circle fills immediately, rolled back on failure.
    setTasks(current => ({
      ...current,
      [scope]: current[scope].map(item => item.id === task.id ? { ...item, status, isDone: status === 'done' } : item),
    }))
    try {
      await updateCalendarTaskProgress(task.id, { status })
      onChanged?.()
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The task could not be updated.')
      load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <aside className="cal-card cal-board" aria-label="Task board">
      <header className="cal-board-head">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="cal-kicker">Task board</p>
            <h2>{scope === 'mine' ? 'My tasks' : 'Assigned by me'}</h2>
            <p className="cal-board-summary">
              {openCount(scope)} open{overdueCount > 0 && <> · <b>{overdueCount} overdue</b></>}
            </p>
          </div>
          <button type="button" className="cal-btn cal-btn--primary" onClick={() => onCreate(scope === 'assigned')}>
            <Plus className="h-3.5 w-3.5" /> {scope === 'assigned' ? 'Assign' : 'Add'}
          </button>
        </div>
      </header>

      {canAssign && (
        <div className="cal-tabs" role="group" aria-label="Task scope">
          <button type="button" aria-pressed={scope === 'mine'} onClick={() => setScope('mine')}>My tasks <b>{openCount('mine')}</b></button>
          <button type="button" aria-pressed={scope === 'assigned'} onClick={() => setScope('assigned')}>Assigned by me <b>{openCount('assigned')}</b></button>
        </div>
      )}

      <div className="cal-board-filters" role="group" aria-label="Task filter">
        {[['open', 'Open'], ['today', 'Due now'], ['done', 'Done']].map(([key, label]) => (
          <button type="button" key={key} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      <div className="cal-board-list">
        {error && <p className="cal-error">{error}</p>}
        {loading && list.length === 0 ? (
          <div className="cal-board-empty"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : visible.length === 0 ? (
          <div className="cal-board-empty">
            <ClipboardCheck className="h-8 w-8" />
            {filter === 'done' ? 'No finished tasks in the last 14 days' : scope === 'assigned' ? 'Nothing assigned to your team' : 'You are all caught up'}
          </div>
        ) : visible.map(task => {
          const overdue = isOverdue(task, today)
          const progress = checklistProgress(task.checklist)
          const people = assignees(task)
          const status = task.status || (task.isDone ? 'done' : 'todo')
          const classes = ['cal-task', task.isDone && 'cal-task--done', overdue && 'cal-task--overdue'].filter(Boolean).join(' ')

          return (
            <article key={task.id} className={classes} data-priority={task.priority || 'normal'}>
              <button
                type="button"
                className="cal-task-check"
                data-status={status}
                disabled={busyId === task.id}
                onClick={() => advance(task)}
                title={NEXT_STATUS_HINT[status]}
                aria-label={`${NEXT_STATUS_HINT[status]}: ${task.title}`}
              >
                {status === 'done' && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </button>

              <button type="button" className="cal-task-body" onClick={() => onOpen(task)}>
                <span className="cal-task-top">
                  <span className="cal-task-title">{task.title}</span>
                  {task.priority && task.priority !== 'normal' && <span className="cal-prio">{task.priority}</span>}
                </span>

                <span className="cal-task-meta">
                  <span className={overdue ? 'cal-due--overdue' : task.date === today ? 'cal-due--today' : ''}>{dueLabel(task)}</span>
                  <span className="cal-status" data-status={status}>{STATUS_LABEL[status]}</span>
                  {task.reminderMinutes != null && !task.isDone && <span title="Reminder set"><Bell className="h-3 w-3" /></span>}
                  {scope === 'mine' && task.by && task.by.id !== currentUser?.id && (
                    <span><UserRound className="h-3 w-3" /> from {task.by.name.split(' ')[0]}</span>
                  )}
                  {scope === 'assigned' && people.length > 0 && (
                    <span className="cal-avatars" title={people.map(person => person.name).join(', ')}>
                      {people.slice(0, 4).map(person => <span key={person.id} className="cal-avatar">{initials(person.name)}</span>)}
                      {people.length > 4 && <span className="cal-avatar">+{people.length - 4}</span>}
                    </span>
                  )}
                </span>

                {progress.total > 0 && (
                  <span className="cal-progress">
                    <ListChecks className="h-3.5 w-3.5 text-neutral-400" />
                    <span className="cal-progress-track"><span style={{ width: `${progress.percent}%` }} /></span>
                    <small>{progress.done}/{progress.total}</small>
                  </span>
                )}
              </button>
            </article>
          )
        })}
      </div>
    </aside>
  )
}
