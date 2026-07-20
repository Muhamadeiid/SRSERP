import { useState, useEffect, useRef, useCallback } from 'react'
import { assetService } from '../../services/assetService'
import { getEmployees } from '../../services/employeeService'
import { listIssuingSources } from '../../services/issuingSourceService'
import {
  Search, Plus, X, Pencil, Loader2, RefreshCw,
  Package, CheckCircle2, AlertTriangle, ChevronDown,
  Printer, RotateCcw, Trash2, Filter, Monitor, FileDown,
} from 'lucide-react'
import ITAssetsTab from './ITAssetsTab'

// ── constants ─────────────────────────────────────────────────────────────────
const DEPARTMENTS = [
  'CM', 'PM', 'Warranty', 'CM (Intervention)', 'Human Resources', 'EHS', 'IT', 'Other',
]
const CATEGORIES = ['PPE', 'Tool', 'Device', 'Uniform', 'Vehicle', 'Document', 'Key', 'Other']
const CONDITIONS  = ['Good', 'Damaged', 'Lost']

const DEPT_COLORS = {
  'CM':               'bg-orange-100 text-orange-700 border-orange-200',
  'PM':               'bg-blue-100   text-blue-700   border-blue-200',
  'Warranty':         'bg-green-100  text-green-700  border-green-200',
  'CM (Intervention)':'bg-secondary-50 text-secondary border-secondary-200',
  'Human Resources':  'bg-pink-100   text-pink-700   border-pink-200',
  'EHS':              'bg-teal-100   text-teal-700   border-teal-200',
  'IT':               'bg-cyan-100   text-cyan-700   border-cyan-200',
  'Other':            'bg-neutral-100 text-neutral-600 border-neutral-200',
}
const COND_COLORS = {
  Good:    'text-green-600',
  Damaged: 'text-orange-500',
  Lost:    'text-red-500',
}

