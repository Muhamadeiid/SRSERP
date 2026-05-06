import { useState, useEffect, useRef, useCallback } from 'react'
import { itAssetService } from '../../services/assetService'
import {
  Search, Plus, X, Pencil, Loader2, RefreshCw, Trash2, Monitor,
} from 'lucide-react'

// ── constants ──────────────────────────────────────────────────────────────────
const ITEMS = [
  'Laptop', 'Desktop', 'Monitor', 'Mouse', 'Keyboard', 'Printer', 'Scanner',
  'UPS', 'Switch', 'Router', 'IP Phone', 'Projector', 'Camera', 'Hard Drive',
  'Flash Drive', 'Cable', 'Headset', 'Webcam', 'Server', 'Other',
]
const FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'As Needed']

const COLS = [
  { key: 'item',                  label: 'Item',            w: 'w-24'  },
  { key: 'asset_no',              label: 'Asset No.',       w: 'w-24'  },
  { key: 'name',                  label: 'Name (Des.)',     w: 'w-40'  },
  { key: 'qty',                   label: 'QTY',             w: 'w-10'  },
  { key: 'serial_number',         label: 'Serial No.',      w: 'w-28'  },
  { key: 'purpose',               label: 'Purpose',         w: 'w-24'  },
  { key: 'location',              label: 'Location',        w: 'w-32'  },
  { key: 'registration_date',     label: 'Reg. Date',       w: 'w-24'  },
  { key: 'account_registration',  label: 'Acct. Reg.',      w: 'w-22'  },
  { key: 'user_name',             label: 'User',            w: 'w-28'  },
  { key: 'managing_staff',        label: 'Staff',           w: 'w-24'  },
  { key: 'maintenance_frequency', label: 'Frequency',       w: 'w-24'  },
  { key: 'activity',              label: 'Activity',        w: 'w-20'  },
]

