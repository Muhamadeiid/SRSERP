import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, Search, Download, RefreshCw, FileSpreadsheet, ShoppingCart,
} from 'lucide-react'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES } from '../services/prfService'

const fmtShort = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

// Tracking sort key — numeric runs padded so PRF-EG1-2026-0009 < PRF-EG1-2026-0010
function trackingKey(s) {
  return (s || '~~~~ZZZZ').replace(/(\d+)/g, (_, d) => d.padStart(6, '0'))
}

export default function PrfMasterList() {
  const navigate = useNavigate()

  const [prfs,    setPrfs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [status,  setStatus]  = useState('all')
  const [search,  setSearch]  = useState('')

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
        (p.prf_number      || '').toLowerCase().includes(q) ||
        (p.requester?.name || '').toLowerCase().includes(q) ||
        (p.notes           || '').toLowerCase().includes(q)
      )
    }

    return [...out].sort((a, b) => trackingKey(a.prf_number).localeCompare(trackingKey(b.prf_number)))
  }, [prfs, status, search])

  const exportExcel = async () => {
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
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Master List — PRFs
          </h1>
          <p className="text-sm text-neutral-400 mt-0.5">Sorted by PRF number</p>
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
            {STATUS_OPTIONS.map(([key, label]) => (
              <button key={key} onClick={() => setStatus(key)}
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
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
                      {p.prf_number || <span className="text-neutral-300 italic font-normal">—</span>}
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
