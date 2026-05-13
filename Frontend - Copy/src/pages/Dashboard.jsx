// src/pages/Dashboard.jsx — interactive, live-data dashboard
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users, Calendar, Clock, ShoppingCart, AlertTriangle,
  CheckCircle2, ArrowRight, RefreshCw, Bell, FileText,
  TrendingUp, FileSpreadsheet, Loader2,
} from 'lucide-react'

import { getEmployees, getEmployeeStats } from '../services/employeeService'
import { getLeaveRequests, getNotifications } from '../services/leaveService'
import { getPrfs }                     from '../services/prfService'

// ── time formatter ──────────────────────────────────────────────
const fmtTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const diffMin = Math.floor((new Date() - dt) / 60000)
  if (diffMin < 1)  return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH  < 24)  return `${diffH}h ago`
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// ── reusable interactive cards ──────────────────────────────────
function StatTile({ label, value, sub, subColor = 'text-neutral-400', icon: Icon, color, to, onClick }) {
  const handle = onClick || (() => {})
  return (
    <button
      onClick={handle}
      className="bg-white rounded-2xl border border-neutral-100 p-5 text-left flex items-start gap-4 hover:shadow-lg hover:border-primary/30 transition-all group w-full">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-neutral-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-3xl font-extrabold text-secondary-700 leading-none">{value}</p>
        {sub && <p className={`text-[11px] font-medium mt-2 ${subColor}`}>{sub}</p>}
      </div>
      {to && <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />}
    </button>
  )
}

function ModuleTile({ icon: Icon, title, subtitle, badge, badgeColor, color, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={`relative bg-white rounded-2xl border p-5 text-left flex flex-col gap-3 transition-all w-full ${
        disabled
          ? 'border-neutral-100 cursor-not-allowed opacity-60'
          : 'border-neutral-100 cursor-pointer hover:shadow-lg hover:border-primary/30'
      }`}>
      {badge && (
        <span className={`absolute top-3 right-3 px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeColor}`}>
          {badge}
        </span>
      )}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
        {Icon && <Icon className="w-5 h-5" />}
      </div>
      <div>
        <h3 className="text-sm font-bold text-secondary-700">{title}</h3>
        <p className="text-xs text-neutral-400 mt-1 leading-relaxed">{subtitle}</p>
      </div>
    </button>
  )
}

