import { createElement, useState, useEffect, useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Eye, FileText, RefreshCw, Search, Calendar,
  ClipboardList, AlertCircle,
  Package, Truck, ClipboardCheck, PackageCheck, Users, ArrowUpRight,
  BarChart3, ShoppingCart, Building2, ChevronRight,
} from 'lucide-react'
import {
  getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES, canActOnStage,
} from '../services/prfService'
import { getPos } from '../services/poService'
import { getSuppliers } from '../services/procurementRegistryService'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const fmtShort = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_OPTIONS = [
  ['all',                 'All'],
  ['pending_procurement', 'Pending Procurement'],
  ['pending_ehs',         'Pending EHS'],
  ['pending_depot',       'Pending Depot'],
  ['approved',            'Approved'],
  ['rejected',            'Rejected'],
  ['cancelled',           'Cancelled'],
]

export default function PrfDashboard() {
  const { user } = useSelector(s => s.auth)
  const navigate = useNavigate()

  const [prfs,    setPrfs]    = useState([])
  const [pos,     setPos]     = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [warning, setWarning] = useState('')
  const [status,  setStatus]  = useState('all')
  const [search,  setSearch]  = useState('')

  const canSeePOs = ['admin', 'depot_manager', 'procurement', 'purchasing'].includes(user?.role)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    setWarning('')
    try {
      const [prfResult, poResult, supplierResult] = await Promise.allSettled([
        getPrfs(),
        canSeePOs ? getPos() : Promise.resolve({ data: [] }),
        canSeePOs ? getSuppliers() : Promise.resolve({ data: [] }),
      ])
      if (prfResult.status === 'rejected') throw prfResult.reason
      setPrfs(prfResult.value?.data ?? [])
      setPos(poResult.status === 'fulfilled' ? (poResult.value?.data ?? []) : [])
      setSuppliers(supplierResult.status === 'fulfilled' ? (supplierResult.value?.data ?? []) : [])
      const optionalFailures = [poResult, supplierResult].filter(result => result.status === 'rejected').length
      if (optionalFailures) setWarning(`${optionalFailures} supporting data source${optionalFailures > 1 ? 's are' : ' is'} temporarily unavailable.`)
    } catch (e) {
      setErr(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [canSeePOs])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = useMemo(() => prfs.filter(p => {
    if (status !== 'all' && p.status !== status) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        (p.prf_number       || '').toLowerCase().includes(q) ||
        (p.requester?.name  || '').toLowerCase().includes(q) ||
        (p.notes            || '').toLowerCase().includes(q)
      )
    }
    return true
  }), [prfs, search, status])

  const myPending = useMemo(() => prfs.filter(p => canActOnStage(user, p.status)), [prfs, user])

  const statValues = useMemo(() => ({
    total:    prfs.length,
    pending:  prfs.filter(p => (p.status || '').startsWith('pending')).length,
    action:   myPending.length,
    approved: prfs.filter(p => p.status === 'approved').length,
    rejected: prfs.filter(p => p.status === 'rejected').length,
  }), [prfs, myPending.length])

  // PO stats
  const posInTransit = useMemo(() => pos.filter(p => p.status === 'draft' || p.status === 'issued'), [pos])
  const posNeedIgi = useMemo(() => pos.filter(p => p.status === 'received' && !p.igi), [pos])
  const posDone = useMemo(() => pos.filter(p => p.status === 'received' && !!p.igi), [pos])

  const approvedSuppliers = useMemo(() => suppliers.filter(s => s.status === 'approved' || s.approved_at).length, [suppliers])
  const activeOrders = useMemo(() => pos.filter(p => ['draft', 'issued', 'received'].includes(p.status) && !p.igi).length, [pos])
  const completedRate = prfs.length ? Math.round((statValues.approved / prfs.length) * 100) : 0
  const monthBuckets = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() - (5 - index))
    const inMonth = prfs.filter(p => {
      const source = new Date(p.date || p.created_at)
      return source.getMonth() === date.getMonth() && source.getFullYear() === date.getFullYear()
    })
    const approved = inMonth.filter(p => p.status === 'approved').length
    return {
      label:    date.toLocaleDateString('en', { month: 'short' }),
      total:    inMonth.length,
      approved,
      pending:  Math.max(0, inMonth.length - approved),
    }
  }), [prfs])
  const hasTrendData = monthBuckets.some(month => month.total > 0)

  const supplierBreakdown = useMemo(() => {
    const supplierGroups = suppliers.reduce((groups, supplier) => {
      const key = supplier.business_type || supplier.specialities || supplier.specialties || 'General Suppliers'
      groups[key] = (groups[key] || 0) + 1
      return groups
    }, {})
    return Object.entries(supplierGroups).sort((a, b) => b[1] - a[1]).slice(0, 4)
  }, [suppliers])

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">

      {/* Page header — same pattern as the Operations Dashboard. */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-secondary-700 sm:text-[28px]">Procurement Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">A single operational view for requests, suppliers, orders and receiving controls.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button onClick={() => navigate('/procurement/new')}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-white hover:bg-primary/90">
            <Plus className="w-3.5 h-3.5" /> New PRF
          </button>
        </div>
      </div>

      {/* Executive metrics */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="animate-pulse rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="h-10 w-10 rounded-xl bg-neutral-100" />
            <div className="mt-4 h-7 w-14 rounded-lg bg-neutral-100" />
            <div className="mt-2 h-3 w-28 rounded bg-neutral-100" />
            <div className="mt-1.5 h-2.5 w-20 rounded bg-neutral-50" />
          </div>
        )) : [
          { label: 'Purchase Requests', value: prfs.length, note: `${statValues.pending} still in workflow`, icon: ClipboardList, tone: 'bg-blue-50 text-blue-600' },
          { label: 'Active Orders', value: activeOrders, note: `${posDone.length} completed`, icon: ShoppingCart, tone: 'bg-amber-50 text-amber-600' },
          { label: 'Approved Vendors', value: approvedSuppliers, note: `${suppliers.length} supplier records`, icon: Users, tone: 'bg-primary/10 text-primary' },
          { label: 'My Pending Actions', value: myPending.length, note: `${completedRate}% approval rate`, icon: AlertCircle, tone: 'bg-emerald-50 text-emerald-600' },
        ].map(({ label, value, note, icon, tone }) => (
          <div key={label} className="group rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}>{createElement(icon, { className: 'h-5 w-5' })}</div>
              <ArrowUpRight className="h-4 w-4 text-neutral-300 transition-colors group-hover:text-primary" />
            </div>
            <p className="mt-4 text-2xl font-extrabold leading-none text-secondary-700">{value}</p>
            <p className="mt-1.5 text-xs font-bold text-secondary-700">{label}</p>
            <p className="mt-0.5 text-[11px] text-neutral-400">{note}</p>
          </div>
        ))}
      </div>

      {/* PO Stats — only for users who can see POs */}
      {canSeePOs && pos.length > 0 && (
        <div className="space-y-3">
          <p className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider px-0.5">Purchase Orders</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label:   'Awaiting Delivery',
                value:   posInTransit.length,
                icon:    Truck,
                iconBg:  'bg-blue-50',
                iconClr: 'text-blue-600',
                hint:    'Draft or Issued — goods not yet received',
              },
              {
                label:   'Needs IGI',
                value:   posNeedIgi.length,
                icon:    ClipboardCheck,
                iconBg:  posNeedIgi.length > 0 ? 'bg-amber-50' : 'bg-neutral-100',
                iconClr: posNeedIgi.length > 0 ? 'text-amber-600' : 'text-neutral-400',
                hint:    'Goods received — IGI not yet created',
                urgent:  posNeedIgi.length > 0,
              },
              {
                label:   'Completed',
                value:   posDone.length,
                icon:    PackageCheck,
                iconBg:  'bg-green-50',
                iconClr: 'text-green-600',
                hint:    'Received + IGI done',
              },
              {
                label:   'Total POs',
                value:   pos.length,
                icon:    Package,
                iconBg:  'bg-neutral-100',
                iconClr: 'text-neutral-500',
                hint:    'All purchase orders',
              },
            ].map(({ label, value, icon, iconBg, iconClr, hint, urgent }) => (
              <div key={label}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex items-center gap-3 ${urgent ? 'border-amber-300 ring-1 ring-amber-200' : 'border-neutral-100'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                  {createElement(icon, { className: `w-5 h-5 ${iconClr}` })}
                </div>
                <div className="min-w-0">
                  <p className={`text-2xl font-extrabold leading-none ${urgent ? 'text-amber-600' : 'text-secondary-700'}`}>{value}</p>
                  <p className="text-[11px] font-medium text-neutral-400 mt-0.5">{label}</p>
                  <p className="text-[10px] text-neutral-300 mt-0.5 hidden sm:block">{hint}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operational analytics */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold text-secondary-700">Purchase Request Trend</p>
              <p className="mt-1 text-[11px] text-neutral-400">Requests submitted during the last six months</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] font-semibold text-neutral-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-primary" /> Approved</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Pending</span>
          </div>
          <div className="mt-3 h-64">
            {loading ? <div className="h-full animate-pulse rounded-xl bg-neutral-100" /> : hasTrendData ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthBuckets} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="prfApproved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#004A77" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#004A77" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="prfPending" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.20} />
                      <stop offset="100%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eef2f6" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} dy={6} />
                  <YAxis width={28} allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ stroke: '#004A77', strokeDasharray: '3 3', strokeWidth: 1 }}
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: 8, padding: '8px 10px', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}
                    labelStyle={{ color: '#e5e7eb', fontSize: 11, fontWeight: 700, marginBottom: 4 }}
                    itemStyle={{ color: '#f8fafc', fontSize: 11, padding: 0 }}
                  />
                  <Area type="monotone" dataKey="pending" name="Pending" stroke="#F59E0B" strokeWidth={2} fill="url(#prfPending)" activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
                  <Area type="monotone" dataKey="approved" name="Approved" stroke="#004A77" strokeWidth={2.4} fill="url(#prfApproved)" activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <BarChart3 className="mb-3 h-8 w-8 text-neutral-300" />
                <p className="text-xs font-bold text-neutral-500">No purchase requests in the last six months</p>
                <p className="mt-1 text-[10px] text-neutral-400">New requests will appear here automatically.</p>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-sm font-extrabold text-secondary-700">Vendor Categories</p><p className="mt-1 text-[11px] text-neutral-400">Supplier portfolio breakdown</p></div>
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="mt-6 space-y-4">
            {(supplierBreakdown.length ? supplierBreakdown : [['No supplier categories yet', 0]]).map(([label, value], index) => {
              const percent = suppliers.length ? Math.round((value / suppliers.length) * 100) : 0
              return <div key={label}>
                <div className="mb-1.5 flex items-center justify-between gap-3 text-[11px]"><span className="truncate font-semibold text-secondary-700">{label}</span><span className="font-bold text-neutral-400">{value}</span></div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100"><div className={`h-full rounded-full ${['bg-primary', 'bg-amber-500', 'bg-emerald-500', 'bg-neutral-400'][index]}`} style={{ width: `${percent}%` }} /></div>
              </div>
            })}
          </div>
          <button onClick={() => navigate('/procurement/records')} className="mt-6 flex w-full items-center justify-between rounded-xl bg-neutral-50 px-3 py-2.5 text-xs font-bold text-secondary-700 hover:bg-primary/10 hover:text-primary">
            Open vendor master list <ChevronRight className="h-4 w-4" />
          </button>
        </section>
      </div>

      {/* Needs IGI banner */}
      {canSeePOs && posNeedIgi.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            {posNeedIgi.length} PO{posNeedIgi.length > 1 ? 's' : ''} received — awaiting IGI creation
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {posNeedIgi.slice(0, 6).map(p => (
              <button key={p.id} onClick={() => navigate(`/procurement/igi/new/${p.id}`)}
                className="flex items-center justify-between bg-white px-3 py-2.5 rounded-lg border border-amber-200 hover:bg-amber-50 transition-all text-left">
                <div>
                  <p className="text-xs font-bold text-secondary-700">{p.po_number}</p>
                  <p className="text-[10px] text-neutral-400">{p.prf?.prf_number} · {p.vendor || '—'}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200 whitespace-nowrap">
                  Create IGI →
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pending action banner */}
      {myPending.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            {myPending.length} request(s) awaiting your approval
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {myPending.slice(0, 6).map(p => (
              <button key={p.id} onClick={() => navigate(`/procurement/${p.id}`)}
                className="flex items-center justify-between bg-white px-3 py-2.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-all text-left">
                <div>
                  <p className="text-xs font-bold text-secondary-700">{p.prf_number}</p>
                  <p className="text-[10px] text-neutral-400">{p.requester?.name} · {p.items?.length ?? 0} items</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRF_STATUS_STYLES[p.status]}`}>
                  {PRF_STATUS_LABELS[p.status]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters + List */}
      <div className="bg-white rounded-2xl border border-neutral-100 overflow-hidden">

        {warning && <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-700">{warning} Core purchase requests remain available.</div>}

        <div className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex flex-col lg:flex-row lg:items-center gap-2">
          {/* Filter tabs — scrollable on mobile */}
          <div className="overflow-x-auto flex-shrink-0">
            <div className="flex items-center gap-1 bg-neutral-50 rounded-lg border border-neutral-200 p-0.5 w-max">
              {STATUS_OPTIONS.map(([key, label]) => (
                <button key={key} onClick={() => setStatus(key)} aria-pressed={status === key}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                    status === key ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full lg:flex-1 lg:min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search PRF number, requester, notes..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary" />
          </div>
        </div>

        {loading ? (
          <div className="animate-pulse divide-y divide-neutral-50 px-4">
            {Array.from({ length: 5 }, (_, index) => <div key={index} className="grid grid-cols-5 gap-4 py-4"><span className="h-3 rounded bg-neutral-100" /><span className="h-3 rounded bg-neutral-100" /><span className="hidden h-3 rounded bg-neutral-100 sm:block" /><span className="hidden h-3 rounded bg-neutral-100 md:block" /><span className="h-5 rounded-full bg-neutral-100" /></div>)}
          </div>
        ) : err ? (
          <div className="py-12 text-center text-red-500 text-sm">{err}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-neutral-300">
            <FileText className="w-10 h-10 mb-3" />
            <p className="text-sm font-semibold">No requests found</p>
            <p className="text-xs mt-1">{prfs.length === 0 ? 'Submit your first PRF' : 'Try a different filter'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-neutral-50 border-b border-neutral-100">
                <tr>
                  <th className="px-4 sm:px-5 py-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider">PRF #</th>
                  <th className="px-4 sm:px-5 py-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider">Requester</th>
                  <th className="px-4 sm:px-5 py-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider hidden sm:table-cell">Date</th>
                  <th className="px-4 sm:px-5 py-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider hidden md:table-cell">Items</th>
                  <th className="px-4 sm:px-5 py-3 text-left font-bold text-neutral-400 text-[10px] uppercase tracking-wider">Status</th>
                  <th className="px-4 sm:px-5 py-3 text-center font-bold text-neutral-400 text-[10px] uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => navigate(`/procurement/${p.id}`)}
                    className="cursor-pointer hover:bg-neutral-50/70 transition-colors group">
                    <td className="px-4 sm:px-5 py-3.5 font-mono font-bold text-secondary-700">{p.prf_number}</td>
                    <td className="px-4 sm:px-5 py-3.5 text-neutral-600">{p.requester?.name ?? '—'}</td>
                    <td className="px-4 sm:px-5 py-3.5 text-neutral-500 whitespace-nowrap hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-neutral-300" />
                        {fmtShort(p.date)}
                      </div>
                    </td>
                    <td className="px-4 sm:px-5 py-3.5 text-neutral-600 hidden md:table-cell">{p.items?.length ?? 0}</td>
                    <td className="px-4 sm:px-5 py-3.5">
                      <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${PRF_STATUS_STYLES[p.status]}`}>
                        {PRF_STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-4 sm:px-5 py-3.5 text-center">
                      <button onClick={(e) => { e.stopPropagation(); navigate(`/procurement/${p.id}`) }}
                        className="p-1.5 rounded-lg text-neutral-400 hover:bg-primary/10 hover:text-primary transition-all opacity-0 group-hover:opacity-100">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-wrap justify-between items-center pt-2 text-xs text-neutral-400 border-t border-neutral-100 gap-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full inline-block ${err ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-green-500'}`} />
          SYSTEM STATUS: {err ? 'SERVICE UNAVAILABLE' : warning ? 'PARTIAL DATA' : 'OPTIMAL'}
        </div>
        <span>© {new Date().getFullYear()} Rotem Industrial SRS • Procurement Module</span>
      </div>

    </div>
  )
}
