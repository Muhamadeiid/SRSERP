import { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Eye, Loader2, FileText, RefreshCw, Search, Calendar,
  ClipboardList, Clock, CheckCircle, XCircle, AlertCircle,
  Package, Truck, ClipboardCheck, PackageCheck,
} from 'lucide-react'
import {
  getPrfs, PRF_STATUS_LABELS, PRF_STATUS_STYLES, canActOnStage,
} from '../services/prfService'
import { getPos, PO_STATUS_LABELS, PO_STATUS_STYLES } from '../services/poService'

const fmtShort = d => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_OPTIONS = [
  ['all',                 'All'],
  ['pending_procurement', 'Pending Procurement'],
  ['pending_ehs',         'Pending EHS'],
  ['pending_depot',       'Pending Depot'],
  ['approved',            'Approved'],
  ['rejected',            'Rejected'],
]

const STAT_DEFS = [
  { key: 'total',    label: 'Total PRFs',   icon: ClipboardList, iconBg: 'bg-neutral-100', iconColor: 'text-neutral-500' },
  { key: 'pending',  label: 'Pending',      icon: Clock,         iconBg: 'bg-amber-50',    iconColor: 'text-amber-600'   },
  { key: 'action',   label: 'My Action',    icon: AlertCircle,   iconBg: 'bg-blue-50',     iconColor: 'text-blue-600'    },
  { key: 'approved', label: 'Approved',     icon: CheckCircle,   iconBg: 'bg-green-50',    iconColor: 'text-green-600'   },
  { key: 'rejected', label: 'Rejected',     icon: XCircle,       iconBg: 'bg-red-50',      iconColor: 'text-red-500'     },
]

export default function PrfDashboard() {
  const { user } = useSelector(s => s.auth)
  const navigate = useNavigate()

  const [prfs,    setPrfs]    = useState([])
  const [pos,     setPos]     = useState([])
  const [loading, setLoading] = useState(true)
  const [err,     setErr]     = useState('')
  const [status,  setStatus]  = useState('all')
  const [search,  setSearch]  = useState('')

  const canSeePOs = ['admin', 'depot_manager', 'purchasing'].includes(user?.role)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    setErr('')
    try {
      const [prfRes, poRes] = await Promise.all([
        getPrfs(),
        canSeePOs ? getPos() : Promise.resolve({ data: [] }),
      ])
      setPrfs(prfRes?.data ?? [])
      setPos(poRes?.data  ?? [])
    } catch (e) {
      setErr(e.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [canSeePOs])

  useEffect(() => { fetchAll() }, [fetchAll])

  const filtered = prfs.filter(p => {
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
  })

  const myPending = prfs.filter(p => canActOnStage(user, p.status))

  const statValues = {
    total:    prfs.length,
    pending:  prfs.filter(p => p.status.startsWith('pending')).length,
    action:   myPending.length,
    approved: prfs.filter(p => p.status === 'approved').length,
    rejected: prfs.filter(p => p.status === 'rejected').length,
  }

  // PO stats
  const posInTransit  = pos.filter(p => p.status === 'draft' || p.status === 'issued')
  const posNeedIgi    = pos.filter(p => p.status === 'received' && !p.igi)
  const posDone       = pos.filter(p => p.status === 'received' && !!p.igi)
  const posCancelled  = pos.filter(p => p.status === 'cancelled')

  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6">

      {/* Page Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight">Procurement Dashboard</h1>
          <p className="text-sm text-neutral-400 mt-1">Track and manage purchase requests</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button onClick={fetchAll}
            className="p-2.5 rounded-lg border border-neutral-100 bg-white hover:bg-neutral-50 text-neutral-400 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => navigate('/procurement/new')}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New PRF
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {STAT_DEFS.map(({ key, label, icon: Icon, iconBg, iconColor }) => (
          <div key={key} className="bg-white rounded-2xl border border-neutral-100 p-4 sm:p-5 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-2xl font-extrabold text-secondary-700 leading-none">{statValues[key]}</p>
              <p className="text-[11px] text-neutral-400 font-medium mt-0.5 whitespace-nowrap">{label}</p>
            </div>
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
            ].map(({ label, value, icon: Icon, iconBg, iconClr, hint, urgent }) => (
              <div key={label}
                className={`bg-white rounded-2xl border p-4 sm:p-5 flex items-center gap-3 ${urgent ? 'border-amber-300 ring-1 ring-amber-200' : 'border-neutral-100'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                  <Icon className={`w-5 h-5 ${iconClr}`} />
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

        <div className="px-4 sm:px-5 py-3 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center gap-2">
          {/* Filter tabs — scrollable on mobile */}
          <div className="overflow-x-auto flex-shrink-0">
            <div className="flex items-center gap-1 bg-neutral-50 rounded-lg border border-neutral-200 p-0.5 w-max">
              {STATUS_OPTIONS.map(([key, label]) => (
                <button key={key} onClick={() => setStatus(key)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                    status === key ? 'bg-primary text-white' : 'text-neutral-500 hover:bg-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div className="relative w-full sm:flex-1 sm:min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-300" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search PRF number, requester, notes..."
              className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg outline-none focus:border-primary" />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
          SYSTEM STATUS: OPTIMAL
        </div>
        <span>© 2024 Rotem Industrial SRS • Procurement Module</span>
      </div>

    </div>
  )
}
