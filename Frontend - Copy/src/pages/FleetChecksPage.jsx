import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Search, Loader2, RefreshCw, X, CheckCircle2, XCircle,
  ClipboardCheck, Filter, Edit3, Trash2, Save, ChevronDown, ChevronUp,
  Minus,
} from 'lucide-react'
import {
  getFleetChecks, createFleetCheck, updateFleetCheck, deleteFleetCheck,
  getFleetCheckStats, getEquipment,
} from '../services/maintenanceService'
import { getEmployees } from '../services/employeeService'

const STATUS_STYLE = {
  scheduled:   'bg-neutral-100 text-neutral-600 border-neutral-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  passed:      'bg-green-50 text-green-700 border-green-200',
  failed:      'bg-red-50 text-red-700 border-red-200',
  partial:     'bg-amber-50 text-amber-700 border-amber-200',
}
const STATUS_LABEL = { scheduled: 'Scheduled', in_progress: 'In Progress', passed: 'Passed', failed: 'Failed', partial: 'Partial' }
const CHECK_TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'annual']

const INP = 'w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors'

function TrainSelect({ value, onChange, equipmentList }) {
  const trains = equipmentList.filter(e => e.type === 'train').sort((a, b) => a.train_number - b.train_number)
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} className={INP}>
      <option value="">Select train…</option>
      {trains.map(t => (
        <option key={t.id} value={t.id}>TS{String(t.train_number).padStart(2, '0')}</option>
      ))}
    </select>
  )
}