const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── EmployeePicker ─────────────────────────────────────────────────────────
function EmployeePicker({ value, onChange, placeholder = 'Search employee…', className = '' }) {
  const [q, setQ]         = useState(value?.name ?? '')
  const [results, setRes] = useState([])
  const [open, setOpen]   = useState(false)
  const [busy, setBusy]   = useState(false)
  const ref     = useRef()
  const timer   = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!q || q.trim().length < 2) { setRes([]); return }
    setBusy(true)
    timer.current = setTimeout(() => {
      getEmployees({ search: q.trim(), per_page: 10 })
        .then(r => { setRes(Array.isArray(r) ? r : (r.data ?? [])); setOpen(true) })
        .catch(() => setRes([]))
        .finally(() => setBusy(false))
    }, 350)
    return () => clearTimeout(timer.current)
  }, [q])

  const select = emp => {
    setQ(emp.name); setOpen(false); setRes([])
    onChange(emp)
  }
  const clear = () => { setQ(''); setRes([]); onChange(null) }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
      <input value={q} onChange={e => { setQ(e.target.value); if (!e.target.value) clear() }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className="w-full pl-9 pr-8 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all" />
      {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
      {value && !busy && (
        <button onClick={clear} className="absolute right-2 top-2 p-0.5 rounded text-neutral-400 hover:text-neutral-600">
          <X className="w-4 h-4" />
        </button>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-[90] w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-2xl max-h-64 overflow-y-auto">
          {results.map(emp => (
            <button key={emp.id} type="button" onClick={() => select(emp)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 text-left border-b border-neutral-50 last:border-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {emp.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-secondary-700">{emp.name}</p>
                <p className="text-xs text-neutral-400">{emp.position} · {emp.department}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── AssetForm modal ────────────────────────────────────────────────────────
function AssetForm({ initial, sources, onClose, onSaved }) {
  const isEdit = !!initial?.id
  const [form, setForm] = useState({
    employee:           initial?.employee ?? null,
    issuing_source_id:  initial?.issuing_source_id ?? '',
    asset_name:         initial?.asset_name ?? '',
    asset_code:         initial?.asset_code ?? '',
    asset_category:     initial?.asset_category ?? '',
    received_date:      initial?.received_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    condition:          initial?.condition ?? 'Good',
    notes:              initial?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    if (!form.employee && !isEdit) return setErr('Please select an employee')
    if (!form.issuing_source_id)   return setErr('Please select a department')
    if (!form.asset_name.trim())   return setErr('Asset name is required')
    if (!form.received_date)       return setErr('Received date is required')

    setBusy(true); setErr(null)
    try {
      const payload = {
        ...(isEdit ? {} : { employee_id: form.employee.id }),
        issuing_source_id:  Number(form.issuing_source_id),
        asset_name:         form.asset_name.trim(),
        asset_code:         form.asset_code.trim() || null,
        asset_category:     form.asset_category || null,
        received_date:      form.received_date,
        condition:          form.condition,
        notes:              form.notes.trim() || null,
      }
      isEdit
        ? await assetService.update(initial.id, payload)
        : await assetService.create(payload)
      onSaved()
    } catch (e) {
      setErr(e.message || 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="font-bold text-secondary-700 text-base">
              {isEdit ? 'Edit Asset' : 'Assign New Asset'}
            </p>
            {isEdit && <p className="text-xs text-neutral-400 mt-0.5">{initial.employee?.name}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Employee picker — only for new assets */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Employee *</label>
              <EmployeePicker value={form.employee} onChange={emp => setForm(f => ({ ...f, employee: emp }))} />
            </div>
          )}

          {/* Department + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Issuing Department *</label>
              <select value={form.issuing_source_id} onChange={set('issuing_source_id')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
                <option value="">Select…</option>
                {sources.map(source => <option key={source.id} value={source.id}>{source.label_en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Category</label>
              <select value={form.asset_category} onChange={set('asset_category')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
                <option value="">Select…</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Asset name + code */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Asset Name *</label>
              <input value={form.asset_name} onChange={set('asset_name')} placeholder="e.g. Safety Helmet"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Serial / Code</label>
              <input value={form.asset_code} onChange={set('asset_code')} placeholder="Optional"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60" />
            </div>
          </div>

          {/* Date + Condition */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Received Date *</label>
              <input type="date" value={form.received_date} onChange={set('received_date')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 mb-1">Condition</label>
              <select value={form.condition} onChange={set('condition')}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
                {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">Notes</label>
            <textarea value={form.notes} onChange={set('notes')} rows={2} placeholder="Optional notes…"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 resize-none" />
          </div>
        </div>

        {err && <p className="mt-3 text-sm text-red-500 font-medium">{err}</p>}

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-sm text-neutral-500 hover:bg-neutral-50">
            Cancel
          </button>
          <button onClick={save} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</> : (isEdit ? 'Update' : 'Assign Asset')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ReturnModal ────────────────────────────────────────────────────────────
function ReturnModal({ asset, onClose, onSaved }) {
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10))
  const [condition,  setCondition]  = useState(asset.condition)
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await assetService.markReturned(asset.id, { return_date: returnDate, condition })
      onSaved()
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-secondary-700">Mark as Returned</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-neutral-500 mb-4">
          <span className="font-semibold text-secondary-700">{asset.asset_name}</span>
          {asset.asset_code ? ` (${asset.asset_code})` : ''}
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">Return Date</label>
            <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-500 mb-1">Condition on Return</label>
            <select value={condition} onChange={e => setCondition(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
              {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        {err && <p className="mt-2 text-sm text-red-500">{err}</p>}
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 border border-neutral-200 rounded-xl text-sm text-neutral-500 hover:bg-neutral-50">Cancel</button>
          <button onClick={save} disabled={busy}
            className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Confirm Return
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Clearance Report print ─────────────────────────────────────────────────
function printClearance(data) {
  const { employee, by_department, active_count, returned_count, generated_at } = data
  const deptRows = by_department.map(dept => `
    <tr style="background:#1e3a2f;color:#fff">
      <td colspan="6" style="padding:5px 8px;font-weight:bold;font-size:9pt">
        ${dept.department} &nbsp;(${dept.count} item${dept.count !== 1 ? 's' : ''})
      </td>
    </tr>
    ${dept.assets.map((a, i) => `
      <tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'}">
        <td style="padding:4px 8px;border:1px solid #e5e7eb">${i + 1}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;font-weight:600">${a.asset_name}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;color:#6b7280">${a.asset_category ?? '—'}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;font-family:monospace">${a.asset_code ?? '—'}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb">${a.received_date ? new Date(a.received_date + 'T00:00:00').toLocaleDateString('en-GB') : '—'}</td>
        <td style="padding:4px 8px;border:1px solid #e5e7eb;color:${a.condition === 'Good' ? '#16a34a' : a.condition === 'Damaged' ? '#ea580c' : '#dc2626'};font-weight:600">${a.condition}</td>
      </tr>
    `).join('')}
  `).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Employee Clearance — ${employee.name}</title>
<style>
  @page { size: A4 portrait; margin: 15mm; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, sans-serif; font-size: 8.5pt; color: #111; }
  .header { border: 2px solid #1e3a2f; margin-bottom: 10px; }
  .header-top { background: #1e3a2f; color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
  .header-top h1 { font-size: 13pt; font-weight: 900; }
  .header-info { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .info-cell { padding: 5px 10px; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
  .info-cell:last-child { border-right: 0; }
  .lbl { font-size: 7pt; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .val { font-size: 9pt; font-weight: 700; margin-top: 1px; }
  .summary { display: flex; gap: 8px; margin-bottom: 8px; }
  .sum-card { flex: 1; border: 1.5px solid; border-radius: 6px; padding: 6px 10px; text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #374151; color: #fff; padding: 5px 8px; font-size: 8pt; text-align: left; }
  .signature { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; }
  .sig-box { border-top: 1.5px solid #374151; padding-top: 6px; text-align: center; font-size: 8pt; color: #374151; }
  .note { margin-top: 10px; padding: 8px; background: #fef9c3; border: 1px solid #fde047; border-radius: 4px; font-size: 8pt; }
</style>
</head><body>

<div class="header">
  <div class="header-top">
    <h1>Employee Clearance Report</h1>
    <div style="text-align:right;font-size:8pt">
      <div>Generated: ${new Date(generated_at).toLocaleDateString('en-GB')}</div>
      <div>Doc No: SRS-HR-CLR-01 | Rev.01</div>
    </div>
  </div>
  <div class="header-info">
    <div class="info-cell"><div class="lbl">Employee Name</div><div class="val">${employee.name}</div></div>
    <div class="info-cell"><div class="lbl">IBS Code</div><div class="val">${employee.ibs_code ?? '—'}</div></div>
    <div class="info-cell"><div class="lbl">Department</div><div class="val">${employee.department ?? '—'}</div></div>
    <div class="info-cell"><div class="lbl">Position</div><div class="val">${employee.position ?? '—'}</div></div>
  </div>
</div>

<div class="summary">
  <div class="sum-card" style="border-color:#dc2626;color:#dc2626">
    <div style="font-size:18pt;font-weight:900">${active_count}</div>
    <div style="font-size:7pt;font-weight:700;text-transform:uppercase">Pending Return</div>
  </div>
  <div class="sum-card" style="border-color:#16a34a;color:#16a34a">
    <div style="font-size:18pt;font-weight:900">${returned_count}</div>
    <div style="font-size:7pt;font-weight:700;text-transform:uppercase">Already Returned</div>
  </div>
</div>

${active_count === 0 ? `
  <div style="text-align:center;padding:20px;background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;color:#16a34a;font-weight:bold;font-size:11pt;margin-bottom:10px">
    ✓ All Clear — No pending assets
  </div>
` : `
<table>
  <thead>
    <tr>
      <th style="width:30px">#</th>
      <th>Asset Name</th>
      <th>Category</th>
      <th>Code / Serial</th>
      <th>Received</th>
      <th>Condition</th>
    </tr>
  </thead>
  <tbody>${deptRows}</tbody>
</table>
`}

${active_count > 0 ? `
<div class="note">
  ⚠ The above ${active_count} item${active_count !== 1 ? 's' : ''} must be returned before final clearance is approved.
</div>
` : ''}

<div class="signature">
  <div class="sig-box">Employee Signature<br><span style="color:#9ca3af;font-size:7pt">Date: ___________</span></div>
  <div class="sig-box">Department Manager<br><span style="color:#9ca3af;font-size:7pt">Date: ___________</span></div>
  <div class="sig-box">HR Manager<br><span style="color:#9ca3af;font-size:7pt">Date: ___________</span></div>
</div>

</body></html>`

  const w = window.open('', '_blank', 'width=900,height=700')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

// ── Stats bar ──────────────────────────────────────────────────────────────
function StatsBar({ stats }) {
  if (!stats) return null
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
      {[
        { label: 'Total Assets',    value: stats.total,    color: 'text-secondary-700' },
        { label: 'Assigned / Held', value: stats.active,   color: 'text-blue-600' },
        { label: 'Returned',        value: stats.returned, color: 'text-green-600' },
        { label: 'Good',            value: stats.good,     color: 'text-emerald-600' },
        { label: 'Damaged',         value: stats.damaged,  color: 'text-orange-600' },
        { label: 'Lost',            value: stats.lost,     color: 'text-red-600' },
      ].map(({ label, value, color }) => (
        <div key={label} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 text-center">
          <p className={`text-2xl font-black ${color}`}>{value}</p>
          <p className="text-xs text-neutral-400 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
function EmployeeAssetsTab({ hideHeader = false }) {
  const [assets,      setAssets]      = useState([])
  const [stats,       setStats]       = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [pagination,  setPagination]  = useState(null)
  const [sources,     setSources]     = useState([])

  // filters
  const [search,      setSearch]      = useState('')
  const [filterDept,  setFilterDept]  = useState('all')
  const [filterStatus,setFilterStatus]= useState('Active')
  const [filterCondition, setFilterCondition] = useState('all')
  const [filterEmp,   setFilterEmp]   = useState(null)

  // modals
  const [showForm,    setShowForm]    = useState(false)
  const [editAsset,   setEditAsset]   = useState(null)
  const [returnAsset, setReturnAsset] = useState(null)
  const [clearanceEmp,setClearanceEmp]= useState(null)
  const [clearanceData,setClearData]  = useState(null)
  const [clearanceBusy,setClearBusy]  = useState(false)
  const [reportBusy,   setReportBusy] = useState(false)

  const searchTimer = useRef()

  const loadAssets = useCallback(async (params = {}) => {
    setLoading(true)
    try {
      const res = await assetService.list({
        search:      params.search      ?? search,
        department:  params.department  ?? filterDept,
        status:      params.status      ?? filterStatus,
        condition:   params.condition   ?? filterCondition,
        employee_id: params.employee_id ?? filterEmp?.id,
        per_page:    25,
      })
      setAssets(res.data ?? [])
      setPagination(res.pagination ?? null)
    } catch { setAssets([]) }
    finally { setLoading(false) }
  }, [search, filterDept, filterStatus, filterCondition, filterEmp])

  const loadStats = async () => {
    try { setStats(await assetService.stats()) } catch {}
  }

  useEffect(() => { loadAssets() }, [filterDept, filterStatus, filterCondition, filterEmp])
  useEffect(() => { loadStats() }, [])
  useEffect(() => {
    listIssuingSources()
      .then(data => setSources((Array.isArray(data) ? data : []).filter(source => source.is_active)))
      .catch(() => setSources([]))
  }, [])

  // debounce search
  useEffect(() => {
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadAssets({ search }), 400)
    return () => clearTimeout(searchTimer.current)
  }, [search])

  const refresh = () => { loadAssets(); loadStats() }

  const openClearance = async emp => {
    setClearanceEmp(emp); setClearBusy(true); setClearData(null)
    try {
      const res = await assetService.clearance(emp.id)
      setClearData(res.data)
    } catch { setClearData(null) }
    finally { setClearBusy(false) }
  }

  const runReport = async () => {
    if (!clearanceEmp) return
    setReportBusy(true)
    try {
      const data = clearanceData ?? await assetService.clearance(clearanceEmp.id)
      const { generateAssetReturnReport } = await import('../../utils/generateAssetReturn')
      await generateAssetReturnReport({ employee: clearanceEmp, clearanceData: data })
    } catch (e) {
      alert('Failed to generate report: ' + e.message)
    } finally {
      setReportBusy(false)
    }
  }

  const [directReportId, setDirectReportId] = useState(null)
  const runReportDirect = async (emp) => {
    setDirectReportId(emp.id)
    try {
      const data = await assetService.clearance(emp.id)
      const { generateAssetReturnReport } = await import('../../utils/generateAssetReturn')
      await generateAssetReturnReport({ employee: emp, clearanceData: data })
    } catch (e) {
      alert('Failed to generate report: ' + e.message)
    } finally {
      setDirectReportId(null)
    }
  }

  const deleteAsset = async id => {
    if (!window.confirm('Delete this asset record?')) return
    try { await assetService.remove(id); refresh() } catch {}
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      {!hideHeader && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-bold text-secondary-700">Asset Tracking</h2>
            <p className="text-sm text-neutral-400 mt-0.5">Track company assets held by employees per department</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 justify-end">
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
        </button>
        <button onClick={() => { setEditAsset(null); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
          <Plus className="w-4 h-4" />Assign Asset
        </button>
      </div>

      {/* ── Stats ── */}
      <StatsBar stats={stats} />

      {/* ── Filters ── */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Employee, asset name or code…"
            className="pl-9 pr-4 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 w-64" />
        </div>

        {/* Employee filter */}
        <EmployeePicker value={filterEmp} onChange={emp => setFilterEmp(emp)}
          placeholder="Filter by employee…" className="w-52" />

        {/* Department filter */}
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
          <option value="all">All Departments</option>
          {sources.map(source => <option key={source.id} value={source.id}>{source.label_en}</option>)}
        </select>

        {/* Status filter */}
        <div className="flex rounded-xl overflow-hidden border border-neutral-200">
          {[['all', 'All'], ['Active', 'Active'], ['Returned', 'Returned']].map(([v, l]) => (
            <button key={v} onClick={() => setFilterStatus(v)}
              className={`px-3 py-2 text-xs font-semibold transition-all ${filterStatus === v ? 'bg-primary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              {l}
            </button>
          ))}
        </div>

        <select value={filterCondition} onChange={e => setFilterCondition(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
          <option value="all">All Conditions</option>
          <option value="Good">Good</option>
          <option value="Damaged">Damaged</option>
          <option value="Lost">Lost</option>
        </select>

        {pagination && (
          <span className="ml-auto text-xs text-neutral-400 font-medium">
            {pagination.total} record{pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Assets table ── */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
            <Package className="w-14 h-14 mb-3" />
            <p className="text-sm font-medium">No assets found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  {['Employee', 'Asset', 'Category', 'Code', 'Department', 'Received', 'Condition', 'Status', ''].map((h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left font-bold whitespace-nowrap border-r border-neutral-700 last:border-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {assets.map((a, i) => (
                  <tr key={a.id}
                    className={`border-b border-neutral-100 group transition-colors ${
                      a.status === 'Returned' ? 'bg-neutral-50 text-neutral-400' :
                      i % 2 === 0 ? 'bg-white hover:bg-primary/5' : 'bg-neutral-50/60 hover:bg-primary/5'
                    }`}>
                    {/* Employee */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                          {a.employee?.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-secondary-700 text-[11px]">{a.employee?.name}</p>
                          <p className="text-neutral-400 text-[10px]">{a.employee?.department}</p>
                        </div>
                      </div>
                    </td>
                    {/* Asset name */}
                    <td className="px-3 py-2.5 font-semibold text-secondary-700">{a.asset_name}</td>
                    {/* Category */}
                    <td className="px-3 py-2.5 text-neutral-500">{a.asset_category ?? '—'}</td>
                    {/* Code */}
                    <td className="px-3 py-2.5 font-mono text-neutral-500">{a.asset_code ?? '—'}</td>
                    {/* Department badge */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DEPT_COLORS[a.issuing_department] ?? DEPT_COLORS['Other']}`}>
                        {a.issuing_department}
                      </span>
                    </td>
                    {/* Received */}
                    <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{fmtDate(a.received_date)}</td>
                    {/* Condition */}
                    <td className={`px-3 py-2.5 font-semibold ${COND_COLORS[a.condition]}`}>{a.condition}</td>
                    {/* Status */}
                    <td className="px-3 py-2.5">
                      {a.status === 'Active'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Active
                          </span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-semibold">
                            <CheckCircle2 className="w-3 h-3" />Returned {a.return_date ? fmtDate(a.return_date) : ''}
                          </span>}
                    </td>
                    {/* Actions */}
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Run Report — direct download */}
                        <button
                          title="Run Clearance Report"
                          onClick={() => runReportDirect(a.employee)}
                          disabled={directReportId === a.employee?.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-semibold disabled:opacity-50 whitespace-nowrap">
                          {directReportId === a.employee?.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <FileDown className="w-3 h-3" />}
                          Run Report
                        </button>
                        {/* Clearance panel */}
                        <button title="View Clearance Details"
                          onClick={() => openClearance(a.employee)}
                          className="p-1 rounded hover:bg-primary/10 text-neutral-400 hover:text-primary">
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {/* Edit */}
                        <button title="Edit" onClick={() => { setEditAsset(a); setShowForm(true) }}
                          className="p-1 rounded hover:bg-amber-50 text-neutral-400 hover:text-amber-600">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {/* Mark returned */}
                        {a.status === 'Active' && (
                          <button title="Mark Returned" onClick={() => setReturnAsset(a)}
                            className="p-1 rounded hover:bg-green-50 text-neutral-400 hover:text-green-600">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {/* Delete */}
                        <button title="Delete" onClick={() => deleteAsset(a.id)}
                          className="p-1 rounded hover:bg-red-50 text-neutral-400 hover:text-red-500">
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

      {/* ── Clearance panel (slide-in) ── */}
      {clearanceEmp && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setClearanceEmp(null); setClearData(null) }} />
          <div className="relative ml-auto w-full max-w-lg bg-white shadow-2xl flex flex-col h-full overflow-hidden">
            {/* Panel header */}
            <div className="bg-secondary-700 text-white px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-bold text-base">Employee Clearance</p>
                <p className="text-sm text-white/70">{clearanceEmp.name}</p>
              </div>
              <div className="flex items-center gap-2">
                {clearanceData && (
                  <button onClick={() => printClearance(clearanceData)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold">
                    <Printer className="w-4 h-4" />Print
                  </button>
                )}
                <button onClick={runReport} disabled={reportBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 rounded-lg text-sm font-semibold">
                  {reportBusy
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <FileDown className="w-4 h-4" />}
                  Run Report
                </button>
                <button onClick={() => { setClearanceEmp(null); setClearData(null) }}
                  className="p-1.5 hover:bg-white/20 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto p-5">
              {clearanceBusy ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : !clearanceData ? (
                <p className="text-neutral-400 text-sm text-center py-10">Failed to load clearance data</p>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className={`rounded-2xl border-2 p-4 text-center ${clearanceData.active_count > 0 ? 'border-red-300 bg-red-50' : 'border-green-300 bg-green-50'}`}>
                      <p className={`text-3xl font-black ${clearanceData.active_count > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {clearanceData.active_count}
                      </p>
                      <p className="text-xs font-bold text-neutral-500 mt-1">PENDING RETURN</p>
                    </div>
                    <div className="rounded-2xl border-2 border-green-200 bg-green-50 p-4 text-center">
                      <p className="text-3xl font-black text-green-600">{clearanceData.returned_count}</p>
                      <p className="text-xs font-bold text-neutral-500 mt-1">RETURNED</p>
                    </div>
                  </div>

                  {clearanceData.active_count === 0 ? (
                    <div className="flex flex-col items-center py-10 text-green-600">
                      <CheckCircle2 className="w-16 h-16 mb-3" />
                      <p className="font-bold text-lg">All Clear!</p>
                      <p className="text-sm text-neutral-400 mt-1">No assets pending return</p>
                    </div>
                  ) : (
                    clearanceData.by_department.map(dept => (
                      <div key={dept.department} className="mb-4">
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg mb-2 ${DEPT_COLORS[dept.department] ?? DEPT_COLORS['Other']}`}>
                          <Package className="w-4 h-4" />
                          <span className="font-bold text-sm">{dept.department}</span>
                          <span className="ml-auto text-xs font-semibold">{dept.count} item{dept.count !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="space-y-2">
                          {dept.assets.map(asset => (
                            <div key={asset.id} className="flex items-center gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-200">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm text-secondary-700">{asset.asset_name}</p>
                                <p className="text-xs text-neutral-400 mt-0.5">
                                  {asset.asset_category && <span>{asset.asset_category} · </span>}
                                  {asset.asset_code && <span className="font-mono">{asset.asset_code} · </span>}
                                  <span>Received {fmtDate(asset.received_date)}</span>
                                </p>
                              </div>
                              <span className={`text-xs font-bold ${COND_COLORS[asset.condition]}`}>{asset.condition}</span>
                              <button onClick={() => { setReturnAsset(asset); setClearanceEmp(null) }}
                                className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100">
                                <RotateCcw className="w-3 h-3" />Return
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showForm && (
        <AssetForm
          initial={editAsset}
          sources={sources}
          onClose={() => { setShowForm(false); setEditAsset(null) }}
          onSaved={() => { setShowForm(false); setEditAsset(null); refresh() }}
        />
      )}
      {returnAsset && (
        <ReturnModal
          asset={returnAsset}
          onClose={() => setReturnAsset(null)}
          onSaved={() => { setReturnAsset(null); refresh() }}
        />
      )}
    </div>
  )
}

// ── Tab Wrapper ──────────────────────────────────────────────────────────────── //
const TABS = [
  { key: 'employee', label: 'Employee Assets', icon: Package  },
  { key: 'it',       label: 'IT Asset Register', icon: Monitor },
]

export default function AssetsTab() {
  const [tab, setTab] = useState('employee')
  return (
    <div className="p-6 space-y-4">
      {/* ── Shared page header + tabs — centered ── */}
      <div className="flex flex-col items-center text-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-secondary-700">Assets &amp; Clearance</h2>
          <p className="text-sm text-neutral-400 mt-0.5">
            {tab === 'employee' ? 'Track company assets held by employees per department' : 'Line 1 & GANZ IT asset inventory'}
          </p>
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all
                ${tab === t.key
                  ? 'bg-white text-secondary-700 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-700'}`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'employee' ? <EmployeeAssetsTab hideHeader={true} /> : <ITAssetsTab hideHeader={true} EmployeePicker={EmployeePicker} />}
    </div>
  )
}
