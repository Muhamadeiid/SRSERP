import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Printer, CheckCircle, XCircle, AlertCircle, Ban,
  Loader2, Search, Bell, X, Eye, Clock, Calendar, RefreshCw, CalendarClock, Download
} from 'lucide-react'
import { getEmployees, getEmployee, searchEmployees, getDepotManager } from '../services/employeeService'
import {
  getLeaveRequests, createLeaveRequest,
  managerApproveLeave, hrApproveLeave, approveLeave, rejectLeave, cancelLeave, rescheduleLeave,
  getLeaveBalance, updateLeaveTrackingNo,
} from '../services/leaveService'

// ── constants ─────────────────────────────────────────────────
const HR_OFFICER = 'Hazem Khaled'
const DEPOT_MGR  = 'Mohamed Awaad'

const DEPT_LABEL = {
  cm:              'CM',
  hm:              'HM',
  pm:              'PM',
  warranty:        'Warranty',
  cm_intervention: 'CM (Intervention)',
  admin:           'Admin',
}

const unwrapData = (res) => res?.data ?? res
const deptValue = (emp) => {
  const dept = emp?.department
  if (typeof dept === 'object' && dept !== null) {
    return dept.name ?? dept.label ?? dept.title ?? dept.value ?? ''
  }
  return emp?.department_label ?? emp?.department_name ?? dept ?? ''
}
const deptLabel = (emp) => {
  const value = deptValue(emp)
  return DEPT_LABEL[value] ?? value
}

async function generateRequestWord(req) {
  if (req.type === 'lrf') {
    const { generateLRF } = await import('../utils/generateLRF')
    return generateLRF(req)
  }

  const { generateOTR } = await import('../utils/generateOTR')
  return generateOTR(req)
}

const INP = 'w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all'
const LBL = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1'

// ── helpers ───────────────────────────────────────────────────
const diffDays  = (s, e) => (!s || !e) ? 0 : Math.max(0, Math.round((new Date(e) - new Date(s)) / 86400000) + 1)
// OTR: round to nearest whole hour, .5+ rounds up. Handles midnight crossover.
const diffHours = (s, e) => {
  if (!s || !e) return 0
  const [sh, sm] = s.split(':').map(Number)
  const [eh, em] = e.split(':').map(Number)
  let m = (eh * 60 + em) - (sh * 60 + sm)
  if (m < 0) m += 24 * 60   // crosses midnight (e.g. 23:00 → 02:00)
  return m === 0 ? 0 : Math.round(m / 60)
}
// Early leave: 2h=0.25 day, 4h=0.5 day, 6h=0.75 day (workday=8h)
const normalizeTime = (value) => {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/)
  if (!m) return raw
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)))
  const min = Math.min(59, Math.max(0, parseInt(m[2] ?? '0', 10)))
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}
const earlyDays = (from, to) => {
  const start = normalizeTime(from)
  const end = normalizeTime(to)
  if (!start || !end) return ''
  const [fh, fm] = start.split(':').map(Number)
  const [th, tm] = end.split(':').map(Number)
  const mins = (th * 60 + tm) - (fh * 60 + fm)
  if (mins <= 0) return ''
  return (mins / 60 / 8).toFixed(2).replace(/\.?0+$/, '')
}
const lrfDays = (form) => form.leave_type === 'early'
  ? parseFloat(earlyDays(form.early_from, form.early_to) || 0)
  : diffDays(form.start_date, form.end_date)
const formatBalance = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const n = parseFloat(value)
  return Number.isFinite(n) ? n.toFixed(2).replace(/\.?0+$/, '') : value
}
const depotManagerNameFor = (request) =>
  request?.approver?.role === 'depot_manager'
    ? request.approver.name
    : (request?.depot_manager_name || DEPOT_MGR)
const fmtDate   = d => d ? new Date(d).toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) : ''
const fmtShort  = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const genLRFNo  = () => `LRF-GZ-????`
const fmtDays   = d => d != null ? +parseFloat(d) : d
const genOTRNo  = () => `OTR-EG1-????`
const threeName = (n) => n?.trim().split(/\s+/).slice(0, 3).join(' ') ?? ''
const today     = () => new Date().toISOString().slice(0, 10)
const pad2      = n => String(n).padStart(2, '0')
const dateString = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
const currentMonthRange = () => {
  const d = new Date()
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return { from: dateString(first), to: dateString(last) }
}
const historyRange = (period) => {
  if (period === 'all') return {}
  if (period === 'current_month') return currentMonthRange()
  const days = { last_30: 30, last_90: 90, last_year: 365 }[period] ?? 30
  const from = new Date()
  from.setDate(from.getDate() - days)
  return { from: dateString(from), to: today() }
}

// ── status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    pending:          { label: 'Pending',          cls: 'bg-amber-50 text-amber-600 border-amber-200',     Icon: AlertCircle  },
    manager_approved: { label: 'Manager Approved', cls: 'bg-blue-50 text-blue-600 border-blue-200',        Icon: CheckCircle  },
    hr_approved:      { label: 'HR Approved',      cls: 'bg-purple-50 text-purple-600 border-purple-200',  Icon: CheckCircle  },
    approved:         { label: 'Approved',         cls: 'bg-green-50 text-green-600 border-green-200',     Icon: CheckCircle  },
    rejected:         { label: 'Rejected',         cls: 'bg-red-50 text-red-600 border-red-200',           Icon: XCircle      },
    cancelled:        { label: 'Cancelled',        cls: 'bg-neutral-100 text-neutral-500 border-neutral-200', Icon: Ban       },
    rescheduled:      { label: 'Reschedule',       cls: 'bg-amber-50 text-amber-600 border-amber-200',     Icon: CalendarClock},
  }[status] ?? { label: status, cls: 'bg-neutral-100 text-neutral-500 border-neutral-200', Icon: Clock }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cfg.cls}`}>
      <cfg.Icon className="w-3 h-3" />{cfg.label}
    </span>
  )
}

// ── employee autocomplete ─────────────────────────────────────
function EmployeeSearch({ onSelect, initialName = '' }) {
  const [q, setQ]           = useState(initialName)
  const [results, setResults] = useState([])
  const [open, setOpen]     = useState(false)
  const [busy, setBusy]     = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return }
    setBusy(true)
    searchEmployees(q)
      .then(r => setResults(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setResults([]))
      .finally(() => setBusy(false))
  }, [q])

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => q.length >= 2 && setOpen(true)}
          placeholder="Search employee name…"
          className={INP + ' pl-8'}
        />
        {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-30 w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {results.map(emp => (
            <button key={emp.id} type="button"
              onClick={() => { onSelect(emp); setQ(emp.name); setOpen(false) }}
              className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-primary-50 transition-colors text-left border-b border-neutral-50 last:border-0">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {emp.name?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-secondary-700">{emp.name}</p>
                <p className="text-xs text-neutral-400">{emp.position} · {deptLabel(emp)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── print: LRF ────────────────────────────────────────────────
function printLRF(d) {
  const ck = v => v
    ? '<span style="font-size:9pt;font-weight:normal;font-family:Arial;">X</span>'
    : '<span style="font-size:9pt;">&#9744;</span>'

  const logoSrc = `${window.location.origin}/logo.svg`

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>LRF - ${d.tracking_no}</title>
<style>
  /* ── Remove browser print headers & footers ── */
  @page { size: A4 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }

  html, body {
    width: 210mm; height: 297mm;
    font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff;
  }

  /* Flex column so content fills the page */
  .page {
    width: 210mm; height: 297mm;
    padding: 10mm 12mm 8mm 12mm;
    display: flex; flex-direction: column;
  }

  /* ═══ HEADER TABLE ═══ */
  .hdr-table { width: 100%; border-collapse: collapse; border: 2px solid #000; }
  .hdr-logo  { width: 140px; border-right: 2px solid #000; padding: 6px 10px; vertical-align: middle; text-align:center; }
  .hdr-logo img { height: 50px; width: auto; object-fit: contain; display:block; margin:0 auto; }
  .hdr-title { text-align: center; padding: 6px 10px; vertical-align: middle; }
  .logo-rotem { font-size: 20pt; font-weight: 900; color: #1b5e38; font-style: italic; line-height: 1; }
  .logo-srs   { display: inline-block; background: #1b5e38; color: #fff; font-size: 8pt; font-weight: 900; padding: 1px 4px; letter-spacing: 2px; margin-left: 2px; vertical-align: middle; }
  .logo-egypt { display: block; font-size: 7pt; color: #1b5e38; font-weight: bold; letter-spacing: 2px; text-align: right; margin-top: 1px; }
  .title-en   { font-size: 17pt; font-weight: 900; }
  .title-ar   { font-size: 12pt; font-weight: bold; direction: rtl; margin-top: 2px; }

  /* ═══ SECTION LABELS ═══ */
  .tracking    { font-size: 10pt; font-weight: 900; margin: 4px 0 3px; }
  .sec-head    { font-size: 9.5pt; font-weight: 900; margin-bottom: 2px; display: flex; justify-content: space-between; }
  .purpose-en  { font-size: 8.5pt; margin-bottom: 1px; line-height: 1.4; }
  .purpose-ar  { font-size: 8.5pt; font-weight: bold; direction: rtl; text-align: right; line-height: 1.4; margin-bottom: 3px; }
  .details-lbl { font-size: 9.5pt; font-weight: 900; margin-bottom: 2px; }

  /* ═══ MAIN TABLE — grows to fill remaining space ═══ */
  .main-wrap { flex: 1; display: flex; flex-direction: column; }
  .main { width: 100%; border-collapse: collapse; height: 100%; }
  .main td { border: 1px solid #000; vertical-align: middle; font-size: 9pt; }

  .lbl { width: 36%; padding: 3px 6px; background: #fafafa; }
  .l-en { font-weight: bold; font-size: 9pt; display: block; }
  .l-ar { font-size: 8pt; color: #222; direction: rtl; text-align: right; display: block; }
  .val { padding: 4px 7px; font-size: 9pt; }

  /* Row 4 inner — borders go edge to edge */
  .lt-inner { width: 100%; border-collapse: collapse; table-layout: auto; height: 100%; }
  .lt-inner tr { height: 50%; }
  .lt-inner td { border: none; border-bottom: 1px solid #000; padding: 4px 6px; font-size: 8.5pt; vertical-align: middle; }
  .lt-inner tr:last-child td { border-bottom: none; }
  /* vertical separators */
  .lt-cb   { width: 20px; text-align: center; border-right: 1px solid #aaa !important; }
  .lt-lbl  { border-right: 2px solid #000 !important; }
  .lt-from { border-right: 1px solid #aaa !important; white-space: nowrap; width: 90px; }
  .lt-to   { border-right: 2px solid #000 !important; white-space: nowrap; width: 90px; }
  .lt-par  { width: 38px; text-align: center; border-right: 1px solid #aaa !important; }
  .lt-day  { width: 28px; text-align: center; }

  /* Row 5 inner — borders go edge to edge */
  .pu-inner { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .pu-inner td { border: none; padding: 5px 8px; font-size: 9pt; vertical-align: middle; }
  .pu-cb  { width: 24px; text-align: center; }
  .pu-sep { border-right: 2px solid #000 !important; }

  /* Signature rows */
  .sig-lbl { width: 36%; padding: 3px 6px; vertical-align: middle; background: #fafafa; }
  .sig-top { height: 28px; padding: 2px 7px; border-bottom: 1px solid #000; }
  .sig-bot { height: 18px; padding: 2px 7px; font-size: 8.5pt; color: #444; font-style: italic; }

  /* ── FOOTER (pinned to bottom via flex) ── */
  .footer {
    margin-top: 5px;
    border-top: 2px solid #000;
    padding-top: 3px;
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    font-weight: bold;
  }
  .footer .doc-id { color: #cc0000; }
</style>
</head>
<body>
<div class="page">

<!-- ══ HEADER ══ -->
<table class="hdr-table">
  <tr>
    <td class="hdr-logo">
      <img src="${logoSrc}" alt="Rotem SRS Egypt"
        onerror="this.style.display='none';this.nextSibling.style.display='inline';" />
      <span style="display:none;">
        <span class="logo-rotem">Rotem</span><span class="logo-srs">SRS</span><span class="logo-egypt">EGYPT</span>
      </span>
    </td>
    <td class="hdr-title">
      <div class="title-en">Leave Request Form (LRF)</div>
      <div class="title-ar">نموذج طلب اجازة</div>
    </td>
  </tr>
</table>

<!-- ══ TRACKING + PURPOSE ══ -->
<p class="tracking">Tracking No: ${d.tracking_no}</p>
<div class="sec-head"><span>&#9646; Document purpose:</span><span style="direction:rtl;font-weight:900;">:الغرض من النموذج</span></div>
<p class="purpose-en">This form is for employees to use to take a leave of annual, Casual, sick leaves and Early leave</p>
<p class="purpose-ar">هذا النموذج خاص برصيد الأجازات السنويه, الاجازات العارضه و الاجازات المرضي والأذونات</p>
<p class="details-lbl">&#9646; Details:</p>

<!-- ══ MAIN TABLE (stretches to fill remaining space) ══ -->
<div class="main-wrap">
<table class="main">

  <tr>
    <td class="lbl"><span class="l-en">Employee Name:</span><span class="l-ar">إسم الموظف</span></td>
    <td class="val">${d.employee_name || ''}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">Job Title:</span><span class="l-ar">المسمى الوظيفى</span></td>
    <td class="val">${d.job_title || ''}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">Department:</span><span class="l-ar">الإداره</span></td>
    <td class="val">${d.department_label || d.department || ''}</td>
  </tr>

  <!-- Row 4: Leave Type -->
  <tr style="height:56px;">
    <td class="lbl"><span class="l-en">Leave Type:</span><span class="l-ar">نوع الاذن</span></td>
    <td style="padding:0; height:56px;">
      <table class="lt-inner" style="height:100%;">
        <tr>
          <td class="lt-cb">${ck(d.leave_type==='annual')}</td>
          <td class="lt-lbl">Annual Leave</td>
          <td class="lt-cb">${ck(d.leave_type==='casual')}</td>
          <td class="lt-lbl">Casual Leave</td>
          <td class="lt-cb">${ck(d.leave_type==='sick')}</td>
          <td>Sick Leave</td>
        </tr>
        <tr>
          <td class="lt-cb">${ck(d.leave_type==='early')}</td>
          <td class="lt-lbl">Early Leave</td>
          <td class="lt-from">From:&nbsp;${d.leave_type==='early'&&d.early_from?`<strong>${d.early_from}</strong>`:'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</td>
          <td class="lt-to">To:&nbsp;${d.leave_type==='early'&&d.early_to?`<strong>${d.early_to}</strong>`:'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}</td>
          <td class="lt-par">( ${d.leave_type==='early'?earlyDays(d.early_from,d.early_to):'&nbsp;'} )</td>
          <td class="lt-day">Day</td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Row 5: Paid/Unpaid -->
  <tr style="height:28px;">
    <td class="lbl"><span class="l-en">Paid/Unpaid:</span><span class="l-ar">مدفوع الاجر/ غير مدفوع الاجر</span></td>
    <td style="padding:0; height:28px;">
      <table class="pu-inner" style="height:100%;">
        <tr style="height:100%;">
          <td class="pu-cb">${ck(d.paid===true)}</td>
          <td class="pu-sep" style="padding:4px 10px;">Paid</td>
          <td class="pu-cb">${ck(d.paid===false)}</td>
          <td style="padding:4px 10px;">Unpaid</td>
        </tr>
      </table>
    </td>
  </tr>

  <tr>
    <td class="lbl"><span class="l-en">Available Balance</span><span class="l-ar">الرصيد المتاح</span></td>
    <td class="val">${d.available_balance ?? ''}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">Annual Leave Request Date:</span><span class="l-ar">تاريخ طلب الاجازة</span></td>
    <td class="val">${fmtDate(d.request_date)}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">Annual Leave Start Date:</span><span class="l-ar">بداية تاريخ الأجازه</span></td>
    <td class="val">${fmtDate(d.start_date)}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">Annual Leave End Date:</span><span class="l-ar">تاريخ انتهاء الأجازه</span></td>
    <td class="val">${fmtDate(d.end_date)}</td>
  </tr>
  <tr>
    <td class="lbl"><span class="l-en">The purpose:</span><span class="l-ar">الغرض</span></td>
    <td class="val" style="vertical-align:top;padding-top:4px;">${d.purpose || ''}</td>
  </tr>

  <!-- Rows 11-14: Signatures -->
  <tr>
    <td class="sig-lbl" rowspan="2"><span class="l-en">Employee Name / signature:</span><span class="l-ar">إسم الموظف/توقيعه</span></td>
    <td class="sig-top">${d.employee?.e_signature ? `<img src="${d.employee.e_signature}" style="max-height:48px;max-width:160px;object-fit:contain;" />` : ''}</td>
  </tr>
  <tr><td class="sig-bot">${d.employee_name || ''}</td></tr>

  ${(() => {
    // When the direct manager is the same person as the depot manager they only
    // sign the depot slot below — the direct-manager row stays blank.
    const managerIsDepot = d.manager_approver?.id && d.approver?.id
                            ? d.manager_approver.id === d.approver.id
                            : false;
    const directName = managerIsDepot ? '' : (d.manager_approver?.name || d.direct_manager_name || '');
    const directSig  = managerIsDepot ? '' : (d.manager_signature ? `<img src="${d.manager_signature}" style="max-height:48px;max-width:160px;object-fit:contain;" />` : '');
    return `
  <tr>
    <td class="sig-lbl" rowspan="2"><span class="l-en">Direct Manager Name / signature</span><span class="l-ar">المدير المباشر / التوقيع</span></td>
    <td class="sig-top">${directSig}</td>
  </tr>
  <tr><td class="sig-bot">${directName}</td></tr>`;
  })()}

  <tr>
    <td class="sig-lbl" rowspan="2"><span class="l-en">Human Resource</span><span class="l-ar">موظف الموارد البشريه</span></td>
    <td class="sig-top">${d.hr_signature ? `<img src="${d.hr_signature}" style="max-height:48px;max-width:160px;object-fit:contain;" />` : ''}</td>
  </tr>
  <tr><td class="sig-bot">${HR_OFFICER}</td></tr>

  <tr>
    <td class="sig-lbl" rowspan="2"><span class="l-en">Depot Manager Signature</span><span class="l-ar">توقيع مدير الموقع</span></td>
    <td class="sig-top">${d.depot_signature ? `<img src="${d.depot_signature}" style="max-height:48px;max-width:160px;object-fit:contain;" />` : ''}</td>
  </tr>
  <tr><td class="sig-bot">${d.approver?.name || DEPOT_MGR}</td></tr>

</table>
</div>

<!-- ══ FOOTER (pinned at bottom) ══ -->
<div class="footer">
  <span>Document No: <span class="doc-id">SRS-HR-P02-F01</span>&nbsp;&nbsp;|&nbsp;&nbsp;<span class="doc-id">Rev.: 02</span>&nbsp;&nbsp;|&nbsp;&nbsp;Rev. Date: 04/05/2025</span>
  <span>|&nbsp;&nbsp;Page 1 of 1</span>
</div>

</div>
</body>
</html>`

  const w = window.open('', '_blank', 'width=860,height=1200')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 600)
}

