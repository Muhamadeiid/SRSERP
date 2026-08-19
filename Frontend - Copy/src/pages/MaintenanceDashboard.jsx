import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Wrench, Zap, CalendarClock, HardHat, Cog, ArrowRight, Construction,
  Loader2, CheckCircle2, Clock, AlertTriangle, Plus, X, Trash2, Train,
  MessageSquare, ChevronDown, Send, History,
} from 'lucide-react'
import {
  getJobCardStats, getEquipmentStats, getMaintenanceTasks,
  getMaintenanceTaskOptions, createMaintenanceTask,
  deleteMaintenanceTask,
  getMaintenanceTaskActivities, addMaintenanceTaskActivity,
} from '../services/maintenanceService'
import UserAvatar from '../components/profile/UserAvatar'

const TABS = [
  {
    key: 'cm', title: 'CM — Corrective Maintenance',
    desc: 'Breakdown repairs, fault diagnosis, and corrective interventions.',
    icon: Zap, color: 'bg-red-100 text-red-600', accent: 'border-l-red-500',
    path: '/maintenance/cm',
  },
  {
    key: 'pm', title: 'PM — Preventive Maintenance',
    desc: 'Scheduled inspections, routine servicing, and compliance tracking.',
    icon: CalendarClock, color: 'bg-blue-100 text-blue-600', accent: 'border-l-blue-500',
    path: '/maintenance/pm',
  },
  {
    key: 'hm', title: 'HM — Heavy Maintenance',
    desc: 'Major overhauls, component rebuilds, and heavy repair programs.',
    icon: HardHat, color: 'bg-amber-100 text-amber-600', accent: 'border-l-amber-500',
    path: '/maintenance/hm',
  },
]

function StatMini({ label, value, color }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      <p className="text-[10px] text-neutral-400 mt-0.5">{label}</p>
    </div>
  )
}

const TASK_STATUS = {
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: 'In Progress', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  done: { label: 'Done', cls: 'bg-green-50 text-green-700 border-green-200' },
}

const TASK_PRIORITY = {
  low: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-orange-50 text-orange-700 border-orange-300',
  critical: 'bg-red-50 text-red-700 border-red-300',
}

const EMPTY_TASK = {
  title: '', description: '', viewer_user_ids: [],
  train_number: '', unit_number: '', car_code: '', priority: 'medium', due_date: '',
}

const todayValue = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const emptyUpdate = status => ({
  work_date: todayValue(),
  work_done: '',
  result: '',
  next_steps: '',
  completion_summary: '',
  status: status || 'in_progress',
})

const UNIT_CARS = {
  1: ['MC1', 'T', 'M1'],
  2: ['M2', 'T', 'M1'],
  3: ['M1', 'T', 'MC2'],
}

const unitCode = (trainNumber, unitNumber) =>
  trainNumber && unitNumber ? 1000 + Number(trainNumber) + ((Number(unitNumber) - 1) * 20) : ''

const trainPositionLabel = task => {
  if (!task.train_number) return ''
  const unit = task.unit_number ? ` / Unit ${task.unit_number} (${unitCode(task.train_number, task.unit_number)})` : ''
  const car = task.car_code ? ` / ${task.car_code}` : ''
  return `TS${String(task.train_number).padStart(2, '0')}${unit}${car}`
}

