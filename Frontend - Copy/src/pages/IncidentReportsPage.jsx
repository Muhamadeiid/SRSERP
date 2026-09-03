import { useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { useSearchParams } from 'react-router-dom'
import { Camera, Download, FileWarning, Loader2, Plus, Search, X } from 'lucide-react'
import { generateIncidentReport } from '../utils/generateIncidentReport'
import { getIncidentReport, getIncidentReports, saveIncidentReport } from '../services/incidentReportService'
import { searchEmployees } from '../services/employeeService'

const inputClass = 'w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10'
const labelClass = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-500'
const emptyForm = {
  report_date: new Date().toISOString().slice(0, 10), requester_employee_id: '', classification: '',
  classification_other: '', concerned_area_department: '', description: '',
  picture_1: null, picture_2: null, needs_investigation: '', investigation_notes: '',
  follow_up_date: '', case_frequency_severity: '', warning_letter_required: '',
  warning_letter_no: '', status: 'submitted', hr_signed: false, depot_manager_signed: false,
}

function RequesterPicker({ value, onChange }) {
  const [query, setQuery] = useState(value?.name || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef()

  useEffect(() => {
    clearTimeout(timer.current)
    if (query.trim().length < 2 || query === value?.name) {
      setResults([])
      return
    }
    setLoading(true)
    timer.current = setTimeout(() => {
      searchEmployees(query.trim())
        .then(data => { setResults(Array.isArray(data) ? data : []); setOpen(true) })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
    return () => clearTimeout(timer.current)
  }, [query, value?.name])

  return <div className="relative">
    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
    <input required className={`${inputClass} pl-9 pr-9`} value={query} placeholder="Search employee name or IBS..." onChange={event => { setQuery(event.target.value); onChange(null) }} onFocus={() => results.length && setOpen(true)} />
    {loading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-neutral-400" />}
    {open && results.length > 0 && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-neutral-200 bg-white shadow-xl">
      {results.map(employee => <button type="button" key={employee.id} onClick={() => { onChange(employee); setQuery(employee.name); setOpen(false) }} className="flex w-full items-center justify-between gap-3 border-b border-neutral-100 px-3 py-2.5 text-left last:border-0 hover:bg-neutral-50">
        <span><strong className="block text-sm text-secondary">{employee.name}</strong><small className="text-neutral-500">{employee.position || 'No position'} · {employee.department || 'No department'}</small></span>
        <small className="shrink-0 font-semibold text-primary">{employee.ibs_code || ''}</small>
      </button>)}
    </div>}
  </div>
}

const statusLabel = { submitted: 'Submitted', under_investigation: 'Under Investigation', closed: 'Closed' }
const statusStyle = {
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  under_investigation: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function ReportModal({ report, canSignHr, canSignDepot, onClose, onSaved }) {
  const initialRequester = report?.requester_employee || null
  const [form, setForm] = useState(report ? {
    ...emptyForm, ...report,
    needs_investigation: report.needs_investigation === null ? '' : report.needs_investigation,
    warning_letter_required: report.warning_letter_required === null ? '' : report.warning_letter_required,
    hr_signed: Boolean(report.hr_generalist_id), depot_manager_signed: Boolean(report.depot_manager_id),
  } : emptyForm)
  const [requesterEmployee, setRequesterEmployee] = useState(initialRequester)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const submit = async e => {
    e.preventDefault(); setSaving(true); setError('')
    const payload = { ...form }
    payload.requester_employee_id = requesterEmployee?.id || form.requester_employee_id
    if (!canSignHr) {
      delete payload.classification
      delete payload.classification_other
    }
    if (!canSignHr) delete payload.hr_signed
    if (!canSignDepot) delete payload.depot_manager_signed
    try { onSaved(await saveIncidentReport(payload, report?.id)) }
    catch (err) { setError(err.response?.data?.message || 'Could not save the incident report. Please review the required fields.') }
    finally { setSaving(false) }
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 p-3" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">
        <div><h2 className="text-lg font-bold text-secondary">Management Conflict Incident Report</h2><p className="text-xs text-neutral-400">SRS-HR-P04-F01</p></div>
        <button type="button" onClick={onClose} className="rounded-md p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-4 p-5">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="grid gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3">
          <div className="sm:col-span-1"><span className={labelClass}>Requester</span>{report ? <strong className="text-sm text-secondary">{report.requester_employee?.name || report.requester?.name || 'Not selected'}</strong> : <RequesterPicker value={requesterEmployee} onChange={employee => { setRequesterEmployee(employee); set('requester_employee_id', employee?.id || '') }} />}</div>
          <div><span className={labelClass}>Date</span><strong className="text-sm text-secondary">{String(report?.report_date || form.report_date).slice(0, 10)}</strong></div>
          <div><span className={labelClass}>Signature</span><strong className="text-sm text-emerald-700">{report ? (report.requester_employee?.e_signature || report.requester?.e_signature ? 'E-Signature attached' : 'No E-Signature saved') : 'Selected employee E-Signature will be attached'}</strong></div>
        </div>
        {canSignHr && <div className="grid gap-4 md:grid-cols-2">
          <label><span className={labelClass}>Report date</span><input type="date" required className={inputClass} value={String(form.report_date || '').slice(0, 10)} onChange={e => set('report_date', e.target.value)} /></label>
          <label><span className={labelClass}>Concerned area / department</span><input maxLength="255" className={inputClass} value={form.concerned_area_department || ''} onChange={e => set('concerned_area_department', e.target.value)} /></label>
        </div>}

        {canSignHr && <fieldset className="rounded-md border border-amber-200 bg-amber-50/60 p-4">
          <legend className="px-2 text-sm font-bold text-secondary">Classification of Incident</legend>
          <div className="flex flex-wrap gap-5 text-sm">
            {[['ethical','Ethical'],['process_workflow','Process / Workflow'],['other','Other']].map(([value,label]) => <label key={value} className="flex items-center gap-2"><input type="radio" name="classification" checked={form.classification === value} onChange={() => set('classification', value)} />{label}</label>)}
          </div>
          {form.classification === 'other' && <input required className={`${inputClass} mt-3`} placeholder="Specify other classification" value={form.classification_other || ''} onChange={e => set('classification_other', e.target.value)} />}
        </fieldset>}

        <section className="overflow-hidden rounded-md border border-emerald-200">
          <h3 className="bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-secondary">(1) Description of the Incident (mention the reference and evidence)</h3>
          <div className="p-4"><textarea required rows="6" maxLength="10000" className={inputClass} value={form.description || ''} onChange={e => set('description', e.target.value)} /></div>
          {canSignHr && <div className="grid border-t border-emerald-200 md:grid-cols-2">
            {[1,2].map(slot => <label key={slot} className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 border-emerald-200 p-4 text-sm text-neutral-500 first:border-r hover:bg-neutral-50">
              <Camera className="h-5 w-5 text-primary" /><span>Picture {slot} (if needed)</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="max-w-full text-xs" onChange={e => set(`picture_${slot}`, e.target.files?.[0] || null)} />
            </label>)}
          </div>}
        </section>

        {canSignHr && <>
          <section className="overflow-hidden rounded-md border border-emerald-200">
            <h3 className="bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-secondary">(2) Investigation</h3>
            <div className="grid md:grid-cols-[280px_1fr]">
              <div className="space-y-3 bg-neutral-100 p-4 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="investigation" checked={form.needs_investigation === true} onChange={() => set('needs_investigation', true)} />Need Investigation</label>
                <label className="flex items-center gap-2"><input type="radio" name="investigation" checked={form.needs_investigation === false} onChange={() => set('needs_investigation', false)} />Doesn't Need Investigation</label>
              </div>
              <div className="p-4"><label><span className={labelClass}>Notes</span><textarea rows="4" className={inputClass} value={form.investigation_notes || ''} onChange={e => set('investigation_notes', e.target.value)} /></label></div>
            </div>
            <div className="border-t border-emerald-200 p-4"><label><span className={labelClass}>Follow-up date</span><input type="date" className={`${inputClass} max-w-xs`} value={String(form.follow_up_date || '').slice(0, 10)} onChange={e => set('follow_up_date', e.target.value)} /></label></div>
          </section>

          <section className="overflow-hidden rounded-md border border-emerald-200">
            <h3 className="bg-emerald-50 px-4 py-2 text-center text-sm font-bold text-secondary">(3) Warning Letter</h3>
            <div className="space-y-4 p-4">
              <label><span className={labelClass}>Frequency / severity of the case</span><input className={inputClass} value={form.case_frequency_severity || ''} onChange={e => set('case_frequency_severity', e.target.value)} /></label>
              <div className="flex flex-wrap gap-5 text-sm">
                <label className="flex items-center gap-2"><input type="radio" name="warning" checked={form.warning_letter_required === false} onChange={() => set('warning_letter_required', false)} />No need for Warning Letter</label>
                <label className="flex items-center gap-2"><input type="radio" name="warning" checked={form.warning_letter_required === true} onChange={() => set('warning_letter_required', true)} />Warning Letter</label>
              </div>
              {form.warning_letter_required === true && <input required className={`${inputClass} max-w-sm`} placeholder="Warning Letter No." value={form.warning_letter_no || ''} onChange={e => set('warning_letter_no', e.target.value)} />}
              <div className="grid gap-3 sm:grid-cols-3">
                <label><span className={labelClass}>Status</span><select className={inputClass} value={form.status} onChange={e => set('status', e.target.value)}><option value="submitted">Submitted</option><option value="under_investigation">Under Investigation</option><option value="closed">Closed</option></select></label>
                {canSignHr && <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.hr_signed} onChange={e => set('hr_signed', e.target.checked)} />HR Generalist signature</label>}
                {canSignDepot && <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.depot_manager_signed} onChange={e => set('depot_manager_signed', e.target.checked)} />Depot Manager signature</label>}
              </div>
            </div>
          </section>
        </>}
        {canSignDepot && !canSignHr && report && <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4"><label className="flex items-center gap-2 text-sm font-semibold text-secondary"><input type="checkbox" checked={form.depot_manager_signed} onChange={e => set('depot_manager_signed', e.target.checked)} />Add my Depot Manager E-Signature</label></section>}
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-neutral-200 bg-white px-5 py-4"><button type="button" onClick={onClose} className="rounded-md border border-neutral-200 px-4 py-2 text-sm font-semibold">Cancel</button><button disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save Report</button></div>
    </form>
  </div>
}

export default function IncidentReportsPage() {
  const user = useSelector(state => state.auth.user)
  const reviewer = ['admin','depot_manager','hr'].includes(String(user?.role || '').toLowerCase())
  const canSignHr = ['admin','hr'].includes(String(user?.role || '').toLowerCase())
  const canSignDepot = ['admin','depot_manager'].includes(String(user?.role || '').toLowerCase())
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [editing, setEditing] = useState(undefined)
  const [searchParams, setSearchParams] = useSearchParams()

  const load = () => { setLoading(true); getIncidentReports({ per_page: 100 }).then(r => setReports(r.data || [])).finally(() => setLoading(false)) }
  useEffect(load, [])
  useEffect(() => {
    const id = Number(searchParams.get('report'))
    if (!id) return
    getIncidentReport(id)
      .then(setEditing)
      .catch(() => {})
      .finally(() => setSearchParams({}, { replace: true }))
  }, [searchParams, setSearchParams])
  const shown = useMemo(() => reports.filter(r => (status === 'all' || r.status === status) && `${r.report_no} ${r.requester_employee?.name || r.requester?.name} ${r.concerned_area_department} ${r.description}`.toLowerCase().includes(search.toLowerCase())), [reports, search, status])
  const summary = useMemo(() => ({
    total: reports.length,
    submitted: reports.filter(r => r.status === 'submitted').length,
    under_investigation: reports.filter(r => r.status === 'under_investigation').length,
    closed: reports.filter(r => r.status === 'closed').length,
  }), [reports])
  const openReport = async report => setEditing(await getIncidentReport(report.id))
  const downloadReport = async report => generateIncidentReport(await getIncidentReport(report.id))

  return <div className="min-h-full bg-neutral-50 p-4 lg:p-6">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-secondary"><FileWarning className="h-6 w-6 text-primary" />Incident Reports</h1><p className="text-sm text-neutral-500">Management conflict incident records</p></div><button onClick={() => setEditing(null)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-bold text-white"><Plus className="h-4 w-4" />New Report</button></div>
    {reviewer && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[
        ['Total Reports', summary.total, 'border-neutral-200 bg-white text-secondary'],
        ['Submitted', summary.submitted, 'border-amber-200 bg-amber-50 text-amber-700'],
        ['Under Investigation', summary.under_investigation, 'border-blue-200 bg-blue-50 text-blue-700'],
        ['Closed', summary.closed, 'border-emerald-200 bg-emerald-50 text-emerald-700'],
      ].map(([label, value, style]) => <button type="button" key={label} onClick={() => setStatus(label === 'Total Reports' ? 'all' : label.toLowerCase().replace(' ', '_'))} className={`rounded-lg border p-4 text-left ${style}`}><strong className="block text-2xl">{value}</strong><span className="text-xs font-semibold">{label}</span></button>)}
    </div>}
    <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <label className="relative min-w-64 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" /><input className={`${inputClass} pl-9`} placeholder="Search reports..." value={search} onChange={e => setSearch(e.target.value)} /></label>
      <select className={`${inputClass} w-52`} value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="under_investigation">Under Investigation</option><option value="closed">Closed</option></select>
    </div>
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-secondary text-white"><tr>{['Report No.','Date','Requester','Area / Department','Classification','Status','Actions'].map(h => <th key={h} className="px-4 py-3 text-left text-xs font-bold uppercase">{h}</th>)}</tr></thead><tbody>
        {loading ? <tr><td colSpan="7" className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></td></tr> : shown.length === 0 ? <tr><td colSpan="7" className="py-16 text-center text-neutral-400">No incident reports found</td></tr> : shown.map(report => <tr key={report.id} className="border-t border-neutral-100 hover:bg-neutral-50"><td className="px-4 py-3 font-bold text-primary">{report.report_no}</td><td className="px-4 py-3">{String(report.report_date).slice(0,10)}</td><td className="px-4 py-3 font-semibold">{report.requester_employee?.name || report.requester?.name}</td><td className="px-4 py-3">{report.concerned_area_department}</td><td className="px-4 py-3 capitalize">{report.classification.replace('_',' / ')}</td><td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle[report.status]}`}>{statusLabel[report.status]}</span></td><td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => openReport(report)} className="rounded-md border border-neutral-200 px-3 py-1.5 font-semibold hover:bg-neutral-100">Open</button><button onClick={() => downloadReport(report)} title="Download Word" className="rounded-md border border-blue-200 p-2 text-blue-700 hover:bg-blue-50"><Download className="h-4 w-4" /></button></div></td></tr>)}
      </tbody></table></div>
    </div>
    {editing !== undefined && <ReportModal report={editing} canSignHr={canSignHr} canSignDepot={canSignDepot} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); load() }} />}
  </div>
}
