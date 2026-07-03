// src/pages/Dashboard.jsx — interactive, live-data dashboard
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import {
  Users, Calendar, Clock, ShoppingCart, AlertTriangle,
  CheckCircle2, ArrowRight, RefreshCw, Bell, FileText,
  Loader2, Package2, Wrench, UserCheck,
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

// ── Compact stat tile for use inside dept sections ──────────────
function SectionStat({ label, value, sub, subColor = 'text-neutral-400', icon: Icon, iconBg, onClick }) {
  return (
    <button
      onClick={onClick}
      className="bg-neutral-50 rounded-xl p-4 text-left flex items-start gap-3 hover:bg-neutral-100 transition-all w-full">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        {Icon && <Icon className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-neutral-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-2xl font-extrabold text-secondary-700 leading-none">{value}</p>
        {sub && <p className={`text-[10px] font-medium mt-1.5 ${subColor}`}>{sub}</p>}
      </div>
    </button>
  )
}

// ── Department section card ─────────────────────────────────────
function DeptSection({ title, subtitle, icon: Icon, accentColor, headerBg, iconBg, onView, viewLabel = 'View Module', children }) {
  return (
    <div className={`bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden border-l-4 ${accentColor}`}>
      <div className={`px-5 py-4 flex items-center justify-between ${headerBg} border-b border-neutral-100`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-secondary-700">{title}</h2>
            {subtitle && <p className="text-[10px] text-neutral-400 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {onView && (
          <button onClick={onView}
            className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            {viewLabel} <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useSelector(s => s.auth)

  const role       = user?.role ?? 'staff'
  const dept       = user?.department ?? ''
  const isHRFull   = ['admin', 'depot_manager', 'hr'].includes(role)
  const isProcFull = ['admin', 'depot_manager', 'purchasing'].includes(role)
  const canSeeProc = isProcFull || role === 'ehs'
  const isDashFull = ['admin', 'depot_manager'].includes(role)

  const [loading, setLoading] = useState(true)
  const [empStats,  setEmpStats]  = useState(null)
  const [employees, setEmployees] = useState([])
  const [reqs,      setReqs]      = useState([])
  const [prfs,      setPrfs]      = useState([])
  const [notifs,    setNotifs]    = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const tasks = []
    if (isHRFull) {
      tasks.push(
        getEmployeeStats().then(r => setEmpStats(r?.data ?? r)).catch(() => {}),
        getEmployees({ per_page: 500 }).then(r => {
          const list = Array.isArray(r?.data?.data) ? r.data.data : Array.isArray(r?.data) ? r.data : []
          setEmployees(list)
        }).catch(() => {}),
        getLeaveRequests().then(r => setReqs(r?.data ?? [])).catch(() => {}),
      )
    }
    if (canSeeProc) {
      tasks.push(getPrfs().then(r => setPrfs(r?.data ?? [])).catch(() => {}))
    }
    tasks.push(getNotifications().then(r => setNotifs(r?.data ?? [])).catch(() => {}))
    await Promise.allSettled(tasks)
    setLoading(false)
  }, [isHRFull, canSeeProc])

  useEffect(() => {
    fetchAll()
    const t = setInterval(fetchAll, 60000)
    return () => clearInterval(t)
  }, [fetchAll])

  // ── Derived stats ───────────────────────────────────────────
  const today = todayISO()

  const onLeaveToday = useMemo(() =>
    reqs.filter(r =>
      r.type === 'lrf' && r.status === 'approved' &&
      (r.start_date?.slice(0,10) ?? '') <= today &&
      today <= (r.end_date?.slice(0,10) ?? r.start_date?.slice(0,10) ?? '')
    ).length, [reqs, today])

  const pendingLeaves     = useMemo(() => reqs.filter(r => ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const pendingLrfCount   = useMemo(() => reqs.filter(r => r.type === 'lrf' && ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const pendingOtCount    = useMemo(() => reqs.filter(r => r.type === 'otr' && ['pending','manager_approved'].includes(r.status)).length, [reqs])
  const approvedThisMonth = useMemo(() => {
    const start = new Date(); start.setDate(1)
    return reqs.filter(r => r.status === 'approved' && new Date(r.created_at) >= start).length
  }, [reqs])

  const pendingPrfs  = useMemo(() => prfs.filter(p => p.status?.startsWith('pending')).length, [prfs])
  const approvedPrfs = useMemo(() => prfs.filter(p => p.status === 'approved').length, [prfs])
  const rejectedPrfs = useMemo(() => prfs.filter(p => p.status === 'rejected').length, [prfs])

  const totalStaff  = empStats?.total_employees ?? employees.length
  const onSiteStaff = totalStaff - onLeaveToday

  // ── Recent activity ─────────────────────────────────────────
  const recent = useMemo(() => {
    const items = []
    if (isHRFull) {
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
    }
    if (canSeeProc) {
      prfs.slice(0, 30).forEach(p => {
        items.push({
          type:  'prf',
          title: `PRF — ${p.requester?.name || ''}`,
          sub:   `${(p.status||'').replace(/_/g,' ').toUpperCase()} · ${p.prf_number || '—'}`,
          date:  p.updated_at || p.created_at,
          href:  `/procurement/${p.id}`,
        })
      })
    }
    return items
      .filter(i => i.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 8)
  }, [reqs, prfs, isHRFull, canSeeProc])

  // ── Alerts ──────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const out = []
    if (isHRFull && pendingLeaves > 0)  out.push({ severity:'warning',  message:`${pendingLeaves} leave/overtime request(s) awaiting approval`, href:'/human-resources/leave' })
    if (canSeeProc && pendingPrfs > 0)  out.push({ severity:'info',     message:`${pendingPrfs} PRF(s) awaiting next stage`,                    href:'/procurement' })
    if (canSeeProc && rejectedPrfs > 0) out.push({ severity:'critical', message:`${rejectedPrfs} PRF(s) rejected — review needed`,               href:'/procurement' })
    const unread = notifs.filter(n => !n.read).length
    if (unread > 0) out.push({ severity:'info', message:`${unread} unread notification(s)`, href: isHRFull ? '/human-resources/leave' : '/procurement' })
    return out
  }, [pendingLeaves, pendingPrfs, rejectedPrfs, notifs, isHRFull, canSeeProc])

  const L = (v) => loading ? '…' : v

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-7 space-y-5">

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

      {/* ══ HR Section ══════════════════════════════════════════════ */}
      {isHRFull && (
        <DeptSection
          title="Human Resources"
          subtitle="Workforce, attendance, leaves & overtime requests"
          icon={Users}
          accentColor="border-l-blue-500"
          headerBg="bg-blue-50/40"
          iconBg="bg-blue-100 text-blue-600"
          onView={() => navigate('/human-resources')}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SectionStat
              label="Total Workforce"
              value={L(totalStaff)}
              sub="Active employees"
              icon={Users}
              iconBg="bg-blue-100 text-blue-600"
              onClick={() => navigate('/human-resources')}
            />
            <SectionStat
              label="On Site Today"
              value={L(onSiteStaff >= 0 ? onSiteStaff : '—')}
              sub={`${L(onLeaveToday)} on leave`}
              subColor="text-sky-600"
              icon={UserCheck}
              iconBg="bg-sky-100 text-sky-600"
              onClick={() => navigate('/human-resources/calendar')}
            />
            <SectionStat
              label="Pending Leaves"
              value={L(pendingLrfCount)}
              sub={pendingLrfCount > 0 ? 'Awaiting approval' : `${approvedThisMonth} approved this month`}
              subColor={pendingLrfCount > 0 ? 'text-amber-600' : 'text-neutral-400'}
              icon={Calendar}
              iconBg="bg-amber-100 text-amber-600"
              onClick={() => navigate('/human-resources/leave')}
            />
            <SectionStat
              label="Pending Overtime"
              value={L(pendingOtCount)}
              sub={pendingOtCount > 0 ? 'Awaiting approval' : 'None pending'}
              subColor={pendingOtCount > 0 ? 'text-orange-600' : 'text-neutral-400'}
              icon={Clock}
              iconBg="bg-orange-100 text-orange-600"
              onClick={() => navigate('/human-resources/leave')}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              { label: 'Employee List',  href: '/human-resources' },
              { label: 'Leave Requests', href: '/human-resources/leave' },
              { label: 'Calendar',       href: '/human-resources/calendar' },
            ].map(l => (
              <button key={l.href} onClick={() => navigate(l.href)}
                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold rounded-lg transition-colors">
                {l.label}
              </button>
            ))}
          </div>
        </DeptSection>
      )}

      {/* ══ Procurement Section ═════════════════════════════════════ */}
      {canSeeProc && (
        <DeptSection
          title="Procurement (PRF)"
          subtitle="Purchase requests & approval pipeline"
          icon={ShoppingCart}
          accentColor="border-l-purple-500"
          headerBg="bg-purple-50/40"
          iconBg="bg-purple-100 text-purple-600"
          onView={() => navigate('/procurement')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <SectionStat
              label="Pending PRFs"
              value={L(pendingPrfs)}
              sub="Awaiting approval"
              subColor={pendingPrfs > 0 ? 'text-amber-600' : 'text-neutral-400'}
              icon={Clock}
              iconBg="bg-amber-100 text-amber-600"
              onClick={() => navigate('/procurement')}
            />
            <SectionStat
              label="Approved PRFs"
              value={L(approvedPrfs)}
              sub="Cleared for purchase"
              subColor="text-green-600"
              icon={CheckCircle2}
              iconBg="bg-green-100 text-green-600"
              onClick={() => navigate('/procurement')}
            />
            <SectionStat
              label="Rejected PRFs"
              value={L(rejectedPrfs)}
              sub={rejectedPrfs > 0 ? 'Review required' : 'None rejected'}
              subColor={rejectedPrfs > 0 ? 'text-red-600' : 'text-neutral-400'}
              icon={AlertTriangle}
              iconBg="bg-red-100 text-red-500"
              onClick={() => navigate('/procurement')}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {isProcFull ? [
              { label: 'All PRFs',        href: '/procurement' },
              { label: 'New PRF',         href: '/procurement/new' },
              { label: 'Purchase Orders', href: '/procurement/pos' },
            ].map(l => (
              <button key={l.href} onClick={() => navigate(l.href)}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-semibold rounded-lg transition-colors">
                {l.label}
              </button>
            )) : (
              <button onClick={() => navigate('/procurement/new')}
                className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-semibold rounded-lg transition-colors">
                New Purchase Request
              </button>
            )}
          </div>
        </DeptSection>
      )}

      {/* ══ Inventory + Maintenance (Admin / Depot Manager) ═════════ */}
      {isDashFull && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Inventory */}
          <DeptSection
            title="Inventory Control"
            subtitle="Stock, rotable parts, bad items, weekly imports"
            icon={Package2}
            accentColor="border-l-emerald-500"
            headerBg="bg-emerald-50/40"
            iconBg="bg-emerald-100 text-emerald-600"
            onView={() => navigate('/inventory')}
            viewLabel="Open Inventory"
          >
            <div className="flex items-center gap-4 bg-emerald-50/60 rounded-xl p-4">
              <Package2 className="w-10 h-10 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-emerald-700">Inventory Module Active</p>
                <p className="text-[10px] text-emerald-600 mt-0.5 leading-relaxed">
                  Stock tracking, rotable parts register, bad item log and weekly Excel imports.
                </p>
              </div>
              <button onClick={() => navigate('/inventory')}
                className="flex items-center gap-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors shrink-0">
                Open <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </DeptSection>

          {/* Maintenance */}
          <DeptSection
            title="Maintenance"
            subtitle="Corrective & preventive maintenance workflows"
            icon={Wrench}
            accentColor="border-l-neutral-300"
            headerBg="bg-neutral-50"
            iconBg="bg-neutral-100 text-neutral-400"
          >
            <div className="flex items-center gap-4 bg-neutral-50 rounded-xl p-4">
              <Wrench className="w-10 h-10 text-neutral-300 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-neutral-500">Module Coming Soon</p>
                <p className="text-[10px] text-neutral-400 mt-0.5 leading-relaxed">
                  Corrective + preventive workflows, job cards, and equipment tracking.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-full shrink-0">
                Coming Soon
              </span>
            </div>
          </DeptSection>
        </div>
      )}

      {/* ══ Leave & OT quick access (non-HR users) ══════════════════ */}
      {!isHRFull && (
        <DeptSection
          title="Leave & Overtime Requests"
          subtitle="Submit and track your leave and overtime requests"
          icon={FileText}
          accentColor="border-l-pink-500"
          headerBg="bg-pink-50/40"
          iconBg="bg-pink-100 text-pink-600"
          onView={() => navigate('/human-resources/leave')}
          viewLabel="My Requests"
        >
          <div className="flex flex-wrap gap-2">
            <button onClick={() => navigate('/human-resources/leave')}
              className="flex items-center gap-2 px-4 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-semibold rounded-xl transition-colors">
              <FileText className="w-3.5 h-3.5" /> My Requests
            </button>
            <button onClick={() => navigate('/human-resources/leave')}
              className="flex items-center gap-2 px-4 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-semibold rounded-xl transition-colors">
              <Calendar className="w-3.5 h-3.5" /> New Leave Request
            </button>
            <button onClick={() => navigate('/human-resources/leave')}
              className="flex items-center gap-2 px-4 py-2.5 bg-pink-50 hover:bg-pink-100 text-pink-700 text-xs font-semibold rounded-xl transition-colors">
              <Clock className="w-3.5 h-3.5" /> New Overtime Request
            </button>
          </div>
        </DeptSection>
      )}

      {/* ══ Recent Activity + Alerts ═════════════════════════════════ */}
      {(isHRFull || canSeeProc) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent activity */}
          <div className="lg:col-span-2 bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-secondary-700">Recent Activity</h3>
              <button onClick={() => navigate(isHRFull ? '/human-resources/leave' : '/procurement')}
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
                    it.type === 'leave'    ? { color: 'bg-blue-50   text-blue-500',   Icon: Calendar }     :
                    it.type === 'overtime' ? { color: 'bg-orange-50 text-orange-500', Icon: Clock }        :
                                             { color: 'bg-purple-50 text-purple-500', Icon: ShoppingCart }
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
                    a.severity === 'critical' ? 'bg-red-50   text-red-700   border-l-red-500'   :
                    a.severity === 'warning'  ? 'bg-amber-50 text-amber-700 border-l-amber-500' :
                                                'bg-blue-50  text-blue-700  border-l-blue-500'
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
      )}

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
