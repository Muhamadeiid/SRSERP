import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Search, Download, RefreshCw, FileSpreadsheet, Calendar, Clock,
} from 'lucide-react'
import { saveAs } from 'file-saver'
import { getLeaveRequests } from '../services/leaveService'

// ── helpers ────────────────────────────────────────────────────────────────
const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const TYPE_LABEL = {
  annual: 'Annual Leave',
  casual: 'Casual Leave',
  sick:   'Sick Leave',
  early:  'Early Leave',
}

const STATUS_STYLE = {
  pending:           'bg-amber-50    text-amber-700   border-amber-200',
  manager_approved:  'bg-blue-50     text-blue-700    border-blue-200',
  approved:          'bg-green-50    text-green-700   border-green-200',
  rejected:          'bg-red-50      text-red-700     border-red-200',
  cancelled:         'bg-neutral-50  text-neutral-500 border-neutral-200',
  rescheduled:       'bg-purple-50   text-purple-700  border-purple-200',
}

const STATUS_LABEL = {
  pending: 'Pending', manager_approved: 'Mgr Approved', approved: 'Approved',
  rejected: 'Rejected', cancelled: 'Cancelled', rescheduled: 'Rescheduled',
}

// Stable, sortable key for tracking numbers — pads any digit run to 6 chars
// so "LRF-GZ-9" sorts before "LRF-GZ-10".
function trackingKey(s) {
  return (s || '~~~~ZZZZ')                     // empty → sorts last
    .replace(/(\d+)/g, (_, d) => d.padStart(6, '0'))
}

const TYPE_TABS = [
  ['all', 'All',       null],
  ['lrf', 'Leaves',    Calendar],
  ['otr', 'Overtime',  Clock],
]

export default function LeaveMasterList() {
  const navigate = useNavigate()
  const [reqs,    setReqs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [type,    setType]    = useState('all')   // all | lrf | otr
  const [search,  setSearch]  = useState('')
  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await getLeaveRequests()
      setReqs(res?.data ?? [])
    } catch (e) {
      setErr(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = useMemo(() => {
    let out = reqs

    if (type !== 'all') out = out.filter(r => r.type === type)

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(r =>
        (r.tracking_no   || '').toLowerCase().includes(q) ||
        (r.employee_name || '').toLowerCase().includes(q) ||
        (r.leave_type    || '').toLowerCase().includes(q)
      )
    }

    // Sort by tracking_no (alphanumeric-aware), empty trackings at the end
    return [...out].sort((a, b) => trackingKey(a.tracking_no).localeCompare(trackingKey(b.tracking_no)))
  }, [reqs, type, search])

  const buildDateText = (r) => {
    if (r.type === 'lrf') {
      if (r.leave_type === 'early') {
        return `${fmtShort(r.start_date)} (${r.early_from || ''}–${r.early_to || ''})`
      }
      return r.end_date && r.end_date !== r.start_date
        ? `${fmtShort(r.start_date)} → ${fmtShort(r.end_date)} · ${r.days || 1}d`
        : `${fmtShort(r.start_date)} · ${r.days || 1}d`
    }
    // OTR
    return `${fmtShort(r.ot_date)} · ${r.start_time || ''}–${r.end_time || ''} · ${r.hours || 0}h`
  }

  const buildTypeText = (r) =>
    r.type === 'lrf' ? (TYPE_LABEL[r.leave_type] || r.leave_type) : 'Overtime'

  // ── Excel export ─────────────────────────────────────────────────────────
  const exportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SRS HR'
    const ws = wb.addWorksheet('Master List', { views: [{ state: 'frozen', ySplit: 1 }] })

    ws.columns = [
      { header: '#',             key: 'idx',      width: 5  },
      { header: 'Tracking No',   key: 'tracking', width: 22 },
      { header: 'Employee',      key: 'name',     width: 32 },
      { header: 'Type',          key: 'type',     width: 18 },
      { header: 'Date',          key: 'date',     width: 36 },
      { header: 'Status',        key: 'status',   width: 14 },
    ]

    rows.forEach((r, i) => {
      ws.addRow({
        idx:      i + 1,
        tracking: r.tracking_no || '—',
        name:     r.employee_name || '—',
        type:     buildTypeText(r),
        date:     buildDateText(r),
        status:   STATUS_LABEL[r.status] || r.status,
      })
    })

    // Header style
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E38' } }
    head.alignment = { vertical: 'middle', horizontal: 'center' }
    head.height = 22

    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      row.alignment = { vertical: 'middle', horizontal: rowNum === 1 ? 'center' : 'left', wrapText: true }
      row.eachCell((cell) => {
        cell.border = {
          top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const date   = new Date().toISOString().slice(0, 10)
    const name   = `Leaves-MasterList-${type}-${date}.xlsx`
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Master List — Leaves &amp; Overtime
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">Sorted by tracking number</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll}
            className="p-2 rounded-lg border border-neutral-200 hover:bg-neutral-50 text-neutral-400 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={exportExcel} disabled={loading || rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
            {TYPE_TABS.map(([key, label, Icon]) => (
              <button key={key} onClick={() => setType(key)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all ${
                  type === key ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-neutral-100'
                }`}>
                {Icon && <Icon className="w-3 h-3" />} {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by tracking, name, or type..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary" />
          </div>
          <span className="text-[11px] text-neutral-400">
            <span className="font-bold text-secondary-700">{rows.length}</span> record{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : err ? (
          <div className="py-12 text-center text-red-500 text-sm">{err}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
            <FileSpreadsheet className="w-10 h-10 mb-3" />
            <p className="text-sm font-semibold">No records</p>
            <p className="text-xs mt-1">Submit a request to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-center font-bold text-neutral-500 text-[10px] uppercase tracking-wide w-12">#</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Tracking No</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Employee</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {rows.map((r, i) => (
                  <tr key={r.id}
                    onClick={() => navigate(`/human-resources/leave?req=${r.id}`)}
                    className="cursor-pointer hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2.5 text-center font-bold text-neutral-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-secondary-700 whitespace-nowrap">
                      {r.tracking_no || <span className="text-neutral-300 italic font-normal">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-secondary-700 font-semibold">{r.employee_name || '—'}</td>
                    <td className="px-3 py-2.5 text-neutral-600">
                      <div className="flex items-center gap-1.5">
                        {r.type === 'lrf' ? <Calendar className="w-3 h-3 text-blue-500" /> : <Clock className="w-3 h-3 text-orange-500" />}
                        {buildTypeText(r)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-neutral-600 whitespace-nowrap">{buildDateText(r)}</td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${STATUS_STYLE[r.status]}`}>
                        {STATUS_LABEL[r.status] || r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
