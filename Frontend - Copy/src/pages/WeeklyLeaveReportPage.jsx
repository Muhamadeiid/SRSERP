import { useCallback, useEffect, useState } from 'react'
import { Calendar, Download, FileSpreadsheet, Loader2, RefreshCw } from 'lucide-react'
import { saveAs } from 'file-saver'
import { getLeaveRequests } from '../services/leaveService'
import { getEmployees } from '../services/employeeService'
import { disciplinaryService } from '../services/disciplinaryService'

const WEEKLY_TYPE_LABEL = {
  annual: 'Annual',
  casual: 'Casual',
  sick: 'Sick',
  early: 'ELR',
}
const WEEKLY_LEAVE_TYPES = Object.keys(WEEKLY_TYPE_LABEL)
const REPORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const dateKey = (value) => String(value ?? '').slice(0, 10)
const toLocalDate = (value) => {
  const key = dateKey(value)
  if (!key) return null
  const [y, m, d] = key.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}
const localDateKey = (date) => {
  const d = date instanceof Date ? date : new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const addDays = (value, days) => {
  const d = toLocalDate(value)
  if (!d) return ''
  d.setDate(d.getDate() + days)
  return localDateKey(d)
}
const maxDateKey = (a, b) => dateKey(a) > dateKey(b) ? dateKey(a) : dateKey(b)
const minDateKey = (a, b) => dateKey(a) < dateKey(b) ? dateKey(a) : dateKey(b)
const inclusiveDays = (start, end) => {
  const s = toLocalDate(start)
  const e = toLocalDate(end)
  if (!s || !e || e < s) return 0
  return Math.floor((e - s) / 86400000) + 1
}
const fmtFileDate = (value) => dateKey(value).replaceAll('-', '')
const fmtReportDate = (value) => {
  const d = toLocalDate(value)
  if (!d) return ''
  return `${String(d.getDate()).padStart(2, '0')}-${REPORT_MONTHS[d.getMonth()]}-${d.getFullYear()}`
}
const normalizeName = (value) => String(value ?? '').trim().toLowerCase()
const fallbackLabel = (value) => String(value ?? '').replaceAll('_', ' ').replace(/\b\w/g, ch => ch.toUpperCase())
const PROJECT_REPORTS = [
  { key: 'line1', code: 'EG1', label: 'Line 1' },
  { key: 'ganz', code: 'GZ', label: 'Ganz' },
]

const getAllDisciplinaryCases = async () => {
  const first = await disciplinaryService.list({ status: 'approved', per_page: 100, page: 1 })
  const data = [...(first?.data ?? [])]
  const lastPage = Number(first?.pagination?.last_page ?? 1)

  for (let page = 2; page <= lastPage; page += 1) {
    const next = await disciplinaryService.list({ status: 'approved', per_page: 100, page })
    data.push(...(next?.data ?? []))
  }

  return data
}

export default function WeeklyLeaveReportPage() {
  const [reqs, setReqs] = useState([])
  const [employees, setEmployees] = useState([])
  const [disciplinaryCases, setDisciplinaryCases] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [weeklyStart, setWeeklyStart] = useState(() => localDateKey())
  const [weeklyEnd, setWeeklyEnd] = useState(() => addDays(localDateKey(), 6))
  const [weeklyNo, setWeeklyNo] = useState('1')

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [leaveRes, employeeRes, disciplinaryRes] = await Promise.all([
        getLeaveRequests(),
        getEmployees({ view: 'all', per_page: 2000, sort_by: 'name', sort_dir: 'asc' }),
        getAllDisciplinaryCases(),
      ])
      setReqs(leaveRes?.data ?? [])
      setEmployees(employeeRes?.data ?? [])
      setDisciplinaryCases(disciplinaryRes ?? [])
    } catch (e) {
      setErr(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const employeeById = new Map(employees.map(emp => [String(emp.id), emp]))
  const employeeByName = new Map(employees.map(emp => [normalizeName(emp.name), emp]))
  const findEmployeeByName = (name) => {
    const normalized = normalizeName(name)
    if (!normalized) return null
    return employeeByName.get(normalized) ||
      employees.find(emp => normalizeName(emp.name).startsWith(normalized)) ||
      null
  }
  const projectKeyFor = (projectCode) => {
    const code = String(projectCode ?? '').trim().toUpperCase()
    if (code === 'GZ') return 'ganz'
    if (code === 'EG1') return 'line1'
    return 'other'
  }
  const rowsForProject = (rows, project) =>
    rows
      .filter(row => projectKeyFor(row.project) === project.key)
      .map((row, idx) => ({ ...row, no: idx + 1 }))

  const buildRows = () => {
    if (!weeklyStart || !weeklyEnd) return []
    const start = dateKey(weeklyStart)
    const end = dateKey(weeklyEnd)
    const period = `W${String(weeklyNo || '').trim() || '1'}`

    return reqs
      .filter(r =>
        r.type === 'lrf' &&
        r.status === 'approved' &&
        r.start_date &&
        r.leave_type &&
        WEEKLY_LEAVE_TYPES.includes(r.leave_type) &&
        Number(r.days || 0) > 0 &&
        dateKey(r.start_date) <= end &&
        dateKey(r.end_date || r.start_date) >= start
      )
      .sort((a, b) =>
        dateKey(a.start_date).localeCompare(dateKey(b.start_date)) ||
        (a.employee_name || '').localeCompare(b.employee_name || '')
      )
      .map(r => {
        const employee = employeeById.get(String(r.employee_id)) ||
          findEmployeeByName(r.employee_name) ||
          r.employee ||
          {}
        const fromDate = maxDateKey(r.start_date, start)
        const toDate = minDateKey(r.end_date || r.start_date, end)
        const fullSpan = dateKey(r.start_date) >= start && dateKey(r.end_date || r.start_date) <= end
        const storedDays = Number(r.days || 0)
        const days = r.leave_type === 'early'
          ? storedDays
          : fullSpan && storedDays > 0
            ? storedDays
            : inclusiveDays(fromDate, toDate)

        return {
          no: 0,
          period,
          name: r.employee_name || '',
          title: r.job_title || employee.position || r.employee?.position || '',
          leaveType: WEEKLY_TYPE_LABEL[r.leave_type] || r.leave_type,
          fromDate: fmtReportDate(fromDate),
          toDate: fmtReportDate(toDate),
          days,
          project: employee.project_code || r.employee?.project_code || '',
        }
      })
  }

  const buildWarningRows = () => {
    if (!weeklyStart || !weeklyEnd) return []
    const start = dateKey(weeklyStart)
    const end = dateKey(weeklyEnd)
    const period = `W${String(weeklyNo || '').trim() || '1'}`

    return disciplinaryCases
      .filter(item =>
        item.status === 'approved' &&
        item.incident_date &&
        dateKey(item.incident_date) >= start &&
        dateKey(item.incident_date) <= end
      )
      .sort((a, b) =>
        dateKey(a.incident_date).localeCompare(dateKey(b.incident_date)) ||
        (a.employee?.name || '').localeCompare(b.employee?.name || '')
      )
      .map(item => {
        const employee = employeeById.get(String(item.employee_id)) ||
          findEmployeeByName(item.employee?.name) ||
          item.employee ||
          {}

        return {
          no: 0,
          period,
          ibsNo: employee.ibs_code || employee.rotem_code || '',
          employeeName: employee.name || item.employee?.name || '',
          position: employee.position || item.employee?.position || '',
          investigator: 'HR',
          project: employee.project_code || '',
          reason: item.violation_label || fallbackLabel(item.violation_type),
        }
      })
  }

  const exportWeeklyReport = async () => {
    const reportRows = buildRows()
    const warningRows = buildWarningRows()
    if (!weeklyStart || !weeklyEnd || dateKey(weeklyStart) > dateKey(weeklyEnd) || (reportRows.length === 0 && warningRows.length === 0)) return

    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SRS HR'
    const infoWs = wb.addWorksheet('Employee information', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
    })
    const ws = wb.addWorksheet('Leave records', {
      views: [{ state: 'frozen', ySplit: 1 }],
      properties: { defaultRowHeight: 18 },
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    })

    infoWs.columns = [
      { header: 'SI', key: 'si', width: 8 },
      { header: 'Activity Status', key: 'activityStatus', width: 16 },
      { header: 'IBS No', key: 'ibsNo', width: 14 },
      { header: 'English Name', key: 'englishName', width: 44 },
      { header: 'Position', key: 'position', width: 32 },
      { header: 'Project Name', key: 'projectName', width: 14 },
      { header: 'Hiring Date', key: 'hiringDate', width: 16 },
      { header: 'Separation date', key: 'separationDate', width: 18 },
      { header: 'Separation Reason', key: 'separationReason', width: 24 },
      { header: 'Separation Status', key: 'separationStatus', width: 20 },
    ]

    employees.forEach((emp, idx) => {
      infoWs.addRow({
        si: idx + 1,
        activityStatus: '',
        ibsNo: emp.ibs_code || emp.rotem_code || '',
        englishName: emp.name || '',
        position: emp.position || '',
        projectName: emp.project_code || '',
        hiringDate: fmtReportDate(emp.hiring_date),
        separationDate: '',
        separationReason: '',
        separationStatus: '',
      })
    })

    const setupLeaveSheet = (sheet) => {
      sheet.getCell('A1').value = 'No.'
      sheet.getCell('B1').value = 'Period'
      sheet.getCell('C1').value = 'Name'
      sheet.getCell('D1').value = 'Title'
      sheet.getCell('E1').value = 'Leave Type'
      sheet.getCell('F1').value = 'From date'
      sheet.getCell('G1').value = 'To date'
      sheet.getCell('H1').value = 'No of days'
      sheet.columns = [
        { key: 'no', width: 7 },
        { key: 'period', width: 12 },
        { key: 'name', width: 42 },
        { key: 'title', width: 32 },
        { key: 'leaveType', width: 18 },
        { key: 'fromDate', width: 18 },
        { key: 'toDate', width: 18 },
        { key: 'days', width: 14 },
      ]
    }

    const setupWarningSheet = (sheet) => {
      sheet.getCell('A1').value = 'No.'
      sheet.getCell('B1').value = 'Period'
      sheet.getCell('C1').value = 'IBS No'
      sheet.getCell('D1').value = 'Employee Name'
      sheet.getCell('E1').value = 'Position'
      sheet.getCell('F1').value = 'Investigator'
      sheet.getCell('G1').value = 'Project'
      sheet.getCell('H1').value = 'Reason'
      sheet.columns = [
        { key: 'no', width: 7 },
        { key: 'period', width: 12 },
        { key: 'ibsNo', width: 14 },
        { key: 'employeeName', width: 44 },
        { key: 'position', width: 32 },
        { key: 'investigator', width: 22 },
        { key: 'project', width: 14 },
        { key: 'reason', width: 46 },
      ]
    }

    const fillLeaveSheet = (sheet, rows) => {
      setupLeaveSheet(sheet)
      rows.forEach(row => {
        const excelRow = sheet.addRow({
          no: row.no,
          period: row.period,
          name: row.name,
          leaveType: row.leaveType,
          fromDate: row.fromDate,
          toDate: row.toDate,
          days: row.days,
        })
        excelRow.getCell(4).value = {
          formula: `IFERROR(VLOOKUP(C${excelRow.number},'Employee information'!$D:$E,2,FALSE),"")`,
          result: row.title,
        }
      })
      sheet.autoFilter = 'A1:H1'
      sheet.getColumn('H').numFmt = '0.##'
    }

    const fillWarningSheet = (sheet, rows) => {
      setupWarningSheet(sheet)
      rows.forEach(row => {
        const excelRow = sheet.addRow({
          no: row.no,
          period: row.period,
          employeeName: row.employeeName,
          investigator: row.investigator,
          reason: row.reason,
        })
        excelRow.getCell(3).value = row.ibsNo
        excelRow.getCell(5).value = {
          formula: `IFERROR(VLOOKUP(D${excelRow.number},'Employee information'!$D:$E,2,FALSE),"")`,
          result: row.position,
        }
        excelRow.getCell(7).value = {
          formula: `IFERROR(VLOOKUP(D${excelRow.number},'Employee information'!$D:$F,3,FALSE),"")`,
          result: row.project,
        }
      })
      sheet.autoFilter = 'A1:H1'
    }

    const sheetPairs = []
    PROJECT_REPORTS.forEach(project => {
      const leaveSheet = project.key === 'line1'
        ? ws
        : wb.addWorksheet(`${project.label} Leave records`, {
          views: [{ state: 'frozen', ySplit: 1 }],
          properties: { defaultRowHeight: 18 },
          pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
        })
      if (project.key === 'line1') leaveSheet.name = `${project.label} Leave records`

      const warningSheet = wb.addWorksheet(`${project.label} Warning Record`, {
        views: [{ state: 'frozen', ySplit: 1 }],
        properties: { defaultRowHeight: 18 },
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      })

      fillLeaveSheet(leaveSheet, rowsForProject(reportRows, project))
      fillWarningSheet(warningSheet, rowsForProject(warningRows, project))
      sheetPairs.push(leaveSheet, warningSheet)
    })

    infoWs.autoFilter = 'A1:J1'

    const styleSheet = (sheet, lastColumn) => {
      const header = sheet.getRow(1)
      header.height = 22
      header.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF000000' } }
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } }
      header.alignment = { vertical: 'middle', horizontal: 'center' }

      sheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
        row.height = rowNum === 1 ? 22 : 18
        for (let col = 1; col <= lastColumn; col += 1) {
          const cell = row.getCell(col)
          cell.font = { name: 'Calibri', size: 11, bold: rowNum === 1 }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF000000' } },
            left: { style: 'thin', color: { argb: 'FF000000' } },
            bottom: { style: 'thin', color: { argb: 'FF000000' } },
            right: { style: 'thin', color: { argb: 'FF000000' } },
          }
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
        }
      })
    }
    styleSheet(infoWs, 10)
    sheetPairs.forEach(sheet => styleSheet(sheet, 8))

    const buffer = await wb.xlsx.writeBuffer()
    const name = `Weekly-Leave-Report-W${weeklyNo || 1}-${fmtFileDate(weeklyStart)}-${fmtFileDate(weeklyEnd)}.xlsx`
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
  }

  const rows = buildRows()
  const warningRows = buildWarningRows()
  const invalid = !weeklyStart || !weeklyEnd || dateKey(weeklyStart) > dateKey(weeklyEnd)

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Weekly Leave Report
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">Excel report for approved leave only</p>
        </div>
        <button onClick={fetchAll} disabled={loading}
          className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-secondary-700 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              Report Period
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">Only ELR, Annual, Casual, and Sick are exported</p>
          </div>
          <button onClick={exportWeeklyReport} disabled={loading || invalid || (rows.length === 0 && warningRows.length === 0)}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4">
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">Week No</label>
            <div className="flex items-center rounded-xl border border-neutral-200 bg-neutral-50 overflow-hidden">
              <span className="px-3 text-xs font-black text-secondary-700 border-r border-neutral-200 bg-white">W</span>
              <input type="number" min="1" value={weeklyNo} onChange={e => setWeeklyNo(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-transparent outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">From Day</label>
            <input type="date" value={weeklyStart} onChange={e => setWeeklyStart(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">To Day</label>
            <input type="date" value={weeklyEnd} onChange={e => setWeeklyEnd(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Matching Leaves</p>
            <p className={`mt-1 text-2xl font-black ${invalid ? 'text-red-500' : 'text-secondary-700'}`}>
              {invalid ? '!' : rows.length}
            </p>
          </div>
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 sm:col-span-4">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wide">Warning Records In Excel</p>
            <p className="mt-1 text-lg font-black text-secondary-700">{warningRows.length}</p>
          </div>
        </div>
      </div>

      {err && <div className="py-4 text-center text-red-500 text-sm bg-red-50 border border-red-100 rounded-2xl">{err}</div>}

      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#fce4d6] text-secondary-700">
              <tr>
                {['No.', 'Period', 'Name', 'Title', 'Leave Type', 'From date', 'To date', 'No of days'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-center font-bold border border-neutral-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto" />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-neutral-400">No approved leave in this period</td>
                </tr>
              ) : rows.map(row => (
                <tr key={`${row.no}-${row.name}-${row.fromDate}`} className="hover:bg-primary/5">
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.no}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.period}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.name}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.title}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.leaveType}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.fromDate}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.toDate}</td>
                  <td className="px-3 py-1.5 text-center border border-neutral-700">{row.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
