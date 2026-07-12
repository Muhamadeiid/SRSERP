import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Search, Loader2, RefreshCw, ChevronDown, X, CheckCircle2,
  Clock, AlertTriangle, Wrench, Filter, BarChart3, Edit3, Trash2, Save,
  Zap, CalendarClock, HardHat,
} from 'lucide-react'
import {
  getJobCards, createJobCard, updateJobCard, deleteJobCard, getJobCardStats,
  getEquipment,
} from '../services/maintenanceService'
import { getEmployees } from '../services/employeeService'

const STATUS_STYLE = {
  open:        'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  completed:   'bg-green-50 text-green-700 border-green-200',
  closed:      'bg-neutral-100 text-neutral-500 border-neutral-200',
}
const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', completed: 'Completed', closed: 'Closed' }

const PRIORITY_STYLE = {
  low:      'bg-neutral-100 text-neutral-600',
  medium:   'bg-blue-50 text-blue-600',
  high:     'bg-orange-50 text-orange-600',
  critical: 'bg-red-50 text-red-600',
}

const INP = 'w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors'

function StatTile({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-neutral-50 rounded-xl p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-extrabold text-secondary-700 mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function EmployeeSelect({ value, onChange, department }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const params = { search: q, per_page: 10, category: 'Blue Collar' }
        if (department) params.department = department
        const res = await getEmployees(params)
        setResults(res.data ?? [])
        setOpen(true)
      } catch (_) {}
    }, 300)
    return () => clearTimeout(t)
  }, [q, department])

  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); onChange(null, '') }}
        onFocus={() => q.length >= 2 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search technician…" className={INP} />
      {open && results.length > 0 && (
        <div className="absolute z-[90] w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-2xl max-h-48 overflow-y-auto">
          {results.map(emp => (
            <button key={emp.id} type="button"
              onClick={() => { onChange(emp.id, emp.name); setQ(emp.name); setOpen(false) }}
              className="w-full text-left px-3 py-2 hover:bg-primary/5 text-sm border-b border-neutral-50 last:border-0">
              <span className="font-semibold text-secondary-700">{emp.name}</span>
              <span className="text-neutral-400 ml-2 text-xs">{emp.position}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EquipmentSelect({ value, onChange, equipmentList }) {
  const trains = equipmentList.filter(e => e.type === 'train').sort((a, b) => a.train_number - b.train_number)
  const units  = equipmentList.filter(e => e.type === 'unit')
  const cars   = equipmentList.filter(e => e.type === 'car')

  const selected = value ? equipmentList.find(e => e.id === Number(value)) : null
  const [trainId, setTrainId] = useState(selected?.parent_id ? (() => {
    if (selected?.type === 'car') {
      const unit = units.find(u => u.id === selected.parent_id)
      return unit?.parent_id ?? ''
    }
    if (selected?.type === 'unit') return selected.parent_id
    return selected?.id ?? ''
  })() : '')
  const [unitId, setUnitId]   = useState(selected?.type === 'car' ? selected.parent_id : (selected?.type === 'unit' ? selected.id : ''))

  const filteredUnits = trainId ? units.filter(u => u.parent_id === Number(trainId)).sort((a, b) => a.unit_index - b.unit_index) : []
  const filteredCars  = unitId  ? cars.filter(c => c.parent_id === Number(unitId)).sort((a, b) => a.code.localeCompare(b.code))  : []

  const handleTrainChange = (id) => {
    setTrainId(id)
    setUnitId('')
    onChange('')
  }
  const handleUnitChange = (id) => {
    setUnitId(id)
    onChange('')
  }

  return (
    <div className="space-y-2">
      <select value={trainId} onChange={e => handleTrainChange(e.target.value)} className={INP}>
        <option value="">Select train…</option>
        {trains.map(t => (
          <option key={t.id} value={t.id}>TS{String(t.train_number).padStart(2, '0')}</option>
        ))}
      </select>
      {trainId && (
        <select value={unitId} onChange={e => handleUnitChange(e.target.value)} className={INP}>
          <option value="">Select unit…</option>
          {filteredUnits.map(u => (
            <option key={u.id} value={u.id}>Unit {u.unit_index}</option>
          ))}
        </select>
      )}
      {unitId && (
        <select value={value || ''} onChange={e => onChange(e.target.value)} className={INP}>
          <option value="">Select car…</option>
          {filteredCars.map(c => (
            <option key={c.id} value={c.id}>{c.car_type}</option>
          ))}
        </select>
      )}
    </div>
  )
}

const EMPTY_FORM = {
  title: '', description: '', equipment_id: '', priority: 'medium',
  assigned_to: null, assigned_to_name: '', scheduled_date: '', frequency: '',
  work_performed: '', parts_used: '', root_cause: '', notes: '',
}

const TYPE_ICON = { cm: Zap, pm: CalendarClock, hm: HardHat }

export default function MaintenanceTab({ type, label, departments }) {
  const TabIcon = TYPE_ICON[type] || Wrench
  const [cards, setCards] = useState([])
  const [stats, setStats] = useState({})
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [cardsRes, statsRes, eqRes] = await Promise.all([
        getJobCards({ maintenance_type: type, per_page: 200 }),
        getJobCardStats({ maintenance_type: type }),
        getEquipment({}),
      ])
      setCards(cardsRes.data ?? [])
      setStats(statsRes.data ?? {})
      setEquipment(eqRes.data ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [type])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = cards.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (c.card_no?.toLowerCase().includes(s) ||
        c.title?.toLowerCase().includes(s) ||
        c.assigned_to_name?.toLowerCase().includes(s) ||
        c.equipment?.code?.toLowerCase().includes(s) ||
        c.equipment?.name?.toLowerCase().includes(s))
    }
    return true
  })

  const openForm = (card = null) => {
    if (card) {
      setForm({
        title: card.title || '',
        description: card.description || '',
        equipment_id: card.equipment_id || '',
        priority: card.priority || 'medium',
        assigned_to: card.assigned_to || null,
        assigned_to_name: card.assigned_to_name || '',
        scheduled_date: card.scheduled_date?.slice(0, 10) || '',
        frequency: card.frequency || '',
        work_performed: card.work_performed || '',
        parts_used: card.parts_used || '',
        root_cause: card.root_cause || '',
        notes: card.notes || '',
      })
      setEditingId(card.id)
    } else {
      setForm(EMPTY_FORM)
      setEditingId(null)
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.title || !form.equipment_id) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await updateJobCard(editingId, form)
      } else {
        await createJobCard({ ...form, maintenance_type: type })
      }
      setShowForm(false)
      setEditingId(null)
      await fetchAll()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusChange = async (card, newStatus) => {
    try {
      await updateJobCard(card.id, { status: newStatus })
      await fetchAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this job card?')) return
    try {
      await deleteJobCard(id)
      await fetchAll()
    } catch (e) {
      setError(e.message)
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <TabIcon className="w-5 h-5 text-primary" />
            {label}
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Job cards and equipment tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="w-9 h-9 border border-neutral-200 rounded-xl flex items-center justify-center hover:bg-neutral-50 text-neutral-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => openForm()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all">
            <Plus className="w-3.5 h-3.5" /> New Job Card
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Open" value={stats.open ?? 0} icon={Clock} color="bg-amber-100 text-amber-600" />
        <StatTile label="In Progress" value={stats.in_progress ?? 0} icon={Wrench} color="bg-blue-100 text-blue-600" />
        <StatTile label="Completed (Month)" value={stats.completed_this_month ?? 0} icon={CheckCircle2} color="bg-green-100 text-green-600" />
        <StatTile label="Avg Downtime" value={`${stats.avg_downtime_hours ?? 0}h`} icon={BarChart3} color="bg-purple-100 text-purple-600" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search job cards…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            {['', 'open', 'in_progress', 'completed', 'closed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                  statusFilter === s
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                }`}>
                {s ? STATUS_LABEL[s] : 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <Wrench className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No job cards found</p>
            <p className="text-xs mt-1">Create your first job card to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50 text-neutral-400 text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">Card No</th>
                  <th className="px-4 py-3 text-left font-semibold">Title</th>
                  <th className="px-4 py-3 text-left font-semibold">Equipment</th>
                  <th className="px-4 py-3 text-left font-semibold">Assigned To</th>
                  <th className="px-4 py-3 text-center font-semibold">Priority</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Date</th>
                  <th className="px-4 py-3 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(card => (
                  <tr key={card.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{card.card_no}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setExpandedId(expandedId === card.id ? null : card.id)}
                        className="text-left text-secondary-700 font-medium hover:text-primary transition-colors">
                        {card.title}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      <span className="font-mono text-xs">{card.equipment?.code}</span>
                      {card.equipment?.name && <span className="text-neutral-400 ml-1 text-xs">({card.equipment.name})</span>}
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{card.assigned_to_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_STYLE[card.priority] || ''}`}>
                        {card.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select value={card.status} onChange={e => handleStatusChange(card, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer outline-none ${STATUS_STYLE[card.status] || ''}`}>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-neutral-400">
                      {card.reported_date ? new Date(card.reported_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openForm(card)} className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-primary">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(card.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expandedId && (() => {
        const card = cards.find(c => c.id === expandedId)
        if (!card) return null
        return (
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-secondary-700">{card.card_no} — {card.title}</h3>
              <button onClick={() => setExpandedId(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div><span className="text-neutral-400 block mb-0.5">Equipment</span><span className="font-semibold text-secondary-700">{card.equipment?.code} — {card.equipment?.name}</span></div>
              <div><span className="text-neutral-400 block mb-0.5">Assigned To</span><span className="font-semibold text-secondary-700">{card.assigned_to_name || '—'}</span></div>
              <div><span className="text-neutral-400 block mb-0.5">Priority</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_STYLE[card.priority]}`}>{card.priority}</span></div>
              <div><span className="text-neutral-400 block mb-0.5">Reported</span><span className="font-semibold">{card.reported_date || '—'}</span></div>
              <div><span className="text-neutral-400 block mb-0.5">Started</span><span className="font-semibold">{card.started_at?.slice(0, 10) || '—'}</span></div>
              <div><span className="text-neutral-400 block mb-0.5">Completed</span><span className="font-semibold">{card.completed_at?.slice(0, 10) || '—'}</span></div>
              {card.downtime_hours && <div><span className="text-neutral-400 block mb-0.5">Downtime</span><span className="font-semibold">{card.downtime_hours}h</span></div>}
              {card.scheduled_date && <div><span className="text-neutral-400 block mb-0.5">Scheduled</span><span className="font-semibold">{card.scheduled_date}</span></div>}
              {card.frequency && <div><span className="text-neutral-400 block mb-0.5">Frequency</span><span className="font-semibold">{card.frequency}</span></div>}
            </div>
            {card.description && <div><p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Description</p><p className="text-xs text-secondary-700">{card.description}</p></div>}
            {card.work_performed && <div><p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Work Performed</p><p className="text-xs text-secondary-700">{card.work_performed}</p></div>}
            {card.parts_used && <div><p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Parts Used</p><p className="text-xs text-secondary-700">{card.parts_used}</p></div>}
            {card.root_cause && <div><p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Root Cause</p><p className="text-xs text-secondary-700">{card.root_cause}</p></div>}
          </div>
        )
      })()}

      {/* Create / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 mb-10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-secondary-700">{editingId ? 'Edit Job Card' : 'New Job Card'}</h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Title *</label>
                <input value={form.title} onChange={e => set('title', e.target.value)} className={INP} placeholder="Brief description of the work" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Train *</label>
                <EquipmentSelect value={form.equipment_id} onChange={v => set('equipment_id', v)} equipmentList={equipment} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Priority</label>
                <select value={form.priority} onChange={e => set('priority', e.target.value)} className={INP}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Assign Technician</label>
                <EmployeeSelect value={form.assigned_to} department={departments?.[0]}
                  onChange={(id, name) => { set('assigned_to', id); set('assigned_to_name', name) }} />
              </div>
              {type === 'pm' && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Scheduled Date</label>
                    <input type="date" value={form.scheduled_date} onChange={e => set('scheduled_date', e.target.value)} className={INP} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Frequency</label>
                    <select value={form.frequency} onChange={e => set('frequency', e.target.value)} className={INP}>
                      <option value="">—</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="semi_annual">Semi-Annual</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={INP} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Work Performed</label>
                <textarea value={form.work_performed} onChange={e => set('work_performed', e.target.value)} rows={2} className={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Parts Used</label>
                <textarea value={form.parts_used} onChange={e => set('parts_used', e.target.value)} rows={2} className={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">{type === 'cm' ? 'Root Cause' : 'Notes'}</label>
                <textarea value={type === 'cm' ? form.root_cause : form.notes} onChange={e => set(type === 'cm' ? 'root_cause' : 'notes', e.target.value)} rows={2} className={INP} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.title || !form.equipment_id}
                className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
