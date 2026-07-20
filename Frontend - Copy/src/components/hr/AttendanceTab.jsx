import { useState, useEffect, useRef } from 'react'
import { attendanceService } from '../../services/Attendanceservice'
import { getEmployees } from '../../services/employeeService'
import { getLeaveBalance } from '../../services/leaveService'
import { getSettings } from '../../services/settingsService'
import { useLookups } from '../../hooks/useLookups'
import {
  Search, Upload, Download, RefreshCw, Printer,
  Loader2, X, Pencil, Plus, CalendarDays
} from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const pad = n => String(n).padStart(2, '0')
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ATTENDANCE_POLICY_DEFAULTS = {
  attendance_regular_start_time: '08:00',
  attendance_regular_ot_start_time: '17:00',
  attendance_night_ot_start_time: '19:00',
  attendance_regular_expected_hours: 9,
  attendance_intervention_expected_hours: 9,
  attendance_regular_weekly_off_day: 5,
  attendance_saturday_rotation_enabled: '1',
  attendance_group_a_off_even_week: '1',
  attendance_absent_deduction_minutes: 540,
}

// "02-Mar-26"
const fmtDate = ds => {
  if (!ds) return '—'
  const [y, m, d] = ds.split('-')
  return `${d}-${MON[parseInt(m)-1]}-${String(y).slice(2)}`
}

// decimal hours → "H:MM"
const decToHHMM = h => {
  if (h == null || h === '') return ''
  const total = Math.round(Number(h) * 60)
  if (total <= 0) return '0:00'
  return `${Math.floor(total / 60)}:${pad(total % 60)}`
}

// "07:57:00" → "7:57 AM"
const fmt12 = t => {
  if (!t) return ''
  const [hh, mm] = String(t).split(':')
  const h = parseInt(hh), m = parseInt(mm)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 || 12
  return `${h12}:${pad(m)} ${ampm}`
}

// minutes since midnight from "HH:MM:SS"
const toMin = t => {
  if (!t) return null
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + m
}

// calc OT start / end / rates
// Regular employees: OT starts at 17:00 (fixed), night boundary at 19:00
// Intervention employees: OT starts after expected shift (check_in + 9h), same night boundary
const policyNumber = (policy, key) => Number(policy?.[key] ?? ATTENDANCE_POLICY_DEFAULTS[key])
const policyBool = (policy, key) => ['1', 'true', 'yes', 'on'].includes(String(policy?.[key] ?? ATTENDANCE_POLICY_DEFAULTS[key]).toLowerCase())
const attendancePolicyTime = (policy, key) => {
  const value = String(policy?.[key] ?? ATTENDANCE_POLICY_DEFAULTS[key])
  return value.length === 5 ? `${value}:00` : value
}
const policyTimeMin = (policy, key) => toMin(attendancePolicyTime(policy, key))
const isLateCheckIn = (time, policy = ATTENDANCE_POLICY_DEFAULTS) => {
  const checkInMinutes = toMin(time)
  return checkInMinutes != null && checkInMinutes > policyTimeMin(policy, 'attendance_regular_start_time')
}
const isInterventionEmployee = (employee) => {
  const department = String(employee?.department ?? '').toLowerCase()
  const label = String(employee?.department_label ?? '').toLowerCase()
  return ['intervention', 'cm_intervention'].includes(department) || label.includes('intervention')
}
const hasWeeklyOffDay = (employee) =>
  employee?.weekly_off_day !== null && employee?.weekly_off_day !== undefined && employee?.weekly_off_day !== ''
const weeklyOffLabel = (employee) => hasWeeklyOffDay(employee)
  ? DAYS[Number(employee.weekly_off_day)]
  : 'Not set'

// OT is only counted when there's an approved OTR on that date.
// Ignores attendance clock-out — a manager-approved OTR is required.
const otTimes = (otr, policy = ATTENDANCE_POLICY_DEFAULTS) => {
  if (!otr || !otr.start_time || !otr.end_time) return null
  const startMin = toMin(otr.start_time)
  const endMin   = toMin(otr.end_time)
  if (endMin <= startMin) return null

  const fmt        = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
  const nightStart = policyTimeMin(policy, 'attendance_night_ot_start_time')
  const dayMins    = Math.max(0, Math.min(endMin, nightStart) - startMin)
  const nightMins  = Math.max(0, endMin - Math.max(startMin, nightStart))
  const dayRate    = Math.round(dayMins / 60)
  const nightRate  = Math.round(nightMins / 60)
  return {
    start: fmt(startMin),
    end:   fmt(endMin),
    dayRate,
    nightRate,
    total: dayRate + nightRate,
  }
}

// Match approved OTR for a specific employee & date
function otrOnDate(otrs, employeeId, dateStr) {
  if (!Array.isArray(otrs) || !employeeId) return null
  return otrs.find(o => o.employee_id === employeeId && (o.ot_date?.slice(0,10) === dateStr)) ?? null
}

// Match public holiday for date — supports multi-day holidays via optional end_date
function holidayOnDate(holidays, dateStr) {
  if (!Array.isArray(holidays)) return null
  return holidays.find(h => {
    const s = h.date?.slice(0,10) ?? ''
    const e = (h.end_date?.slice(0,10)) || s
    return dateStr >= s && dateStr <= e
  }) ?? null
}

// Parse a leave's early_from / early_to permission window (returns null if not set)
function earlyPermissionWindow(leave) {
  if (!leave?.early_from || !leave?.early_to) return null
  return { from: leave.early_from, to: leave.early_to }
}

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}
const monthStart = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`
}
const monthEnd = () => {
  const d = new Date()
  const last = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate()
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(last)}`
}

