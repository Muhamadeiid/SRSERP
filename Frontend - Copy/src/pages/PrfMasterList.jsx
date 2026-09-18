import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Search, Download, RefreshCw, FileSpreadsheet, ShoppingCart,
} from 'lucide-react'
import { saveAs } from 'file-saver'
import { getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES, cleanPrfNumber } from '../services/prfService'

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Tracking sort key — numeric runs padded so PRF-EG1-2026-0009 < PRF-EG1-2026-0010
function trackingKey(s) {
  return (s || '~~~~ZZZZ').replace(/(\d+)/g, (_, d) => d.padStart(6, '0'))
}

const VALID_STATUSES = new Set([
  'all',
  'pending_procurement',
  'pending_ehs',
  'pending_depot',
  'approved',
  'rejected',
  'cancelled',
])

export default function PrfMasterList() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [prfs,    setPrfs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [status, setStatus] = useState(() => {
    const requested = searchParams.get('status') || 'all'
    return VALID_STATUSES.has(requested) ? requested : 'all'
  })
  const [search,  setSearch]  = useState('')

  // Keep dashboard deep-links and browser back/forward navigation in sync with
  // the selected status tab.
  useEffect(() => {
    const requested = searchParams.get('status') || 'all'
    setStatus(VALID_STATUSES.has(requested) ? requested : 'all')
  }, [searchParams])

  const selectStatus = useCallback((nextStatus) => {
    setStatus(nextStatus)
    setSearchParams(current => {
      const next = new URLSearchParams(current)
      if (nextStatus === 'all') next.delete('status')
      else next.set('status', nextStatus)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const res = await getPrfs()
      setPrfs(res?.data ?? [])
    } catch (e) {
      setErr(e.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = useMemo(() => {
    let out = prfs

    if (status !== 'all') out = out.filter(p => p.status === status)

    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(p =>
        cleanPrfNumber(p.prf_number).toLowerCase().includes(q) ||
        (p.requester?.name || '').toLowerCase().includes(q) ||
        (p.notes           || '').toLowerCase().includes(q)
      )
    }

    return [...out].sort((a, b) => trackingKey(a.prf_number).localeCompare(trackingKey(b.prf_number)))
  }, [prfs, status, search])

  const exportExcel = async () => {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'SRS Procurement'
    const ws = wb.addWorksheet('PRF Master List', { views: [{ state: 'frozen', ySplit: 1 }] })

    ws.columns = [
      { header: '#',          key: 'idx',       width: 5  },
      { header: 'PRF Number', key: 'prf',       width: 26 },
      { header: 'Requester',  key: 'name',      width: 32 },
      { header: 'Date',       key: 'date',      width: 14 },
      { header: 'Items',      key: 'items',     width: 8  },
      { header: 'Categories', key: 'cats',      width: 30 },
      { header: 'Status',     key: 'status',    width: 18 },
    ]

    rows.forEach((p, i) => {
      ws.addRow({
        idx:    i + 1,
        prf:    p.prf_number || '—',
        name:   p.requester?.name || '—',
        date:   fmtShort(p.date),
        items:  p.items?.length ?? 0,
        cats:   Array.isArray(p.material_category) ? p.material_category.join(', ') : '',
        status: PRF_STATUS_LABELS[p.status] || p.status,
      })
    })

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
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
           `PRF-MasterList-${status}-${date}.xlsx`)
  }

  const STATUS_OPTIONS = [
    ['all',                 'All'],
    ['pending_procurement', 'Pending Procurement'],
    ['pending_ehs',         'Pending EHS'],
    ['pending_depot',       'Pending Depot'],
    ['approved',            'Approved'],
    ['rejected',            'Rejected'],
    ['cancelled',           'Cancelled'],
  ]

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
      {/* Page header — same pattern as the Operations Dashboard. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold leading-tight text-secondary-700 sm:text-[28px]">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
            Master List — PRFs
          </h1>
          <p className="mt-1 text-sm text-neutral-400">Every purchase request in one place, sorted by number.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={exportExcel} disabled={loading || rows.length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-50">
            <Download className="h-3.5 w-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-white rounded-lg border border-neutral-200 p-0.5">
            {STATUS_OPTIONS.map(([key, label]) => (
              <button key={key} onClick={() => selectStatus(key)} aria-pressed={status === key}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all ${
                  status === key ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-neutral-100'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by PRF number, requester, or notes..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary" />
          </div>
          <span className="text-[11px] text-neutral-400">
            <span className="font-bold text-secondary-700">{rows.length}</span> record{rows.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="animate-pulse divide-y divide-neutral-50 px-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="grid grid-cols-6 gap-4 py-4">
                <span className="h-3 rounded bg-neutral-100" />
                <span className="h-3 rounded bg-neutral-100" />
                <span className="hidden h-3 rounded bg-neutral-100 sm:block" />
                <span className="hidden h-3 rounded bg-neutral-100 sm:block" />
                <span className="hidden h-3 rounded bg-neutral-100 md:block" />
                <span className="h-5 rounded-full bg-neutral-100" />
              </div>
            ))}
          </div>
        ) : err ? (
          <div className="py-12 text-center text-red-500 text-sm">{err}</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
            <ShoppingCart className="w-10 h-10 mb-3" />
            <p className="text-sm font-semibold">No PRFs</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-100 sticky top-0">
                <tr>
                  <th className="px-3 py-2.5 text-center font-bold text-neutral-500 text-[10px] uppercase tracking-wide w-12">#</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">PRF Number</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Requester</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Date</th>
                  <th className="px-3 py-2.5 text-center font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Items</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Categories</th>
                  <th className="px-3 py-2.5 text-left font-bold text-neutral-500 text-[10px] uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {rows.map((p, i) => (
                  <tr key={p.id}
                    onClick={() => navigate(`/procurement/${p.id}`)}
                    className="cursor-pointer hover:bg-primary/5 transition-colors">
                    <td className="px-3 py-2.5 text-center font-bold text-neutral-400">{i + 1}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-secondary-700 whitespace-nowrap">
                      {cleanPrfNumber(p.prf_number) || <span className="text-neutral-300 italic font-normal">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-secondary-700 font-semibold">{p.requester?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-neutral-500 whitespace-nowrap">{fmtShort(p.date)}</td>
                    <td className="px-3 py-2.5 text-center text-neutral-600">{p.items?.length ?? 0}</td>
                    <td className="px-3 py-2.5 text-neutral-500 max-w-xs">
                      <div className="truncate">{Array.isArray(p.material_category) && p.material_category.length ? p.material_category.join(', ') : '—'}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${PRF_STATUS_STYLES[p.status]}`}>
                        {PRF_STATUS_LABELS[p.status] || p.status}
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