// ── print: OTR ─────────────────────────────────────────────────
function printOTR(d) {
  const fmt = dt => dt ? new Date(dt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''
  const logo = window.location.origin + '/logo.svg'

  const s_lb  = 'border:1px solid #000;padding:4px 7px;vertical-align:middle;background:#f9f9f9;'
  const s_vl  = 'border:1px solid #000;padding:4px 8px;vertical-align:middle;font-size:9.5pt;'
  const s_en  = 'font-size:9pt;font-weight:700;display:block;'
  const s_ar  = 'font-size:7pt;direction:rtl;text-align:right;display:block;color:#333;margin-top:1px;'

  const empSig  = d.employee?.e_signature ? '<img src="' + d.employee.e_signature + '" style="max-height:24px;max-width:110px;object-fit:contain;margin-top:3px;display:block;"/>' : ''
  const manSig  = d.manager_signature  ? '<img src="' + d.manager_signature  + '" style="max-height:24px;max-width:110px;object-fit:contain;margin-top:3px;display:block;"/>' : ''
  const hrSig   = d.hr_signature       ? '<img src="' + d.hr_signature       + '" style="max-height:24px;max-width:110px;object-fit:contain;margin-top:3px;display:block;"/>' : ''
  const depSig  = d.depot_signature    ? '<img src="' + d.depot_signature    + '" style="max-height:24px;max-width:110px;object-fit:contain;margin-top:3px;display:block;"/>' : ''
  const manDate = d.manager_approved_at ? fmt(d.manager_approved_at) : ''
  const hrDate  = d.hr_approved_at      ? fmt(d.hr_approved_at)      : ''
  const appDate = d.approved_at         ? fmt(d.approved_at)         : ''
  const expl    = (d.explanation || '').replace(/\n/g, '<br/>')

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>OTR - ' + (d.tracking_no||'') + '</title>'
    + '<style>'
    + '@page{size:A4 portrait;margin:12mm 14mm 12mm 14mm;}'
    + '*{margin:0;padding:0;box-sizing:border-box;}'
    + 'body{font-family:Arial,sans-serif;font-size:10pt;color:#000;background:#fff;}'
    + '</style></head><body>'

    // ── HEADER ──
    + '<table style="width:100%;border-collapse:collapse;border-bottom:2.5px solid #000;margin-bottom:7px;">'
    + '<tr>'
    + '<td style="width:145px;padding:6px 10px;vertical-align:middle;text-align:center;border-right:1px solid #ccc;">'
    + '<img src="' + logo + '" style="height:52px;width:auto;object-fit:contain;display:block;margin:0 auto;" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'block\';"/>'
    + '<div style="display:none;text-align:center;">'
    + '<span style="font-size:13pt;font-weight:900;color:#1a3a6e;font-style:italic;">Rotem</span>'
    + '<span style="background:#c00;color:#fff;font-size:8pt;font-weight:900;padding:1px 4px;letter-spacing:2px;margin-left:2px;">SRS</span>'
    + '<span style="display:block;font-size:7pt;color:#c00;font-weight:900;letter-spacing:1px;">EGYPT</span>'
    + '</div></td>'
    + '<td style="text-align:center;padding:8px 12px;vertical-align:middle;">'
    + '<span style="font-size:18pt;font-weight:900;display:block;">Overtime Request Form</span>'
    + '<span style="font-size:13pt;font-weight:700;direction:rtl;display:block;margin-top:4px;">&#x625;&#x630;&#x646; &#x639;&#x645;&#x644; &#x633;&#x627;&#x639;&#x627;&#x62A; &#x625;&#x636;&#x627;&#x641;&#x64A;&#x647;</span>'
    + '</td></tr></table>'

    // ── TRACKING ──
    + '<p style="font-size:11pt;font-weight:900;margin:4px 0 8px;">Tracking No: ' + (d.tracking_no||'') + '</p>'

    // ── MAIN TABLE ──
    + '<table style="width:100%;border-collapse:collapse;">'

    // Green header
    + '<tr><td colspan="4" style="background:#C6E0B4;text-align:center;padding:5px 8px;border:1px solid #000;">'
    + '<span style="font-size:10pt;font-weight:900;display:block;">Overtime Request</span>'
    + '<span style="font-size:8.5pt;font-weight:700;direction:rtl;display:block;margin-top:1px;">&#x637;&#x644;&#x628; &#x633;&#x627;&#x639;&#x627;&#x62A; &#x627;&#x636;&#x627;&#x641;&#x64A;&#x647;</span>'
    + '</td></tr>'

    // Employee | Date
    + '<tr>'
    + '<td style="' + s_lb + 'width:26%;"><span style="' + s_en + '">Employee Name</span><span style="' + s_ar + '">&#x625;&#x633;&#x645; &#x627;&#x644;&#x645;&#x648;&#x638;&#x641;</span></td>'
    + '<td style="' + s_vl + 'width:24%;">' + (d.employee_name||'') + '</td>'
    + '<td style="' + s_lb + 'width:26%;"><span style="' + s_en + '">Date</span><span style="' + s_ar + '">&#x627;&#x644;&#x62A;&#x627;&#x631;&#x64A;&#x62E;</span></td>'
    + '<td style="' + s_vl + 'width:24%;">' + fmt(d.ot_date) + '</td>'
    + '</tr>'

    // Title | Department
    + '<tr>'
    + '<td style="' + s_lb + '"><span style="' + s_en + '">Title</span><span style="' + s_ar + '">&#x627;&#x644;&#x645;&#x633;&#x645;&#x649; &#x627;&#x644;&#x648;&#x638;&#x64A;&#x641;&#x64A;</span></td>'
    + '<td style="' + s_vl + '">' + (d.job_title||'') + '</td>'
    + '<td style="' + s_lb + '"><span style="' + s_en + '">Department</span><span style="' + s_ar + '">&#x627;&#x644;&#x625;&#x62F;&#x627;&#x631;&#x647;</span></td>'
    + '<td style="' + s_vl + '">' + (d.department_label||d.department||'') + '</td>'
    + '</tr>'

    // Timing
    + '<tr><td colspan="4" style="border:1px solid #000;padding:0;">'
    + '<table style="width:100%;border-collapse:collapse;">'
    + '<tr>'
    + '<td style="width:30%;padding:4px 7px;border-right:1px solid #000;vertical-align:top;"><span style="' + s_en + '">Overtime needed from</span><span style="' + s_ar + '">&#x627;&#x644;&#x639;&#x645;&#x644; &#x627;&#x644;&#x625;&#x636;&#x627;&#x641;&#x64A; &#x645;&#x646; :</span><span style="font-size:10.5pt;font-weight:700;display:block;margin-top:3px;">' + (d.start_time||'') + '</span></td>'
    + '<td style="width:14%;padding:4px 7px;border-right:1px solid #000;vertical-align:top;"><span style="' + s_en + '">To &nbsp;<span style="font-weight:400;font-size:7.5pt;">&#x625;&#x644;&#x64A;</span></span><span style="font-size:10.5pt;font-weight:700;display:block;margin-top:3px;">' + (d.end_time||'') + '</span></td>'
    + '<td style="width:38%;padding:4px 7px;border-right:1px solid #000;vertical-align:top;"><span style="' + s_en + '">Total overtime not to exceed</span><span style="' + s_ar + '">&#x625;&#x62C;&#x645;&#x627;&#x644;&#x64A; &#x633;&#x627;&#x639;&#x627;&#x62A; &#x627;&#x644;&#x639;&#x645;&#x644; &#x644;&#x627; &#x64A;&#x62A;&#x62E;&#x637;&#x649;</span></td>'
    + '<td style="width:18%;padding:4px 7px;vertical-align:top;text-align:center;"><span style="font-size:9pt;font-weight:700;display:block;">Hours &nbsp;<span style="font-weight:400;font-size:7.5pt;">&#x633;&#x627;&#x639;&#x647;</span></span><span style="font-size:15pt;font-weight:900;display:block;margin-top:2px;text-align:center;">' + (d.hours!=null?d.hours:'') + '</span></td>'
    + '</tr></table></td></tr>'

    // Explanation label
    + '<tr><td colspan="4" style="border:1px solid #000;padding:4px 8px;">'
    + '<table style="width:100%;border-collapse:collapse;"><tr>'
    + '<td style="font-size:9pt;font-weight:700;">Detailed Explanation why over time is required:</td>'
    + '<td style="font-size:7.5pt;font-weight:700;direction:rtl;text-align:right;color:#333;">&#x62A;&#x641;&#x633;&#x64A;&#x631; &#x633;&#x628;&#x628; &#x625;&#x62D;&#x62A;&#x64A;&#x627;&#x62C; &#x627;&#x644;&#x639;&#x645;&#x644; &#x644;&#x633;&#x627;&#x639;&#x627;&#x62A; &#x625;&#x636;&#x627;&#x641;&#x64A;&#x647;</td>'
    + '</tr></table></td></tr>'
    + '<tr><td colspan="4" style="border:1px solid #000;padding:6px 9px;vertical-align:middle;text-align:center;font-size:9.5pt;height:48px;">' + expl + '</td></tr>'

    // Results label
    + '<tr><td colspan="4" style="border:1px solid #000;padding:4px 8px;">'
    + '<table style="width:100%;border-collapse:collapse;"><tr>'
    + '<td style="font-size:9pt;font-weight:700;">Overtime Results</td>'
    + '<td style="font-size:7.5pt;font-weight:700;direction:rtl;text-align:right;color:#333;">&#x646;&#x62A;&#x627;&#x626;&#x62C; &#x627;&#x644;&#x639;&#x645;&#x644; &#x644;&#x633;&#x627;&#x639;&#x627;&#x62A; &#x625;&#x636;&#x627;&#x641;&#x64A;&#x647;</td>'
    + '</tr></table></td></tr>'
    + '<tr><td colspan="4" style="border:1px solid #000;padding:6px 9px;vertical-align:middle;text-align:center;height:48px;font-size:9pt;">' + (d.overtime_results || '') + '</td></tr>'

    // Sig: Employee
    + '<tr>'
    + '<td colspan="2" style="' + s_lb + 'width:50%;vertical-align:middle;"><span style="' + s_en + '">Employee Signature</span><span style="' + s_ar + '">&#x62A;&#x648;&#x642;&#x64A;&#x639; &#x627;&#x644;&#x645;&#x648;&#x638;&#x641;</span>' + empSig + '</td>'
    + '<td style="' + s_lb + 'width:26%;"><span style="' + s_en + '">Date</span><span style="' + s_ar + '">&#x627;&#x644;&#x62A;&#x627;&#x631;&#x64A;&#x62E;</span></td>'
    + '<td style="' + s_vl + 'width:24%;"></td>'
    + '</tr>'

    // Sig: Direct Manager
    + '<tr>'
    + '<td colspan="2" style="' + s_lb + 'width:50%;vertical-align:middle;"><span style="' + s_en + '">Direct Manager Signature</span><span style="' + s_ar + '">&#x62A;&#x648;&#x642;&#x64A;&#x639; &#x645;&#x62F;&#x64A;&#x631; &#x627;&#x644;&#x645;&#x628;&#x627;&#x634;&#x631;</span>' + manSig + '</td>'
    + '<td style="' + s_lb + 'width:26%;"><span style="' + s_en + '">Date</span><span style="' + s_ar + '">&#x627;&#x644;&#x62A;&#x627;&#x631;&#x64A;&#x62E;</span></td>'
    + '<td style="' + s_vl + 'width:24%;">' + manDate + '</td>'
    + '</tr>'

    // Sig: HR
    + '<tr>'
    + '<td colspan="2" style="' + s_lb + 'vertical-align:middle;"><span style="' + s_en + '">HR Signature</span><span style="' + s_ar + '">&#x62A;&#x648;&#x642;&#x64A;&#x639; &#x627;&#x644;&#x645;&#x648;&#x627;&#x631;&#x62F; &#x627;&#x644;&#x628;&#x634;&#x631;&#x64A;&#x629;</span>' + hrSig + '</td>'
    + '<td style="' + s_lb + '"><span style="' + s_en + '">Date</span><span style="' + s_ar + '">&#x627;&#x644;&#x62A;&#x627;&#x631;&#x64A;&#x62E;</span></td>'
    + '<td style="' + s_vl + '">' + hrDate + '</td>'
    + '</tr>'

    // Sig: Depot Manager
    + '<tr>'
    + '<td colspan="2" style="' + s_lb + 'vertical-align:middle;"><span style="' + s_en + '">Depot Manager Signature</span><span style="' + s_ar + '">&#x62A;&#x648;&#x642;&#x64A;&#x639; &#x645;&#x62F;&#x64A;&#x631; &#x627;&#x644;&#x645;&#x648;&#x642;&#x639;</span>' + depSig + '</td>'
    + '<td style="' + s_lb + '"><span style="' + s_en + '">Date</span><span style="' + s_ar + '">&#x627;&#x644;&#x62A;&#x627;&#x631;&#x64A;&#x62E;</span></td>'
    + '<td style="' + s_vl + '">' + appDate + '</td>'
    + '</tr>'

    + '</table>'

    // ── FOOTER ──
    + '<table style="width:100%;border-collapse:collapse;border:1px solid #000;margin-top:9px;">'
    + '<tr>'
    + '<td style="padding:4px 8px;font-size:8pt;font-weight:700;border-right:1px solid #000;">'
    + 'Document No: <span style="color:#cc0000;">SRS-HR-P02-F03</span> | <span style="color:#cc0000;">Rev.: 02</span> | Rev. Date: 04-May-2025'
    + '</td>'
    + '<td style="padding:4px 8px;font-size:8pt;font-weight:700;text-align:right;width:95px;">| Page 1 of 1</td>'
    + '</tr></table>'

    + '</body></html>'

  const w = window.open('', '_blank', 'width=860,height=1200')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 600)
}


