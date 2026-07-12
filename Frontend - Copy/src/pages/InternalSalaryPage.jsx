import { useCallback, useEffect, useState } from 'react'
import {
  Loader2, RefreshCw, Download, FileSpreadsheet, Calendar, Search, Filter,
} from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

function getToken() {
  return localStorage.getItem('srs_token')
}

async function fetchSalary(params) {
  const token = getToken()
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${BASE}/attendance/internal-salary?${qs}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText)
  return res.json()
}

function downloadExcel(params) {
  const token = getToken()
  const qs = new URLSearchParams(params).toString()
  const url = `${BASE}/attendance/internal-salary/export?${qs}`
  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `Internal_Salary_${params.start_date}_${params.end_date}.xlsx`
      a.click()
      URL.revokeObjectURL(a.href)
    })
}

const INP = 'px-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors'

export default function InternalSalaryPage() {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const [startDate, setStartDate] = useState(`${y}-${String(m + 1).padStart(2, '0')}-01`)
  const [endDate, setEndDate] = useState(
    `${y}-${String(m + 1).padStart(2, '0')}-${String(new Date(y, m + 1, 0).getDate()).padStart(2, '0')}`
  )
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')

  const fetch_ = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetchSalary({ start_date: startDate, end_date: endDate })
      setRows(res.data ?? [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [startDate, endDate])

  useEffect(() => { fetch_() }, [fetch_])

  const departments = [...new Set(rows.map(r => r.department).filter(Boolean))].sort()

  const filtered = rows.filter(r => {
    if (deptFilter && r.department !== deptFilter) return false
    if (search) {
      const s = search.toLowerCase()
      return r.name?.toLowerCase().includes(s) || r.ibs_code?.toLowerCase().includes(s)
    }
    return true
  })

  const totals = {
    morning: filtered.reduce((s, r) => s + (r.morning_ot || 0), 0),
    night: filtered.reduce((s, r) => s + (r.night_ot || 0), 0),
    double: filtered.reduce((s, r) => s + (r.double_pay_ot || 0), 0),
    deduction: filtered.reduce((s, r) => s + (r.deduction_hours || 0), 0),
  }

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-secondary-700 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Internal Salary Sheet
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">Monthly overtime & deductions summary for payroll</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetch_} disabled={loading}
            className="w-9 h-9 border border-neutral-200 rounded-xl flex items-center justify-center hover:bg-neutral-50 text-neutral-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => downloadExcel({ start_date: startDate, end_date: endDate })}
            disabled={loading || rows.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            <Download className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-xl px-4 py-3">{error}</div>}

      {/* Date range */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />From
            </label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={INP} />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-wide mb-1">
              <Calendar className="w-3 h-3 inline mr-1" />To
            </label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={INP} />
          </div>
          <button onClick={fetch_} disabled={loading}
            className="px-5 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate'}
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-neutral-500">
            <span className="font-bold text-secondary-700">{filtered.length}</span> employees
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-[10px] text-amber-600 uppercase tracking-wider">Morning OT</p>
            <p className="text-2xl font-extrabold text-amber-700 mt-1">{totals.morning}h</p>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4">
            <p className="text-[10px] text-indigo-600 uppercase tracking-wider">Night OT</p>
            <p className="text-2xl font-extrabold text-indigo-700 mt-1">{totals.night}h</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4">
            <p className="text-[10px] text-purple-600 uppercase tracking-wider">Double Pay OT</p>
            <p className="text-2xl font-extrabold text-purple-700 mt-1">{totals.double}h</p>
          </div>
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-[10px] text-red-600 uppercase tracking-wider">Deduction</p>
            <p className="text-2xl font-extrabold text-red-700 mt-1">{totals.deduction}h</p>
          </div>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50/50 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-neutral-300 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or IBS…" className="w-full pl-8 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary" />
          </div>
          {departments.length > 1 && (
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-neutral-400" />
              <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
                className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-neutral-200 bg-white outline-none">
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-400">
            <FileSpreadsheet className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-semibold">No data for this period</p>
            <p className="text-xs mt-1">Select a date range and click Generate</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50 text-neutral-400 text-[11px] uppercase tracking-wider">
                  <th className="px-4 py-3 text-left font-semibold w-8">#</th>
                  <th className="px-4 py-3 text-left font-semibold">IBS No.</th>
                  <th className="px-4 py-3 text-left font-semibold">Emp. Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Department</th>
                  <th className="px-4 py-3 text-center font-semibold">Morning OT (Hrs.)</th>
                  <th className="px-4 py-3 text-center font-semibold">Night OT (Hrs.)</th>
                  <th className="px-4 py-3 text-center font-semibold">Double Pay OT (Hrs.)</th>
                  <th className="px-4 py-3 text-center font-semibold">Deduction (Hrs.)</th>
                  <th className="px-4 py-3 text-center font-semibold">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.id} className="border-b border-neutral-50 hover:bg-neutral-50/50 transition-colors">
                    <td className="px-4 py-3 text-neutral-400 text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs font-bold text-primary">{r.ibs_code || '—'}</td>
                    <td className="px-4 py-3 text-secondary-700 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-neutral-500 text-xs">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-amber-700">{r.morning_ot || '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-indigo-700">{r.night_ot || '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-purple-700">{r.double_pay_ot || '-'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-red-600">{r.deduction_hours || '-'}</td>
                    <td className="px-4 py-3 text-center text-neutral-400">-</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-50 border-t-2 border-neutral-200">
                  <td colSpan={4} className="px-4 py-3 text-right text-xs font-bold text-secondary-700 uppercase">Totals</td>
                  <td className="px-4 py-3 text-center font-extrabold text-amber-700">{totals.morning}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-indigo-700">{totals.night}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-purple-700">{totals.double}</td>
                  <td className="px-4 py-3 text-center font-extrabold text-red-600">{totals.deduction}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