// ── Page ────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)

  const [loading, setLoading] = useState(true)
  const [empStats,  setEmpStats]  = useState(null)
  const [employees, setEmployees] = useState([])
  const [reqs,      setReqs]      = useState([])
  const [prfs,      setPrfs]      = useState([])
  const [notifs,    setNotifs]    = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const tasks = [
      getEmployeeStats().then(r => setEmpStats(r?.data ?? r)).catch(() => {}),
      getEmployees({ per_page: 500 }).then(r => {
        const list = Array.isArray(r?.data?.data) ? r.data.data : Array.isArray(r?.data) ? r.data : []
        setEmployees(list)
      }).catch(() => {}),
      getLeaveRequests().then(r => setReqs(r?.data ?? [])).catch(() => {}),
      getPrfs().then(r => setPrfs(r?.data ?? [])).catch(() => {}),
      getNotifications().then(r => setNotifs(r?.data ?? [])).catch(() => {}),
    ]
    await Promise.allSettled(tasks)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 60000)   // refresh every minute
    return () => clearInterval(t)
  }, [fetchAll])

  // ── Derived stats ───────────────────────────────────────────
  const today = todayISO()

  const onLeaveToday = useMemo(() =>
    reqs.filter(r =>
      r.type === 'lrf' &&
      r.status === 'approved' &&
      (r.start_date?.slice(0,10) ?? '') <= today &&
      today <= (r.end_date?.slice(0,10) ?? r.start_date?.slice(0,10) ?? '')
    ).length,
  [reqs, today])

  const pendingLeaves    = useMemo(() => reqs.filter(r => ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const pendingLrfCount  = useMemo(() => reqs.filter(r => r.type === 'lrf' && ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const pendingOtCount   = useMemo(() => reqs.filter(r => r.type === 'otr' && ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const approvedThisMonth = useMemo(() => {
    const start = new Date(); start.setDate(1)
    return reqs.filter(r => r.status === 'approved' && new Date(r.created_at) >= start).length
  }, [reqs])

  const pendingPrfs   = useMemo(() => prfs.filter(p => p.status?.startsWith('pending')).length, [prfs])
  const approvedPrfs  = useMemo(() => prfs.filter(p => p.status === 'approved').length, [prfs])
  const rejectedPrfs  = useMemo(() => prfs.filter(p => p.status === 'rejected').length, [prfs])

  const totalStaff = empStats?.total_employees ?? employees.length
  const onSiteStaff = totalStaff - onLeaveToday

  // ── Recent activity (synthesized from data) ───────────────────
  const recent = useMemo(() => {
    const items = []
    reqs.slice(0, 30).forEach(r => {
      const action = r.status === 'approved' ? 'approved' :
                     r.status === 'rejected' ? 'rejected' :
                     r.status === 'cancelled' ? 'cancelled' : 'submitted'
      items.push({
        type:  r.type === 'lrf' ? 'leave' : 'overtime',
        title: r.type === 'lrf'
          ? `${(r.leave_type||'leave').replace('_',' ')} — ${r.employee_name || ''}`
          : `Overtime — ${r.employee_name || ''}`,
        sub:   `${action.toUpperCase()} · ${r.tracking_no || ''}`,
        date:  r.updated_at || r.created_at,
        href:  '/human-resources/leave',
      })
    })
    prfs.slice(0, 30).forEach(p => {
      items.push({
        type:  'prf',
        title: `PRF — ${p.requester?.name || ''}`,
        sub:   `${(p.status||'').replace(/_/g,' ').toUpperCase()} · ${p.prf_number || '—'}`,
        date:  p.updated_at || p.created_at,
        href:  `/procurement/${p.id}`,
      })
    })
    return items
      .filter(i => i.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8)
  }, [reqs, prfs])

  // ── Alerts (computed) ─────────────────────────────────────────
  const alerts = useMemo(() => {
    const out = []
    if (pendingLeaves > 0) out.push({ severity:'warning', message:`${pendingLeaves} leave/overtime request(s) awaiting approval`, href:'/human-resources/leave' })
    if (pendingPrfs   > 0) out.push({ severity:'info',    message:`${pendingPrfs} PRF(s) awaiting next stage`,                  href:'/procurement' })
    if (rejectedPrfs  > 0) out.push({ severity:'critical',message:`${rejectedPrfs} PRF(s) rejected — review needed`,             href:'/procurement?status=rejected' })

    const unreadNotifs = notifs.filter(n => !n.read).length
    if (unreadNotifs > 0) out.push({ severity:'info', message:`${unreadNotifs} unread notification(s)`, href:'/human-resources/leave' })
    return out
  }, [pendingLeaves, pendingPrfs, rejectedPrfs, notifs])

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-extrabold text-secondary-700 leading-tight">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-sm text-neutral-400 mt-1">
            Operations overview — live data across HR, Procurement &amp; Inventory.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} disabled={loading}
            className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-100 rounded-lg text-xs font-bold text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Refresh
          </button>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-neutral-100 rounded-lg text-xs font-semibold text-neutral-500">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            {new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' })}
          </span>
        </div>
      </div>

      {/* ── KPI tiles ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          label="Total Workforce"
          value={loading && totalStaff === 0 ? '…' : totalStaff}
          sub={onSiteStaff >= 0 ? `${onSiteStaff} on site · ${onLeaveToday} on leave` : ''}
          subColor="text-neutral-500"
          icon={Users}
          color="bg-blue-50 text-blue-600"
          to
          onClick={() => navigate('/human-resources')}
        />
        <StatTile
          label="Pending Approvals"
          value={loading ? '…' : pendingLeaves}
          sub={`${pendingLrfCount} leaves · ${pendingOtCount} overtime`}
          subColor="text-amber-600"
          icon={Clock}
          color="bg-amber-50 text-amber-600"
          to
          onClick={() => navigate('/human-resources/leave')}
        />
        <StatTile
          label="Active PRFs"
          value={loading ? '…' : pendingPrfs}
          sub={`${approvedPrfs} approved · ${rejectedPrfs} rejected`}
          subColor="text-neutral-500"
          icon={ShoppingCart}
          color="bg-purple-50 text-purple-600"
          to
          onClick={() => navigate('/procurement')}
        />
        <StatTile
          label="On Leave Today"
          value={loading ? '…' : onLeaveToday}
          sub={`${approvedThisMonth} approved this month`}
          subColor="text-green-600"
          icon={Calendar}
          color="bg-green-50 text-green-600"
          to
          onClick={() => navigate('/human-resources/calendar')}
        />
      </div>

      {/* ── Modules grid ── */}
      <div>
        <h2 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Modules</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <ModuleTile
            icon={Users}
            title="Human Resources"
            subtitle="Workforce, attendance, leaves, certifications, assets"
            badge="Live" badgeColor="bg-green-50 text-green-600 border border-green-200"
            color="bg-blue-50 text-blue-600"
            onClick={() => navigate('/human-resources')}
          />
          <ModuleTile
            icon={ShoppingCart}
            title="Procurement (PRF)"
            subtitle="Purchase requests, approval pipeline, master list"
            badge="Live" badgeColor="bg-green-50 text-green-600 border border-green-200"
            color="bg-purple-50 text-purple-600"
            onClick={() => navigate('/procurement')}
          />
          <ModuleTile
            icon={FileSpreadsheet}
            title="Inventory Control"
            subtitle="Stock, rotable parts, bad items, weekly imports"
            badge="Live" badgeColor="bg-green-50 text-green-600 border border-green-200"
            color="bg-emerald-50 text-emerald-600"
            onClick={() => navigate('/inventory')}
          />
          <ModuleTile
            icon={Calendar}
            title="Calendar"
            subtitle="Approved leaves overview by date"
            color="bg-orange-50 text-orange-600"
            onClick={() => navigate('/human-resources/calendar')}
          />
          <ModuleTile
            icon={FileText}
            title="Leave & OT Requests"
            subtitle="Submit leave, overtime, manage approvals"
            color="bg-pink-50 text-pink-600"
            onClick={() => navigate('/human-resources/leave')}
          />
          <ModuleTile
            icon={TrendingUp}
            title="Maintenance"
            subtitle="Corrective + preventive workflows"
            badge="Coming Soon" badgeColor="bg-amber-50 text-amber-700 border border-amber-200"
            color="bg-neutral-50 text-neutral-400"
            disabled
          />
        </div>
      </div>

      {/* ── Recent activity + Alerts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Recent activity */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-secondary-700">Recent Activity</h3>
            <button onClick={() => navigate('/human-resources/leave')}
              className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {loading && recent.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : recent.length === 0 ? (
            <div className="py-12 text-center text-neutral-300">
              <Bell className="w-7 h-7 mx-auto mb-2" />
              <p className="text-xs">No recent activity</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {recent.map((it, i) => {
                const cfg =
                  it.type === 'leave'    ? { color: 'bg-blue-50    text-blue-500',    Icon: Calendar }      :
                  it.type === 'overtime' ? { color: 'bg-orange-50  text-orange-500',  Icon: Clock }         :
                                           { color: 'bg-purple-50  text-purple-500',  Icon: ShoppingCart }
                return (
                  <button key={i} onClick={() => it.href && navigate(it.href)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors text-left">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
                      <cfg.Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-secondary-700 truncate capitalize">{it.title}</p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">{it.sub}</p>
                    </div>
                    <span className="text-[10px] text-neutral-300 shrink-0">{fmtTime(it.date)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Alerts */}
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-secondary-700 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Alerts
            </h3>
            <span className="text-[10px] font-bold text-neutral-400">{alerts.length}</span>
          </div>
          {alerts.length === 0 ? (
            <div className="py-12 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
              <p className="text-xs font-bold text-secondary-700">All caught up!</p>
              <p className="text-[10px] text-neutral-400 mt-1">No alerts right now</p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {alerts.map((a, i) => {
                const palette =
                  a.severity === 'critical' ? 'bg-red-50    text-red-700    border-l-red-500'    :
                  a.severity === 'warning'  ? 'bg-amber-50  text-amber-700  border-l-amber-500'  :
                                              'bg-blue-50   text-blue-700   border-l-blue-500'
                return (
                  <button key={i} onClick={() => a.href && navigate(a.href)}
                    className={`w-full flex items-start gap-2 px-5 py-3 border-l-4 ${palette} hover:opacity-90 transition-all text-left`}>
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold leading-relaxed">{a.message}</p>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex flex-wrap justify-between items-center pt-2 text-xs text-neutral-400 border-t border-neutral-100 gap-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse" />
          SYSTEM STATUS: ONLINE
        </div>
        <span>© {new Date().getFullYear()} Rotem SRS Egypt</span>
      </div>

    </div>
  )
}
