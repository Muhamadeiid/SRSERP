import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Download,
  Edit3,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { disciplinaryService } from '../../services/disciplinaryService'
import { searchEmployees } from '../../services/employeeService'
import { useLookups } from '../../hooks/useLookups'

const ACTIONS = [
  ['verbal_warning', 'Verbal Warning'],
  ['written_warning', 'Written Warning'],
  ['final_warning', 'Final Warning'],
  ['deduction', 'Deduction'],
  ['suspension', 'Suspension'],
  ['termination_recommendation', 'Termination Recommendation'],
]

const STATUSES = [
  ['draft', 'Draft'],
  ['submitted', 'Submitted'],
  ['approved', 'Approved'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
]

const FALLBACK_VIOLATIONS = [
  { key: 'attendance_delay', label_en: 'Repeated Late Attendance' },
  { key: 'absence_without_permission', label_en: 'Absence Without Permission' },
  { key: 'safety_violation', label_en: 'Safety Violation' },
  { key: 'misconduct', label_en: 'Misconduct' },
  { key: 'asset_damage', label_en: 'Asset Damage / Loss' },
  { key: 'refusal_of_instruction', label_en: 'Refusal of Instruction' },
]

const emptyForm = (violationType = 'attendance_delay') => ({
  employee_id: '',
  employee: null,
  violation_type: violationType,
  incident_date: new Date().toISOString().slice(0, 10),
  location: '',
  reported_by: '',
  witnesses: '',
  description: '',
  employee_statement: '',
  action_taken: 'written_warning',
  action_date: new Date().toISOString().slice(0, 10),
  status: 'approved',
  hr_notes: '',
})

const fmtDate = (value) => value ? String(value).slice(0, 10) : '-'
const formDate = (value) => value ? String(value).slice(0, 10) : ''
const labelFrom = (items, key) => items.find(item => item.key === key)?.label_en ?? key
const actionLabel = (key) => ACTIONS.find(([value]) => value === key)?.[1] ?? key
const statusCls = (status) => ({
  approved: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-blue-50 text-blue-700 border-blue-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  draft: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
}[status] ?? 'bg-neutral-100 text-neutral-600 border-neutral-200')

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function downloadWord(caseItem, violations) {
  const emp = caseItem.employee ?? {}
  const title = `Disciplinary_Case_${emp.name ?? caseItem.employee_id}_${caseItem.id}.doc`
  const rows = [
    ['Employee Name', emp.name],
    ['IBS Code', emp.ibs_code],
    ['Position', emp.position],
    ['Department', emp.department],
    ['Location', caseItem.location || emp.work_location],
    ['Incident Date', fmtDate(caseItem.incident_date)],
    ['Violation Type', labelFrom(violations, caseItem.violation_type)],
    ['Occurrence No.', caseItem.occurrence_no],
    ['Action Taken', actionLabel(caseItem.action_taken)],
    ['Action Date', fmtDate(caseItem.action_date)],
    ['Status', caseItem.status],
    ['Reported By', caseItem.reported_by],
    ['Witnesses', caseItem.witnesses],
  ]
  const html = `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; font-size: 11pt; color: #111827; }
        h1 { text-align: center; font-size: 18pt; margin: 0 0 18px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        td { border: 1px solid #111827; padding: 7px; vertical-align: top; }
        .label { width: 28%; background: #e5e7eb; font-weight: bold; }
        .section { background: #1f2937; color: white; font-weight: bold; text-align: center; }
        .sign td { height: 56px; }
        .footer { font-size: 9pt; margin-top: 18px; }
      </style>
    </head>
    <body>
      <h1>SRS Disciplinary Action Form</h1>
      <table>
        ${rows.map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td>${escapeHtml(value || '-')}</td></tr>`).join('')}
      </table>
      <table>
        <tr><td class="section">Incident Description</td></tr>
        <tr><td>${escapeHtml(caseItem.description)}</td></tr>
        <tr><td class="section">Employee Statement</td></tr>
        <tr><td>${escapeHtml(caseItem.employee_statement || '-')}</td></tr>
        <tr><td class="section">HR Notes / Decision</td></tr>
        <tr><td>${escapeHtml(caseItem.hr_notes || '-')}</td></tr>
      </table>
      <table class="sign">
        <tr>
          <td><b>Employee Signature</b></td>
          <td><b>Direct Manager Signature</b></td>
          <td><b>HR Signature</b></td>
        </tr>
        <tr><td></td><td></td><td></td></tr>
      </table>
      <div class="footer">SRS-HR-DIS-01 Rev.01</div>
    </body>
    </html>
  `
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = title.replace(/[\\/:*?"<>|]/g, '_')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function EmployeePicker({ value, onChange }) {
  const [q, setQ] = useState(value?.name ?? '')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!q || q.trim().length < 2 || value?.name === q) {
      setResults([])
      return
    }
    setBusy(true)
    timer.current = setTimeout(() => {
      searchEmployees(q.trim())
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setBusy(false))
    }, 300)
    return () => clearTimeout(timer.current)
  }, [q, value?.name])

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); onChange(null) }}
          placeholder="Search employee..."
          className="w-full pl-9 pr-9 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary"
        />
        {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {results.map(emp => (
            <button
              key={emp.id}
              type="button"
              onClick={() => { onChange(emp); setQ(emp.name); setResults([]) }}
              className="w-full text-left px-3 py-2.5 hover:bg-primary-50 border-b border-neutral-50 last:border-0"
            >
              <p className="text-sm font-semibold text-secondary-700">{emp.name}</p>
              <p className="text-xs text-neutral-400">{emp.ibs_code ?? '-'} - {emp.position ?? '-'}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CaseForm({ initial, violations, onClose, onSave, saving, error }) {
  const [form, setForm] = useState(() => initial
    ? { ...initial, employee: initial.employee, employee_id: initial.employee_id, incident_date: formDate(initial.incident_date), action_date: formDate(initial.action_date) }
    : emptyForm(violations[0]?.key ?? 'attendance_delay')
  )
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = (e) => {
    e.preventDefault()
    const payload = { ...form }
    delete payload.employee
    onSave(payload)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form onSubmit={submit} className="relative w-full max-w-3xl max-h-[92vh] bg-white rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-secondary-700">{initial ? 'Edit Disciplinary Case' : 'New Disciplinary Case'}</h3>
            <p className="text-xs text-neutral-400">Occurrence number is calculated automatically.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {error && <div className="px-3 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">{error}</div>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Employee</label>
              <EmployeePicker value={form.employee} onChange={emp => setForm(prev => ({ ...prev, employee: emp, employee_id: emp?.id ?? '' }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Incident Date</label>
              <input type="date" required value={form.incident_date} onChange={e => set('incident_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Violation Type</label>
              <select required value={form.violation_type} onChange={e => set('violation_type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white">
                {violations.map(v => <option key={v.key} value={v.key}>{v.label_en}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Action</label>
              <select required value={form.action_taken} onChange={e => set('action_taken', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white">
                {ACTIONS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Status</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white">
                {STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Location</label>
              <input value={form.location ?? ''} onChange={e => set('location', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Reported By</label>
              <input value={form.reported_by ?? ''} onChange={e => set('reported_by', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary" />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Action Date</label>
              <input type="date" value={form.action_date ?? ''} onChange={e => set('action_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Witnesses</label>
            <input value={form.witnesses ?? ''} onChange={e => set('witnesses', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Incident Description</label>
            <textarea required value={form.description ?? ''} onChange={e => set('description', e.target.value)} rows={4}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary resize-none" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Employee Statement</label>
              <textarea value={form.employee_statement ?? ''} onChange={e => set('employee_statement', e.target.value)} rows={4}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary resize-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">HR Notes</label>
              <textarea value={form.hr_notes ?? ''} onChange={e => set('hr_notes', e.target.value)} rows={4}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary resize-none" />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-neutral-100 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold rounded-xl border border-neutral-200 text-neutral-500 hover:bg-neutral-50">Cancel</button>
          <button disabled={saving || !form.employee_id} className="px-4 py-2 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 disabled:opacity-40">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Case'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function DisciplinaryTab() {
  const { disciplinaryViolations } = useLookups()
  const violations = disciplinaryViolations.length ? disciplinaryViolations : FALLBACK_VIOLATIONS
  const [cases, setCases] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [violation, setViolation] = useState('all')
  const [pagination, setPagination] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editCase, setEditCase] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const timer = useRef(null)

  const loadCases = useCallback(async (params = {}) => {
    setLoading(true)
    try {
      const res = await disciplinaryService.list({
        search: params.search ?? search,
        status: params.status ?? status,
        violation_type: params.violation_type ?? violation,
        per_page: 25,
      })
      setCases(res.data ?? [])
      setPagination(res.pagination ?? null)
    } catch {
      setCases([])
    } finally {
      setLoading(false)
    }
  }, [search, status, violation])

  const loadStats = async () => {
    try { setStats(await disciplinaryService.stats()) } catch {}
  }

  useEffect(() => { loadCases(); loadStats() }, [status, violation])
  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => loadCases({ search }), 400)
    return () => clearTimeout(timer.current)
  }, [search])

  const refresh = () => { loadCases(); loadStats() }
  const openNew = () => { setEditCase(null); setError(null); setFormOpen(true) }
  const openEdit = (item) => { setEditCase(item); setError(null); setFormOpen(true) }

  const saveCase = async (payload) => {
    setSaving(true)
    setError(null)
    try {
      if (editCase) await disciplinaryService.update(editCase.id, payload)
      else await disciplinaryService.create(payload)
      setFormOpen(false)
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const removeCase = async (item) => {
    if (!window.confirm('Delete this disciplinary case?')) return
    await disciplinaryService.remove(item.id)
    refresh()
  }

  const statItems = [
    ['Total Cases', stats?.total ?? 0, 'text-secondary-700'],
    ['Approved', stats?.approved ?? 0, 'text-green-600'],
    ['Open', stats?.open ?? 0, 'text-amber-600'],
    ['Warning Letters', stats?.warnings ?? 0, 'text-red-600'],
    ['Repeat Cases', stats?.repeat_cases ?? 0, 'text-purple-600'],
  ]

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-secondary-700">Disciplinary</h2>
          <p className="text-sm text-neutral-400 mt-0.5">Case register, warning history, and disciplinary forms</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refresh} disabled={loading} className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90">
            <Plus className="w-4 h-4" />Add Case
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {statItems.map(([label, value, color]) => (
          <div key={label} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 text-center">
            <p className={`text-2xl font-black ${color}`}>{value}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search employee or case..."
            className="pl-9 pr-4 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 w-64" />
        </div>
        <select value={violation} onChange={e => setViolation(e.target.value)}
          className="px-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60 bg-white">
          <option value="all">All Violations</option>
          {violations.map(v => <option key={v.key} value={v.key}>{v.label_en}</option>)}
        </select>
        <div className="flex rounded-xl overflow-hidden border border-neutral-200">
          {['all', 'draft', 'submitted', 'approved', 'closed', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-2 text-xs font-semibold transition-all ${status === s ? 'bg-secondary text-white' : 'bg-white text-neutral-500 hover:bg-neutral-50'}`}>
              {s === 'all' ? 'All' : s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        {pagination && <span className="ml-auto text-xs text-neutral-400 font-medium">{pagination.total} case{pagination.total === 1 ? '' : 's'}</span>}
      </div>

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : cases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-neutral-300">
            <AlertTriangle className="w-14 h-14 mb-3" />
            <p className="text-sm font-medium">No disciplinary cases found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-neutral-800 text-white">
                  {['Employee', 'Incident', 'Violation', 'Occurrence', 'Action', 'Status', 'Warnings', ''].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left font-bold whitespace-nowrap border-r border-neutral-700 last:border-0">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cases.map((item, idx) => (
                  <tr key={item.id} className={`border-b border-neutral-100 ${idx % 2 ? 'bg-neutral-50/60' : 'bg-white'} hover:bg-primary/5`}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-secondary-700">{item.employee?.name ?? '-'}</p>
                      <p className="text-[10px] text-neutral-400">{item.employee?.ibs_code ?? '-'} - {item.employee?.position ?? '-'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{fmtDate(item.incident_date)}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-secondary-700">{labelFrom(violations, item.violation_type)}</p>
                      {item.location && <p className="text-[10px] text-neutral-400">{item.location}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-purple-200 bg-purple-50 text-purple-700 font-bold">
                        #{item.occurrence_no}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600">{actionLabel(item.action_taken)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusCls(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-bold text-secondary-700">{item.employee?.no_warning_letters ?? 0}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button title="Word form" onClick={() => downloadWord(item, violations)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600">
                          <Download className="w-4 h-4" />
                        </button>
                        <button title="Edit" onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500">
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button title="Delete" onClick={() => removeCase(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                          <Trash2 className="w-4 h-4" />
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

      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-secondary-700 mb-2">
          <FileText className="w-4 h-4 text-primary" />
          Employee warning count
        </div>
        <p className="text-xs text-neutral-500">
          Warning Letters are calculated from approved Written Warning and Final Warning cases. Repeated occurrence is calculated per employee and violation type.
        </p>
      </div>

      {formOpen && (
        <CaseForm
          initial={editCase}
          violations={violations}
          saving={saving}
          error={error}
          onClose={() => setFormOpen(false)}
          onSave={saveCase}
        />
      )}
    </div>
  )
}