// ── LRF form card ─────────────────────────────────────────────
const LRF_EMPTY = {
  employee_id: null, employee_name: '', job_title: '', department: '', department_label: '',
  leave_type: 'annual', early_from: '', early_to: '',
  paid: true,
  alternate_employee_name: '',
  request_date: today(), start_date: '', end_date: '', purpose: 'Personal matter',
}

// shared cell styles
const TD_LBL = 'border border-neutral-300 bg-neutral-50 px-3 py-2 w-[220px] align-middle'
const TD_VAL = 'border border-neutral-300 px-3 py-2 align-middle'
const L_EN   = 'block text-[11px] font-bold text-secondary-700'
const L_AR   = 'block text-[10px] text-neutral-400 text-right'
const FINP   = 'w-full px-2 py-1 text-sm border border-neutral-200 rounded outline-none focus:border-primary/50 bg-white'

// Square checkbox that shows ✗ when selected
function RadioBox({ name, value, checked, onChange }) {
  return (
    <label className="inline-flex items-center justify-center w-4 h-4 border-2 border-neutral-500 cursor-pointer shrink-0 select-none"
      style={{ minWidth: '16px' }}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      {checked && <span className="text-[12px] font-normal leading-none text-neutral-800" style={{lineHeight:1}}>✗</span>}
    </label>
  )
}