const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Form Modal ─────────────────────────────────────────────────────────────────
function ITAssetForm({ initial, onClose, onSaved }) {
  const isEdit = !!initial?.id
  const empty = {
    item: '', asset_no: '', name: '', qty: 1, serial_number: '',
    purpose: '', location: '', registration_date: '',
    account_registration: '', user_name: '', managing_staff: '',
    maintenance_frequency: '', activity: '', notes: '',
  }
  const [form, setForm] = useState(
    isEdit
      ? { ...empty, ...initial, registration_date: initial.registration_date?.slice(0,10) ?? '' }
      : empty
  )
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.item.trim()) return setErr('Item is required')
    if (!form.name.trim()) return setErr('Name / Description is required')
    setBusy(true); setErr(null)
    try {
      const payload = { ...form, qty: Number(form.qty) || 1, registration_date: form.registration_date || null }
      isEdit ? await itAssetService.update(initial.id, payload) : await itAssetService.create(payload)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Save failed')
    } finally { setBusy(false) }
  }

  const F = ({ label, children, required }) => (
    <div>
      <label className="block text-xs font-semibold text-neutral-500 mb-1">{label}{required && ' *'}</label>
      {children}
    </div>
  )
  const inp = (k, placeholder='', type='text') => (
    <input type={type} value={form[k]} onChange={set(k)} placeholder={placeholder}
      className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white" />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <p className="font-bold text-secondary-700 text-base">{isEdit ? 'Edit IT Asset' : 'Add IT Asset'}</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          {/* Row 1: Item + Asset No + QTY */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <F label="Item" required>
              <select value={form.item} onChange={set('item')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
                <option value="">Select…</option>
                {ITEMS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </F>
            <F label="Asset No.">{inp('asset_no', 'e.g. MOUSE-01')}</F>
            <F label="QTY">
              <input type="number" min="1" value={form.qty} onChange={set('qty')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white" />
            </F>
          </div>

          {/* Row 2: Name + Serial */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Name / Description" required>{inp('name', 'e.g. Wireless Mouse 2B')}</F>
            <F label="Serial Number">{inp('serial_number', 'Serial…')}</F>
          </div>

          {/* Row 3: Purpose + Location */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Purpose">{inp('purpose', 'e.g. Office Use')}</F>
            <F label="Location">{inp('location', 'e.g. Kozzika Admin Office')}</F>
          </div>

          {/* Row 4: Reg date + Account Reg */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Registration Date">{inp('registration_date', '', 'date')}</F>
            <F label="Acct. Registration No.">{inp('account_registration', 'Account / Reg. No.')}</F>
          </div>

          {/* Row 5: User + Managing Staff */}
          <div className="grid grid-cols-2 gap-3">
            <F label="User">{inp('user_name', 'Name of user')}</F>
            <F label="Managing Staff">{inp('managing_staff', 'Staff name')}</F>
          </div>

          {/* Row 6: Frequency + Activity */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Maintenance Frequency">
              <select value={form.maintenance_frequency} onChange={set('maintenance_frequency')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
                <option value="">Select…</option>
                {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </F>
            <F label="Activity">{inp('activity', 'e.g. Use in Office')}</F>
          </div>

          {/* Notes */}
          <F label="Notes">
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional notes…"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white resize-none" />
          </F>

          {err && <p className="text-xs text-red-500 font-medium">{err}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-medium">Cancel</button>
            <button onClick={save} disabled={busy}
              className="px-5 py-2 text-sm rounded-xl bg-primary text-white font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{isEdit ? 'Save Changes' : 'Add Asset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function ITAssetsTab({ hideHeader = false }) {
  const [records,    setRecords]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [pagination, setPagination] = useState(null)
  const [search,     setSearch]     = useState('')
  const [filterItem, setFilterItem] = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [editRec,    setEditRec]    = useState(null)
  const searchTimer = useRef()

  const load = useCallback(async (params = {}) => {
    setLoading(true)
    try {
      const res = await itAssetService.list({
        search:   params.search   ?? search,
        item:     params.item     ?? filterItem,
        per_page: 50,
      })
      setRecords(res.data ?? [])
      setPagination(res.pagination ?? null)
    } catch { setRecords([]) }
    finally { setLoading(false) }
  }, [search, filterItem])

  useEffect(() => { load() }, [filterItem])

  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => load({ search }), 350)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const del = async id => {
    if (!window.confirm('Delete this IT asset record?')) return
    try { await itAssetService.remove(id); load() } catch {}
  }

  const openEdit = rec => { setEditRec(rec); setShowForm(true) }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-end flex-wrap gap-2">
        <button onClick={() => load()} disabled={loading}
          className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
        <button onClick={() => { setEditRec(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />Add Asset
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets…"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 w-56" />
        </div>
        <select value={filterItem} onChange={e => setFilterItem(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
          <option value="">All Items</option>
          {ITEMS.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        <p className="ml-auto text-xs text-neutral-400">
          {pagination?.total ?? records.length} record{(pagination?.total ?? records.length) !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden mt-2" style={{display:'grid',gridTemplateColumns:'1fr'}}>
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-neutral-300">
            <Monitor className="w-14 h-14" />
            <p className="text-sm font-medium">No IT assets found</p>
            <p className="text-xs">Click "Add Asset" to register the first item</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse" style={{minWidth:'1100px',width:'100%'}}>
              <thead>
                <tr className="bg-neutral-800 text-white">
                  <th className="px-2 py-2.5 text-[10px] font-bold text-center border-r border-neutral-700 w-8">#</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Item</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Asset No.</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[13%]">Name (Des.)</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-center border-r border-neutral-700 w-8">QTY</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Serial No.</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Purpose</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[9%]">Location</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Reg. Date</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[6%]">Acct. Reg.</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[8%]">User</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Staff</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[7%]">Frequency</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-left border-r border-neutral-700 w-[6%]">Activity</th>
                  <th className="px-2 py-2.5 text-[10px] font-bold text-center border-l border-neutral-700 w-12">Act.</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, i) => (
                  <tr key={rec.id}
                    className={`border-b border-neutral-100 transition-colors hover:bg-primary/5 ${i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}`}>
                    <td className="px-2 py-2 text-center text-neutral-400 font-semibold">{i + 1}</td>

                    {/* Item */}
                    <td className="px-2 py-2">
                      <span className="inline-flex px-1.5 py-0.5 rounded-md bg-cyan-50 border border-cyan-200 text-cyan-700 text-[10px] font-semibold truncate max-w-full">
                        {rec.item || '—'}
                      </span>
                    </td>
                    {/* Asset No */}
                    <td className="px-2 py-2 font-mono text-neutral-700 truncate" title={rec.asset_no}>{rec.asset_no || '—'}</td>
                    {/* Name */}
                    <td className="px-2 py-2" title={rec.name}>
                      <p className="font-medium text-secondary-700 truncate">{rec.name}</p>
                    </td>
                    {/* QTY */}
                    <td className="px-2 py-2 text-center font-bold text-neutral-700">{rec.qty}</td>
                    {/* Serial */}
                    <td className="px-2 py-2 font-mono text-neutral-500 truncate" title={rec.serial_number}>{rec.serial_number || '—'}</td>
                    {/* Purpose */}
                    <td className="px-2 py-2 text-neutral-600 truncate" title={rec.purpose}>{rec.purpose || '—'}</td>
                    {/* Location */}
                    <td className="px-2 py-2 text-neutral-600 truncate" title={rec.location}>{rec.location || '—'}</td>
                    {/* Reg date */}
                    <td className="px-2 py-2 text-neutral-500 truncate">{fmtDate(rec.registration_date)}</td>
                    {/* Account reg */}
                    <td className="px-2 py-2 font-mono text-neutral-500 truncate" title={rec.account_registration}>{rec.account_registration || '—'}</td>
                    {/* User */}
                    <td className="px-2 py-2 text-neutral-700 truncate" title={rec.user_name}>{rec.user_name || '—'}</td>
                    {/* Managing staff */}
                    <td className="px-2 py-2 text-neutral-700 truncate" title={rec.managing_staff}>{rec.managing_staff || '—'}</td>
                    {/* Frequency */}
                    <td className="px-2 py-2">
                      {rec.maintenance_frequency
                        ? <span className="px-1.5 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 text-[10px] font-semibold truncate inline-block max-w-full">{rec.maintenance_frequency}</span>
                        : '—'}
                    </td>
                    {/* Activity */}
                    <td className="px-2 py-2 text-neutral-600 truncate" title={rec.activity}>{rec.activity || '—'}</td>

                    {/* Actions */}
                    <td className="px-2 py-2 text-center border-l border-neutral-100">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => openEdit(rec)} title="Edit"
                          className="p-1 rounded-lg hover:bg-primary/10 text-neutral-400 hover:text-primary transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => del(rec.id)} title="Delete"
                          className="p-1 rounded-lg hover:bg-red-50 text-neutral-400 hover:text-red-500 transition-colors">
                          <Trash2 className="w-3 h-3" />
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

      {/* Form modal */}
      {showForm && (
        <ITAssetForm
          initial={editRec}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}
    </div>
  )
}
