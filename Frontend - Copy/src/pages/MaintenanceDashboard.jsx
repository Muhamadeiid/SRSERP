import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Wrench, Zap, CalendarClock, HardHat, Cog, ArrowRight, Construction,
  Loader2, CheckCircle2, Clock, AlertTriangle, Plus, X, Trash2, Train,
} from 'lucide-react'
import {
  getJobCardStats, getEquipmentStats, getMaintenanceTasks,
  getMaintenanceTaskOptions, createMaintenanceTask,
  updateMaintenanceTask, deleteMaintenanceTask,
} from '../services/maintenanceService'

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
  low: 'bg-neutral-300',
  medium: 'bg-blue-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
}

const EMPTY_TASK = {
  title: '', description: '', target_department: 'cm', assigned_user_id: '',
  equipment_id: '', priority: 'medium', due_date: '',
}

function equipmentLabel(item) {
  if (!item) return ''
  if (item.type === 'train') return `TS${String(item.train_number ?? item.name).padStart(2, '0')}`
  const train = item.parent?.train_number ?? item.train_number
  const prefix = train ? `TS${String(train).padStart(2, '0')} / ` : ''
  return `${prefix}${item.code || item.name}${item.car_type ? ` (${item.car_type})` : ''}`
}

function PendingTasks({ user }) {
  const canCreate = ['admin', 'depot_manager'].includes(user?.role)
  const [tasks, setTasks] = useState([])
  const [options, setOptions] = useState({ managers: [], equipment: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_TASK)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const taskResult = await getMaintenanceTasks()
      setTasks(taskResult.data ?? [])
      if (canCreate) {
        const optionResult = await getMaintenanceTaskOptions()
        setOptions(optionResult.data ?? { managers: [], equipment: [] })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [canCreate])

  useEffect(() => { load() }, [load])

  const setStatus = async (task, status) => {
    try {
      const result = await updateMaintenanceTask(task.id, { status })
      setTasks(current => current.map(item => item.id === task.id ? result.data : item))
    } catch (err) {
      setError(err.message)
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        assigned_user_id: form.assigned_user_id || null,
        equipment_id: form.equipment_id || null,
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

  const visibleManagers = options.managers.filter(manager => manager.department === form.target_department)
  const active = tasks.filter(task => task.status !== 'done')

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
            const status = TASK_STATUS[task.status]
            return (
              <div key={task.id} className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_120px_150px_150px_100px] gap-3 items-center px-5 py-3">
                <div className="min-w-0 flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${TASK_PRIORITY[task.priority]}`} title={task.priority} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-secondary-700 break-words">{task.title}</p>
                    {task.description && <p className="mt-0.5 text-[11px] leading-4 text-neutral-500 break-words">{task.description}</p>}
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[10px] text-neutral-400">
                      <span>{task.target_department?.toUpperCase()}</span>
                      {task.assignee?.name && <span>{task.assignee.name}</span>}
                      {task.equipment && <span className="inline-flex items-center gap-1"><Train className="w-3 h-3" />{equipmentLabel(task.equipment)}</span>}
                    </div>
                  </div>
                </div>
                <span className={`justify-self-start text-[10px] font-bold px-2 py-1 border rounded ${status.cls}`}>{status.label}</span>
                <span className={`text-xs ${overdue ? 'font-bold text-red-600' : 'text-neutral-500'}`}>
                  {task.due_date ? `${overdue ? 'Overdue · ' : ''}${new Date(`${task.due_date}T00:00:00`).toLocaleDateString('en-GB')}` : 'No due date'}
                </span>
                <select value={task.status} onChange={event => setStatus(task, event.target.value)} className="h-8 border border-neutral-200 rounded px-2 text-xs bg-white">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
                {canCreate && (
                  <button onClick={() => remove(task)} title="Delete task" className="justify-self-end p-2 text-neutral-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
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
              <label className="text-xs font-semibold text-neutral-600">Visible to
                <select value={form.target_department} onChange={e => setForm(f => ({ ...f, target_department: e.target.value, assigned_user_id: '' }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white">
                  <option value="cm">CM Manager</option><option value="pm">PM Manager</option><option value="hm">HM Manager</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Assign manager
                <select value={form.assigned_user_id} onChange={e => setForm(f => ({ ...f, assigned_user_id: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white">
                  <option value="">Whole department</option>
                  {visibleManagers.map(manager => <option key={manager.id} value={manager.id}>{manager.name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-neutral-600">Train / car
                <select value={form.equipment_id} onChange={e => setForm(f => ({ ...f, equipment_id: e.target.value }))} className="mt-1 w-full h-10 border border-neutral-200 rounded px-3 font-normal bg-white">
                  <option value="">General task</option>
                  {options.equipment.map(item => <option key={item.id} value={item.id}>{equipmentLabel(item)}</option>)}
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
  const [loading, setLoading] = useState(true)
  const [tabStats, setTabStats] = useState({})
  const [eqStats, setEqStats] = useState({})

  const fetchStats = useCallback(async () => {
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
  }, [])

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
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5">
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
      </div>

      <PendingTasks user={user} />

      {/* 3 Maintenance tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
      </div>
    </div>
  )
}