function LRFForm({ onSubmit, saving }) {
  const [form, setForm]         = useState({ ...LRF_EMPTY })
  const [balances, setBalances] = useState(null)   // null=no employee, {}=loaded
  const [balLoading, setBalLoading] = useState(false)
  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const days = lrfDays(form)

  // Use effective remaining (after deductions). Annual can overflow into casual.
  const effectiveRemaining = (type) => {
    if (!balances) return null
    const key = type + '_remaining_effective'
    const val = balances[key] ?? balances[type] ?? null
    return val !== null ? parseFloat(val) : null
  }
  // For annual: show the combined pool (annual + casual since overflow is allowed)
  const availableBalance = balances
    ? (form.leave_type === 'annual' || form.leave_type === 'early'
        ? parseFloat(balances.annual_pool_remaining ?? effectiveRemaining('annual') ?? 0)
        : effectiveRemaining(form.leave_type))
    : null
  const annualRemaining  = balances ? parseFloat(balances.annual_remaining_effective ?? balances.annual ?? 0) : null
  const casualRemaining  = balances ? parseFloat(balances.casual_remaining_effective ?? balances.casual ?? 0) : null
  const casualUsed       = (balances && casualRemaining !== null) ? (parseFloat(balances.casual ?? 7) - casualRemaining) : 0

  const handleEmployeeSelect = (emp) => {
    const selectedDept = deptValue(emp)
    const region = emp.project_code ?? (emp.rotem_code?.toLowerCase().startsWith('ganz') ? 'GZ' : 'EG1')
    const previewTracking = `LRF-${region}-????`
    setForm(f => ({
      ...f,
      employee_id:      emp.id ?? null,
      employee_name:    threeName(emp.name),
      job_title:        emp.position ?? '',
      department:       selectedDept,
      department_label: deptLabel(emp),
      direct_manager_name: '',
      tracking_no:      previewTracking,
    }))
    setBalances(null)
    if (emp.id) {
      setBalLoading(true)
      getLeaveBalance(emp.id)
        .then(r => setBalances(r.data ?? {}))
        .catch(() => setBalances({}))
        .finally(() => setBalLoading(false))
      // fetch direct manager
      getEmployee(emp.id)
        .then(res => {
          const full = unwrapData(res)
          const fullDept = deptValue(full) || selectedDept
          setForm(f => ({
            ...f,
            job_title: full?.position ?? f.job_title,
            department: fullDept,
            department_label: fullDept ? (DEPT_LABEL[fullDept] ?? deptLabel(full) ?? fullDept) : f.department_label,
          }))
          const mgr = full?.direct_manager
          if (mgr?.name && mgr?.user_role !== 'depot_manager') {
            setForm(f => ({ ...f, direct_manager_name: mgr.name }))
          }
        })
        .catch(() => {})
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden" style={{fontFamily:'Arial, sans-serif'}}>

      {/* ══ PAGE HEADER — matches PDF ══ */}
      <table className="w-full border-collapse border-2 border-neutral-800">
        <tbody>
          <tr>
            {/* Logo */}
            <td className="border-r-2 border-neutral-800 w-[160px] px-3 py-2 align-middle">
              <img src="/logo.svg" alt="Rotem SRS Egypt" className="h-14 w-auto object-contain"
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              <div style={{display:'none'}} className="items-center gap-1">
                <span className="text-2xl font-black text-[#1b5e38] italic leading-none">Rotem</span>
                <div className="flex flex-col">
                  <span className="bg-[#1b5e38] text-white text-[8px] font-black px-1.5 py-px tracking-widest">SRS</span>
                  <span className="text-[7px] text-[#1b5e38] font-bold tracking-widest text-right mt-0.5">EGYPT</span>
                </div>
              </div>
            </td>
            {/* Title */}
            <td className="text-center px-4 py-3 align-middle">
              <p className="text-xl font-black text-secondary-800 tracking-wide">Leave Request Form (LRF)</p>
              <p className="text-sm font-bold text-secondary-700 mt-1">نموذج طلب اجازة</p>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="px-4 pt-3 pb-1 space-y-1">
        <p className="text-xs font-bold text-secondary-700">Tracking No: {form.tracking_no || '—'}</p>

        {/* Purpose block */}
        <div className="flex justify-between items-start">
          <p className="text-[11px] font-black text-secondary-700">■ Document purpose:</p>
          <p className="text-[11px] font-black text-secondary-700 text-right">:الغرض من النموذج</p>
        </div>
        <p className="text-[11px] text-neutral-600">This form is for employees to use to take a leave of annual, Casual, sick leaves and Early leave</p>
        <p className="text-[11px] font-bold text-neutral-600 text-right">هذا النموذج خاص برصيد الأجازات السنويه, الاجازات العارضه و الاجازات المرضي والأذونات</p>
        <p className="text-[11px] font-black text-secondary-700 pt-1">■ Details:</p>
      </div>

      <form onSubmit={e => {
        e.preventDefault()
        onSubmit({ ...form, early_from: form.leave_type === 'early' ? normalizeTime(form.early_from) : '', early_to: form.leave_type === 'early' ? normalizeTime(form.early_to) : '', days, available_balance: availableBalance ?? undefined, tracking_no: genLRFNo(), status: 'pending', type: 'lrf', created_at: new Date().toISOString() })
      }}>
        {/* ══ MAIN TABLE ══ */}
        <table className="w-full border-collapse border-2 border-neutral-800 mx-[1px]" style={{width:'calc(100% - 2px)'}}>
          <tbody>

            {/* Row 1 — Employee Name */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Employee Name:</span>
                <span className={L_AR}>إسم الموظف</span>
              </td>
              <td className={TD_VAL}>
                <EmployeeSearch onSelect={handleEmployeeSelect} initialName={form.employee_name} />
              </td>
            </tr>

            {/* Row 2 — Job Title */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Job Title:</span>
                <span className={L_AR}>المسمى الوظيفى</span>
              </td>
              <td className={TD_VAL}>
                <input value={form.job_title} onChange={e => set('job_title', e.target.value)} className={FINP} placeholder="Auto-filled" />
              </td>
            </tr>

            {/* Row 3 — Department */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Department:</span>
                <span className={L_AR}>الإداره</span>
              </td>
              <td className={TD_VAL}>
                <input value={form.department_label || form.department} readOnly className={FINP + ' bg-neutral-50 cursor-default'} placeholder="Auto-filled" />
              </td>
            </tr>

            {/* Row 4 — Leave Type: nested 2 sub-rows */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Leave Type:</span>
                <span className={L_AR}>نوع الاذن</span>
              </td>
              <td className="border border-neutral-300 p-0 align-middle">
                <table className="w-full border-collapse">
                  <tbody>
                    {/* Sub-row 1: 6 columns — ☐ Annual | ☐ Casual | ☐ Sick */}
                    <tr className="border-b border-neutral-200">
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="leave_type" value="annual" checked={form.leave_type==='annual'} onChange={() => set('leave_type','annual')} />
                      </td>
                      <td className="px-2 py-2 border-r border-neutral-300 text-[11px] font-medium text-secondary-700 whitespace-nowrap">Annual Leave</td>
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="leave_type" value="casual" checked={form.leave_type==='casual'} onChange={() => set('leave_type','casual')} />
                      </td>
                      <td className="px-2 py-2 border-r border-neutral-300 text-[11px] font-medium text-secondary-700 whitespace-nowrap">Casual Leave</td>
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="leave_type" value="sick" checked={form.leave_type==='sick'} onChange={() => set('leave_type','sick')} />
                      </td>
                      <td className="px-2 py-2 text-[11px] font-medium text-secondary-700 whitespace-nowrap">Sick Leave</td>
                    </tr>
                    {/* Sub-row 2: 5 columns — ☐ Early | From: | To: | ( ) | Day */}
                    <tr>
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="leave_type" value="early" checked={form.leave_type==='early'} onChange={() => set('leave_type','early')} />
                      </td>
                      <td className="px-2 py-2 border-r border-neutral-300 text-[11px] font-medium text-secondary-700 whitespace-nowrap">Early Leave</td>
                      <td className="px-2 py-2 border-r border-neutral-300" colSpan={2}>
                        <div className="flex items-center gap-2 text-[11px] text-secondary-700">
                          <span>From:</span>
                          <PickerInput type="time" value={form.early_from} onChange={v => set('early_from', v)} onBlur={e => set('early_from', normalizeTime(e.target.value))}
                            disabled={form.leave_type !== 'early'}
                            placeholder="08:00" className="w-[86px]" inputClassName="w-full border border-neutral-200 rounded px-1 py-0.5 text-xs outline-none focus:border-primary/50 disabled:opacity-40" />
                          <span>To:</span>
                          <PickerInput type="time" value={form.early_to} onChange={v => set('early_to', v)} onBlur={e => set('early_to', normalizeTime(e.target.value))}
                            disabled={form.leave_type !== 'early'}
                            placeholder="10:00" className="w-[86px]" inputClassName="w-full border border-neutral-200 rounded px-1 py-0.5 text-xs outline-none focus:border-primary/50 disabled:opacity-40" />
                        </div>
                      </td>
                      <td className="px-2 py-2 border-r border-neutral-200 text-[11px] text-center whitespace-nowrap text-secondary-700">
                        ( {form.leave_type==='early' ? (earlyDays(form.early_from, form.early_to) || '\u00a0') : '\u00a0'} )
                      </td>
                      <td className="px-2 py-2 text-[11px] text-secondary-700">Day</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Row 5 — Paid/Unpaid: 4 columns */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Paid/Unpaid:</span>
                <span className={L_AR}>مدفوع الاجر/ غير مدفوع الاجر</span>
              </td>
              <td className="border border-neutral-300 p-0">
                <table className="w-full border-collapse">
                  <tbody>
                    <tr>
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="paid" value="paid" checked={form.paid===true} onChange={() => set('paid', true)} />
                      </td>
                      <td className="px-3 py-2 border-r border-neutral-300 text-[11px] font-medium text-secondary-700">Paid</td>
                      <td className="px-2 py-2 border-r border-neutral-200 w-6 text-center">
                        <RadioBox name="paid" value="unpaid" checked={form.paid===false} onChange={() => set('paid', false)} />
                      </td>
                      <td className="px-3 py-2 text-[11px] font-medium text-secondary-700">Unpaid</td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>

            {/* Row 6 — Available Balance */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Available Balance</span>
                <span className={L_AR}>الرصيد المتاح</span>
              </td>
              <td className={TD_VAL}>
                {!form.employee_name ? (
                  <span className="text-xs text-neutral-400 italic">Select an employee first</span>
                ) : balLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />
                    <span className="text-xs text-neutral-400">Loading balance…</span>
                  </div>
                ) : availableBalance === null ? (
                  <span className="text-xs text-neutral-400 italic">No balance record found</span>
                ) : (
                  <div className="space-y-1.5">
                    {/* Annual + Casual breakdown */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Annual</span>
                        <span className="text-base font-black text-blue-600">{formatBalance(annualRemaining)}</span>
                        <span className="text-[10px] text-neutral-400">/ {parseFloat(balances?.annual ?? 21)} d</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Casual</span>
                        <span className="text-base font-black text-purple-600">{formatBalance(casualRemaining)}</span>
                        <span className="text-[10px] text-neutral-400">/ {parseFloat(balances?.casual ?? 7)} d</span>
                      </div>
                      {form.leave_type === 'annual' && annualRemaining === 0 && casualRemaining > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                          Annual exhausted — using Casual days
                        </span>
                      )}
                    </div>
                    {/* Available for selected type */}
                    {form.leave_type && (
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-primary">
                          {formatBalance(availableBalance)}
                          {casualRemaining !== null && (
                            <span className="text-base font-bold text-purple-500 ml-1">({formatBalance(casualRemaining)} Casual)</span>
                          )}
                        </span>
                        <span className="text-xs text-neutral-400">days available</span>
                        {days > 0 && (
                          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${days > availableBalance ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                            Requesting {days}d → {availableBalance - days} left
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </td>
            </tr>

            {/* Row 7 — Request Date */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Annual Leave Request Date:</span>
                <span className={L_AR}>تاريخ طلب الاجازة</span>
              </td>
              <td className={TD_VAL}><PickerInput type="date" placeholder="YYYY-MM-DD" value={form.request_date} onChange={v => set('request_date', v)} /></td>
            </tr>

            {/* Row 8 — Start Date */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Annual Leave start Date:</span>
                <span className={L_AR}>بداية تاريخ الأجازه</span>
              </td>
              <td className={TD_VAL}>
                <PickerInput type="date" required value={form.start_date} placeholder="YYYY-MM-DD"
                  onChange={v => set('start_date', v)} />
              </td>
            </tr>

            {/* Row 9 — End Date */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>Annual Leave End Date:</span>
                <span className={L_AR}>تاريخ انتهاء الأجازه</span>
              </td>
              <td className={TD_VAL}>
                <PickerInput type="date" required value={form.end_date} placeholder="YYYY-MM-DD"
                  onChange={v => set('end_date', v)} />
              </td>
            </tr>

            {/* Row 10 — Purpose */}
            <tr>
              <td className={TD_LBL}>
                <span className={L_EN}>The purpose:</span>
                <span className={L_AR}>الغرض</span>
              </td>
              <td className={TD_VAL}>
                <div className="flex flex-wrap gap-3">
                  {[
                    { value: 'Sick',            ar: 'مرضي'         },
                    { value: 'Personal matter', ar: 'أمر شخصي'     },
                  ].map(opt => (
                    <label key={opt.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all select-none
                        ${form.purpose === opt.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-neutral-200 hover:border-primary/40 text-neutral-600'}`}>
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0
                        ${form.purpose === opt.value ? 'border-primary' : 'border-neutral-300'}`}>
                        {form.purpose === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                      </div>
                      <input type="radio" name="purpose" value={opt.value}
                        checked={form.purpose === opt.value}
                        onChange={() => set('purpose', opt.value)}
                        className="sr-only" />
                      <span className="text-[11px] font-semibold">{opt.value}</span>
                      <span className="text-[10px] text-neutral-400 font-normal">{opt.ar}</span>
                    </label>
                  ))}
                </div>
              </td>
            </tr>

            {/* Rows 11-14 — Signatures: label rowspan=2, value split into 2 sub-rows */}
            {/* Row 11 — Employee */}
            <tr>
              <td className={TD_LBL} rowSpan={2}>
                <span className={L_EN}>Employee Name / signature:</span>
                <span className={L_AR}>إسم الموظف/توقيعه</span>
              </td>
              <td className="border border-neutral-300 h-8 px-3 py-1" />
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-1 text-xs text-neutral-400 italic">{form.employee_name}</td>
            </tr>

            {/* Row 12 — Direct Manager */}
            <tr>
              <td className={TD_LBL} rowSpan={2}>
                <span className={L_EN}>Direct manager Name / signature</span>
                <span className={L_AR}>المدير المباشر / التوقيع</span>
              </td>
              <td className="border border-neutral-300 h-8 px-3 py-1" />
            </tr>
            <tr><td className="border border-neutral-300 px-3 py-1 text-xs text-neutral-400 italic">{form.direct_manager_name || ''}</td></tr>

            {/* Row 13 — Human Resource */}
            <tr>
              <td className={TD_LBL} rowSpan={2}>
                <span className={L_EN}>Human Resource</span>
                <span className={L_AR}>موظف الموارد البشريه</span>
              </td>
              <td className="border border-neutral-300 h-8 px-3 py-1" />
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-1 text-xs text-neutral-400 italic">{HR_OFFICER}</td>
            </tr>

            {/* Row 14 — Depot Manager */}
            <tr>
              <td className={TD_LBL} rowSpan={2}>
                <span className={L_EN}>Depot Manager Signature</span>
                <span className={L_AR}>توقيع مدير الموقع</span>
              </td>
              <td className="border border-neutral-300 h-8 px-3 py-1" />
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-1 text-xs text-neutral-400 italic">{DEPOT_MGR}</td>
            </tr>

          </tbody>
        </table>

        {/* Submit button */}
        <div className="px-4 py-4 flex justify-end border-t border-neutral-100 mt-1">
          <button type="submit" disabled={saving || !form.employee_name}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Submit Leave Request'}
          </button>
        </div>
      </form>

      {/* ══ FOOTER — Doc number bar at bottom like PDF ══ */}
      <div className="border-t-2 border-neutral-800 text-center text-[10px] font-bold py-1.5 px-2 bg-neutral-50 tracking-wide text-neutral-800">
        Document No:&nbsp;<span style={{color:'#c00'}}>SRS-HR-P02-F01</span>&nbsp;&nbsp;|&nbsp;&nbsp;<span style={{color:'#c00'}}>Rev.: 02</span>&nbsp;&nbsp;|&nbsp;&nbsp;Rev. Date: 04/05/2025&nbsp;&nbsp;|&nbsp;&nbsp;Page 1 of 1
      </div>
    </div>
  )
}

// ── OTR form card ─────────────────────────────────────────────
function CheckMark({ checked }) {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center border border-neutral-700 text-[10px] font-bold leading-none">
      {checked ? 'X' : ''}
    </span>
  )
}

function PickerInput({
  type,
  value,
  onChange,
  onBlur,
  placeholder,
  disabled = false,
  className = '',
  inputClassName = FINP,
  required = false,
}) {
  const pickerRef = useRef(null)
  const Icon = type === 'date' ? Calendar : Clock
  const pickerValue = (() => {
    if (type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : ''
    const normalized = normalizeTime(value)
    return /^\d{2}:\d{2}$/.test(normalized) ? normalized : ''
  })()

  const openPicker = () => {
    if (disabled || !pickerRef.current) return
    if (pickerRef.current.showPicker) pickerRef.current.showPicker()
    else pickerRef.current.click()
  }

  return (
    <div className={`relative flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className={`${inputClassName} pr-8`}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="absolute right-1.5 inline-flex h-6 w-6 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 disabled:opacity-30"
        title={type === 'date' ? 'Pick date' : 'Pick time'}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
      <input
        ref={pickerRef}
        type={type}
        value={pickerValue}
        onChange={e => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
      />
    </div>
  )
}

function OfficialLRFForm({ onSubmit, saving }) {
  const [form, setForm] = useState({ ...LRF_EMPTY })
  const [balances, setBalances] = useState(null)
  const [balLoading, setBalLoading] = useState(false)
  const [depotManagerName, setDepotManagerName] = useState(DEPOT_MGR)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const days = lrfDays(form)

  useEffect(() => {
    getDepotManager()
      .then(dm => {
        if (dm?.name) setDepotManagerName(dm.name)
      })
      .catch(() => {})
  }, [])

  const effectiveRemaining = (type) => {
    if (!balances) return null
    const val = balances[`${type}_remaining_effective`] ?? balances[type] ?? null
    return val !== null ? parseFloat(val) : null
  }

  const availableBalance = balances
    ? (form.leave_type === 'annual' || form.leave_type === 'early'
        ? parseFloat(balances.annual_pool_remaining ?? effectiveRemaining('annual') ?? 0)
        : effectiveRemaining(form.leave_type))
    : null
  const casualRem2  = balances ? parseFloat(balances.casual_remaining_effective ?? balances.casual ?? 0) : null
  const casualUsed2 = (balances && casualRem2 !== null) ? (parseFloat(balances.casual ?? 7) - casualRem2) : 0

  const handleEmployeeSelect = (emp) => {
    const selectedDept = deptValue(emp)
    setForm(f => ({
      ...f,
      employee_id: emp.id ?? null,
      employee_name: threeName(emp.name),
      job_title: emp.position ?? '',
      department: selectedDept,
      department_label: deptLabel(emp),
      direct_manager_name: '',
    }))
    setBalances(null)
    if (!emp.id) return
    setBalLoading(true)
    getLeaveBalance(emp.id).then(r => setBalances(r.data ?? {})).catch(() => setBalances({})).finally(() => setBalLoading(false))
    getEmployee(emp.id).then(res => {
      const full = unwrapData(res)
      const fullDept = deptValue(full) || selectedDept
      setForm(f => ({
        ...f,
        job_title: full?.position ?? f.job_title,
        department: fullDept,
        department_label: fullDept ? (DEPT_LABEL[fullDept] ?? deptLabel(full) ?? fullDept) : f.department_label,
        direct_manager_name: (full?.direct_manager?.user_role !== 'depot_manager' ? full?.direct_manager?.name : null) ?? f.direct_manager_name,
      }))
    }).catch(() => {})
  }

  const labelCell = (en, ar) => (
    <td className="w-[34%] border border-neutral-900 bg-white px-3 py-2 align-middle">
      <span className="block text-[11px] font-bold text-neutral-950">{en}</span>
      <span className="block text-right text-[10px] font-semibold text-neutral-700" dir="rtl">{ar}</span>
    </td>
  )

  const sigRows = (en, ar, name, editableKey) => (
    <>
      <tr>{labelCell(en, ar)}<td className="h-10 border border-neutral-900 px-3 py-1" /></tr>
      <tr>
        <td className="border border-neutral-900 px-3 py-1 text-xs italic text-neutral-500">
          {editableKey === 'alternate_employee_name'
            ? <EmployeeSearch
                onSelect={emp => set(editableKey, threeName(emp.name))}
                initialName={form[editableKey]}
              />
            : editableKey
              ? <input value={form[editableKey] ?? ''} onChange={e => set(editableKey, e.target.value)} className="w-full bg-transparent outline-none" placeholder="Name" />
              : name}
        </td>
      </tr>
    </>
  )

  const submit = (e) => {
    e.preventDefault()
    onSubmit({ ...form, early_from: form.leave_type === 'early' ? normalizeTime(form.early_from) : '', early_to: form.leave_type === 'early' ? normalizeTime(form.early_to) : '', days, available_balance: availableBalance ?? undefined, tracking_no: genLRFNo(), status: 'pending', type: 'lrf', created_at: new Date().toISOString() })
  }

  return (
    <form onSubmit={submit} className="bg-white border border-neutral-200 shadow-sm overflow-hidden" style={{ fontFamily: 'Arial, sans-serif' }}>
      <div className="overflow-x-auto">
        <div className="min-w-[760px] p-4">
          <table className="w-full border-collapse border-2 border-neutral-950">
            <tbody><tr>
              <td className="w-[160px] border-r-2 border-neutral-950 px-4 py-3 align-middle text-center"><img src="/logo.svg" alt="Rotem SRS Egypt" className="mx-auto h-14 w-auto object-contain" /></td>
              <td className="px-4 py-4 text-center align-middle"><p className="text-xl font-black text-neutral-950">Leave Request Form (LRF)</p><p className="mt-1 text-sm font-bold text-neutral-800" dir="rtl">نموذج طلب اجازة</p></td>
            </tr></tbody>
          </table>

          <div className="py-3 text-[11px] leading-relaxed text-neutral-900">
            <div className="flex justify-between font-black"><span>■ Document purpose:</span><span dir="rtl">الغرض من النموذج:</span></div>
            <p>This form is for employees to use to take a leave of annual, casual, sick leaves and early leave</p>
            <p className="text-right font-semibold" dir="rtl">هذا النموذج خاص برصيد الأجازات السنويه، الاجازات العارضه و الاجازات المرضي والأذونات</p>
            <p className="mt-1 font-black">■ Details:</p>
          </div>

          <table className="w-full border-collapse border-2 border-neutral-950 text-sm"><tbody>
            <tr>{labelCell('Employee Name:', 'إسم الموظف')}<td className="border border-neutral-900 px-3 py-2"><EmployeeSearch onSelect={handleEmployeeSelect} initialName={form.employee_name} /></td></tr>
            <tr>{labelCell('Job Title:', 'المسمى الوظيفى')}<td className="border border-neutral-900 px-3 py-2"><input value={form.job_title} onChange={e => set('job_title', e.target.value)} className={FINP} /></td></tr>
            <tr>{labelCell('Department:', 'الإداره')}<td className="border border-neutral-900 px-3 py-2"><input value={form.department_label || form.department} readOnly className={FINP + ' bg-neutral-50'} /></td></tr>
            <tr>{labelCell('Leave Type:', 'نوع الاذن')}<td className="border border-neutral-900 p-0">
              <div className="grid grid-cols-[24px_1fr_24px_1fr_24px_1fr] border-b border-neutral-900">
                {[['annual', 'Annual Leave'], ['casual', 'Casual Leave'], ['sick', 'Sick Leave']].map(([key, text]) => (
                  <div key={key} className="contents"><button type="button" onClick={() => set('leave_type', key)} className="flex items-center justify-center border-r border-neutral-400 py-2"><CheckMark checked={form.leave_type === key} /></button><button type="button" onClick={() => set('leave_type', key)} className="border-r border-neutral-900 px-2 py-2 text-left text-[12px] font-semibold">{text}</button></div>
                ))}
              </div>
              <div className="grid grid-cols-[24px_1fr_90px_90px_60px_44px]">
                <button type="button" onClick={() => set('leave_type', 'early')} className="flex items-center justify-center border-r border-neutral-400 py-2"><CheckMark checked={form.leave_type === 'early'} /></button>
                <button type="button" onClick={() => set('leave_type', 'early')} className="border-r border-neutral-900 px-2 py-2 text-left text-[12px] font-semibold">Early Leave</button>
                <div className="flex items-center gap-1 border-r border-neutral-400 px-2 py-2 text-[12px]">From:<PickerInput type="time" value={form.early_from} onChange={v => set('early_from', v)} onBlur={e => set('early_from', normalizeTime(e.target.value))} disabled={form.leave_type !== 'early'} placeholder="08:00" className="w-[74px]" inputClassName="w-full bg-transparent outline-none text-xs disabled:opacity-30" /></div>
                <div className="flex items-center gap-1 border-r border-neutral-900 px-2 py-2 text-[12px]">To:<PickerInput type="time" value={form.early_to} onChange={v => set('early_to', v)} onBlur={e => set('early_to', normalizeTime(e.target.value))} disabled={form.leave_type !== 'early'} placeholder="10:00" className="w-[74px]" inputClassName="w-full bg-transparent outline-none text-xs disabled:opacity-30" /></div>
                <div className="border-r border-neutral-400 px-2 py-2 text-center text-[12px]">( {form.leave_type === 'early' ? earlyDays(form.early_from, form.early_to) : ''} )</div><div className="px-2 py-2 text-[12px]">Day</div>
              </div>
            </td></tr>
            <tr>{labelCell('Paid/Unpaid:', 'مدفوع الاجر / غير مدفوع الاجر')}<td className="border border-neutral-900 p-0"><div className="grid grid-cols-[24px_1fr_24px_1fr]"><button type="button" onClick={() => set('paid', true)} className="flex items-center justify-center border-r border-neutral-400 py-2"><CheckMark checked={form.paid === true} /></button><button type="button" onClick={() => set('paid', true)} className="border-r border-neutral-900 px-3 py-2 text-left text-[12px] font-semibold">Paid</button><button type="button" onClick={() => set('paid', false)} className="flex items-center justify-center border-r border-neutral-400 py-2"><CheckMark checked={form.paid === false} /></button><button type="button" onClick={() => set('paid', false)} className="px-3 py-2 text-left text-[12px] font-semibold">Unpaid</button></div></td></tr>
            <tr>{labelCell('Available Balance', 'الرصيد المتاح')}<td className="border border-neutral-900 px-3 py-2">{balLoading ? <span className="text-xs text-neutral-500">Loading...</span> : <span className="font-bold text-primary">{formatBalance(availableBalance)}{casualRem2 !== null && <span className="text-purple-500 ml-1 font-bold">({formatBalance(casualRem2)} Casual)</span>}</span>}</td></tr>
            <tr>{labelCell('Annual Leave Request Date:', 'تاريخ طلب الاجازة')}<td className="border border-neutral-900 px-3 py-2"><PickerInput type="date" value={form.request_date} onChange={v => set('request_date', v)} placeholder="YYYY-MM-DD" /></td></tr>
            <tr>{labelCell('Annual Leave start Date:', 'تاريخ بداية الأجازه')}<td className="border border-neutral-900 px-3 py-2"><PickerInput type="date" required value={form.start_date} placeholder="YYYY-MM-DD" onChange={v => set('start_date', v)} /></td></tr>
            <tr>{labelCell('Annual Leave End Date:', 'تاريخ انتهاء الأجازه')}<td className="border border-neutral-900 px-3 py-2"><PickerInput type="date" required value={form.end_date} placeholder="YYYY-MM-DD" onChange={v => set('end_date', v)} /></td></tr>
            <tr>{labelCell('The purpose:', 'الغرض')}<td className="border border-neutral-900 px-3 py-2"><div className="flex gap-6">{[['Sick', 'مرضي'], ['Personal matter', 'أمر شخصي']].map(([value, ar]) => <button key={value} type="button" onClick={() => set('purpose', value)} className="flex items-center gap-2 text-[12px]"><CheckMark checked={form.purpose === value} /><span>{value}</span><span className="text-neutral-500" dir="rtl">{ar}</span></button>)}</div></td></tr>
            {sigRows('Employee Name / signature:', 'إسم الموظف / توقيعه', form.employee_name)}
            {sigRows('Alternate Employee name / signature:', 'إسم الموظف البديل / توقيعه', '', 'alternate_employee_name')}
            {sigRows('Direct manager Name / signature', 'المدير المباشر / التوقيع', form.direct_manager_name)}
            {sigRows('Human Resource', 'موظف الموارد البشريه', HR_OFFICER)}
            {sigRows('Depot Manager Signature', 'توقيع مدير الموقع', depotManagerName)}
          </tbody></table>
          <div className="mt-2 flex items-center justify-between border-t-2 border-neutral-950 pt-2 text-[10px] font-bold"><span>Document No: <span className="text-red-600">SRS-HR-P02-F01</span> | <span className="text-red-600">Rev.: 03</span> | Rev. Date: 06/05/2026</span><span>| Page 1 of 1</span></div>
        </div>
      </div>
      <div className="flex justify-end border-t border-neutral-100 px-4 py-4"><button type="submit" disabled={saving || !form.employee_name} className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-primary/90 disabled:opacity-60">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />Submitting...</> : 'Submit Leave Request'}</button></div>
    </form>
  )
}

function printOfficialLRF(d) {
  const checked = (v) => v ? '<span class="box">X</span>' : '<span class="box"></span>'
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>LRF</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#000}.page{width:210mm;height:297mm;padding:12mm 13mm 8mm;display:flex;flex-direction:column}table{width:100%;border-collapse:collapse}.hdr{border:2px solid #000}.hdr td{border:2px solid #000}.logo{width:42mm;text-align:center;padding:5mm}.logo img{max-height:16mm;max-width:34mm}.title{text-align:center;font-weight:900;font-size:17pt}.ar{direction:rtl;text-align:right;font-weight:700}.sub{font-size:9pt;line-height:1.45;margin:3mm 0}.main{border:2px solid #000;flex:1}.main td{border:1px solid #000;font-size:9pt;vertical-align:middle}.lbl{width:34%;padding:2.5mm;background:#fff}.lbl b{display:block}.lbl span{display:block;direction:rtl;text-align:right;font-size:8pt}.val{padding:2.5mm}.box{display:inline-flex;width:12px;height:12px;border:1px solid #000;align-items:center;justify-content:center;font-size:8pt;font-weight:700}.inner td{padding:2mm;border-color:#000}.sig{height:11mm}.sig-name{height:6mm;color:#444;font-style:italic}.foot{border-top:2px solid #000;margin-top:2mm;padding-top:1.5mm;font-size:8pt;font-weight:700;display:flex;justify-content:space-between}.red{color:#c00}</style></head><body><div class="page"><table class="hdr"><tr><td class="logo"><img src="${window.location.origin}/logo.svg" alt="Rotem SRS Egypt"></td><td class="title">Leave Request Form (LRF)<div class="ar" style="text-align:center;font-size:12pt;margin-top:2mm">نموذج طلب اجازة</div></td></tr></table><div class="sub"><div style="display:flex;justify-content:space-between;font-weight:900"><span>■ Document purpose:</span><span dir="rtl">الغرض من النموذج:</span></div><div>This form is for employees to use to take a leave of annual, casual, sick leaves and early leave</div><div class="ar">هذا النموذج خاص برصيد الأجازات السنويه، الاجازات العارضه و الاجازات المرضي والأذونات</div><b>■ Details:</b></div><table class="main"><tbody><tr><td class="lbl"><b>Employee Name:</b><span>إسم الموظف</span></td><td class="val">${d.employee_name || ''}</td></tr><tr><td class="lbl"><b>Job Title:</b><span>المسمى الوظيفى</span></td><td class="val">${d.job_title || ''}</td></tr><tr><td class="lbl"><b>Department:</b><span>الإداره</span></td><td class="val">${d.department_label || d.department || ''}</td></tr><tr><td class="lbl"><b>Leave Type:</b><span>نوع الاذن</span></td><td style="padding:0"><table class="inner"><tr><td>${checked(d.leave_type==='annual')}</td><td>Annual Leave</td><td>${checked(d.leave_type==='casual')}</td><td>Casual Leave</td><td>${checked(d.leave_type==='sick')}</td><td>Sick Leave</td></tr><tr><td>${checked(d.leave_type==='early')}</td><td>Early Leave</td><td>From: ${normalizeTime(d.early_from) || ''}</td><td>To: ${normalizeTime(d.early_to) || ''}</td><td>( ${d.leave_type==='early' ? earlyDays(d.early_from,d.early_to) : ''} )</td><td>Day</td></tr></table></td></tr><tr><td class="lbl"><b>Paid/Unpaid:</b><span>مدفوع الاجر / غير مدفوع الاجر</span></td><td style="padding:0"><table class="inner"><tr><td>${checked(d.paid===true)}</td><td>Paid</td><td>${checked(d.paid===false)}</td><td>Unpaid</td></tr></table></td></tr><tr><td class="lbl"><b>Available Balance</b><span>الرصيد المتاح</span></td><td class="val">${formatBalance(d.available_balance)}</td></tr><tr><td class="lbl"><b>Annual Leave Request Date:</b><span>تاريخ طلب الاجازة</span></td><td class="val">${fmtDate(d.request_date)}</td></tr><tr><td class="lbl"><b>Annual Leave start Date:</b><span>تاريخ بداية الأجازه</span></td><td class="val">${fmtDate(d.start_date)}</td></tr><tr><td class="lbl"><b>Annual Leave End Date:</b><span>تاريخ انتهاء الأجازه</span></td><td class="val">${fmtDate(d.end_date)}</td></tr><tr><td class="lbl"><b>The purpose:</b><span>الغرض</span></td><td class="val">${d.purpose || ''}</td></tr>${[['Employee Name / signature:', 'إسم الموظف / توقيعه', d.employee_name || ''], ['Alternate Employee name / signature:', 'إسم الموظف البديل / توقيعه', d.alternate_employee_name || ''], ['Direct manager Name / signature', 'المدير المباشر / التوقيع', d.manager_approver?.name || d.direct_manager_name || ''], ['Human Resource', 'موظف الموارد البشريه', HR_OFFICER], ['Depot Manager Signature', 'توقيع مدير الموقع', depotManagerNameFor(d)]].map(([en, ar, name]) => `<tr><td class="lbl" rowspan="2"><b>${en}</b><span>${ar}</span></td><td class="sig"></td></tr><tr><td class="sig-name">${name}</td></tr>`).join('')}</tbody></table><div class="foot"><span>Document No: <span class="red">SRS-HR-P02-F01</span> | <span class="red">Rev.: 03</span> | Rev. Date: 06/05/2026</span><span>| Page 1 of 1</span></div></div></body></html>`
  const w = window.open('', '_blank', 'width=860,height=1200')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

function printOfficialLRFGrid(d) {
  d = { ...d, available_balance: formatBalance(d.available_balance) }
  const esc = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

  const box = (checked) => `<span class="box">${checked ? 'X' : ''}</span>`
  const label = (en, ar) => `<td class="lbl"><b>${en}</b><span dir="rtl">${ar}</span></td>`
  // Blank out the direct-manager row when the same person signed both slots
  // (i.e. their direct manager IS the depot manager).
  const managerIsDepot = d.manager_approver?.id && d.approver?.id
                          ? d.manager_approver.id === d.approver.id
                          : false;
  const directNameOnForm = managerIsDepot ? '' : (d.manager_approver?.name || d.direct_manager_name || '');
  const sigRows = [
    ['Employee Name / signature:', 'إسم الموظف / توقيعه', d.employee_name],
    ['Alternate Employee name / signature:', 'إسم الموظف البديل / توقيعه', d.alternate_employee_name],
    ['Direct manager Name / signature', 'المدير المباشر / التوقيع', directNameOnForm],
    ['Human Resource', 'موظف الموارد البشريه', HR_OFFICER],
    ['Depot Manager Signature', 'توقيع مدير الموقع', d.approver?.name || DEPOT_MGR],
  ].map(([en, ar, name]) => {
    const displayName = en === 'Depot Manager Signature' ? depotManagerNameFor(d) : name
    return `
    <tr><td class="lbl" rowspan="2"><b>${en}</b><span dir="rtl">${ar}</span></td><td class="sig"></td></tr>
    <tr><td class="sig-name">${esc(displayName)}</td></tr>
  `
  }).join('')

  const leaveType = `
    <div class="cell-grid leave-grid top-row">
      <div class="check">${box(d.leave_type === 'annual')}</div><div class="txt">Annual Leave</div>
      <div class="check">${box(d.leave_type === 'casual')}</div><div class="txt">Casual Leave</div>
      <div class="check">${box(d.leave_type === 'sick')}</div><div class="txt last">Sick Leave</div>
    </div>
    <div class="cell-grid early-grid">
      <div class="check">${box(d.leave_type === 'early')}</div><div class="txt">Early Leave</div>
      <div class="txt">From: ${esc(normalizeTime(d.early_from))}</div>
      <div class="txt">To: ${esc(normalizeTime(d.early_to))}</div>
      <div class="txt center">( ${d.leave_type === 'early' ? esc(earlyDays(d.early_from, d.early_to)) : ''} )</div>
      <div class="txt last">Day</div>
    </div>`

  const paid = `
    <div class="cell-grid paid-grid">
      <div class="check">${box(d.paid === true)}</div><div class="txt">Paid</div>
      <div class="check">${box(d.paid === false)}</div><div class="txt last">Unpaid</div>
    </div>`

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>LRF</title>
<style>
@page{size:A4 portrait;margin:0}
*{box-sizing:border-box}
body{margin:0;background:#fff;font-family:Arial,sans-serif;color:#000}
.page{width:210mm;height:297mm;padding:12mm 13mm 8mm;display:flex;flex-direction:column}
table{width:100%;border-collapse:collapse}
.hdr{border-left:0;border-right:0;border-bottom:2px solid #000;border-top:0}
.hdr td{border-left:0;border-right:0;border-bottom:2px solid #000;border-top:0}
.hdr .logo{border-right:2px solid #000}
.logo{width:42mm;text-align:center;padding:5mm}
.logo img{max-height:16mm;max-width:34mm}
.title{text-align:center;font-weight:900;font-size:17pt}
.ar{direction:rtl;text-align:right;font-weight:700}
.sub{font-size:9pt;line-height:1.45;margin:3mm 0}
.main{border:2px solid #000;flex:1}
.main td{border:1px solid #000;font-size:9pt;vertical-align:middle}
.lbl{width:34%;padding:2.5mm;background:#fff}
.lbl b{display:block}
.lbl span{display:block;text-align:right;font-size:8pt}
.val{padding:2.5mm}
.split-cell{padding:0!important}
.cell-grid{display:grid;width:100%;min-height:11mm}
.leave-grid{grid-template-columns:8mm 1fr 8mm 1fr 8mm 1fr}
.early-grid{grid-template-columns:8mm 1fr 25mm 25mm 18mm 12mm}
.paid-grid{grid-template-columns:8mm 1fr 8mm 1fr}
.top-row{border-bottom:1px solid #000}
.check,.txt{display:flex;align-items:center;border-right:1px solid #000;padding:1.7mm 2mm;font-size:9pt}
.check{justify-content:center;padding-left:0;padding-right:0}
.txt.last{border-right:0}
.center{justify-content:center}
.box{display:inline-flex;width:12px;height:12px;border:1px solid #000;align-items:center;justify-content:center;font-size:8pt;font-weight:700;line-height:1}
.sig{height:11mm}
.sig-name{height:6mm;color:#444;font-style:italic;padding:1.5mm 2.5mm}
.foot{border-top:2px solid #000;margin-top:2mm;padding-top:1.5mm;font-size:8pt;font-weight:700;display:flex;justify-content:space-between}
.red{color:#c00}
.tracking{font-size:10pt;font-weight:900;margin:2mm 0 0;letter-spacing:.3pt}
</style>
</head>
<body>
<div class="page">
  <table class="hdr"><tr><td class="logo"><img src="${window.location.origin}/logo.svg" alt="Rotem SRS Egypt"></td><td class="title">Leave Request Form (LRF)<div class="ar" style="text-align:center;font-size:12pt;margin-top:2mm">نموذج طلب اجازة</div></td></tr></table>
  <p class="tracking">Tracking No: ${esc(d.tracking_no) || '<span style="color:#888;font-weight:normal;font-style:italic">__________</span>'}</p>
  <div class="sub"><div style="display:flex;justify-content:space-between;font-weight:900"><span>■ Document purpose:</span><span dir="rtl">الغرض من النموذج:</span></div><div>This form is for employees to use to take a leave of annual, casual, sick leaves and early leave</div><div class="ar">هذا النموذج خاص برصيد الأجازات السنويه، الاجازات العارضه و الاجازات المرضي والأذونات</div><b>■ Details:</b></div>
  <table class="main"><tbody>
    <tr>${label('Employee Name:', 'إسم الموظف')}<td class="val">${esc(d.employee_name)}</td></tr>
    <tr>${label('Job Title:', 'المسمى الوظيفى')}<td class="val">${esc(d.job_title)}</td></tr>
    <tr>${label('Department:', 'الإداره')}<td class="val">${esc(d.department_label || d.department)}</td></tr>
    <tr>${label('Leave Type:', 'نوع الاذن')}<td class="split-cell">${leaveType}</td></tr>
    <tr>${label('Paid/Unpaid:', 'مدفوع الاجر / غير مدفوع الاجر')}<td class="split-cell">${paid}</td></tr>
    <tr>${label('Available Balance', 'الرصيد المتاح')}<td class="val">${esc(d.available_balance)}</td></tr>
    <tr>${label('Annual Leave Request Date:', 'تاريخ طلب الاجازة')}<td class="val">${esc(fmtDate(d.request_date))}</td></tr>
    <tr>${label('Annual Leave start Date:', 'تاريخ بداية الأجازه')}<td class="val">${esc(fmtDate(d.start_date))}</td></tr>
    <tr>${label('Annual Leave End Date:', 'تاريخ انتهاء الأجازه')}<td class="val">${esc(fmtDate(d.end_date))}</td></tr>
    <tr>${label('The purpose:', 'الغرض')}<td class="val">${esc(d.purpose)}</td></tr>
    ${sigRows}
  </tbody></table>
  <div class="foot"><span>Document No: <span class="red">SRS-HR-P02-F01</span> | <span class="red">Rev.: 03</span> | Rev. Date: 06/05/2026</span><span>| Page 1 of 1</span></div>
</div>
</body>
</html>`

  const w = window.open('', '_blank', 'width=860,height=1200')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

const OTR_EMPTY = {
  employee_id: null, employee_name: '', job_title: '', department: '', department_label: '',
  direct_manager_name: '',
  ot_date: today(), start_time: '', end_time: '',
  explanation: '',
  overtime_results: '',
}

function OTRForm({ onSubmit, saving }) {
  const [form, setForm] = useState({ ...OTR_EMPTY })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const hours = diffHours(form.start_time, form.end_time)

  const handleEmployeeSelect = (emp) => {
    setForm(f => ({
      ...f,
      employee_id:      emp.id ?? null,
      employee_name:    emp.name ?? '',
      job_title:        emp.position ?? '',
      department:       emp.department ?? '',
      department_label: DEPT_LABEL[emp.department] ?? emp.department ?? '',
      direct_manager_name: '',
    }))
    if (emp.id) {
      getEmployee(emp.id)
        .then(res => {
          const full = unwrapData(res)
          const mgr = full?.direct_manager
          if (mgr?.name && mgr?.user_role !== 'depot_manager') {
            setForm(f => ({ ...f, direct_manager_name: mgr.name }))
          }
        })
        .catch(() => {})
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden" style={{fontFamily:'Arial, sans-serif'}}>
      {/* ══ PAGE HEADER — matches PDF ══ */}
      <table className="w-full border-collapse border-2 border-neutral-800">
        <tbody>
          <tr>
            <td className="border-r-2 border-neutral-800 w-[160px] px-3 py-2 align-middle">
              <img src="/logo.svg" alt="Rotem SRS Egypt" className="h-14 w-auto object-contain"
                onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }} />
              <div style={{display:'none'}} className="items-center gap-1">
                <span className="text-2xl font-black text-[#1b5e38] italic leading-none">Rotem</span>
                <div className="flex flex-col">
                  <span className="bg-[#1b5e38] text-white text-[8px] font-black px-1.5 py-px tracking-widest">SRS</span>
                  <span className="text-[7px] text-[#1b5e38] font-bold tracking-widest text-right mt-0.5">EGYPT</span>
                </div>
              </div>
            </td>
            <td className="text-center px-4 py-3 align-middle">
              <p className="text-xl font-black text-secondary-800 tracking-wide">Overtime Request Form</p>
              <p className="text-sm font-bold text-secondary-700 mt-1">إذن عمل ساعات إضافيه</p>
            </td>
          </tr>
        </tbody>
      </table>

      <form onSubmit={e => { e.preventDefault(); onSubmit({ ...form, hours, tracking_no: genOTRNo(), status: 'pending', type: 'otr', created_at: new Date().toISOString() }) }} className="divide-y divide-neutral-100">

        {/* Employee + Date */}
        <div className="grid grid-cols-2 divide-x divide-neutral-100">
          <div className="divide-y divide-neutral-100">
            <div className="grid grid-cols-[120px_1fr] divide-x divide-neutral-100">
              <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Employee Name</p><p className="text-[10px] text-neutral-400">إسم الموظف</p></div>
              <div className="px-4 py-3"><EmployeeSearch onSelect={handleEmployeeSelect} initialName={form.employee_name} /></div>
            </div>
          </div>
          <div className="grid grid-cols-[80px_1fr] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Date</p><p className="text-[10px] text-neutral-400">التاريخ</p></div>
            <div className="px-4 py-3"><input type="date" required value={form.ot_date} onChange={e => set('ot_date', e.target.value)} className={INP} /></div>
          </div>
        </div>

        {/* Title + Department */}
        <div className="grid grid-cols-2 divide-x divide-neutral-100">
          <div className="grid grid-cols-[120px_1fr] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Title</p><p className="text-[10px] text-neutral-400">المسمى الوظيفي</p></div>
            <div className="px-4 py-3"><input value={form.job_title} onChange={e => set('job_title', e.target.value)} className={INP} placeholder="Auto-filled" /></div>
          </div>
          <div className="grid grid-cols-[80px_1fr] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Department</p><p className="text-[10px] text-neutral-400">الإداره</p></div>
            <div className="px-4 py-3"><input value={form.department_label || form.department} readOnly className={INP + ' bg-neutral-50 cursor-default'} placeholder="Auto-filled" /></div>
          </div>
        </div>

        {/* Overtime From / To / Hours */}
        <div className="grid grid-cols-[1fr_1fr_200px] divide-x divide-neutral-100">
          <div className="grid grid-cols-[140px_1fr] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Overtime needed from</p><p className="text-[10px] text-neutral-400">العمل الإضافي من</p></div>
            <div className="px-4 py-3"><input type="time" required value={form.start_time} onChange={e => set('start_time', e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-[40px_1fr] divide-x divide-neutral-100">
            <div className="px-2 py-3 bg-neutral-50 flex items-center justify-center"><p className="text-xs font-bold text-secondary-700">To</p></div>
            <div className="px-4 py-3"><input type="time" required value={form.end_time} onChange={e => set('end_time', e.target.value)} className={INP} /></div>
          </div>
          <div className="grid grid-cols-[1fr_80px] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">Total not to exceed</p><p className="text-[10px] text-neutral-400">إجمالي الساعات</p></div>
            <div className="px-4 py-3 flex items-center justify-center">
              <span className="text-xl font-black text-primary">{hours}</span>
            </div>
          </div>
        </div>

        {/* Explanation */}
        <div className="divide-y divide-neutral-100">
          <div className="px-4 py-2 bg-neutral-50">
            <p className="text-xs font-bold text-secondary-700">Detailed Explanation why over time is required</p>
            <p className="text-[10px] text-neutral-400">تفسير سبب إحتياج العمل لساعات إضافيه</p>
          </div>
          <div className="px-4 py-3">
            <textarea required value={form.explanation} onChange={e => set('explanation', e.target.value)} rows={4} className={INP + ' resize-none'} placeholder="Describe in detail why overtime is needed…" />
          </div>
        </div>

        {/* Overtime Results */}
        <div className="divide-y divide-neutral-100">
          <div className="px-4 py-2 bg-neutral-50">
            <p className="text-xs font-bold text-secondary-700">Overtime Results</p>
            <p className="text-[10px] text-neutral-400">نتائج العمل لساعات إضافيه</p>
          </div>
          <div className="px-4 py-3">
            <textarea value={form.overtime_results} onChange={e => set('overtime_results', e.target.value)} rows={4} className={INP + ' resize-none'} placeholder="Describe the results / outcomes of the overtime work…" />
          </div>
        </div>

        {/* Signatures */}
        {[
          ['Direct Manager Signature', 'توقيع مدير المباشر', ''],
          ['HR Signature', 'توقيع الموارد البشرية', HR_OFFICER],
          ['Depot Manager Signature', 'توقيع مدير الموقع', DEPOT_MGR],
        ].map(([en, ar, val]) => (
          <div key={en} className="grid grid-cols-[200px_1fr_100px_150px] divide-x divide-neutral-100">
            <div className="px-4 py-3 bg-neutral-50"><p className="text-xs font-bold text-secondary-700">{en}</p><p className="text-[10px] text-neutral-400">{ar}</p></div>
            <div className="px-4 py-4 min-h-[48px] flex items-end"><p className="text-sm text-neutral-500 italic">{val}</p></div>
            <div className="px-4 py-3 bg-neutral-50 flex items-center"><p className="text-xs font-bold text-secondary-700">Date</p></div>
            <div className="px-4 py-4" />
          </div>
        ))}

        {/* Submit */}
        <div className="px-6 py-4 bg-neutral-50 flex justify-end">
          <button type="submit" disabled={saving || !form.employee_name}
            className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-xl transition-all disabled:opacity-60">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" />Submitting…</> : 'Submit Overtime Request'}
          </button>
        </div>
      </form>

      {/* ══ FOOTER — Doc number bar at bottom like PDF ══ */}
      <div className="border-t-2 border-neutral-800 text-center text-[10px] font-bold py-1.5 px-2 bg-neutral-50 tracking-wide text-neutral-800">
        Document No:&nbsp;<span style={{color:'#c00'}}>SRS-HR-P02-F03</span>&nbsp;&nbsp;|&nbsp;&nbsp;<span style={{color:'#c00'}}>Rev.: 02</span>&nbsp;&nbsp;|&nbsp;&nbsp;Rev. Date: 04-May-2025&nbsp;&nbsp;|&nbsp;&nbsp;Page 1 of 1
      </div>
    </div>
  )
}

// ── Signature stamp display ───────────────────────────────────
function SigStamp({ label, name, date, sig }) {
  return (
    <div className="flex flex-col items-center gap-1 min-w-[120px]">
      <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide text-center">{label}</p>
      <div className="w-28 h-14 border border-dashed border-neutral-300 rounded-lg flex items-center justify-center bg-neutral-50 overflow-hidden">
        {sig
          ? <img src={sig} alt={label} className="max-h-12 max-w-full object-contain" />
          : <span className="text-[10px] text-neutral-300 italic">Pending</span>
        }
      </div>
      {name && <p className="text-[10px] font-semibold text-secondary-700 text-center">{name}</p>}
      {date && <p className="text-[10px] text-neutral-400">{fmtShort(date)}</p>}
    </div>
  )
}

// ── Approval steps progress bar ───────────────────────────────
function ApprovalProgress({ req }) {
  const steps = [
    { label: 'Submitted',       done: true,                                              date: req.created_at },
    { label: 'Manager Approval', done: ['manager_approved','hr_approved','approved'].includes(req.status), date: req.manager_approved_at, name: req.manager_approver?.name },
    { label: 'HR Approval',      done: ['hr_approved','approved'].includes(req.status),       date: req.hr_approved_at,      name: req.hr_approver?.name },
    { label: 'Depot Approval',   done: req.status === 'approved',                            date: req.approved_at,         name: req.approver?.name },
  ]
  return (
    <div className="flex items-start gap-0 mt-1 mb-3">
      {steps.map((s, i) => (
        <div key={i} className="flex-1 flex flex-col items-center relative">
          {i > 0 && (
            <div className={`absolute top-2.5 right-1/2 w-full h-0.5 -z-0 ${steps[i].done ? 'bg-green-400' : 'bg-neutral-200'}`} />
          )}
          <div className={`w-5 h-5 rounded-full flex items-center justify-center z-10 text-white shrink-0 ${s.done ? 'bg-green-500' : 'bg-neutral-200'}`}>
            {s.done ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="text-[9px] text-neutral-400">{i+1}</span>}
          </div>
          <p className="text-[10px] font-semibold text-center mt-1 text-secondary-700 leading-tight">{s.label}</p>
          {s.name && <p className="text-[9px] text-neutral-400 text-center">{s.name}</p>}
          {s.date && <p className="text-[9px] text-neutral-400 text-center">{fmtShort(s.date)}</p>}
        </div>
      ))}
    </div>
  )
}

// ── request detail modal ──────────────────────────────────────
function RequestDetailModal({ req, onClose, onManagerApprove, onHrApprove, onApprove, onReject, onReschedule, onCancel, userRole, userDepartment, currentUserId, isDirectManager, onUpdated }) {
  if (!req) return null
  const isLRF       = req.type === 'lrf'
  const isDepotAdmin = userRole === 'admin' || userRole === 'depot_manager'
  const canHrApprove = userRole === 'admin' || userRole === 'hr'
  const isHR         = isDepotAdmin || canHrApprove
  const canWithdraw  = ['pending','manager_approved','hr_approved','approved'].includes(req.status) && (isDepotAdmin || req.user_id === currentUserId)

  // Tracking-number inline editor (HR only)
  const [trackingDraft, setTrackingDraft]   = useState(req.tracking_no || '')
  const [editingTracking, setEditingTracking] = useState(false)
  const [savingTracking, setSavingTracking] = useState(false)

  const saveTracking = async () => {
    const value = trackingDraft.trim()
    if (!value) { alert('Tracking number cannot be empty'); return }
    setSavingTracking(true)
    try {
      await updateLeaveTrackingNo(req.id, value)
      req.tracking_no = value          // optimistic local update
      setEditingTracking(false)
      onUpdated?.()
    } catch (e) {
      alert(e.message || 'Failed to update tracking number')
    } finally {
      setSavingTracking(false)
    }
  }

  const trackingMissing = !req.tracking_no || /-(\s*)$/.test(req.tracking_no)
  const confirmMissing = (action) => {
    if (trackingMissing) {
      const ok = window.confirm(`This request has no tracking number set. ${action} without it?`)
      if (!ok) return false
    }
    return true
  }
  const handlePrintClick = () => {
    if (!confirmMissing('Print')) return
    return isLRF ? printOfficialLRFGrid(req) : printOTR(req)
  }
  const handleDownloadWord = () => {
    if (!confirmMissing('Download')) return
    return generateRequestWord(req)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 sticky top-0 bg-white z-10">
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-sm font-bold text-secondary-700">{isLRF ? 'Leave Request (LRF)' : 'Overtime Request (OTR)'}</p>

            {isHR && editingTracking ? (
              <div className="mt-1 flex items-center gap-1.5">
                <input
                  value={trackingDraft}
                  onChange={e => setTrackingDraft(e.target.value)}
                  placeholder={isLRF ? 'LRF-GZ-0001' : 'OTR-EG1-0001'}
                  autoFocus
                  className="text-xs px-2 py-1 border border-primary rounded-md outline-none focus:ring-1 focus:ring-primary w-44"
                  onKeyDown={e => { if (e.key === 'Enter') saveTracking(); if (e.key === 'Escape') { setEditingTracking(false); setTrackingDraft(req.tracking_no || '') } }}
                />
                <button onClick={saveTracking} disabled={savingTracking}
                  className="px-2 py-1 text-[10px] font-bold text-white bg-green-600 hover:bg-green-700 rounded-md disabled:opacity-50">
                  {savingTracking ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditingTracking(false); setTrackingDraft(req.tracking_no || '') }}
                  className="px-2 py-1 text-[10px] font-bold text-neutral-500 hover:bg-neutral-100 rounded-md">
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1">
                <p className={`text-xs ${trackingMissing ? 'text-amber-600 italic font-semibold' : 'text-neutral-400'}`}>
                  {trackingMissing ? 'No tracking number' : req.tracking_no}
                </p>
                {isHR && (
                  <button onClick={() => setEditingTracking(true)}
                    className="text-[10px] font-bold text-primary hover:underline">
                    {trackingMissing ? '+ Set' : 'Edit'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StatusBadge status={req.status} />
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Approval progress */}
        <div className="px-6 pt-4">
          <ApprovalProgress req={req} />
        </div>

        {/* Details */}
        <div className="px-6 pb-4 divide-y divide-neutral-100 text-sm">
          {[
            ['Employee',   req.employee_name],
            ['Job Title',  req.job_title],
            ['Department', req.department_label || req.department],
            isLRF ? ['Leave Type', req.leave_type?.replace('_',' ')] : ['Date', fmtShort(req.ot_date)],
            isLRF ? ['Period', `${fmtShort(req.start_date)} → ${fmtShort(req.end_date)} (${fmtDays(req.days)} days)`] : ['Time', `${req.start_time} – ${req.end_time} (${req.hours}h)`],
            isLRF ? ['Paid', req.paid ? 'Paid' : 'Unpaid'] : ['Explanation', req.explanation],
            isLRF ? ['Purpose', req.purpose] : (req.overtime_results ? ['Overtime Results', req.overtime_results] : null),
            req.rejection_reason  ? ['Rejection Reason',  req.rejection_reason]  : null,
            req.reschedule_reason ? ['Reschedule Reason', req.reschedule_reason] : null,
            ['Submitted', fmtShort(req.created_at)],
          ].filter(Boolean).map(([k, v]) => v ? (
            <div key={k} className="py-2.5 grid grid-cols-[150px_1fr] gap-2">
              <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wide">{k}</span>
              <span className="text-secondary-700 font-medium">{v}</span>
            </div>
          ) : null)}
        </div>

        {/* Signatures strip (show when approved) */}
        {['hr_approved','approved'].includes(req.status) && (
          <div className="px-6 pb-4 border-t border-neutral-100">
            <p className="text-xs font-bold text-neutral-400 uppercase tracking-wide mb-3 pt-3">Signatures</p>
            <div className="flex gap-4 flex-wrap">
              <SigStamp label="Direct Manager" name={req.manager_approver?.name} date={req.manager_approved_at} sig={req.manager_signature} />
              <SigStamp label="HR Officer"     name={req.hr_approver?.name}       date={req.hr_approved_at}      sig={req.hr_signature}      />
              <SigStamp label="Depot Manager"  name={req.approver?.name}          date={req.approved_at}         sig={req.depot_signature}   />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintClick}
              title="Print"
              className="flex items-center justify-center w-10 h-10 text-neutral-500 hover:text-secondary border border-neutral-200 rounded-xl hover:bg-neutral-50 transition-all">
              <Printer className="w-4 h-4" />
            </button>
            <button
              onClick={handleDownloadWord}
              title="Download Word"
              className="flex items-center justify-center w-10 h-10 text-white bg-primary hover:bg-primary-600 rounded-xl transition-all">
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-2 items-center flex-wrap justify-end">
            {canWithdraw && (
              <button onClick={() => onCancel(req.id)}
                title="Withdraw"
                className="flex items-center justify-center w-10 h-10 text-neutral-500 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 rounded-xl transition-all">
                <Ban className="w-4 h-4" />
              </button>
            )}

            {/* Direct manager (non-depot) approving a pending request */}
            {req.status === 'pending' && isDirectManager && !isDepotAdmin && (
              <>
                <button onClick={() => onReschedule(req.id)}
                  title="Reschedule"
                  className="flex items-center justify-center w-10 h-10 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all">
                  <CalendarClock className="w-4 h-4" />
                </button>
                <button onClick={() => onReject(req.id)}
                  title="Reject"
                  className="flex items-center justify-center w-10 h-10 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all">
                  <XCircle className="w-4 h-4" />
                </button>
                <button onClick={() => onManagerApprove(req.id)}
                  title="Approve"
                  className="flex items-center justify-center w-10 h-10 text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all">
                  <CheckCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {/* Depot/admin: pending or manager_approved → single Approve */}
            {req.status === 'pending' && isDepotAdmin && (
              <>
                <button onClick={() => onReschedule(req.id)}
                  title="Reschedule"
                  className="flex items-center justify-center w-10 h-10 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all">
                  <CalendarClock className="w-4 h-4" />
                </button>
                <button onClick={() => onReject(req.id)}
                  title="Reject"
                  className="flex items-center justify-center w-10 h-10 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all">
                  <XCircle className="w-4 h-4" />
                </button>
                <button onClick={() => onManagerApprove(req.id)}
                  title="Manager Approve"
                  className="flex items-center justify-center w-10 h-10 text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all">
                  <CheckCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {req.status === 'manager_approved' && canHrApprove && (
              <>
                <button onClick={() => onReschedule(req.id)}
                  title="Reschedule"
                  className="flex items-center justify-center w-10 h-10 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all">
                  <CalendarClock className="w-4 h-4" />
                </button>
                <button onClick={() => onReject(req.id)}
                  title="Reject"
                  className="flex items-center justify-center w-10 h-10 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all">
                  <XCircle className="w-4 h-4" />
                </button>
                <button onClick={() => onHrApprove(req.id)}
                  title="HR Approve"
                  className="flex items-center justify-center w-10 h-10 text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-all">
                  <CheckCircle className="w-4 h-4" />
                </button>
              </>
            )}

            {isDepotAdmin && req.status === 'hr_approved' && (
              <>
                <button onClick={() => onReschedule(req.id)}
                  title="Reschedule"
                  className="flex items-center justify-center w-10 h-10 text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl transition-all">
                  <CalendarClock className="w-4 h-4" />
                </button>
                <button onClick={() => onReject(req.id)}
                  title="Reject"
                  className="flex items-center justify-center w-10 h-10 text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all">
                  <XCircle className="w-4 h-4" />
                </button>
                <button onClick={() => onApprove(req.id)}
                  title="Final Approve"
                  className="flex items-center justify-center w-10 h-10 text-white bg-green-600 hover:bg-green-700 rounded-xl transition-all">
                  <CheckCircle className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────
export default function LeaveRequestsPage() {
  const { user }      = useSelector(s => s.auth)
  const isDepotAdmin  = user?.role === 'admin' || user?.role === 'depot_manager'
  const isHrApprover  = user?.role === 'admin' || user?.role === 'hr'
  const isManager     = isDepotAdmin  // keep for compat
  const location      = useLocation()
  const navigate      = useNavigate()

  const [tab,         setTab]         = useState('lrf')
  const [requests,    setRequests]    = useState([])
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [formKey,     setFormKey]     = useState(0)   // increment to reset form
  const [viewReq,     setViewReq]     = useState(null)
  const [rejectModal,  setRejectModal]  = useState(null) // { id }
  const [rejectReason, setRejectReason] = useState('')
  const [cancelModal,  setCancelModal]  = useState(null) // { id }
  const [cancelReason,     setCancelReason]     = useState('')
  const [rescheduleModal,  setRescheduleModal]  = useState(null) // { id }
  const [rescheduleReason, setRescheduleReason] = useState('')
  // History filters
  const [historyType,   setHistoryType]   = useState('all')  // all | lrf | otr
  const [historyStatus, setHistoryStatus] = useState('all')  // all | approved | rejected | cancelled | rescheduled
  const [historyPeriod, setHistoryPeriod] = useState('current_month')   // current_month | last_30 | last_90 | last_year | all
  const [historyPage,   setHistoryPage]   = useState(1)
  const HISTORY_PER_PAGE = 25

  // Pending actions: each role sees the stage it can move forward.
  const pending = requests.filter(r =>
    (r.status === 'pending' && (isDepotAdmin || user?.role === 'manager')) ||
    (r.status === 'manager_approved' && isHrApprover) ||
    (r.status === 'hr_approved' && isDepotAdmin)
  )

  // Check if current user is the direct manager of a given request's employee
  // direct_manager_id now references employees.id → employee.directManager.user_id must match
  const isDirectManagerOf = (req) => {
    return req.employee?.directManager?.user_id === user?.id
  }

  // Single row renderer used by both Active and History sections
  const renderRequestRow = (r) => (
    <div key={r.id} className="flex items-center justify-between px-6 py-4 hover:bg-neutral-50 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.type==='lrf'?'bg-blue-50 text-blue-500':'bg-orange-50 text-orange-500'}`}>
          {r.type==='lrf' ? <Calendar className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-secondary-700">
            {r.type==='lrf' ? `${(r.leave_type||'').replace('_',' ')} Leave` : 'Overtime Request'}
            {r.tracking_no && <span className="ml-2 text-xs text-neutral-400 font-normal">{r.tracking_no}</span>}
          </p>
          <p className="text-xs text-neutral-400">
            {r.employee_name} · {r.type==='lrf'
              ? `${fmtShort(r.start_date)} → ${fmtShort(r.end_date)} · ${fmtDays(r.days)}d`
              : `${fmtShort(r.ot_date)} · ${r.start_time}–${r.end_time} · ${r.hours}h`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <StatusBadge status={r.status} />
        <button onClick={() => setViewReq(r)} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors"><Eye className="w-4 h-4" /></button>
        {r.status === 'approved' && (
          <button
            onClick={() => generateRequestWord(r)}
            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" title="Download Word">
            <Download className="w-4 h-4" />
          </button>
        )}
        {['pending','manager_approved','hr_approved','approved'].includes(r.status) && (isDepotAdmin || r.user_id === user?.id) && (
          <button onClick={() => setCancelModal({ id: r.id })}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-300 hover:text-neutral-500 transition-colors" title="Cancel / Withdraw">
            <Ban className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  )

  const fetchRequests = useCallback(async () => {
    setLoadingReqs(true)
    try {
      const [activeRes, historyRes] = await Promise.all([
        getLeaveRequests({ scope: 'active' }),
        getLeaveRequests({ scope: 'history', ...historyRange(historyPeriod) }),
      ])
      const merged = [...(activeRes.data ?? []), ...(historyRes.data ?? [])]
      setRequests(Array.from(new Map(merged.map(r => [r.id, r])).values()))
    } catch (_) {}
    finally { setLoadingReqs(false) }
  }, [historyPeriod])

  useEffect(() => { fetchRequests() }, [fetchRequests])

  // Auto-open request modal if notification deep-link points to a specific request.
  // Re-runs whenever URL search OR requests change (so it works even if user is already on the page).
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const reqId = params.get('req')
    if (!reqId) return

    if (requests.length) {
      const found = requests.find(r => String(r.id) === String(reqId))
      if (found) {
        setViewReq(found)
        // Clean the URL so refresh / back-button won't re-trigger
        navigate(location.pathname, { replace: true })
      } else {
        // Request not in current list — refresh once to fetch it
        fetchRequests()
      }
    } else if (!loadingReqs) {
      // Requests not loaded yet and not currently loading → trigger fetch
      fetchRequests()
    }
  }, [location.search, requests, loadingReqs])

  const handleSubmit = async (data) => {
    setSaving(true)
    try {
      await createLeaveRequest(data)
      setSubmitted(true)
      setFormKey(k => k + 1)          // reset the form to empty
      setTimeout(() => setSubmitted(false), 6000)
      fetchRequests()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleManagerApprove = async (id) => {
    try {
      await managerApproveLeave(id)
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  const handleHrApprove = async (id) => {
    try {
      await hrApproveLeave(id)
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  const handleApprove = async (id) => {
    try {
      await approveLeave(id)
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    try {
      await rejectLeave(rejectModal.id, rejectReason)
      setRejectModal(null)
      setRejectReason('')
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  const handleCancel = async () => {
    if (!cancelModal) return
    try {
      await cancelLeave(cancelModal.id, cancelReason)
      setCancelModal(null)
      setCancelReason('')
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  const handleReschedule = async () => {
    if (!rescheduleModal) return
    try {
      await rescheduleLeave(rescheduleModal.id, rescheduleReason)
      setRescheduleModal(null)
      setRescheduleReason('')
      setViewReq(null)
      fetchRequests()
    } catch (e) { alert(e.message) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700">Leave & Overtime Requests</h1>
          <p className="text-sm text-neutral-400 mt-0.5">نماذج طلب الإجازة وساعات العمل الإضافي</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Refresh */}
          <button onClick={fetchRequests}
            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Success toast — fixed bottom-right */}
      {submitted && (
        <div className="fixed bottom-6 right-6 z-[60] flex items-start gap-3 bg-white border border-green-200 shadow-2xl rounded-2xl px-5 py-4 max-w-sm animate-fade-in">
          <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-secondary-700">Request Submitted!</p>
            <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
              Your request has been sent successfully and is pending approval from the direct manager.
            </p>
          </div>
          <button onClick={() => setSubmitted(false)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-300 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-3">
        {[['lrf', 'Leave Request (LRF)', 'نموذج طلب الإجازة'],
          ['otr', 'Overtime Request (OTR)', 'نموذج العمل الإضافي']].map(([key, label, sub]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-col items-start px-5 py-3 rounded-xl border transition-all text-left ${
              tab === key ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-neutral-500 border-neutral-200 hover:border-primary/40 hover:text-primary'
            }`}>
            <span className="text-sm font-bold">{label}</span>
            <span className={`text-[11px] mt-0.5 ${tab === key ? 'text-white/70' : 'text-neutral-400'}`}>{sub}</span>
          </button>
        ))}
      </div>

      {/* Form */}
      {tab === 'lrf'
        ? <OfficialLRFForm key={`lrf-${formKey}`} onSubmit={handleSubmit} saving={saving} />
        : <OTRForm key={`otr-${formKey}`} onSubmit={handleSubmit} saving={saving} />
      }

      {/* Pending approvals — manager / depot_manager only */}
      {(isDepotAdmin || isHrApprover || user?.role === 'manager') && pending.length > 0 && (
        <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-amber-700">Pending Approvals</h2>
            <span className="ml-auto px-2 py-0.5 bg-amber-200 text-amber-800 text-xs font-bold rounded-full">{pending.length}</span>
          </div>
          <div className="divide-y divide-neutral-50">
            {pending.map(r => (
              <div key={r.id} className="flex items-center justify-between px-6 py-4 hover:bg-amber-50/40 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${r.type==='lrf'?'bg-blue-50 text-blue-500':'bg-orange-50 text-orange-500'}`}>
                    {r.type==='lrf' ? <Calendar className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-secondary-700">{r.employee_name}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="text-xs text-neutral-400">
                      {r.type==='lrf'
                        ? `${r.leave_type} leave · ${fmtDays(r.days)} days (${fmtShort(r.start_date)}→${fmtShort(r.end_date)})`
                        : `Overtime · ${r.hours}h · ${fmtShort(r.ot_date)}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setViewReq(r)} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors"><Eye className="w-4 h-4" /></button>
                  <button onClick={() => setRescheduleModal({ id: r.id })}
                    className="px-3 py-1.5 text-xs font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all">Reschedule</button>
                  <button onClick={() => setRejectModal({ id: r.id })}
                    className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all">Reject</button>
                  {/* Depot/admin: pending → Approve directly (full approve) */}
                  {r.status === 'pending' && isDepotAdmin && (
                    <button onClick={() => handleManagerApprove(r.id)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all">Manager Approve</button>
                  )}
                  {/* Regular manager: pending → Approve (manager step) */}
                  {r.status === 'pending' && !isDepotAdmin && (
                    <button onClick={() => handleManagerApprove(r.id)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all">Approve</button>
                  )}
                  {/* Depot/admin: manager_approved → Final Approve */}
                  {r.status === 'manager_approved' && isHrApprover && (
                    <button onClick={() => handleHrApprove(r.id)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-all">HR Approve</button>
                  )}
                  {r.status === 'hr_approved' && isDepotAdmin && (
                    <button onClick={() => handleApprove(r.id)}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-all">Final Approve</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ Active Requests — always visible (small count) ═══ */}
      {(() => {
        const active = requests.filter(r =>
          ['pending', 'manager_approved', 'hr_approved'].includes(r.status) ||
          (r.type === 'lrf' && r.status === 'approved' && !r.balance_deducted_at)
        )
        if (active.length === 0) return null
        return (
          <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-blue-50/30">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <h2 className="text-sm font-bold text-secondary-700">Active Requests</h2>
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">{active.length}</span>
              </div>
              <p className="text-[11px] text-neutral-400">In-progress or upcoming</p>
            </div>
            <div className="divide-y divide-neutral-50">
              {active.map(r => renderRequestRow(r))}
            </div>
          </div>
        )
      })()}

      {/* ═══ Requests History — paginated, filtered ═══ */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-secondary-700">Requests History</h2>
            <p className="text-xs text-neutral-400 mt-0.5">Closed, approved & past requests</p>
          </div>
          {loadingReqs && <Loader2 className="w-4 h-4 animate-spin text-neutral-300" />}
        </div>

        {(() => {
          // Build the history pool: closed + completed (NOT in active set)
          const historyPool = requests.filter(r =>
            r.status === 'rejected' ||
            r.status === 'cancelled' ||
            r.status === 'rescheduled' ||
            (r.type === 'lrf' && r.status === 'approved' && r.balance_deducted_at) ||
            // Approved OTR is history once it is approved.
            (r.type === 'otr' && r.status === 'approved')
          )

          // Apply period filter
          let periodFiltered = historyPool
          if (historyPeriod !== 'all') {
            const { from } = historyRange(historyPeriod)
            const cutoff = new Date(from)
            periodFiltered = historyPool.filter(r => new Date(r.created_at) >= cutoff)
          }

          // Apply type + status filter
          const filtered = periodFiltered.filter(r =>
            (historyType   === 'all' || r.type   === historyType) &&
            (historyStatus === 'all' || r.status === historyStatus)
          )

          // Pagination
          const totalPages = Math.max(1, Math.ceil(filtered.length / HISTORY_PER_PAGE))
          const safePage   = Math.min(historyPage, totalPages)
          const pageStart  = (safePage - 1) * HISTORY_PER_PAGE
          const pageItems  = filtered.slice(pageStart, pageStart + HISTORY_PER_PAGE)

          return (
            <>
              {/* Filters bar */}
              <div className="px-6 py-3 border-b border-neutral-50 bg-neutral-50/50 flex flex-wrap items-center gap-2">
                {/* Type pills */}
                <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
                  {[
                    ['all', 'All',      historyPool.length],
                    ['lrf', 'Leave',    historyPool.filter(r => r.type === 'lrf').length],
                    ['otr', 'Overtime', historyPool.filter(r => r.type === 'otr').length],
                  ].map(([key, label, n]) => (
                    <button key={key} onClick={() => { setHistoryType(key); setHistoryPage(1) }}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                        historyType === key ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-neutral-100'
                      }`}>
                      {label} <span className={`ml-1 ${historyType === key ? 'text-white/80' : 'text-neutral-300'}`}>({n})</span>
                    </button>
                  ))}
                </div>

                <span className="w-px h-5 bg-neutral-200 mx-1" />

                {/* Status pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    ['all',         'All',         'bg-neutral-100 text-neutral-600 border-neutral-200', 'bg-neutral-700 text-white'],
                    ['approved',    'Approved',    'bg-green-50 text-green-700 border-green-200',        'bg-green-600 text-white'],
                    ['rejected',    'Rejected',    'bg-red-50 text-red-700 border-red-200',              'bg-red-500 text-white'],
                    ['cancelled',   'Cancelled',   'bg-neutral-50 text-neutral-500 border-neutral-200',  'bg-neutral-500 text-white'],
                    ['rescheduled', 'Rescheduled', 'bg-purple-50 text-purple-700 border-purple-200',     'bg-purple-500 text-white'],
                  ].map(([key, label, idle, active]) => {
                    const count = key === 'all' ? historyPool.length : historyPool.filter(r => r.status === key).length
                    if (key !== 'all' && count === 0) return null
                    return (
                      <button key={key} onClick={() => { setHistoryStatus(key); setHistoryPage(1) }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md border transition-all ${
                          historyStatus === key ? active : idle + ' hover:bg-white'
                        }`}>
                        {label} <span className="opacity-75 ml-0.5">{count}</span>
                      </button>
                    )
                  })}
                </div>

                <span className="w-px h-5 bg-neutral-200 mx-1" />

                {/* Period dropdown */}
                <select
                  value={historyPeriod}
                  onChange={e => { setHistoryPeriod(e.target.value); setHistoryPage(1) }}
                  className="px-3 py-1 text-xs font-bold bg-white border border-neutral-200 rounded-md outline-none focus:border-primary cursor-pointer">
                  <option value="current_month">This month</option>
                  <option value="last_30">Last 30 days</option>
                  <option value="last_90">Last 90 days</option>
                  <option value="last_year">Last year</option>
                  <option value="all">All time</option>
                </select>
              </div>

              {/* List */}
              {historyPool.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
                  <Calendar className="w-10 h-10 mb-3" />
                  <p className="text-sm font-semibold">No history yet</p>
                  <p className="text-xs mt-1">Closed requests will appear here</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-neutral-300">
                  <Calendar className="w-8 h-8 mb-2" />
                  <p className="text-sm font-semibold">No matching requests</p>
                  <p className="text-xs mt-1">Try a different filter or period</p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-neutral-50">
                    {pageItems.map(r => renderRequestRow(r))}
                  </div>

                  {/* Pagination footer */}
                  {totalPages > 1 && (
                    <div className="px-6 py-3 border-t border-neutral-100 flex items-center justify-between bg-neutral-50/50">
                      <p className="text-xs text-neutral-400">
                        Showing <span className="font-bold text-secondary-700">{pageStart + 1}</span>–<span className="font-bold text-secondary-700">{Math.min(pageStart + HISTORY_PER_PAGE, filtered.length)}</span> of <span className="font-bold text-secondary-700">{filtered.length}</span>
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                          disabled={safePage === 1}
                          className="px-3 py-1 text-xs font-bold rounded-md border border-neutral-200 text-neutral-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                          ← Prev
                        </button>
                        <span className="px-3 py-1 text-xs font-bold text-secondary-700">
                          {safePage} / {totalPages}
                        </span>
                        <button onClick={() => setHistoryPage(p => Math.min(totalPages, p + 1))}
                          disabled={safePage === totalPages}
                          className="px-3 py-1 text-xs font-bold rounded-md border border-neutral-200 text-neutral-500 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                          Next →
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )
        })()}
      </div>

      {/* Detail / approval modal */}
      {viewReq && (
        <RequestDetailModal
          req={viewReq}
          onClose={() => setViewReq(null)}
          onManagerApprove={handleManagerApprove}
          onHrApprove={handleHrApprove}
          onApprove={handleApprove}
          onReject={(id) => { setRejectModal({ id }); setViewReq(null) }}
          onReschedule={(id) => { setRescheduleModal({ id }); setViewReq(null) }}
          onCancel={(id) => { setCancelModal({ id }); setViewReq(null) }}
          userRole={user?.role}
          userDepartment={user?.department}
          currentUserId={user?.id}
          isDirectManager={isDirectManagerOf(viewReq)}
          onUpdated={fetchRequests}
        />
      )}

      {/* Reject reason modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setRejectModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-secondary-700">Reject Request</p>
              <button onClick={() => setRejectModal(null)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Reason (optional)</label>
              <textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-red-400 resize-none"
                placeholder="Explain why this request is being rejected…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 rounded-lg transition-all">Cancel</button>
              <button onClick={handleReject} className="px-5 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-all">Confirm Reject</button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setRescheduleModal(null); setRescheduleReason('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                <CalendarClock className="w-5 h-5 text-amber-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-secondary-700">Request Reschedule</p>
                <p className="text-xs text-neutral-400">The employee will be notified to pick another date.</p>
              </div>
              <button onClick={() => { setRescheduleModal(null); setRescheduleReason('') }} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Reason (optional)</label>
              <textarea
                value={rescheduleReason}
                onChange={e => setRescheduleReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-amber-400 resize-none"
                placeholder="Why does this date not work? (e.g. operational requirements)…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setRescheduleModal(null); setRescheduleReason('') }} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 rounded-lg transition-all">Cancel</button>
              <button onClick={handleReschedule} className="px-5 py-2 text-sm font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-all">Send for Reschedule</button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel / Withdraw modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setCancelModal(null); setCancelReason('') }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5 text-neutral-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-secondary-700">Withdraw / Cancel Request</p>
                <p className="text-xs text-neutral-400">If the request was already approved, the balance will be restored.</p>
              </div>
              <button onClick={() => { setCancelModal(null); setCancelReason('') }} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400 shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Reason (optional)</label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg outline-none focus:border-neutral-400 resize-none"
                placeholder="Why are you withdrawing this request?"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setCancelModal(null); setCancelReason('') }} className="px-4 py-2 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 rounded-lg transition-all">Close</button>
              <button onClick={handleCancel} className="px-5 py-2 text-sm font-bold text-white bg-neutral-600 hover:bg-neutral-700 rounded-lg transition-all">Confirm Withdraw</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
