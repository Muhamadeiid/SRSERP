import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Printer, Download, FileText, Search, Loader2 } from 'lucide-react'
import { getEmployee, searchEmployees, getDepotManager, getHrOfficer, updateEmployee } from '../services/employeeService'

// ── constants ─────────────────────────────────────────────────
const DEPT_LABEL = {
  cm:              'CM',
  hm:              'HM',
  pm:              'PM',
  warranty:        'Warranty',
  cm_intervention: 'CM (Intervention)',
  admin:           'Admin',
  human_resources: 'Human Resources',
  procurement:     'Procurement',
  qa:              'QA',
  hse:             'HSE',
}

const unwrapData = (res) => res?.data ?? res
const deptValue  = (emp) => {
  const dept = emp?.department
  if (typeof dept === 'object' && dept !== null) {
    return dept.name ?? dept.label ?? dept.title ?? dept.value ?? ''
  }
  return emp?.department_label ?? emp?.department_name ?? dept ?? ''
}
const deptLabel  = (emp) => {
  const value = deptValue(emp)
  return DEPT_LABEL[value] ?? value
}

const INP = 'w-full px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all'
const LBL = 'block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1'

const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : ''
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
const fmtDateAr = d => {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return ''
  return `${dt.getDate()} ${AR_MONTHS[dt.getMonth()]} ${dt.getFullYear()}`
}
const today    = () => new Date().toISOString().slice(0, 10)
const esc      = (s='') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))