function PendingTasks({ user }) {
  const canCreate = ['admin', 'depot_manager'].includes(user?.role)
  const [tasks, setTasks] = useState([])
  const [options, setOptions] = useState({ managers: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_TASK)
  const [error, setError] = useState('')
  const [expandedTaskId, setExpandedTaskId] = useState(null)
  const [activities, setActivities] = useState({})
  const [activityDraft, setActivityDraft] = useState(() => emptyUpdate('in_progress'))
  const [activitySaving, setActivitySaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const taskResult = await getMaintenanceTasks()
      setTasks(taskResult.data ?? [])
      if (canCreate) {
        const optionResult = await getMaintenanceTaskOptions()
        setOptions(optionResult.data ?? { managers: [] })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [canCreate])

  useEffect(() => { load() }, [load])

  const toggleActivity = async task => {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null)
      return
    }
    setExpandedTaskId(task.id)
    setActivityDraft(emptyUpdate(task.status === 'done' ? 'done' : task.status || 'in_progress'))
    if (!activities[task.id]) {
      try {
        const result = await getMaintenanceTaskActivities(task.id)
        setActivities(current => ({ ...current, [task.id]: result.data ?? [] }))
      } catch (err) {
        setError(err.message)
      }
    }
  }

  const submitActivity = async (event, task) => {
    event.preventDefault()
    if (!activityDraft.work_done.trim() || !activityDraft.result.trim()) return
    if (activityDraft.status !== 'done' && !activityDraft.next_steps.trim()) return
    if (activityDraft.status === 'done' && !activityDraft.completion_summary.trim()) return
    setActivitySaving(true)
    setError('')
    try {
      const result = await addMaintenanceTaskActivity(task.id, {
        ...activityDraft,
        work_date: activityDraft.work_date || todayValue(),
      })
      setActivities(current => ({ ...current, [task.id]: result.activities ?? [] }))
      setTasks(current => current.map(item => item.id === task.id ? result.task : item))
      setActivityDraft(emptyUpdate(result.task?.status === 'done' ? 'done' : result.task?.status || 'in_progress'))
    } catch (err) {
      setError(err.message)
    } finally {
      setActivitySaving(false)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        train_number: form.train_number ? Number(form.train_number) : null,
        unit_number: form.unit_number ? Number(form.unit_number) : null,
        car_code: form.car_code || null,
        due_date: form.due_date || null,
      }
      const result = await createMaintenanceTask(payload)
      setTasks(current => [result.data, ...current])
      setForm(EMPTY_TASK)
      setShowForm(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return
    try {
      await deleteMaintenanceTask(task.id)
      setTasks(current => current.filter(item => item.id !== task.id))
    } catch (err) {
      setError(err.message)
    }
  }

  const active = tasks.filter(task => task.status !== 'done')
  const noViewers = form.viewer_user_ids.length === 0
  const toggleViewer = id => setForm(current => ({
    ...current,
    viewer_user_ids: current.viewer_user_ids.includes(id)
      ? current.viewer_user_ids.filter(viewerId => viewerId !== id)
      : [...current.viewer_user_ids, id],
  }))

  return (
    <section className="bg-white border border-neutral-200 shadow-sm">
      <header className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
        <div>
          <h2 className="text-sm font-bold text-secondary-700">Pending Tasks</h2>
          <p className="text-[11px] text-neutral-400">{active.length} active · {tasks.filter(t => t.status === 'done').length} completed</p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm(true)} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 bg-primary text-white text-xs font-bold rounded-md hover:bg-primary/90">
            <Plus className="w-4 h-4" /> Add Task
          </button>
        )}
      </header>

      {error && <div className="mx-5 mt-4 px-3 py-2 bg-red-50 border border-red-200 text-xs text-red-700">{error}</div>}

      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : tasks.length === 0 ? (
        <div className="py-10 text-center text-xs text-neutral-400">No maintenance tasks yet.</div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {tasks.map(task => {
            const overdue = task.status !== 'done' && task.due_date && new Date(`${task.due_date}T23:59:59`) < new Date()
            const taskStatus = task.status || 'pending'
            const status = TASK_STATUS[taskStatus] || TASK_STATUS.pending
            const taskActivities = activities[task.id] ?? []
            const isExpanded = expandedTaskId === task.id
            return (
              <div key={task.id}>
              <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_90px_130px_100px] gap-3 items-center px-5 py-3 ${task.priority === 'critical' ? 'bg-red-50/40' : task.priority === 'high' ? 'bg-orange-50/30' : ''}`}>
                <div className="min-w-0 flex items-start gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-secondary-700 break-words">{task.title}</p>
                      <span className={`text-[9px] uppercase font-extrabold px-2 py-0.5 border rounded ${TASK_PRIORITY[task.priority] || TASK_PRIORITY.medium}`}>{task.priority || 'medium'}</span>
                    </div>
                    {task.description && <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 break-words">{task.description}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-neutral-400">
                      {task.viewers?.length > 0 && <span>Visible: {task.viewers.map(viewer => viewer.name).join(', ')}</span>}
                      {task.train_number && <span className="inline-flex items-center gap-1"><Train className="w-3 h-3" />{trainPositionLabel(task)}</span>}
                    </div>
                  </div>
                </div>
                <span className={`justify-self-start text-[10px] font-bold px-2 py-1 border rounded ${status.cls}`}>{status.label}</span>
                <span className={`text-xs ${overdue ? 'font-bold text-red-600' : 'text-neutral-500'}`}>
                  {task.due_date ? `${overdue ? 'Overdue · ' : ''}${new Date(`${task.due_date}T00:00:00`).toLocaleDateString('en-GB')}` : 'No due date'}
                </span>
                <div className="flex items-center justify-end gap-1">
                  <button onClick={() => toggleActivity(task)} title="Task activity" className={`p-2 hover:bg-neutral-100 ${isExpanded ? 'text-primary' : 'text-neutral-500'}`}><MessageSquare className="w-4 h-4" /></button>
                  {canCreate && <button onClick={() => remove(task)} title="Delete task" className="p-2 text-neutral-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
              {isExpanded && (
                <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-4">
                  <div className="max-w-3xl ml-auto">
                    <div className="flex items-center gap-2 mb-3"><History className="w-4 h-4 text-neutral-400" /><h3 className="text-xs font-bold text-secondary-700">Task Updates</h3></div>
                    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                      {taskActivities.length === 0 ? <p className="text-xs text-neutral-400 py-3">No updates yet.</p> : taskActivities.map(activity => (
                        <div key={activity.id} className="flex gap-3 rounded-md border border-neutral-200 bg-white p-3">
                          <UserAvatar user={activity.user} name={activity.user?.name || 'System'} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] text-neutral-500">
                              <span className="font-bold text-secondary-700">{activity.user?.name || 'System'}</span>
                              {activity.type === 'status_change' && <> changed status from <b>{activity.from_status?.replace('_', ' ')}</b> to <b>{activity.to_status?.replace('_', ' ')}</b></>}
                            </p>
                            {activity.work_date && <p className="mt-0.5 text-[10px] font-bold text-primary">Work date: {new Date(`${String(activity.work_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB')}</p>}
                            {(activity.work_done || (activity.type === 'comment' && activity.body)) && (
                              <div className="mt-2"><p className="text-[9px] font-bold uppercase text-neutral-400">Work performed</p><p className="text-xs text-neutral-700 whitespace-pre-wrap break-words">{activity.work_done || activity.body}</p></div>
                            )}
                            {activity.result && <div className="mt-2"><p className="text-[9px] font-bold uppercase text-neutral-400">Result</p><p className="text-xs text-neutral-700 whitespace-pre-wrap break-words">{activity.result}</p></div>}
                            {activity.next_steps && <div className="mt-2"><p className="text-[9px] font-bold uppercase text-neutral-400">Next action</p><p className="text-xs text-neutral-700 whitespace-pre-wrap break-words">{activity.next_steps}</p></div>}
                            {activity.completion_summary && <div className="mt-2 rounded bg-green-50 p-2"><p className="text-[9px] font-bold uppercase text-green-700">Completion summary</p><p className="text-xs text-green-800 whitespace-pre-wrap break-words">{activity.completion_summary}</p></div>}
                            <p className="mt-1 text-[10px] text-neutral-300">{new Date(activity.created_at).toLocaleString('en-GB')}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={event => submitActivity(event, task)} className="mt-4 border-t border-neutral-200 pt-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="text-[10px] font-bold uppercase text-neutral-500">Work date
                          <input type="date" required value={activityDraft.work_date} onChange={event => setActivityDraft(current => ({ ...current, work_date: event.target.value }))} className="mt-1 h-9 w-full border border-neutral-200 bg-white rounded px-2 text-xs" />
                        </label>
                        <label className="text-[10px] font-bold uppercase text-neutral-500">Status after update
                        <select value={activityDraft.status} onChange={event => setActivityDraft(current => ({ ...current, status: event.target.value }))} className="mt-1 h-9 w-full border border-neutral-200 bg-white rounded px-2 text-xs">
                          <option value="pending">Still Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                        </label>
                      </div>
                      <label className="block text-[10px] font-bold uppercase text-neutral-500">Work performed
                        <textarea required value={activityDraft.work_done} onChange={event => setActivityDraft(current => ({ ...current, work_done: event.target.value }))} rows="2" placeholder="What was checked, repaired, replaced, or tested?" className="mt-1 w-full border border-neutral-200 bg-white rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary" />
                      </label>
                      <label className="block text-[10px] font-bold uppercase text-neutral-500">Result
                        <textarea required value={activityDraft.result} onChange={event => setActivityDraft(current => ({ ...current, result: event.target.value }))} rows="2" placeholder="What happened after the work was performed?" className="mt-1 w-full border border-neutral-200 bg-white rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary" />
                      </label>
                      {activityDraft.status === 'done' ? (
                        <label className="block text-[10px] font-bold uppercase text-green-700">Completion summary
                          <textarea required value={activityDraft.completion_summary} onChange={event => setActivityDraft(current => ({ ...current, completion_summary: event.target.value }))} rows="2" placeholder="Final condition, solution, and how the task was closed." className="mt-1 w-full border border-green-300 bg-green-50 rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-green-500" />
                        </label>
                      ) : (
                        <label className="block text-[10px] font-bold uppercase text-neutral-500">Next action / pending reason
                          <textarea required value={activityDraft.next_steps} onChange={event => setActivityDraft(current => ({ ...current, next_steps: event.target.value }))} rows="2" placeholder="What remains, who will do it, or why is the task still pending?" className="mt-1 w-full border border-neutral-200 bg-white rounded px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary" />
                        </label>
                      )}
                      <div className="flex justify-end">
                        <button disabled={activitySaving || !activityDraft.work_done.trim() || !activityDraft.result.trim() || (activityDraft.status === 'done' ? !activityDraft.completion_summary.trim() : !activityDraft.next_steps.trim())} className="h-9 inline-flex items-center gap-1.5 bg-primary text-white px-4 rounded text-xs font-bold disabled:opacity-50"><Send className="w-3.5 h-3.5" /> Save update</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onMouseDown={event => event.target === event.currentTarget && setShowForm(false)}>
          <form onSubmit={submit} className="w-full max-w-xl bg-white shadow-xl border border-neutral-200">
            <header className="flex items-center px-5 py-4 border-b">
              <h3 className="text-sm font-bold text-secondary-700">New Maintenance Task</h3>
              <button type="button" onClick={() => setShowForm(false)} className="ml-auto p-1 text-neutral-400"><X className="w-4 h-4" /></button>
            </header>
            <div className="p-5 grid grid-cols-2 gap-4">
              <label className="col-span-2 text-xs font-semibold text-neutral-600">Task title
                <input autoFocus required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal" />
              </label>
              <fieldset className="col-span-2">
                <legend className="text-xs font-semibold text-neutral-600">Visible to</legend>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto border border-neutral-200 rounded p-2">
                  <label className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 rounded cursor-pointer">
                    <input type="checkbox" checked={noViewers} onChange={() => setForm(current => ({ ...current, viewer_user_ids: [] }))} />
                    <span>None</span>
                    <span className="ml-auto text-[10px] font-normal text-neutral-400">Depot only</span>
                  </label>
                  {options.managers.map(manager => (
                    <label key={manager.id} className="flex items-center gap-2 px-2 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 rounded cursor-pointer">
                      <input type="checkbox" checked={form.viewer_user_ids.includes(manager.id)} onChange={() => toggleViewer(manager.id)} />
                      <span className="min-w-0 truncate">{manager.name}</span>
                      <span className="ml-auto text-[10px] text-neutral-400 uppercase">{manager.department}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="text-xs font-semibold text-neutral-600">Train Set
                <select value={form.train_number} onChange={e => setForm(f => ({ ...f, train_number: e.target.value, unit_number: '', car_code: '' }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white">
                  <option value="">General task</option>
                  {Array.from({ length: 20 }, (_, index) => index + 1).map(number => (
                    <option key={number} value={number}>TS{String(number).padStart(2, '0')}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Unit
                <select disabled={!form.train_number} value={form.unit_number} onChange={e => setForm(f => ({ ...f, unit_number: e.target.value, car_code: '' }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white disabled:bg-neutral-100">
                  <option value="">Whole train</option>
                  {[1, 2, 3].map(number => (
                    <option key={number} value={number}>Unit {number} — {unitCode(form.train_number, number)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Car
                <select disabled={!form.unit_number} value={form.car_code} onChange={e => setForm(f => ({ ...f, car_code: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white disabled:bg-neutral-100">
                  <option value="">Whole unit</option>
                  {(UNIT_CARS[form.unit_number] ?? []).map((car, index) => (
                    <option key={`${car}-${index}`} value={car}>{index + 1}. {car}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Due date
                <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal" />
              </label>
              <label className="text-xs font-semibold text-neutral-600">Priority
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                </select>
              </label>
              <label className="col-span-2 text-xs font-semibold text-neutral-600">Details
                <textarea rows="3" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1 w-full border border-neutral-200 rounded px-3 py-2 font-normal resize-none" />
              </label>
            </div>
            <footer className="flex justify-end gap-2 px-5 py-4 border-t bg-neutral-50">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-neutral-600">Cancel</button>
              <button disabled={saving} className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-md disabled:opacity-60">{saving ? 'Saving...' : 'Create Task'}</button>
            </footer>
          </form>
        </div>
      )}
    </section>
  )
}

export default function MaintenanceDashboard() {
  const navigate = useNavigate()
  const { user } = useSelector(state => state.auth)
  const isAdmin = user?.role === 'admin'
  const [loading, setLoading] = useState(true)
  const [tabStats, setTabStats] = useState({})
  const [eqStats, setEqStats] = useState({})

  const fetchStats = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [cm, pm, hm, eq] = await Promise.all([
        getJobCardStats({ maintenance_type: 'cm' }),
        getJobCardStats({ maintenance_type: 'pm' }),
        getJobCardStats({ maintenance_type: 'hm' }),
        getEquipmentStats(),
      ])
      setTabStats({ cm: cm.data, pm: pm.data, hm: hm.data })
      setEqStats(eq.data ?? {})
    } catch (_) {}
    setLoading(false)
  }, [isAdmin])

  useEffect(() => { fetchStats() }, [fetchStats])

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-primary" />
            Maintenance Module
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Corrective, preventive, and heavy maintenance workflows</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-bold rounded-full">
          <Construction className="w-3.5 h-3.5" />
          {user?.role === 'admin' ? 'Admin Preview' : 'Task Workspace'}
        </span>
      </div>

      {/* Equipment overview */}
      {isAdmin && <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <Cog className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-bold text-secondary-700">Fleet Overview</h2>
          <button onClick={() => navigate('/maintenance/equipment')} className="ml-auto text-xs font-bold text-primary hover:underline flex items-center gap-1">
            Equipment Register <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-neutral-50 rounded-xl p-4">
              <p className="text-[10px] text-neutral-400 uppercase tracking-wider">Total Equipment</p>
              <p className="text-2xl font-extrabold text-secondary-700 mt-1">{eqStats.total ?? 0}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-[10px] text-green-600 uppercase tracking-wider">Available</p>
              <p className="text-2xl font-extrabold text-green-700 mt-1">{eqStats.available ?? 0}</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <p className="text-[10px] text-amber-600 uppercase tracking-wider">Under Maintenance</p>
              <p className="text-2xl font-extrabold text-amber-700 mt-1">{eqStats.underMaint ?? 0}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-[10px] text-red-600 uppercase tracking-wider">Out of Service</p>
              <p className="text-2xl font-extrabold text-red-700 mt-1">{eqStats.oos ?? 0}</p>
            </div>
          </div>
        )}
      </div>}

      <PendingTasks user={user} />

      {/* 3 Maintenance tabs */}
      {isAdmin && <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {TABS.map(tab => {
          const s = tabStats[tab.key] ?? {}
          return (
            <div key={tab.key} className={`bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden border-l-4 ${tab.accent}`}>
              <div className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tab.color}`}>
                    <tab.icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-sm font-bold text-secondary-700">{tab.title}</h2>
                    <p className="text-[10px] text-neutral-400 mt-0.5 leading-relaxed">{tab.desc}</p>
                  </div>
                </div>

                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-neutral-300" /></div>
                ) : (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <StatMini label="Open" value={s.open ?? 0} color="text-amber-600" />
                    <StatMini label="In Progress" value={s.in_progress ?? 0} color="text-blue-600" />
                    <StatMini label="This Month" value={s.completed_this_month ?? 0} color="text-green-600" />
                  </div>
                )}

                {(s.critical ?? 0) > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span className="text-[11px] font-bold text-red-600">{s.critical} Critical</span>
                  </div>
                )}

                <button onClick={() => navigate(tab.path)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 bg-neutral-50 hover:bg-neutral-100 text-xs font-bold text-secondary-700 rounded-xl transition-colors">
                  Open {tab.key.toUpperCase()} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          )
        })}
      </div>}
    </div>
  )
}