const STATUS_CFG = {
  present:      { label: 'Present',      cls: 'bg-green-50 text-green-700 border-green-200' },
  late:         { label: 'Late',         cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  shortage:     { label: 'Shortage',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  absent:       { label: 'Absent',       cls: 'bg-red-50 text-red-600 border-red-200' },
  incomplete:   { label: 'Incomplete',   cls: 'bg-neutral-100 text-neutral-500 border-neutral-200' },
  wfh:          { label: 'WFH',          cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  intervention: { label: 'Intervention', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}
const STATUS_OPTIONS = ['present','late','shortage','absent','incomplete','wfh','intervention']

// ── schedule helpers ───────────────────────────────────────────────────────
// Returns true if the given date is a working day for the employee
function isWorkingDay(employee, dateObj, policy = ATTENDANCE_POLICY_DEFAULTS) {
  if (!employee) return true
  const dow = dateObj.getDay() // 0=Sun…6=Sat
  const isIntervention = isInterventionEmployee(employee)

  if (isIntervention) {
    if (!hasWeeklyOffDay(employee)) return true
    return dow !== Number(employee.weekly_off_day)
  }

  // Regular employees
  if (dow === policyNumber(policy, 'attendance_regular_weekly_off_day')) return false

  if (dow === 6 && policyBool(policy, 'attendance_saturday_rotation_enabled')) {
    // ISO week number
    const d = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const isoWeek = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
    const evenWeek = isoWeek % 2 === 0
    const groupAOffEvenWeek = policyBool(policy, 'attendance_group_a_off_even_week')
    if (employee.saturday_group === 'A') return !(evenWeek === groupAOffEvenWeek)
    if (employee.saturday_group === 'B') return  (evenWeek === groupAOffEvenWeek)
    return false // no group → off
  }

  return true // Sun–Thu always work
}

function dayOffLabel(employee, dow, policy = ATTENDANCE_POLICY_DEFAULTS) {
  if (!employee) return 'Day Off'
  const isIntervention = isInterventionEmployee(employee)
  if (isIntervention && hasWeeklyOffDay(employee) && dow === Number(employee.weekly_off_day)) return `${DAYS[dow]} Off`
  if (!isIntervention && dow === policyNumber(policy, 'attendance_regular_weekly_off_day')) return `${DAYS[dow]} Off`
  if (!isIntervention && dow === 6) return 'Weekend'
  return 'Day Off'
}

// ── build rows array from date range + records ─────────────────────────────
// Returns leave info if employee is on approved leave on a given date
function leaveOnDate(leaves, employeeId, dateStr) {
  if (!Array.isArray(leaves) || !employeeId) return null
  return leaves.find(l =>
    l.employee_id === employeeId &&
    dateStr >= (l.start_date?.slice(0,10) ?? '') &&
    dateStr <= (l.end_date?.slice(0,10) ?? l.start_date?.slice(0,10) ?? '')
  ) ?? null
}

function buildRows(startDate, endDate, records, employee, leaves = [], otrs = [], holidays = [], policy = ATTENDANCE_POLICY_DEFAULTS) {
  if (!startDate || !endDate) return []
  const rows = []
  const cur  = new Date(startDate + 'T00:00:00')
  const end  = new Date(endDate   + 'T00:00:00')
  while (cur <= end) {
    const y   = cur.getFullYear(), m = cur.getMonth()+1, d = cur.getDate()
    const dow = cur.getDay()
    const dateStr   = `${y}-${pad(m)}-${pad(d)}`
    const isDayOff  = !isWorkingDay(employee, new Date(cur), policy)
    rows.push({
      day: d, dayName: DAYS[dow], dateStr,
      isWeekend: isDayOff,        // reuse isWeekend flag for any day-off
      dayOffLabel: dayOffLabel(employee, dow, policy),
      record:  records.find(r => r.date?.slice(0,10) === dateStr) ?? null,
      leave:   leaveOnDate(leaves, employee?.id, dateStr),
      otr:     otrOnDate(otrs, employee?.id, dateStr),
      holiday: holidayOnDate(holidays, dateStr),
    })
    cur.setDate(cur.getDate() + 1)
  }
  return rows
}

// ── employee autocomplete ──────────────────────────────────────────────────
function EmployeeSearch({ onSelect }) {
  const [q, setQ]           = useState('')
  const [results, setRes]   = useState([])
  const [open, setOpen]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const [chosen, setChosen] = useState(null)
  const ref        = useRef()
  const timerRef   = useRef(null)   // debounce timer
  const abortRef   = useRef(null)   // abort previous in-flight request

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Debounced search — fires 350 ms after the user stops typing
  useEffect(() => {
    clearTimeout(timerRef.current)
    if (!q || q.trim().length < 2) { setRes([]); setBusy(false); return }

    setBusy(true)
    timerRef.current = setTimeout(() => {
      // Cancel any previous pending request
      if (abortRef.current) abortRef.current.abort()
      abortRef.current = new AbortController()

      getEmployees({ search: q.trim(), per_page: 10 })
        .then(r => { setRes(Array.isArray(r) ? r : (r.data ?? [])); setOpen(true) })
        .catch(() => setRes([]))
        .finally(() => setBusy(false))
    }, 350)

    return () => clearTimeout(timerRef.current)
  }, [q])

  const select = emp => { setChosen(emp); setQ(emp.name); setOpen(false); onSelect(emp) }
  const clear  = ()  => { setChosen(null); setQ(''); setRes([]); setBusy(false); onSelect(null) }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
        <input value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); if (!e.target.value) clear() }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search employee…"
          className="w-64 pl-9 pr-8 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
        />
        {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
        {chosen && !busy && (
          <button onClick={clear} className="absolute right-2 top-2 p-0.5 rounded text-neutral-400 hover:text-neutral-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[90] w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-2xl max-h-64 overflow-y-auto">
          {results.map(emp => (
            <button key={emp.id} type="button" onClick={() => select(emp)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary-50 text-left border-b border-neutral-50 last:border-0">
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

// ── upload modal ───────────────────────────────────────────────────────────
function UploadModal({ onClose, onSuccess }) {
  const [tab, setTab]   = useState('biometric')
  const [file, setFile] = useState(null)
  const [filePreview, setFilePreview] = useState({ records: 0, punchCodes: 0 })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState(null)

  const upload = async () => {
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const res = tab === 'biometric'
        ? await attendanceService.uploadBiometric(file)
        : await attendanceService.uploadExcel(file)

      const candidates = [res?.data, res]
      const d = candidates.find(value => value && typeof value === 'object' &&
        ['imported', 'processed', 'file_records', 'employees_count'].some(key => Object.prototype.hasOwnProperty.call(value, key))) || {}
      const imported = Number(d.imported ?? 0)
      const fileRecords = Number(d.file_records ?? (filePreview.records || imported))
      const employeesCount = Number(d.employees_count ?? d.matched_employees ?? d.punch_codes_count ?? filePreview.punchCodes ?? 0)
      const matched  = Number(d.processed ?? d.attendance_records ?? employeesCount)
      const dates    = d.dates ?? []
      const errs     = d.errors ?? []

      // Build a detailed result message
      let text, warn = false
      if (tab === 'biometric') {
        if (employeesCount === 0 && fileRecords > 0) {
          text = `${fileRecords} punch records read — but 0 employees matched. Make sure employees have correct Punch Codes set.`
          warn = true
        } else {
          text = `${employeesCount} employee${employeesCount !== 1 ? 's' : ''} matched · ${matched} attendance record${matched !== 1 ? 's' : ''} updated · ${fileRecords} punches read`
          if (imported !== fileRecords) text += ` (${imported} new)`
          if (dates.length) text += ` (${dates.join(', ')})`
        }
      } else {
        text = `${matched} record${matched !== 1 ? 's' : ''} processed`
        if (errs.length) text += ` · ${errs.length} skipped`
        if (dates.length) text += ` (${dates.join(', ')})`
      }

      setMsg({ ok: !warn, warn, text })
      setTimeout(() => onSuccess(res), warn ? 3000 : 1500)
    } catch (e) {
      setMsg({ ok: false, text: e?.response?.data?.message || 'Upload failed — is the server running?' })
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-secondary-700">Upload Attendance Data</p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          {[['biometric','Biometric (.dat)'],['excel','Excel Sheet (.xlsx)']].map(([k,l]) => (
            <button key={k} onClick={() => { setTab(k); setFile(null); setMsg(null) }}
              className={`flex-1 py-2 text-sm rounded-lg font-medium transition-all ${tab===k?'bg-primary text-white':'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
              {l}
            </button>
          ))}
        </div>
        {tab === 'excel' && (
          <div className="mb-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700 border border-blue-100">
            <p className="font-bold mb-1">Excel format (columns):</p>
            <p>A: IBS Code &nbsp;|&nbsp; B: Date (YYYY-MM-DD) &nbsp;|&nbsp; C: Check In (HH:MM) &nbsp;|&nbsp; D: Check Out (HH:MM)</p>
            <p className="mt-1 text-blue-500">First row = header (skipped)</p>
          </div>
        )}
        <label className="block border-2 border-dashed border-neutral-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary/40 transition-colors">
          <input type="file" accept={tab==='biometric'?'.dat,.txt':'.xlsx,.xls,.csv'} className="sr-only"
            onChange={async e => {
              const selected = e.target.files[0]
              setFile(selected); setMsg(null); setFilePreview({ records: 0, punchCodes: 0 })
              if (tab === 'biometric' && selected) {
                try {
                  const lines = (await selected.text()).split(/\r?\n/)
                  const codes = new Set()
                  let records = 0
                  lines.forEach(line => {
                    const parts = line.trim().split(/\s+/)
                    if (parts.length < 6 || !/^\d+$/.test(parts[0])) return
                    records += 1
                    codes.add(String(Number(parts[0])))
                  })
                  setFilePreview({ records, punchCodes: codes.size })
                } catch { /* The server result remains authoritative. */ }
              }
            }} />
          {file
            ? <p className="text-sm font-semibold text-secondary-700">{file.name}</p>
            : <><Upload className="w-8 h-8 text-neutral-300 mx-auto mb-2" />
               <p className="text-sm text-neutral-400">Click to choose file</p></>}
        </label>
        {msg && (
          <p className={`mt-3 text-sm text-center font-medium ${msg.warn ? 'text-amber-600' : msg.ok ? 'text-green-600' : 'text-red-500'}`}>
            {msg.text}
          </p>
        )}
        <button onClick={upload} disabled={!file||busy}
          className="mt-4 w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
          {busy ? <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</> : 'Upload'}
        </button>
      </div>
    </div>
  )
}

// ── edit / add manual record modal ─────────────────────────────────────────
function EditModal({ row, employee, onClose, onSaved }) {
  const { departments } = useLookups()
  const deptLabel = (key) => (departments || []).find(d => d.key === key)?.label_en ?? key ?? ''
  const existing = row.record
  const [form, setForm] = useState({
    check_in:  existing?.check_in  ? String(existing.check_in).slice(0,5)  : '',
    check_out: existing?.check_out ? String(existing.check_out).slice(0,5) : '',
    status:    existing?.status ?? 'present',
    notes:     existing?.notes  ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [err,  setErr]  = useState(null)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      let work_hours = 0, late_minutes = 0, overtime_hours = 0
      if (form.check_in && form.check_out) {
        const [ih, im] = form.check_in.split(':').map(Number)
        const [oh, om] = form.check_out.split(':').map(Number)
        const inMin  = ih*60+im, outMin = oh*60+om
        const workMin = outMin - inMin
        work_hours     = workMin > 0 ? Math.round(workMin/60*100)/100 : 0
        late_minutes   = Math.max(0, inMin - 480)
        overtime_hours = Math.max(0, Math.round((work_hours-9)*2)/2)
      }
      await attendanceService.createManual({
        employee_id: employee.id, date: row.dateStr,
        check_in:  form.check_in  || null,
        check_out: form.check_out || null,
        work_hours, expected_hours: 9, late_minutes, overtime_hours,
        status: form.status, notes: form.notes || null, is_manual: true,
      })
      onSaved()
    } catch (e) {
      const errs = e?.response?.data?.errors
      setErr(errs ? Object.values(errs).flat().join(' · ') : (e?.response?.data?.message || 'Save failed'))
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-bold text-secondary-700">{existing ? 'Edit Record' : 'Add Manual Entry'}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{fmtDate(row.dateStr)} — {row.dayName}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3">
          <div className="px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs font-bold text-primary">{employee.name}</p>
            <p className="text-[10px] text-neutral-400">{employee.position} · {deptLabel(employee.department)}</p>
          </div>
          {[['check_in','Check In'],['check_out','Check Out']].map(([k,l]) => (
            <div key={k}>
              <label className="block text-xs font-semibold text-neutral-600 mb-1">{l}</label>
              <input type="time" value={form[k]} onChange={set(k)}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Status</label>
            <select value={form.status} onChange={set('status')}
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 bg-white">
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_CFG[s]?.label ?? s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-neutral-600 mb-1">Notes <span className="font-normal text-neutral-300">(optional)</span></label>
            <input type="text" value={form.notes} onChange={set('notes')} placeholder="e.g. WFH approved…"
              className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
          </div>
        </div>
        {err && <p className="mt-3 text-xs text-red-500 font-medium">{err}</p>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 border border-neutral-200 rounded-xl text-sm text-neutral-600 hover:bg-neutral-50 transition-all">Cancel</button>
          <button onClick={save} disabled={busy}
            className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin"/>Saving…</> : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── info row helper ────────────────────────────────────────────────────────
function InfoRow({ label, value, highlight }) {
  return (
    <div className={`flex items-center border-b border-neutral-100 last:border-0 ${highlight ? 'bg-blue-50' : ''}`}>
      <span className="w-[52%] px-2 py-1 text-[10.5px] text-neutral-500 font-medium shrink-0">{label}</span>
      <span className={`flex-1 px-2 py-1 text-[10.5px] font-semibold ${highlight ? 'text-blue-700' : 'text-secondary-700'}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}
function SectionHeader({ children }) {
  return (
    <div className="bg-neutral-700 text-white text-[10.5px] font-bold px-2 py-1 tracking-wide uppercase">
      {children}
    </div>
  )
}

// ── print ──────────────────────────────────────────────────────────────────
function printReport(employee, balance, startDate, endDate, rows, policy = ATTENDANCE_POLICY_DEFAULTS) {
  const logoSrc  = `${window.location.origin}/logo.svg`
  const nightStart = policyTimeMin(policy, 'attendance_night_ot_start_time')

  // helpers
  const toMinP = t => t ? parseInt(t.slice(0,2))*60 + parseInt(t.slice(3,5)) : null
  const fmt12P = t => {
    if (!t) return ''
    const h = parseInt(t.slice(0,2)), m = parseInt(t.slice(3,5))
    return `${h%12||12}:${pad(m)} ${h>=12?'PM':'AM'}`
  }
  const decHHMM = h => {
    if (!h || h<=0) return '0:00'
    const tot = Math.round(h*60)
    return `${Math.floor(tot/60)}:${pad(tot%60)}`
  }

  // summaries
  const withRec     = rows.filter(r => r.record)
  const totalDedMin = withRec.filter(r => r.record.status==='absent').length * policyNumber(policy, 'attendance_absent_deduction_minutes')
  const totalDedHrs = totalDedMin / 60

  // OT breakdown per row — total = dayRate + nightRate (floor, same as the rate columns)
  const isIntervention = isInterventionEmployee(employee)
  const getOT = rec => {
    if (!rec?.overtime_hours || rec.overtime_hours<=0 || !rec.check_out) return null
    const outMin = toMinP(rec.check_out)
    let otStartMin
    if (isIntervention) {
      if (!rec.check_in) return null
      const inMin  = toMinP(rec.check_in)
      const expMin = (rec.expected_hours || policyNumber(policy, 'attendance_intervention_expected_hours')) * 60
      otStartMin   = inMin + expMin
    } else {
      otStartMin = policyTimeMin(policy, 'attendance_regular_ot_start_time')
    }
    if (outMin <= otStartMin) return null
    const dayMins   = Math.max(0, Math.min(outMin, nightStart) - otStartMin)
    const nightMins = Math.max(0, outMin - Math.max(otStartMin, nightStart))
    // >= 30 min → full hour; < 30 min → 0
    const dayRate   = Math.round(dayMins / 60)
    const nightRate = Math.round(nightMins / 60)
    return {
      start:     fmt12P(pad(Math.floor(otStartMin/60)) + ':' + pad(otStartMin%60)),
      end:       fmt12P(pad(Math.floor(outMin/60))     + ':' + pad(outMin%60)),
      dayRate,
      nightRate,
      total:     dayRate + nightRate,
    }
  }

  let totalDayOT=0, totalNightOT=0
  rows.forEach(r => {
    const ot = r.record ? getOT(r.record) : null
    if (ot) { totalDayOT += ot.dayRate; totalNightOT += ot.nightRate }
  })

  // Total OT = sum of per-row (dayRate + nightRate)
  const totalOTHrs = totalDayOT + totalNightOT

  // balance
  const annual         = balance?.annual  ?? 21
  const casual         = balance?.casual  ?? 6
  const annualRemain   = balance?.annual_remaining  ?? annual
  const casualRemain   = balance?.casual_remaining  ?? casual
  const consumedAnnual = annual  - annualRemain
  const consumedCasual = casual  - casualRemain

  const infoRow = (l,v,hi=false) =>
    `<tr style="${hi?'background:#dbeafe':''}">
      <td class="lbl">${l}</td>
      <td class="val" style="${hi?'color:#1d4ed8':''}">${v??''}</td>
    </tr>`

  const rowsHtml = rows.map((r,i) => {
    const rec = r.record
    const off = r.isWeekend
    const ot  = rec ? getOT(rec) : null
    const dedMin = rec?.status==='absent' ? 540 : 0
    const workStr = rec ? (rec.status==='absent'?'0:00':decHHMM(rec.work_hours)) : (off?'0:00':'')
    const rowBg = off?'#e5e7eb':ot?'#fff9e6':i%2===0?'#ffffff':'#f9fafb'
    const txtClr = off?'color:#9ca3af;':''
    return `<tr style="background:${rowBg};${txtClr}">
      <td>${i+1}</td>
      <td style="white-space:nowrap">${fmtDate(r.dateStr)}</td>
      <td>${r.dayName}</td>
      <td>${rec?.check_in  ? fmt12P(rec.check_in)  : ''}</td>
      <td>${rec?.check_out ? fmt12P(rec.check_out) : ''}</td>
      <td style="font-weight:bold">${workStr}</td>
      <td>0.00</td>
      <td style="color:#1d4ed8">${ot ? fmt12P(ot.start) : ''}</td>
      <td style="color:#1d4ed8">${ot ? fmt12P(ot.end)   : ''}</td>
      <td>${ot ? ot.dayRate   : '0'}</td>
      <td>${ot ? ot.nightRate : '0'}</td>
      <td>0</td>
      <td style="font-weight:bold;color:${ot?'#1d4ed8':''}">${ot ? ot.total : '0'}</td>
      <td style="color:#dc2626">${dedMin>0 ? dedMin/60 : ''}</td>
      <td style="color:#dc2626">${dedMin>0 ? dedMin    : ''}</td>
      <td style="text-align:left;color:#6b7280;font-size:6pt">${rec?.notes??''}</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Attendance — ${employee.name}</title>
<style>
  @page { size: A4 landscape; margin:0; }
  *{ margin:0; padding:0; box-sizing:border-box; }
  html,body{ width:297mm; height:210mm; font-family:Arial,sans-serif; font-size:7.5pt; color:#000; }
  .page{ width:297mm; height:210mm; padding:5mm 5mm 4mm 5mm; display:flex; flex-direction:column; }

  /* ─ header ─ */
  .top{ border:1.5px solid #000; display:flex; margin-bottom:3px; }
  .top-logo{ width:100px; border-right:1.5px solid #000; display:flex; align-items:center; justify-content:center; padding:4px; }
  .top-logo img{ height:34px; width:auto; object-fit:contain; }
  .top-title{ flex:1; text-align:center; padding:3px 6px; display:flex; flex-direction:column; justify-content:center; }
  .title-en{ font-size:12pt; font-weight:900; }
  .title-ar{ font-size:9.5pt; font-weight:bold; direction:rtl; margin-top:1px; }
  .top-meta{ width:130px; border-left:1.5px solid #000; padding:3px 5px; font-size:7pt; display:flex; flex-direction:column; justify-content:center; gap:2px; }

  /* ─ body ─ */
  .body{ flex:1; display:flex; gap:3px; overflow:hidden; min-height:0; }

  /* ─ info panel ─ */
  .ip{ width:168px; flex-shrink:0; overflow:hidden; }
  .ip table{ width:100%; border-collapse:collapse; }
  .ip .sec{ background:#374151; color:#fff; font-size:7pt; font-weight:bold; padding:2px 4px; }
  .ip .lbl{ background:#d1d5db; font-size:7pt; padding:1px 4px; border:1px solid #9ca3af; }
  .ip .val{ font-size:7pt; padding:1px 4px; border:1px solid #9ca3af; font-weight:600; }

  /* ─ attendance table ─ */
  .att-wrap{ flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }
  table.att{ width:100%; border-collapse:collapse; flex:1; }
  table.att th{ background:#1e3a2f; color:#fff; font-size:6pt; padding:2px 2px; border:1px solid #000; text-align:center; font-weight:bold; line-height:1.2; }
  table.att td{ border:1px solid #d1d5db; font-size:6.5pt; padding:1px 2px; text-align:center; vertical-align:middle; }

  /* ─ summary ─ */
  .sumtbl{ border-collapse:collapse; margin-top:3px; }
  .sumtbl td{ border:1px solid #9ca3af; font-size:7pt; padding:1px 5px; }
  .sumtbl .sh{ background:#374151; color:#fff; font-weight:bold; text-align:center; }
  .sumtbl .sl{ background:#d1d5db; }
  .sumtbl .sv{ font-weight:700; text-align:center; }

  /* ─ footer ─ */
  .footer{ margin-top:2px; border-top:1.5px solid #000; padding-top:2px; display:flex; justify-content:space-between; font-size:6.5pt; font-weight:bold; }
  .red{ color:#cc0000; }
</style>
</head><body><div class="page">

<div class="top">
  <div class="top-logo">
    <img src="${logoSrc}" onerror="this.style.display='none';this.nextSibling.style.display='block'" alt="">
    <span style="display:none;font-size:10pt;font-weight:900;color:#1b5e38;font-style:italic">Rotem SRS</span>
  </div>
  <div class="top-title">
    <div class="title-en">Monthly Attendance Transaction Record</div>
    <div class="title-ar">سجل حضور الموظفين الشهري</div>
  </div>
  <div class="top-meta">
    <div><b>IBS No:</b> ${employee.ibs_code||'—'}</div>
    <div><b>Period:</b> ${fmtDate(startDate)} → ${fmtDate(endDate)}</div>
    <div><b>Dept:</b> ${employee.department||'—'}</div>
  </div>
</div>

<div class="body">

<!-- info panel -->
<div class="ip"><table>
  <tr><td colspan="2" class="sec">Employee Data</td></tr>
  ${infoRow('IBS No', employee.ibs_code)}
  ${infoRow('Project Name', 'Line 1')}
  ${infoRow('Employee Name', employee.name)}
  ${infoRow('Employee ID', employee.employee_id || employee.ibs_code)}
  ${infoRow('Hiring Date', employee.hiring_date ? fmtDate(employee.hiring_date) : '')}
  ${infoRow('Probation End', employee.probation_end_date ? fmtDate(employee.probation_end_date) : '')}
  ${infoRow('Title', employee.position)}
  ${infoRow('Location', employee.work_location || employee.location, true)}
  ${infoRow('Department', employee.department)}
  ${infoRow('Warning Letters', employee.no_warning_letters ?? 0)}
  <tr><td colspan="2" class="sec">Monthly Transactions Record</td></tr>
  ${infoRow('Employer', 'IBS')}
  ${infoRow('Balance Effective', fmtDate(startDate))}
  ${infoRow('Available Balance', annual)}
  ${infoRow('Annual Balance', annualRemain)}
  ${infoRow('Casual Balance', casualRemain)}
  ${infoRow('Consumed Annual', consumedAnnual)}
  ${infoRow('Consumed Casual', consumedCasual)}
  ${infoRow('Remain Annual', annualRemain)}
  ${infoRow('Remain Casual', casualRemain)}
  ${infoRow('Early Leave', '')}
  ${infoRow('Zero Balanced Vac.', '')}
  ${infoRow('Deduction in Minutes', totalDedMin.toFixed(2))}
  ${infoRow('Deduction in Hours', totalDedHrs.toFixed(2))}
  ${infoRow('Over Time in Hours', totalOTHrs.toFixed(2))}
  <tr><td colspan="2" class="sec">Work Hours</td></tr>
  ${infoRow('Start', fmt12P(attendancePolicyTime(policy, 'attendance_regular_start_time')))}
  ${infoRow('End', fmt12P(attendancePolicyTime(policy, 'attendance_regular_ot_start_time')))}
  <tr><td colspan="2" class="sec">Attendance Trans. Role</td></tr>
  ${infoRow('Salary', '')}
  ${infoRow('Day Rate', 0)}
  ${infoRow('Day Over Time Rate', 0)}
  ${infoRow('Night Over Time Rate', 0)}
  ${infoRow('Hour Rate', 0)}
</table></div>

<!-- attendance table -->
<div class="att-wrap">
<table class="att">
<thead><tr>
  <th>Sn</th><th>Date<br>(Day)</th><th>Day</th>
  <th>Check<br>IN</th><th>Check<br>Out</th>
  <th>Total<br>Working<br>Hrs</th><th>Hour<br>Rate</th>
  <th>Over Time<br>Start</th><th>Over Time<br>End</th>
  <th>Day<br>OT Rate</th><th>Night<br>OT Rate</th><th>Double<br>Pay</th>
  <th>Total<br>Over Time</th>
  <th>DEDUCTIONS<br>(HOURS)</th><th>DEDUCTIONS<br>(MIN)</th>
  <th>Notes</th>
</tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
</div>

</div><!-- /body -->

<!-- summary table -->
<table class="sumtbl" style="margin-top:3px">
  <tr>
    <td colspan="2" class="sh">Attendance Summary</td>
    <td colspan="2" class="sh">Over Time Summary</td>
  </tr>
  <tr><td class="sl">Total Deduction in Minutes</td><td class="sv">${totalDedMin.toFixed(1)}</td>
      <td class="sl">Total Day Over Time</td><td class="sv">${totalDayOT.toFixed(1)}</td></tr>
  <tr><td class="sl">Total Deduction in Hours</td><td class="sv">${totalDedHrs.toFixed(1)}</td>
      <td class="sl">Total Night Over Time</td><td class="sv">${totalNightOT.toFixed(1)}</td></tr>
  <tr><td class="sl">Total Work Hours</td><td class="sv">${withRec.reduce((s,r)=>s+Number(r.record.work_hours||0),0).toFixed(1)}</td>
      <td class="sl">Total Double Pay OT</td><td class="sv">0.0</td></tr>
  <tr><td class="sl">Present Days</td><td class="sv">${withRec.filter(r=>r.record.status==='present').length}</td>
      <td class="sl">Total Over Time</td><td class="sv">${totalOTHrs.toFixed(1)}</td></tr>
</table>

<div class="footer">
  <span>Document No: <span class="red">SRS-HR-ATT-01</span> &nbsp;|&nbsp; <span class="red">Rev.: 01</span> &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-GB')}</span>
  <span>| &nbsp;Page 1 of 1</span>
</div>

</div></body></html>`

  const w = window.open('', '_blank', 'width=1150,height=820')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 700)
}

// ── main component ─────────────────────────────────────────────────────────
export default function AttendanceTab() {

  // Lookup-backed labels for departments (falls back to raw key while loading)
  const { departments } = useLookups()
  const deptLabel = (key) => {
    if (!key) return ''
    const found = (departments || []).find(d => d.key === key)
    return found?.label_en ?? found?.label_ar ?? key
  }

  // ── View ─────────────────────────────────────────────────────────────────
  const [view, setView] = useState('overview')   // 'overview' | 'detail'

  // ── Overview state ────────────────────────────────────────────────────────
  const [overviewDate,   setOverviewDate]   = useState(todayStr)
  const [overviewRecs,   setOverviewRecs]   = useState([])
  const [overviewBusy,   setOverviewBusy]   = useState(false)
  const [overviewSearch, setOverviewSearch] = useState('')
  const [overviewErr,    setOverviewErr]    = useState(null)

  // ── Detail state ──────────────────────────────────────────────────────────
  const [employee,   setEmployee]   = useState(null)
  const [startDate,  setStartDate]  = useState(monthStart)
  const [endDate,    setEndDate]    = useState(monthEnd)
  const [records,    setRecords]    = useState([])
  const [balance,    setBalance]    = useState(null)
  const [loading,    setLoading]    = useState(false)

  // ── Shared ────────────────────────────────────────────────────────────────
  const [showUpload,      setShowUpload]      = useState(false)
  const [editRow,         setEditRow]         = useState(null)
  const [overviewEditRec, setOverviewEditRec] = useState(null)   // for overview inline edit
  const [leaves,          setLeaves]          = useState([])     // approved leaves overlapping range
  const [overviewLeaves,  setOverviewLeaves]  = useState([])     // approved leaves on overview date
  const [otrs,            setOtrs]            = useState([])     // approved OTRs overlapping range
  const [holidays,        setHolidays]        = useState([])     // public holidays overlapping range
  const [attendancePolicy, setAttendancePolicy] = useState(ATTENDANCE_POLICY_DEFAULTS)

  useEffect(() => {
    getSettings()
      .then(r => {
        const data = r.data ?? {}
        setAttendancePolicy({
          ...ATTENDANCE_POLICY_DEFAULTS,
          ...Object.fromEntries(Object.keys(ATTENDANCE_POLICY_DEFAULTS).map(key => [
            key,
            data[key] ?? ATTENDANCE_POLICY_DEFAULTS[key],
          ])),
        })
      })
      .catch(() => setAttendancePolicy(ATTENDANCE_POLICY_DEFAULTS))
  }, [])

  // ── Overview data ─────────────────────────────────────────────────────────
  const loadOverview = async (dateOverride) => {
    const date = dateOverride ?? overviewDate
    setOverviewBusy(true)
    setOverviewErr(null)
    try {
      const res = await attendanceService.getAttendance({ date })
      if (res.success) {
        setOverviewRecs(res.data ?? [])
        setOverviewLeaves(res.leaves ?? [])
      } else {
        setOverviewRecs([])
        setOverviewLeaves([])
        setOverviewErr('Server returned an error — check console')
      }
    } catch (e) {
      setOverviewRecs([])
      const msg = e?.response?.status === 401
        ? 'Session expired — please log in again'
        : e?.response?.data?.message || e?.message || 'Cannot reach the server — is the API running?'
      setOverviewErr(msg)
    }
    finally { setOverviewBusy(false) }
  }

  useEffect(() => {
    if (view === 'overview') loadOverview()
  }, [overviewDate, view])

  const filteredRecs = overviewRecs.filter(rec => {
    if (!overviewSearch.trim()) return true
    const q = overviewSearch.toLowerCase()
    return (
      (rec.employee?.name ?? '').toLowerCase().includes(q) ||
      (rec.employee?.ibs_code ?? '').toLowerCase().includes(q) ||
      (rec.employee?.position ?? '').toLowerCase().includes(q)
    )
  })

  // Helper: is an employee on approved leave on the overview date?
  const isOnLeaveOnOverview = (employeeId) =>
    overviewLeaves.some(l => l.employee_id === employeeId)

  const ovPresent = overviewRecs.filter(r => ['present','incomplete','wfh','intervention'].includes(r.status)).length
  const ovLate    = overviewRecs.filter(r => ['late','shortage'].includes(r.status)).length
  const ovAbsent  = overviewRecs.filter(r => r.status === 'absent' && !isOnLeaveOnOverview(r.employee_id)).length
  const ovOnLeave = new Set(overviewLeaves.map(l => l.employee_id)).size
  const ovOT      = overviewRecs.filter(r => Number(r.overtime_hours) > 0).length

  // ── Detail data ───────────────────────────────────────────────────────────
  const rows = buildRows(startDate, endDate, records, employee, leaves, otrs, holidays, attendancePolicy)
  const withRec     = rows.filter(r => r.record)
  const totalOT     = rows.reduce((s,r) => { const ot = otTimes(r.otr, attendancePolicy); return s + (ot?.total ?? 0) }, 0)
  const totalHrs    = withRec.reduce((s,r) => s + Number(r.record.work_hours||0), 0)
  // A row is covered by an early-leave permission if the LRF has early_from/early_to.
  // In that case the person's actual late/status is treated as "on permission" — not counted.
  const isPermissionCovered = (r) => !!earlyPermissionWindow(r.leave)
  const totalLatMin = withRec.reduce((s,r) => s + (isPermissionCovered(r) ? 0 : Number(r.record.late_minutes||0)), 0)
  // Absences on approved-leave days OR public holidays don't count as deductions
  const totalDedMin = withRec.filter(r => r.record.status === 'absent' && !r.leave && !r.holiday).length * policyNumber(attendancePolicy, 'attendance_absent_deduction_minutes')
  const summary = {
    workingDays: rows.filter(r => !r.isWeekend && !r.holiday).length,
    present:     withRec.filter(r => r.record.status === 'present').length,
    absent:      withRec.filter(r => r.record.status === 'absent' && !r.leave && !r.holiday).length,
    late:        withRec.filter(r => ['late','shortage'].includes(r.record.status) && !isPermissionCovered(r)).length,
    onLeave:     rows.filter(r => r.leave && !r.isWeekend).length,
  }

  const load = async () => {
    if (!employee || !startDate || !endDate) return
    setLoading(true)
    try {
      const res = await attendanceService.getAttendance({
        employee_id: employee.id, start_date: startDate, end_date: endDate,
      })
      setRecords(res.success ? (res.data ?? []) : [])
      setLeaves(res.success ? (res.leaves ?? []) : [])
      setOtrs(res.success ? (res.otrs ?? []) : [])
      setHolidays(res.success ? (res.holidays ?? []) : [])
    } catch { setRecords([]); setLeaves([]); setOtrs([]); setHolidays([]) }
    finally { setLoading(false) }
  }

  const loadBalance = async emp => {
    if (!emp) { setBalance(null); return }
    try { const b = await getLeaveBalance(emp.id); setBalance(b?.data ?? b) }
    catch { setBalance(null) }
  }

  useEffect(() => { if (view === 'detail') load() }, [employee, startDate, endDate, view])

  // Open an employee's detail view (from overview row click)
  const openDetail = emp => {
    if (!emp) return
    setEmployee(emp)
    setRecords([])
    loadBalance(emp)
    setView('detail')
  }

  const setThisMonth = () => { setStartDate(monthStart()); setEndDate(monthEnd()) }
  const setLastMonth = () => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1)
    const y = d.getFullYear(), m = d.getMonth()+1
    const last = new Date(y,m,0).getDate()
    setStartDate(`${y}-${pad(m)}-01`); setEndDate(`${y}-${pad(m)}-${pad(last)}`)
  }
  const setLast7 = () => {
    const e = todayStr(), d = new Date(); d.setDate(d.getDate()-6)
    setStartDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`); setEndDate(e)
  }

  const exportExcel = async () => {
    if (!employee) return
    try {
      const blob = await attendanceService.exportExcel({ employee_id:employee.id, start_date:startDate, end_date:endDate })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `Attendance_${employee.name}_${startDate}_${endDate}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  const [exportAllBusy,       setExportAllBusy]       = useState(false)
  const [showExportAllPicker, setShowExportAllPicker] = useState(false)
  const [exportAllStart,      setExportAllStart]      = useState(monthStart)
  const [exportAllEnd,        setExportAllEnd]        = useState(monthEnd)

  const doExportAll = async () => {
    setExportAllBusy(true)
    try {
      const blob = await attendanceService.exportAllExcel({ start_date: exportAllStart, end_date: exportAllEnd })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url
      a.download = `Attendance_All_${exportAllStart}_${exportAllEnd}.xlsx`
      a.click(); URL.revokeObjectURL(url)
      setShowExportAllPicker(false)
    } catch {}
    finally { setExportAllBusy(false) }
  }

  const annualRemain = balance ? (balance.annual_remaining ?? balance.annual ?? 21) : '—'
  const casualRemain = balance ? (balance.casual_remaining ?? balance.casual  ?? 6)  : '—'
  const annualTotal  = balance?.annual ?? 21
  const casualTotal  = balance?.casual ?? 6

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-4">

      {view === 'overview' ? (
        <>
          {/* ── Overview Header ── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-2xl font-bold text-secondary-700">Attendance</h2>
              <p className="text-sm text-neutral-400 mt-0.5">Biometric overview — daily punch records</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadOverview} disabled={overviewBusy}
                className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-all">
                <RefreshCw className={`w-4 h-4 ${overviewBusy?'animate-spin':''}`} />Refresh
              </button>
              <button onClick={() => setShowExportAllPicker(true)}
                className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-all">
                <Download className="w-4 h-4" />Export All
              </button>
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all">
                <Upload className="w-4 h-4" />Upload Data
              </button>
            </div>
          </div>

          {/* ── Overview filter bar ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex items-center gap-4 flex-wrap">
            {/* Employee search → navigates to detail view */}
            <EmployeeSearch onSelect={emp => { if (emp) openDetail(emp) }} />
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-neutral-400 shrink-0" />
              <input type="date" value={overviewDate} onChange={e => setOverviewDate(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
            </div>
            {/* Quick text filter within loaded records */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
              <input value={overviewSearch} onChange={e => setOverviewSearch(e.target.value)}
                placeholder="Filter table…"
                className="w-48 pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all" />
            </div>
            <p className="ml-auto text-xs text-neutral-400">
              {overviewRecs.length} record{overviewRecs.length !== 1 ? 's' : ''} for {fmtDate(overviewDate)}
            </p>
          </div>

          {/* ── Error banner ── */}
          {overviewErr && (
            <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <X className="w-4 h-4 shrink-0 text-red-500" />
              <span>{overviewErr}</span>
              <button onClick={() => setOverviewErr(null)} className="ml-auto text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {/* ── Overview summary cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            {[
              ['Present',         ovPresent,  'bg-green-50  text-green-700  border-green-200'],
              ['Late / Shortage', ovLate,     'bg-yellow-50 text-yellow-700 border-yellow-200'],
              ['Absent',          ovAbsent,   'bg-red-50    text-red-600    border-red-200'],
              ['On Leave',        ovOnLeave,  'bg-violet-50 text-violet-700 border-violet-200'],
              ['With Overtime',   ovOT,       'bg-blue-50   text-blue-700   border-blue-200'],
            ].map(([l,v,cls]) => (
              <div key={l} className={`rounded-2xl border p-4 text-center ${cls}`}>
                <p className="text-3xl font-black">{v}</p>
                <p className="text-xs font-semibold mt-1 opacity-70">{l}</p>
              </div>
            ))}
          </div>

          {/* ── Overview biometric table ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {overviewBusy ? (
              <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredRecs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-neutral-300">
                <CalendarDays className="w-14 h-14" />
                <p className="text-sm font-medium">No attendance records for {fmtDate(overviewDate)}</p>
                <p className="text-xs">Upload a biometric (.dat) or Excel file to populate records</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-neutral-800 text-white">
                      {['#','Employee','IBS Code','Position','Location','Check In','Check Out','Work Hrs','Status','',''].map((h,i) => (
                        <th key={i} className="px-3 py-2.5 text-[10px] font-bold text-left whitespace-nowrap border-r border-neutral-700 last:border-0">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecs.map((rec, i) => {
                      const emp = rec.employee
                      const onLeaveInfo = overviewLeaves.find(l => l.employee_id === rec.employee_id)
                      const isOnLeave   = !!onLeaveInfo
                      const cfg = isOnLeave
                        ? { label: 'On Leave', cls: 'bg-violet-100 text-violet-700 border-violet-200' }
                        : (STATUS_CFG[rec.status] ?? { label: rec.status, cls: 'bg-neutral-100 text-neutral-500 border-neutral-200' })
                      return (
                        <tr key={rec.id}
                          onClick={() => emp && openDetail(emp)}
                          className={`border-b border-neutral-100 cursor-pointer transition-colors hover:bg-primary/5 group ${
                            isOnLeave ? 'bg-violet-50/60' : (i%2===0?'bg-white':'bg-neutral-50/60')
                          }`}>
                          {/* # */}
                          <td className="px-3 py-2.5 text-center text-neutral-400 font-semibold w-10">{i+1}</td>
                          {/* Employee */}
                          <td className="px-3 py-2.5 min-w-[160px]">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                                {emp?.name?.[0]?.toUpperCase() ?? '?'}
                              </div>
                              <div>
                                <p className="font-semibold text-secondary-700 whitespace-nowrap">{emp?.name ?? '—'}</p>
                                {emp?.arabic_name && <p className="text-[10px] text-secondary-600" dir="rtl">{emp.arabic_name}</p>}
                              </div>
                            </div>
                          </td>
                          {/* IBS */}
                          <td className="px-3 py-2.5 font-mono text-neutral-600 whitespace-nowrap">{emp?.ibs_code ?? '—'}</td>
                          {/* Position */}
                          <td className="px-3 py-2.5 max-w-[160px]">
                            <p className="text-neutral-700 truncate">{emp?.position ?? '—'}</p>
                            {emp?.department && <p className="text-[10px] text-neutral-400">{emp.department}</p>}
                          </td>
                          {/* Location */}
                          <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{emp?.work_location ?? '—'}</td>
                          {/* Check In */}
                          <td className={`px-3 py-2.5 font-mono font-semibold whitespace-nowrap ${
                            isLateCheckIn(rec.check_in, attendancePolicy) ? 'text-red-600' : 'text-green-600'
                          }`}>
                            {rec.check_in
                              ? fmt12(rec.check_in)
                              : <span className="text-neutral-300">—</span>}
                          </td>
                          {/* Check Out */}
                          <td className="px-3 py-2.5 font-mono font-semibold text-blue-600 whitespace-nowrap">
                            {rec.check_out
                              ? fmt12(rec.check_out)
                              : <span className="text-neutral-300">—</span>}
                          </td>
                          {/* Work Hrs */}
                          <td className="px-3 py-2.5 text-center font-bold font-mono text-secondary-700">
                            {Number(rec.work_hours) > 0
                              ? decToHHMM(rec.work_hours)
                              : <span className="text-neutral-300">—</span>}
                          </td>
                          {/* Status */}
                          <td className="px-3 py-2.5">
                            <div className="flex flex-col gap-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls} self-start`}>
                                {cfg.label}
                              </span>
                              {isOnLeave && (
                                <span className="text-[9px] text-violet-500 capitalize">{(onLeaveInfo.leave_type||'').replace('_',' ')}</span>
                              )}
                            </div>
                          </td>
                          {/* Arrow */}
                          <td className="px-3 py-2.5 text-center text-primary opacity-0 group-hover:opacity-60 transition-opacity">→</td>
                          {/* Edit */}
                          <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                            <button
                              onClick={e => { e.stopPropagation(); setOverviewEditRec(rec) }}
                              title="Edit record"
                              className="p-1.5 rounded-lg text-neutral-400 hover:bg-primary/10 hover:text-primary transition-all opacity-0 group-hover:opacity-100">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* ── Detail Header ── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={() => { setView('overview'); setEmployee(null) }}
                className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 transition-all">
                ← Back
              </button>
              <div>
                <h2 className="text-2xl font-bold text-secondary-700">Attendance</h2>
                <p className="text-sm text-neutral-400 mt-0.5">{employee?.name} — Monthly attendance record</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={load} disabled={loading}
                className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-all">
                <RefreshCw className={`w-4 h-4 ${loading?'animate-spin':''}`} />Refresh
              </button>
              <button onClick={exportExcel} disabled={!records.length}
                className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 transition-all">
                <Download className="w-4 h-4" />Export
              </button>
              <button onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 px-4 h-9 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-all">
                <Upload className="w-4 h-4" />Upload Data
              </button>
              <button onClick={() => printReport(employee, balance, startDate, endDate, rows, attendancePolicy)}
                className="flex items-center gap-1.5 px-4 h-9 bg-secondary-700 text-white rounded-lg text-sm font-medium hover:bg-secondary-800 transition-all">
                <Printer className="w-4 h-4" />Print
              </button>
            </div>
          </div>

          {/* ── Detail Filter bar ── */}
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex items-center gap-4 flex-wrap">
            <EmployeeSearch onSelect={emp => { if (emp) { setEmployee(emp); setRecords([]); loadBalance(emp) } }} />
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-neutral-400 shrink-0" />
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
              <span className="text-sm text-neutral-400 font-bold">→</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {[['This Month',setThisMonth],['Last Month',setLastMonth],['Last 7 Days',setLast7]].map(([l,fn]) => (
                <button key={l} onClick={fn}
                  className="px-2.5 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-500 rounded-lg hover:bg-primary/10 hover:text-primary transition-all">{l}</button>
              ))}
            </div>
          </div>

          {/* ── Detail Main: Left Panel + Table ── */}
          <div className="flex gap-4 items-start">

            {/* ── Left Info Panel ── */}
            <div className="w-60 shrink-0 bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden text-[11px]">
              <div className="bg-gradient-to-br from-primary/90 to-primary p-4 text-white">
                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-xl font-black mb-2">
                  {employee.name?.[0]?.toUpperCase()}
                </div>
                <p className="font-bold text-sm leading-tight">{employee.name}</p>
                <p className="text-primary-100 text-[10px] mt-0.5 opacity-80">{employee.position}</p>
              </div>
              <div className="divide-y divide-neutral-100">
                <SectionHeader>Employee Data</SectionHeader>
                <InfoRow label="IBS No"           value={employee.ibs_code} />
                <InfoRow label="Department"       value={deptLabel(employee.department)} />
                <InfoRow label="Title"            value={employee.position} />
                <InfoRow label="Location"         value={employee.work_location} highlight={!!employee.work_location} />
                <InfoRow label="Hiring Date"      value={employee.hiring_date ? fmtDate(employee.hiring_date) : null} />
                <InfoRow label="Warning Letters"  value={employee.no_warning_letters ?? 0} />

                <SectionHeader>Leave Balance</SectionHeader>
                <InfoRow label="Annual Balance"   value={annualTotal} />
                <InfoRow label="Remain Annual"    value={annualRemain} />
                <InfoRow label="Casual Balance"   value={casualTotal} />
                <InfoRow label="Remain Casual"    value={casualRemain} />

                <SectionHeader>Period Summary</SectionHeader>
                <InfoRow label="Deduction (hrs)"  value={(totalDedMin/60).toFixed(2)} />
                <InfoRow label="Deduction (min)"  value={totalDedMin.toFixed(2)} />
                <InfoRow label="Over Time (hrs)"  value={totalOT} />

                <SectionHeader>Schedule</SectionHeader>
                {isInterventionEmployee(employee) ? (
                  <>
                    <InfoRow label="Type"    value="Intervention" highlight />
                    <InfoRow label="Shift"   value={`Variable (${policyNumber(attendancePolicy, 'attendance_intervention_expected_hours')} hrs)`} />
                    <InfoRow label="Day Off" value={weeklyOffLabel(employee)} highlight={hasWeeklyOffDay(employee)} />
                  </>
                ) : (
                  <>
                    <InfoRow label="Type"         value="Regular" />
                    <InfoRow label="Start"        value={fmt12(attendancePolicy.attendance_regular_start_time)} />
                    <InfoRow label="End"          value={fmt12(attendancePolicy.attendance_regular_ot_start_time)} />
                    <InfoRow label={DAYS[policyNumber(attendancePolicy, 'attendance_regular_weekly_off_day')]} value="Off" />
                    <InfoRow label="Saturday Grp" value={employee.saturday_group ?? '—'} highlight={!!employee.saturday_group} />
                  </>
                )}
              </div>
            </div>

            {/* ── Right: Summary + Table ── */}
            <div className="flex-1 min-w-0 space-y-3">

              {/* Summary strip */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm">
                <div className="grid grid-cols-6 divide-x divide-neutral-100 border-b border-neutral-100">
                  {[
                    ['Working Days', summary.workingDays, 'text-secondary-700'],
                    ['Present',      summary.present,     'text-green-600'],
                    ['Absent',       summary.absent,      'text-red-500'],
                    ['On Leave',     summary.onLeave,     'text-violet-600'],
                    ['Late/Shortage',summary.late,        'text-yellow-600'],
                    ['OT Hours',     totalOT,             'text-blue-600'],
                  ].map(([lbl,val,col]) => (
                    <div key={lbl} className="py-3 px-3 text-center">
                      <p className={`text-xl font-black ${col}`}>{val}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{lbl}</p>
                    </div>
                  ))}
                </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 sm:divide-x divide-neutral-100">
                  {[
                    ['Total Work Hrs', totalHrs.toFixed(1),       'text-secondary-700'],
                    ['Late Minutes',   totalLatMin,                'text-orange-500'],
                    ['Ded. Hours',     (totalDedMin/60).toFixed(1),'text-red-400'],
                    ['Ded. Minutes',   totalDedMin,                'text-red-400'],
                  ].map(([lbl,val,col]) => (
                    <div key={lbl} className="py-2.5 px-3 text-center">
                      <p className={`text-base font-black ${col}`}>{val}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{lbl}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Attendance table */}
              <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden" style={{display:'grid',gridTemplateColumns:'1fr'}}>
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : rows.length === 0 ? (
                  <div className="flex items-center justify-center py-16 text-neutral-300 text-sm">
                    Select a valid date range
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="text-xs border-collapse" style={{minWidth:'900px',width:'100%'}}>
                      <thead>
                        <tr className="bg-neutral-800 text-white">
                          {[
                            'Sn','Date','Day',
                            'Check IN','Check Out',
                            'Total Working Hrs','Hour Rate',
                            'OT Start','OT End',
                            'Day OT Rate','Night OT Rate','Double Pay',
                            'Total Over Time',
                            'Deductions (HRS)','Deductions (MIN)',
                            'Notes',''
                          ].map((h,i) => (
                            <th key={i} className="px-2 py-2.5 text-[10px] font-bold text-center whitespace-nowrap border-r border-neutral-700 last:border-0">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const rec    = r.record
                          const ot     = otTimes(r.otr, attendancePolicy)
                          const s      = rec?.status
                          const cfg    = STATUS_CFG[s]
                          const isHoliday = !!r.holiday
                          // Absence on holiday or on approved leave doesn't deduct
                          const dedMin = rec?.status === 'absent' && !r.leave && !isHoliday ? policyNumber(attendancePolicy, 'attendance_absent_deduction_minutes') : 0
                          // Full-day leave (annual/casual/sick) hides check-in/out; early leave keeps them
                          // because the person actually worked part of the day under permission.
                          const isEarly = r.leave?.leave_type === 'early'
                          const onLeave = !!r.leave && !r.isWeekend && !isEarly
                          // Double pay = hours worked on a holiday (from attendance work_hours)
                          const doublePayHrs = isHoliday && rec?.work_hours > 0 ? Math.round(Number(rec.work_hours)) : 0
                          // Early-leave permission note
                          const permWindow = earlyPermissionWindow(r.leave)
                          const noteParts = []
                          if (rec?.notes) noteParts.push(rec.notes)
                          if (permWindow) {
                            // Strip seconds from time values ("08:00:00" → "08:00") and force LTR direction with LRM
                            const from = String(permWindow.from).slice(0, 5)
                            const to   = String(permWindow.to).slice(0, 5)
                            noteParts.push(`إذن ‎${from}–${to}`)
                          }
                          if (isHoliday) noteParts.push(r.holiday.name_en || r.holiday.name_ar || 'Holiday')
                          const noteText = noteParts.join(' · ')
                          return (
                            <tr key={r.dateStr}
                              className={`border-b border-neutral-100 transition-colors group ${
                                isHoliday
                                  ? 'bg-rose-50 hover:bg-rose-100'
                                  : r.isWeekend
                                    ? 'bg-neutral-100 text-neutral-400'
                                    : onLeave
                                      ? 'bg-violet-50 hover:bg-violet-100'
                                      : ot && ot.total > 0
                                        ? 'bg-amber-50 hover:bg-amber-100'
                                        : i%2===0 ? 'bg-white hover:bg-primary/5' : 'bg-neutral-50/60 hover:bg-primary/5'
                              }`}>
                              <td className="px-2 py-2 text-center font-semibold text-neutral-500">{i+1}</td>
                              <td className="px-2 py-2 text-center font-mono font-semibold text-secondary-700 whitespace-nowrap">{fmtDate(r.dateStr)}</td>
                              <td className="px-2 py-2 text-center text-neutral-500">{r.dayName}</td>
                              <td className="px-2 py-2 text-center font-mono">
                                {onLeave
                                  ? <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-[10px] font-bold rounded-full uppercase">On Leave</span>
                                  : rec?.check_in ? <span className={`${isLateCheckIn(rec.check_in, attendancePolicy) ? 'text-red-600' : 'text-green-600'} font-semibold`}>{fmt12(rec.check_in)}</span> : ''}
                              </td>
                              <td className="px-2 py-2 text-center font-mono">
                                {onLeave
                                  ? <span className="text-violet-600 text-[10px] font-semibold capitalize">{(r.leave.leave_type||'').replace('_',' ')}</span>
                                  : rec?.check_out ? <span className="text-blue-600 font-semibold">{fmt12(rec.check_out)}</span> : ''}
                              </td>
                              <td className="px-2 py-2 text-center font-bold font-mono">
                                {onLeave
                                  ? <span className="text-violet-500">—</span>
                                  : rec
                                    ? (rec.status==='absent' ? <span className="text-neutral-400">0:00</span> : decToHHMM(rec.work_hours))
                                    : (r.isWeekend ? <span className="text-neutral-300">0:00</span> : '')}
                              </td>
                              <td className="px-2 py-2 text-center text-neutral-400">0</td>
                              <td className="px-2 py-2 text-center font-mono text-blue-600">{ot && ot.total > 0 ? fmt12(ot.start) : ''}</td>
                              <td className="px-2 py-2 text-center font-mono text-blue-600">{ot && ot.total > 0 ? fmt12(ot.end) : ''}</td>
                              <td className="px-2 py-2 text-center text-neutral-400">{ot ? ot.dayRate : '0'}</td>
                              <td className="px-2 py-2 text-center text-neutral-400">{ot ? ot.nightRate : '0'}</td>
                              <td className="px-2 py-2 text-center font-bold">
                                {doublePayHrs > 0
                                  ? <span className="text-rose-600">{doublePayHrs}</span>
                                  : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="px-2 py-2 text-center font-bold">
                                {ot && ot.total > 0
                                  ? <span className="text-blue-600">{ot.total}</span>
                                  : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {dedMin > 0 ? <span className="text-red-500 font-semibold">{(dedMin/60).toFixed(1)}</span> : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="px-2 py-2 text-center">
                                {dedMin > 0 ? <span className="text-red-500 font-semibold">{dedMin}</span> : <span className="text-neutral-300">0</span>}
                              </td>
                              <td className="px-2 py-2 text-center text-neutral-500 max-w-[140px] truncate" title={noteText}>{noteText}</td>
                              <td className="px-1 py-2 text-center">
                                {!r.isWeekend && (
                                  <button onClick={() => setEditRow(r)} title={rec ? 'Edit' : 'Add'}
                                    className={`p-1 rounded transition-all opacity-0 group-hover:opacity-100 ${
                                      rec ? 'text-neutral-400 hover:bg-primary/10 hover:text-primary'
                                          : 'text-neutral-300 hover:bg-green-50 hover:text-green-600'
                                    }`}>
                                    {rec ? <Pencil className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                                  </button>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

            </div>{/* end right panel */}
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSuccess={(res) => {
            setShowUpload(false)
            if (view === 'overview') {
              // Navigate to the most recent date that was uploaded
              const dates = (res?.data?.dates ?? []).sort()
              const target = dates.length > 0 ? dates[dates.length - 1] : null
              if (target) setOverviewDate(target)
              loadOverview(target ?? undefined)
            } else {
              load()
            }
          }}
        />
      )}
      {editRow && employee && (
        <EditModal row={editRow} employee={employee}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); load() }} />
      )}
      {overviewEditRec && overviewEditRec.employee && (
        <EditModal
          row={{
            record:   overviewEditRec,
            dateStr:  overviewEditRec.date?.slice(0, 10),
            dayName:  DAYS[new Date((overviewEditRec.date?.slice(0,10)) + 'T00:00:00').getDay()],
            isWeekend: false,
          }}
          employee={overviewEditRec.employee}
          onClose={() => setOverviewEditRec(null)}
          onSaved={() => { setOverviewEditRec(null); loadOverview() }}
        />
      )}

      {/* ── Export All Modal ── */}
      {showExportAllPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowExportAllPicker(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-bold text-secondary-700">Export All Employees</p>
                <p className="text-xs text-neutral-400 mt-0.5">Each employee in a separate sheet</p>
              </div>
              <button onClick={() => setShowExportAllPicker(false)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1">Start Date</label>
                <input type="date" value={exportAllStart} onChange={e => setExportAllStart(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-neutral-600 mb-1">End Date</label>
                <input type="date" value={exportAllEnd} onChange={e => setExportAllEnd(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10" />
              </div>
              <div className="flex gap-2">
                {[['This Month', () => { setExportAllStart(monthStart()); setExportAllEnd(monthEnd()) }],
                  ['Last Month', () => {
                    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth()-1)
                    const y = d.getFullYear(), m = d.getMonth()+1
                    const last = new Date(y,m,0).getDate()
                    setExportAllStart(`${y}-${pad(m)}-01`); setExportAllEnd(`${y}-${pad(m)}-${pad(last)}`)
                  }]
                ].map(([l,fn]) => (
                  <button key={l} onClick={fn}
                    className="flex-1 py-1.5 text-xs font-medium bg-neutral-100 text-neutral-500 rounded-lg hover:bg-primary/10 hover:text-primary transition-all">
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={doExportAll} disabled={exportAllBusy || !exportAllStart || !exportAllEnd}
              className="mt-5 w-full py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
              {exportAllBusy
                ? <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                : <><Download className="w-4 h-4" />Download Excel</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