// ── employee autocomplete ─────────────────────────────────────
function EmployeeSearch({ onSelect, initialName = '' }) {
  const [q, setQ]           = useState(initialName)
  const [results, setResults] = useState([])
  const [open, setOpen]     = useState(false)
  const [busy, setBusy]     = useState(false)

  const handleChange = (v) => {
    setQ(v); setOpen(true)
    if (!v || v.length < 2) { setResults([]); return }
    setBusy(true)
    searchEmployees(v)
      .then(r => setResults(Array.isArray(r) ? r : (r.data ?? [])))
      .catch(() => setResults([]))
      .finally(() => setBusy(false))
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
        <input
          value={q}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search employee name…"
          className={INP + ' pl-8'}
        />
        {busy && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-neutral-300" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-[90] w-full mt-1 bg-white rounded-xl border border-neutral-200 shadow-2xl max-h-64 overflow-y-auto">
          {results.map(emp => (
            <button key={emp.id} type="button"
              onMouseDown={(e) => e.preventDefault()}
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

// ── print ERF (matches original DOC layout) ───────────────────
function printERF(d) {
  const logoSrc = `${window.location.origin}/logo.png`
  const positionText   = esc(d.current_title) || '____________________'
  const positionTextAr = esc(d.current_title_ar) || esc(d.current_title) || '____________________'
  const lastDay        = esc(fmtDate(d.last_working_date)) || '____________________'
  const lastDayAr      = esc(fmtDateAr(d.last_working_date)) || '____________________'

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ERF - ${esc(d.tracking_no || 'export')}</title>
<style>
  @page { size: A4 portrait; margin: 30mm 12mm 20mm 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { font-family: Arial, sans-serif; font-size: 10pt; color: #000; background: #fff; }

  /* Page header — repeats on every page */
  .page-header {
    position: fixed; top: 0; left: 0; right: 0;
    padding: 6mm 12mm 3mm 12mm; background: #fff;
  }
  .hdr { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
  .hdr td { border: 1.5px solid #000; vertical-align: middle; }
  .hdr .logo-cell { width: 42mm; text-align: center; padding: 3mm; }
  .hdr .logo-cell img { max-height: 15mm; max-width: 36mm; display: block; margin: 0 auto; }
  .hdr .title-cell { text-align: center; padding: 3mm; background: #FFF2CC; }
  .title-en { font-weight: 900; font-size: 15pt; }
  .title-ar { direction: rtl; text-align: center; font-weight: 700; font-size: 12pt; margin-top: 1mm; }

  /* Page footer — repeats on every page */
  .page-footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    padding: 3mm 12mm 6mm 12mm; background: #fff;
    border-top: 1.5px solid #000; font-size: 8.5pt; font-weight: 700;
    display: flex; justify-content: space-between;
  }
  .page-footer .red { color: #c00; }

  /* Main content wrapper */
  .body { }

  .tracking { font-size: 10pt; font-weight: 900; margin: 0 0 2mm; letter-spacing: .3pt; }

  /* Details table */
  .main { width: 100%; border-collapse: collapse; border: 1.5px solid #000; }
  .main td { border: 1px solid #000; font-size: 9.5pt; vertical-align: middle; padding: 1.5mm 2.5mm; }
  .main .title-bar { background: #FFF2CC; text-align: center; padding: 2mm; font-weight: 900; }
  .main .title-bar .en { font-size: 11pt; }
  .main .title-bar .ar { direction: rtl; font-size: 10pt; margin-top: 0.5mm; }
  .main .lbl { width: 22%; background: #E2EFDA; }
  .main .lbl b { display: block; font-size: 9.5pt; }
  .main .lbl span { display: block; text-align: right; font-size: 8pt; direction: rtl; font-weight: normal; }
  .main .val { padding: 2mm 3mm; min-height: 7mm; }

  /* Letter body */
  .letter { margin-top: 3mm; font-size: 10pt; }
  .letter p { margin-bottom: 2mm; }
  .letter .en { text-align: left; line-height: 1.4; }
  .letter .ar { direction: rtl; text-align: right; line-height: 1.5; }
  .letter .ar-header { direction: rtl; text-align: right; font-weight: 700; margin-bottom: 2mm; }
  .letter b { font-weight: 900; }

  /* Signature table (stacked 4 rows) */
  .sig { width: 100%; border-collapse: collapse; margin-top: 3mm; border: 1.5px solid #000; }
  .sig td { border: 1px solid #000; padding: 2mm 3mm; vertical-align: middle; font-size: 9.5pt; }
  .sig .lbl { width: 34%; background: #E2EFDA; }
  .sig .lbl b { display: block; font-size: 9.5pt; }
  .sig .lbl span { display: block; text-align: right; font-size: 8pt; direction: rtl; font-weight: normal; }
  .sig .val { min-height: 8mm; }

  /* Declaration */
  .decl { width: 100%; border-collapse: collapse; margin-top: 3mm; border: 1.5px solid #000; }
  .decl td { border: 1px solid #000; padding: 1.5mm 2.5mm; vertical-align: middle; font-size: 9.5pt; }
  .decl .hdr-cell { background: #FFF2CC; font-weight: 900; padding: 2mm; }
  .decl .hdr-cell .en { display: inline-block; font-size: 11pt; }
  .decl .hdr-cell .ar { display: inline-block; float: right; font-size: 11pt; direction: rtl; }
  .decl .stmt-cell { background: #E2EFDA; padding: 2mm 3mm; font-weight: 700; }
  .decl .stmt-cell .en { font-size: 9.5pt; }
  .decl .stmt-cell .ar { direction: rtl; text-align: right; font-size: 9.5pt; margin-top: 1mm; }
  .decl .field-lbl { background: #E2EFDA; width: 25%; }
  .decl .field-lbl b { display: block; font-size: 9pt; }
  .decl .field-lbl span { display: block; text-align: right; font-size: 8pt; direction: rtl; font-weight: normal; }
  .decl .field-val { padding: 2mm 3mm; min-height: 8mm; }

  .red { color: #c00; }
</style>
</head>
<body>
  <!-- Fixed page header -->
  <div class="page-header">
    <table class="hdr"><tr>
      <td class="logo-cell"><img src="${logoSrc}" alt="Rotem SRS Egypt" onerror="this.style.display='none'"></td>
      <td class="title-cell">
        <div class="title-en">Employee Resignation Letter</div>
        <div class="title-ar">نموذج إستقالة موظف</div>
      </td>
    </tr></table>
  </div>

  <!-- Fixed page footer -->
  <div class="page-footer">
    <span>Document No: <span class="red">SRS-HR-P05-F01</span> | <span class="red">Rev.: 04</span> | Rev. Date: 30/06/2026</span>
    <span>Page 1 of 1</span>
  </div>

<div class="body">
  <p class="tracking">Tracking No: ${esc(d.tracking_no) || '<span style="color:#888;font-weight:normal;font-style:italic">ERF-XXX-XXX</span>'}</p>

  <!-- Details -->
  <table class="main"><tbody>
    <tr><td class="title-bar" colspan="4">
      <div class="en">Employee Resignation Letter</div>
      <div class="ar">نموذج إستقالة موظف</div>
    </td></tr>
    <tr>
      <td class="lbl"><b>Full name</b><span>الإسم بالكامل رباعي</span></td>
      <td class="val" colspan="3">${esc(d.full_name)}</td>
    </tr>
    <tr>
      <td class="lbl"><b>Department</b><span>الإدارة</span></td>
      <td class="val">${esc(d.department_label || d.department)}</td>
      <td class="lbl"><b>Current Title</b><span>المسمى الوظيفي</span></td>
      <td class="val">${esc(d.current_title)}</td>
    </tr>
    <tr>
      <td class="lbl"><b>Resign Start date</b><span>تاريخ بداية الإستقالة</span></td>
      <td class="val">${esc(fmtDate(d.resign_start_date))}</td>
      <td class="lbl"><b>Last Working Date</b><span>تاريخ آخر يوم عمل</span></td>
      <td class="val">${esc(fmtDate(d.last_working_date))}</td>
    </tr>
  </tbody></table>

  <!-- Letter body -->
  <div class="letter">
    <p class="en"><b>Dears,</b></p>
    <p class="en">Please Accept this letter as formal notice of resignation from my position as <b>${positionText}</b> with Rotem SRS Egypt.</p>
    <p class="en"><b>My last working day will be ${lastDay}.</b> It is my intention to complete all of the Shifts scheduled for me during this period.</p>
    <p class="en">I would like to use this opportunity to thank you for the mentorship and support you have Provided while working here at Rotem SRS Egypt. I wish you and the organization continued Success.</p>
    <p class="ar-header">السيد المدير المباشر . شركة Rotem SRS Egypt</p>
    <p class="ar">يرجى قبول هذه الرسالة كإشعار رسمي بالاستقالة من منصبي ك<b>${positionTextAr}</b> من شركة Rotem SRS Egypt وأن آخر يوم عمل لي سيكون <b>${lastDayAr}</b>، وأنني إلتزم بإستكمال كافة مناوبات وأيام العمل المقررة لي خلال هذه الفترة وأن أي مخالفة لذلك بدون موافقة الشركة سيكون للشركة الحق في إحتفاظ الشركة بحقها الكامل في توقيع جزاء علي بما تراه مناسبا مع خصم قيمة أيام العمل هذه.</p>
    <p class="ar">أود أن انتهز الفرصة وأن اتقدم بالشكر لك على التوجيه والدعم الذي قدمته لشخصي أثناء العمل مع شركة Rotem SRS Egypt وأتمنى لك وللمنظمة الاستمرار في النجاح.</p>
  </div>

  <!-- Signatures (4 stacked rows) -->
  <table class="sig"><tbody>
    <tr><td class="lbl"><b>Employee Full Name</b><span>إسم الموظف رباعي بالكامل</span></td>
        <td class="val">${esc(d.full_name)}</td></tr>
    <tr><td class="lbl"><b>Employee Signature</b><span>توقيع الموظف</span></td>
        <td class="val" style="height:12mm"></td></tr>
    <tr><td class="lbl"><b>Depot Manager Name</b><span>إسم مدير الموقع</span></td>
        <td class="val">${esc(d.depot_manager_name)}</td></tr>
    <tr><td class="lbl"><b>Depot Manger Signature</b><span>توقيع مدير الموقع</span></td>
        <td class="val" style="height:12mm"></td></tr>
  </tbody></table>

  <!-- Declaration -->
  <table class="decl"><tbody>
    <tr><td class="hdr-cell" colspan="4">
      <span class="en">Declaration Form</span>
      <span class="ar">إقرار وتعهد</span>
    </td></tr>
    <tr><td class="stmt-cell" colspan="4">
      <div class="en">I certify that this resignation is executed by me voluntarily and of my own free will.</div>
      <div class="ar">أشهد بأن هذه الإستقالة قد تم تنفيذها بمحض إرادتي وبإرادتي الحرة</div>
    </td></tr>
    <tr>
      <td class="field-lbl"><b>Name:</b><span>الاسم:</span></td>
      <td class="field-lbl"><b>Signature:</b><span>التوقيع:</span></td>
      <td class="field-lbl"><b>ID No.:</b><span>الرقم القومي:</span></td>
      <td class="field-lbl"><b>Date:</b><span>التاريخ:</span></td>
    </tr>
    <tr>
      <td class="field-val">${esc(d.declaration_name || d.full_name)}</td>
      <td class="field-val"></td>
      <td class="field-val">${esc(d.national_id)}</td>
      <td class="field-val">${esc(fmtDate(d.declaration_date) || fmtDate(today()))}</td>
    </tr>
  </tbody></table>
</div>
</body>
</html>`

  const w = window.open('', '_blank', 'width=860,height=1200')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 600)
}

// ── initial form state ────────────────────────────────────────
const ERF_EMPTY = {
  employee_id: null,
  full_name: '',
  department: '',
  department_label: '',
  current_title: '',
  current_title_ar: '',
  resign_start_date: today(),
  last_working_date: '',
  direct_manager_name: '',
  depot_manager_name: '',
  declaration_name: '',
  national_id: '',
  declaration_date: today(),
  tracking_no: '',
}

// ── main page ─────────────────────────────────────────────────
export default function ResignationsPage() {
  const { user } = useSelector((s) => s.auth)
  const [form, setForm] = useState({ ...ERF_EMPTY })
  const [downloading, setDownloading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-fill depot manager from DB on mount
  useEffect(() => {
    getDepotManager()
      .then(res => {
        const dm = unwrapData(res)
        if (dm?.name) setForm(f => ({ ...f, depot_manager_name: f.depot_manager_name || dm.name }))
      })
      .catch(() => {})
  }, [])

  const handleEmployeeSelect = (emp) => {
    setForm(f => ({
      ...f,
      employee_id:      emp.id ?? null,
      full_name:        emp.name ?? '',
      current_title:    emp.position ?? '',
      department:       typeof emp.department === 'object' ? deptValue(emp) : (emp.department ?? ''),
      department_label: DEPT_LABEL[deptValue(emp)] ?? deptValue(emp) ?? '',
      declaration_name: emp.name ?? '',
    }))
    if (emp.id) {
      getEmployee(emp.id)
        .then(res => {
          const full = unwrapData(res)
          const updates = {}
          if (full?.national_id) updates.national_id = full.national_id
          // direct_manager comes from backend's chain-walk (manager/admin/depot_manager only)
          const mgr = full?.direct_manager
          if (mgr?.name) updates.direct_manager_name = mgr.name
          if (Object.keys(updates).length) setForm(f => ({ ...f, ...updates }))
        })
        .catch(() => {})
    }
  }

  const canSubmit = form.full_name && form.current_title && form.resign_start_date && form.last_working_date

  const saveResignation = async () => {
    if (!form.employee_id || !form.last_working_date) return
    try {
      await updateEmployee(form.employee_id, {
        name:              form.full_name,
        position:          form.current_title,
        resignation_date:  form.resign_start_date,
        last_working_date: form.last_working_date,
      })
    } catch (err) {
      console.error('Failed to save resignation on employee record', err)
    }
  }

  const handlePrint = async () => {
    if (!canSubmit) return
    await saveResignation()
    printERF(form)
  }

  const handleDownload = async () => {
    if (!canSubmit) return
    setDownloading(true)
    try {
      await saveResignation()
      const { generateERF } = await import('../utils/generateERF')
      await generateERF(form)
    } catch (err) {
      console.error(err)
      alert('Failed to generate Word document')
    } finally {
      setDownloading(false)
    }
  }

  const handleReset = () => setForm({ ...ERF_EMPTY })

  return (
    <div className="p-4 md:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-lg font-bold text-secondary-700 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Employee Resignation Form
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">SRS-HR-P05-F01 · Rev.04</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="px-3 py-2 text-sm font-medium text-neutral-500 hover:text-secondary-700 hover:bg-neutral-50 rounded-lg transition-all"
          >
            Reset
          </button>
          <button
            onClick={handlePrint}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-neutral-200 text-secondary-700 hover:bg-neutral-50 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
          <button
            onClick={handleDownload}
            disabled={!canSubmit || downloading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold bg-primary text-white hover:bg-primary-600 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download Word
          </button>
        </div>
      </div>

      {/* Two-column layout: inputs (left) + preview (right) */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-5">

        {/* ─── INPUTS ─── */}
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-5 space-y-4 h-fit sticky top-4">
          <div>
            <label className={LBL}>Tracking No.</label>
            <input
              value={form.tracking_no}
              onChange={e => set('tracking_no', e.target.value)}
              placeholder="ERF-XXX-XXX"
              className={INP + ' font-semibold'}
            />
          </div>

          <div>
            <label className={LBL}>Full Name</label>
            <EmployeeSearch onSelect={handleEmployeeSelect} initialName={form.full_name} />
          </div>

          <div>
            <label className={LBL}>Department</label>
            <input
              value={form.department_label}
              onChange={e => set('department_label', e.target.value)}
              className={INP}
            />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className={LBL}>Current Title (English)</label>
              <input
                value={form.current_title}
                onChange={e => set('current_title', e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>المسمى الوظيفي (بالعربي)</label>
              <input
                value={form.current_title_ar}
                onChange={e => set('current_title_ar', e.target.value)}
                dir="rtl"
                className={INP}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LBL}>Resign Start Date</label>
              <input
                type="date"
                value={form.resign_start_date}
                onChange={e => set('resign_start_date', e.target.value)}
                className={INP}
              />
            </div>
            <div>
              <label className={LBL}>Last Working Date</label>
              <input
                type="date"
                value={form.last_working_date}
                onChange={e => set('last_working_date', e.target.value)}
                className={INP}
              />
            </div>
          </div>

          {form.direct_manager_name && (
            <div>
              <label className={LBL}>Direct Manager <span className="text-neutral-300 normal-case">(auto)</span></label>
              <div className="px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-500">
                {form.direct_manager_name}
              </div>
            </div>
          )}

          <div>
            <label className={LBL}>Depot Manager Name <span className="text-neutral-300 normal-case">(auto from DB)</span></label>
            <input
              value={form.depot_manager_name}
              onChange={e => set('depot_manager_name', e.target.value)}
              className={INP}
            />
          </div>

          <div className="pt-4 border-t border-neutral-100">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Declaration</p>
            <div className="space-y-3">
              <div>
                <label className={LBL}>Name (declarant)</label>
                <input
                  value={form.declaration_name}
                  onChange={e => set('declaration_name', e.target.value)}
                  placeholder={form.full_name}
                  className={INP}
                />
              </div>
              <div>
                <label className={LBL}>ID No.</label>
                <input
                  value={form.national_id}
                  onChange={e => set('national_id', e.target.value)}
                  className={INP}
                />
              </div>
              <div>
                <label className={LBL}>Date</label>
                <input
                  type="date"
                  value={form.declaration_date}
                  onChange={e => set('declaration_date', e.target.value)}
                  className={INP}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ─── PREVIEW ─── */}
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
          <FormPreview d={form} />
        </div>
      </div>
    </div>
  )
}

// ── form preview (mirrors the print HTML) ─────────────────────
function FormPreview({ d }) {
  const positionText   = d.current_title || '____________________'
  const positionTextAr = d.current_title_ar || d.current_title || '____________________'
  const lastDay        = fmtDate(d.last_working_date) || '____________________'
  const lastDayAr      = fmtDateAr(d.last_working_date) || '____________________'

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', color: '#000' }}>
      {/* Page Header (fixed at top) */}
      <div className="p-6 pb-3 border-b border-neutral-200 bg-white">
        <table className="w-full border-collapse" style={{ border: '1.5px solid #000' }}>
          <tbody>
            <tr>
              <td className="text-center align-middle p-3" style={{ border: '1.5px solid #000', width: '160px' }}>
                <img src="/logo.png" alt="Rotem SRS Egypt" className="h-14 w-auto object-contain mx-auto" />
              </td>
              <td className="text-center align-middle p-3" style={{ border: '1.5px solid #000', background: '#FFF2CC' }}>
                <div className="font-black text-lg">Employee Resignation Letter</div>
                <div className="font-bold text-base mt-0.5" dir="rtl">نموذج إستقالة موظف</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Body */}
      <div className="px-6 pt-4">
      {/* Tracking */}
      <p className="mb-2 font-black text-sm">
        Tracking No: {d.tracking_no || <span className="text-neutral-400 font-normal italic">ERF-XXX-XXX</span>}
      </p>

      {/* Details */}
      <table className="w-full border-collapse text-sm" style={{ border: '1.5px solid #000' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="text-center py-2 font-black" style={{ border: '1px solid #000', background: '#FFF2CC' }}>
              <div>Employee Resignation Letter</div>
              <div className="text-sm mt-0.5" dir="rtl">نموذج إستقالة موظف</div>
            </td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '22%' }}>
              <b className="block">Full name</b>
              <span className="block text-right text-xs" dir="rtl">الإسم بالكامل رباعي</span>
            </td>
            <td colSpan={3} className="px-2 py-1.5 min-h-[24px]" style={{ border: '1px solid #000' }}>{d.full_name}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '22%' }}>
              <b className="block">Department</b>
              <span className="block text-right text-xs" dir="rtl">الإدارة</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{d.department_label || d.department}</td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '22%' }}>
              <b className="block">Current Title</b>
              <span className="block text-right text-xs" dir="rtl">المسمى الوظيفي</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{d.current_title}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '22%' }}>
              <b className="block">Resign Start date</b>
              <span className="block text-right text-xs" dir="rtl">تاريخ بداية الإستقالة</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{fmtDate(d.resign_start_date)}</td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '22%' }}>
              <b className="block">Last Working Date</b>
              <span className="block text-right text-xs" dir="rtl">تاريخ آخر يوم عمل</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{fmtDate(d.last_working_date)}</td>
          </tr>
        </tbody>
      </table>

      {/* Letter body */}
      <div className="mt-3 text-sm leading-relaxed">
        <p className="mb-2"><b>Dears,</b></p>
        <p className="mb-2">Please Accept this letter as formal notice of resignation from my position as <b>{positionText}</b> with Rotem SRS Egypt.</p>
        <p className="mb-2"><b>My last working day will be {lastDay}.</b> It is my intention to complete all of the Shifts scheduled for me during this period.</p>
        <p className="mb-3">I would like to use this opportunity to thank you for the mentorship and support you have Provided while working here at Rotem SRS Egypt. I wish you and the organization continued Success.</p>
        <p className="mb-2 font-bold" dir="rtl">السيد المدير المباشر . شركة Rotem SRS Egypt</p>
        <p className="mb-2" dir="rtl">يرجى قبول هذه الرسالة كإشعار رسمي بالاستقالة من منصبي ك<b>{positionTextAr}</b> من شركة Rotem SRS Egypt وأن آخر يوم عمل لي سيكون <b>{lastDayAr}</b>، وأنني إلتزم بإستكمال كافة مناوبات وأيام العمل المقررة لي خلال هذه الفترة وأن أي مخالفة لذلك بدون موافقة الشركة سيكون للشركة الحق في إحتفاظ الشركة بحقها الكامل في توقيع جزاء علي بما تراه مناسبا مع خصم قيمة أيام العمل هذه.</p>
        <p dir="rtl">أود أن انتهز الفرصة وأن اتقدم بالشكر لك على التوجيه والدعم الذي قدمته لشخصي أثناء العمل مع شركة Rotem SRS Egypt وأتمنى لك وللمنظمة الاستمرار في النجاح.</p>
      </div>

      {/* Signatures (stacked 4 rows) */}
      <table className="w-full border-collapse mt-3 text-sm" style={{ border: '1.5px solid #000' }}>
        <tbody>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '34%' }}>
              <b className="block">Employee Full Name</b>
              <span className="block text-right text-xs" dir="rtl">إسم الموظف رباعي بالكامل</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{d.full_name}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA' }}>
              <b className="block">Employee Signature</b>
              <span className="block text-right text-xs" dir="rtl">توقيع الموظف</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', height: '32px' }}></td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA' }}>
              <b className="block">Depot Manager Name</b>
              <span className="block text-right text-xs" dir="rtl">إسم مدير الموقع</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{d.depot_manager_name}</td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA' }}>
              <b className="block">Depot Manger Signature</b>
              <span className="block text-right text-xs" dir="rtl">توقيع مدير الموقع</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', height: '32px' }}></td>
          </tr>
        </tbody>
      </table>

      {/* Declaration */}
      <table className="w-full border-collapse mt-3 text-sm" style={{ border: '1.5px solid #000' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="py-2 px-3 font-black" style={{ border: '1px solid #000', background: '#FFF2CC' }}>
              <span style={{ float: 'left' }}>Declaration Form</span>
              <span style={{ float: 'right' }} dir="rtl">إقرار وتعهد</span>
              <div style={{ clear: 'both' }}></div>
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="px-3 py-2 font-bold" style={{ border: '1px solid #000', background: '#E2EFDA' }}>
              <div>I certify that this resignation is executed by me voluntarily and of my own free will.</div>
              <div className="mt-1" dir="rtl">أشهد بأن هذه الإستقالة قد تم تنفيذها بمحض إرادتي وبإرادتي الحرة</div>
            </td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '25%' }}>
              <b className="block">Name:</b>
              <span className="block text-right text-xs" dir="rtl">الاسم:</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '25%' }}>
              <b className="block">Signature:</b>
              <span className="block text-right text-xs" dir="rtl">التوقيع:</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '25%' }}>
              <b className="block">ID No.:</b>
              <span className="block text-right text-xs" dir="rtl">الرقم القومي:</span>
            </td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', background: '#E2EFDA', width: '25%' }}>
              <b className="block">Date:</b>
              <span className="block text-right text-xs" dir="rtl">التاريخ:</span>
            </td>
          </tr>
          <tr>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', minHeight: '32px' }}>{d.declaration_name || d.full_name}</td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000', height: '32px' }}></td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{d.national_id}</td>
            <td className="px-2 py-1.5" style={{ border: '1px solid #000' }}>{fmtDate(d.declaration_date)}</td>
          </tr>
        </tbody>
      </table>

      </div>

      {/* Page Footer (fixed at bottom) */}
      <div className="mt-4 px-6 py-3 border-t-2 border-black bg-white flex justify-between text-[10px] font-bold">
        <span>Document No: <span className="text-red-600">SRS-HR-P05-F01</span> | <span className="text-red-600">Rev.: 04</span> | Rev. Date: 30/06/2026</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  )
}