function InspectorSelect({ value, onChange }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      try {
        const res = await getEmployees({ search: q, per_page: 10, category: 'Blue Collar' })
        setResults(res.data ?? [])
        setOpen(true)
      } catch (_) {}
    }, 300)
    return () => clearTimeout(t)
  }, [q])

  return (
    <div className="relative">
      <input value={q} onChange={e => { setQ(e.target.value); onChange(null, '') }}
        onFocus={() => q.length >= 2 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        placeholder="Search inspector…" className={INP} />
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

const EMPTY_FORM = {
  equipment_id: '', check_type: 'daily', check_date: new Date().toISOString().slice(0, 10),
  inspector_id: null, inspector_name: '', status: 'scheduled', notes: '',
  items: [],
}

const DEFAULT_ITEMS = [
  'Exterior body condition', 'Interior cleanliness', 'Door operation',
  'Braking system', 'Lighting (interior/exterior)', 'HVAC system',
  'Pantograph condition', 'Bogie inspection', 'Couplers & connectors',
  'Safety equipment (fire extinguisher, emergency hammer)',
]

export default function FleetChecksPage() {
  const [checks, setChecks] = useState([])
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
      const [checksRes, statsRes, eqRes] = await Promise.all([
        getFleetChecks({ per_page: 200 }),
        getFleetCheckStats(),
        getEquipment({}),
      ])
      setChecks(checksRes.data ?? [])
      setStats(statsRes ?? {})
      setEquipment(eqRes.data ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = checks.filter(c => {
    if (statusFilter && c.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (c.check_no?.toLowerCase().includes(s) ||
        c.inspector_name?.toLowerCase().includes(s) ||
        c.equipment?.code?.toLowerCase().includes(s) ||
        c.equipment?.name?.toLowerCase().includes(s))
    }
    return true
  })

  const openForm = (check = null) => {
    if (check) {
      setForm({
        equipment_id: check.equipment_id || '',
        check_type: check.check_type || 'daily',
        check_date: check.check_date?.slice(0, 10) || '',
        inspector_id: check.inspector_id || null,
        inspector_name: check.inspector_name || '',
        status: check.status || 'scheduled',
        notes: check.notes || '',
        items: check.items?.map(i => ({ item_name: i.item_name, result: i.result, remarks: i.remarks || '' })) || [],
      })
      setEditingId(check.id)
    } else {
      setForm({
        ...EMPTY_FORM,
        items: DEFAULT_ITEMS.map(name => ({ item_name: name, result: 'na', remarks: '' })),
      })
      setEditingId(null)
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.equipment_id || !form.check_date) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await updateFleetCheck(editingId, form)
      } else {
        await createFleetCheck(form)
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

  const handleStatusChange = async (check, newStatus) => {
    try {
      await updateFleetCheck(check.id, { status: newStatus })
      await fetchAll()
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this fleet check?')) return
    try { await deleteFleetCheck(id); await fetchAll() } catch (e) { setError(e.message) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setItem = (idx, k, v) => setForm(f => {
    const items = [...f.items]
    items[idx] = { ...items[idx], [k]: v }
    return { ...f, items }
  })
  const addItem = () => setForm(f => ({ ...f, items: [...f.items, { item_name: '', result: 'na', remarks: '' }] }))
  const removeItem = (idx) => setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))

  const trainLabel = (eq) => eq ? `TS${String(eq.train_number).padStart(2, '0')}` : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-primary" />
            Fleet Checks
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Periodic inspections and compliance checks</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="w-9 h-9 border border-neutral-200 rounded-xl flex items-center justify-center hover:bg-neutral-50 text-neutral-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => openForm()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all">
            <Plus className="w-3.5 h-3.5" /> New Check
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Scheduled', value: stats.scheduled ?? 0, color: 'bg-neutral-100 text-neutral-600' },
          { label: 'Passed', value: stats.passed ?? 0, color: 'bg-green-100 text-green-600' },
          { label: 'Failed', value: stats.failed ?? 0, color: 'bg-red-100 text-red-600' },
          { label: 'This Month', value: stats.this_month ?? 0, color: 'bg-blue-100 text-blue-600' },
        ].map(s => (
          <div key={s.label} className="bg-neutral-50 rounded-xl p-4">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-extrabold text-secondary-700 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Table */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search checks…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            {['', 'scheduled', 'passed', 'failed', 'partial'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[11px] font-bold rounded-lg border transition-all ${
                  statusFilter === s ? 'bg-primary text-white border-primary' : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-300'
                }`}>
                {s ? STATUS_LABEL[s] : 'All'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <ClipboardCheck className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No fleet checks found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50 text-neutral-400 text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">Check No</th>
                  <th className="px-4 py-3 text-left font-semibold">Train</th>
                  <th className="px-4 py-3 text-left font-semibold">Type</th>
                  <th className="px-4 py-3 text-left font-semibold">Inspector</th>
                  <th className="px-4 py-3 text-center font-semibold">Items</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold">Date</th>
                  <th className="px-4 py-3 text-center font-semibold w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(chk => (
                  <tr key={chk.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{chk.check_no}</td>
                    <td className="px-4 py-3 text-secondary-700 font-semibold">{trainLabel(chk.equipment)}</td>
                    <td className="px-4 py-3 text-neutral-500 capitalize">{chk.check_type}</td>
                    <td className="px-4 py-3 text-neutral-600">{chk.inspector_name || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-green-600 font-bold text-xs">{chk.passed_items}</span>
                      <span className="text-neutral-300 mx-0.5">/</span>
                      <span className="text-red-500 font-bold text-xs">{chk.failed_items}</span>
                      <span className="text-neutral-300 mx-0.5">/</span>
                      <span className="text-neutral-400 text-xs">{chk.total_items}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <select value={chk.status} onChange={e => handleStatusChange(chk, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer outline-none ${STATUS_STYLE[chk.status] || ''}`}>
                        {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-neutral-400">
                      {chk.check_date ? new Date(chk.check_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setExpandedId(expandedId === chk.id ? null : chk.id)} className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-primary">
                          {expandedId === chk.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => openForm(chk)} className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-primary">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(chk.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-500">
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

      {/* Expanded checklist */}
      {expandedId && (() => {
        const chk = checks.find(c => c.id === expandedId)
        if (!chk) return null
        return (
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-secondary-700">{chk.check_no} — Checklist Items</h3>
              <button onClick={() => setExpandedId(null)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
            </div>
            {chk.items?.length > 0 ? (
              <div className="space-y-1">
                {chk.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-neutral-50">
                    {item.result === 'pass' && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                    {item.result === 'fail' && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                    {item.result === 'na' && <Minus className="w-4 h-4 text-neutral-300 shrink-0" />}
                    <span className="text-sm text-secondary-700 flex-1">{item.item_name}</span>
                    {item.remarks && <span className="text-xs text-neutral-400">{item.remarks}</span>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-neutral-400">No checklist items</p>
            )}
            {chk.notes && <div><p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Notes</p><p className="text-xs text-secondary-700">{chk.notes}</p></div>}
          </div>
        )
      })()}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl p-6 space-y-4 mb-10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-secondary-700">{editingId ? 'Edit Fleet Check' : 'New Fleet Check'}</h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Train *</label>
                <TrainSelect value={form.equipment_id} onChange={v => set('equipment_id', v)} equipmentList={equipment} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Check Type</label>
                <select value={form.check_type} onChange={e => set('check_type', e.target.value)} className={INP}>
                  {CHECK_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Date *</label>
                <input type="date" value={form.check_date} onChange={e => set('check_date', e.target.value)} className={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Inspector</label>
                <InspectorSelect value={form.inspector_id}
                  onChange={(id, name) => { set('inspector_id', id); set('inspector_name', name) }} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Status</label>
                <select value={form.status} onChange={e => set('status', e.target.value)} className={INP}>
                  {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Notes</label>
                <input value={form.notes} onChange={e => set('notes', e.target.value)} className={INP} placeholder="Optional notes" />
              </div>
            </div>

            {/* Checklist Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Checklist Items</label>
                <button onClick={addItem} type="button" className="text-xs text-primary font-bold hover:underline flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Add Item
                </button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {form.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-neutral-50 rounded-xl px-3 py-2">
                    <input value={item.item_name} onChange={e => setItem(idx, 'item_name', e.target.value)}
                      placeholder="Item name" className="flex-1 text-sm bg-transparent outline-none" />
                    <select value={item.result} onChange={e => setItem(idx, 'result', e.target.value)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold border cursor-pointer outline-none ${
                        item.result === 'pass' ? 'bg-green-50 text-green-700 border-green-200' :
                        item.result === 'fail' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-neutral-100 text-neutral-500 border-neutral-200'
                      }`}>
                      <option value="na">N/A</option>
                      <option value="pass">Pass</option>
                      <option value="fail">Fail</option>
                    </select>
                    <input value={item.remarks} onChange={e => setItem(idx, 'remarks', e.target.value)}
                      placeholder="Remarks" className="w-32 text-xs bg-transparent outline-none text-neutral-400" />
                    <button onClick={() => removeItem(idx)} className="text-neutral-300 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.equipment_id || !form.check_date}
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
