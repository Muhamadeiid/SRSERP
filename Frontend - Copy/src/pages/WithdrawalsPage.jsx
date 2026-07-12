import { useCallback, useEffect, useState } from 'react'
import {
  Plus, Search, Loader2, RefreshCw, X, Filter, Edit3, Trash2, Save,
  LogOut, ArrowLeftRight,
} from 'lucide-react'
import {
  getWithdrawals, createWithdrawal, updateWithdrawal, deleteWithdrawal,
  getWithdrawalStats, getEquipment,
} from '../services/maintenanceService'

const STATUS_STYLE = {
  active:   'bg-red-50 text-red-700 border-red-200',
  returned: 'bg-green-50 text-green-700 border-green-200',
  extended: 'bg-amber-50 text-amber-700 border-amber-200',
}
const STATUS_LABEL = { active: 'Active', returned: 'Returned', extended: 'Extended' }

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

const EMPTY_FORM = {
  equipment_id: '', withdrawal_date: new Date().toISOString().slice(0, 10),
  expected_return_date: '', reason: '', description: '', notes: '',
}

export default function WithdrawalsPage() {
  const [records, setRecords] = useState([])
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

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [wdRes, statsRes, eqRes] = await Promise.all([
        getWithdrawals({ per_page: 200 }),
        getWithdrawalStats(),
        getEquipment({}),
      ])
      setRecords(wdRes.data ?? [])
      setStats(statsRes ?? {})
      setEquipment(eqRes.data ?? [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = records.filter(r => {
    if (statusFilter && r.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return (r.withdrawal_no?.toLowerCase().includes(s) ||
        r.reason?.toLowerCase().includes(s) ||
        r.equipment?.code?.toLowerCase().includes(s) ||
        r.equipment?.name?.toLowerCase().includes(s))
    }
    return true
  })

  const openForm = (wd = null) => {
    if (wd) {
      setForm({
        equipment_id: wd.equipment_id || '',
        withdrawal_date: wd.withdrawal_date?.slice(0, 10) || '',
        expected_return_date: wd.expected_return_date?.slice(0, 10) || '',
        actual_return_date: wd.actual_return_date?.slice(0, 10) || '',
        reason: wd.reason || '',
        description: wd.description || '',
        status: wd.status || 'active',
        notes: wd.notes || '',
      })
      setEditingId(wd.id)
    } else {
      setForm(EMPTY_FORM)
      setEditingId(null)
    }
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!form.equipment_id || !form.withdrawal_date || !form.reason) return
    setSaving(true)
    setError('')
    try {
      if (editingId) {
        await updateWithdrawal(editingId, form)
      } else {
        await createWithdrawal(form)
      }
      setShowForm(false)
      setEditingId(null)
      await fetchAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleReturn = async (wd) => {
    if (!confirm(`Return ${wd.withdrawal_no}?`)) return
    try {
      await updateWithdrawal(wd.id, { status: 'returned', actual_return_date: new Date().toISOString().slice(0, 10) })
      await fetchAll()
    } catch (e) { setError(e.message) }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this withdrawal?')) return
    try { await deleteWithdrawal(id); await fetchAll() } catch (e) { setError(e.message) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const trainLabel = (eq) => eq ? `TS${String(eq.train_number).padStart(2, '0')}` : '—'

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <LogOut className="w-5 h-5 text-primary" />
            Withdrawals
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Train withdrawal and return tracking</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="w-9 h-9 border border-neutral-200 rounded-xl flex items-center justify-center hover:bg-neutral-50 text-neutral-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => openForm()}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all">
            <Plus className="w-3.5 h-3.5" /> New Withdrawal
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">{error}</div>}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active', value: stats.active ?? 0 },
          { label: 'Returned', value: stats.returned ?? 0 },
          { label: 'Extended', value: stats.extended ?? 0 },
          { label: 'This Month', value: stats.this_month ?? 0 },
        ].map(s => (
          <div key={s.label} className="bg-neutral-50 rounded-xl p-4">
            <p className="text-[10px] text-neutral-400 uppercase tracking-wider">{s.label}</p>
            <p className="text-2xl font-extrabold text-secondary-700 mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search withdrawals…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-neutral-400" />
            {['', 'active', 'returned', 'extended'].map(s => (
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
            <LogOut className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No withdrawals found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50 text-neutral-400 text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold">WD No</th>
                  <th className="px-4 py-3 text-left font-semibold">Train</th>
                  <th className="px-4 py-3 text-left font-semibold">Reason</th>
                  <th className="px-4 py-3 text-center font-semibold">Withdrawn</th>
                  <th className="px-4 py-3 text-center font-semibold">Expected Return</th>
                  <th className="px-4 py-3 text-center font-semibold">Actual Return</th>
                  <th className="px-4 py-3 text-center font-semibold">Status</th>
                  <th className="px-4 py-3 text-center font-semibold w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(wd => (
                  <tr key={wd.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{wd.withdrawal_no}</td>
                    <td className="px-4 py-3 text-secondary-700 font-semibold">{trainLabel(wd.equipment)}</td>
                    <td className="px-4 py-3 text-neutral-600">{wd.reason}</td>
                    <td className="px-4 py-3 text-center text-xs text-neutral-400">
                      {wd.withdrawal_date ? new Date(wd.withdrawal_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-neutral-400">
                      {wd.expected_return_date ? new Date(wd.expected_return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-neutral-400">
                      {wd.actual_return_date ? new Date(wd.actual_return_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[11px] font-bold border ${STATUS_STYLE[wd.status] || ''}`}>
                        {STATUS_LABEL[wd.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {wd.status === 'active' && (
                          <button onClick={() => handleReturn(wd)} title="Mark Returned"
                            className="w-7 h-7 rounded-lg hover:bg-green-50 flex items-center justify-center text-neutral-400 hover:text-green-600">
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => openForm(wd)} className="w-7 h-7 rounded-lg hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-primary">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(wd.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-neutral-400 hover:text-red-500">
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

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4 mb-10">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-secondary-700">{editingId ? 'Edit Withdrawal' : 'New Withdrawal'}</h2>
              <button onClick={() => setShowForm(false)} className="text-neutral-400 hover:text-neutral-600"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Train *</label>
                <TrainSelect value={form.equipment_id} onChange={v => set('equipment_id', v)} equipmentList={equipment} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Withdrawal Date *</label>
                <input type="date" value={form.withdrawal_date} onChange={e => set('withdrawal_date', e.target.value)} className={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Expected Return</label>
                <input type="date" value={form.expected_return_date} onChange={e => set('expected_return_date', e.target.value)} className={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Reason *</label>
                <input value={form.reason} onChange={e => set('reason', e.target.value)} className={INP} placeholder="Reason for withdrawal" />
              </div>
              {editingId && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Status</label>
                    <select value={form.status} onChange={e => set('status', e.target.value)} className={INP}>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Actual Return Date</label>
                    <input type="date" value={form.actual_return_date || ''} onChange={e => set('actual_return_date', e.target.value)} className={INP} />
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Description</label>
                <textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} className={INP} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} className={INP} />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-neutral-100">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-xs font-bold text-neutral-500 hover:text-neutral-700">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.equipment_id || !form.withdrawal_date || !form.reason}
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
