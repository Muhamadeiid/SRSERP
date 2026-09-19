import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CakeSlice, ClipboardList, FilePlus2, FileText,
  Loader2, Package2, RefreshCw, ShieldCheck, ShoppingCart,
  Users, Wrench,
} from 'lucide-react'
import ModuleCard from './ModuleCard'
import CalendarDashboardWidget from './CalendarDashboardWidget'
import UserAvatar from '../profile/UserAvatar'
import './operations-dashboard.css'
import OperationsInsights from './OperationsInsights'
import AttentionStrip from './AttentionStrip'
import ActivityStream from './ActivityStream'

/**
 * Root Operations Dashboard — one module card per department.
 *
 * The detailed HR view (attendance charts, leave board, birthdays, recognition,
 * personal maintenance queue) lives inside the HR module at
 * /human-resources/dashboard. This screen is the top-level overview: same shape
 * for HR, Procurement, Maintenance and Material Control so the workspace reads
 * as one system.
 *
 * Each module renders only when the caller has access (fullHrAccess,
 * fullProcurementAccess, fullMaintenanceAccess, fullMaterialAccess); other
 * viewers see a lightweight "My Requests" strip via the Dashboard shell.
 */
export default function OperationsDashboardView({
  user, loading, refreshing, onRefresh,
  fullHrAccess, fullProcurementAccess, fullMaintenanceAccess, fullMaterialAccess,
  empStats, todayAttendance = [], leaveRequests = [],
  procurementRequests = [], maintenanceTasks = [], withdrawalStats = null, birthdays = [],
  attendanceWeek = { rows: [], loading: false, error: false },
}) {
  const navigate = useNavigate()
  // Capture "now" once at mount so date-based memos stay pure. Manual refreshes
  // re-fetch the tasks; the 7-day window is a UX cue, not audit-grade.
  const [today] = useState(() => Date.now())

  // ── HR summary ─────────────────────────────────────────────────────────────
  // The current employees/stats endpoint returns `total`; keep the legacy key
  // as a fallback so the overview works with both backend response shapes.
  const totalEmployees = empStats?.total ?? empStats?.total_employees ?? 0
  const presentToday = useMemo(() => new Set(
    todayAttendance.filter(row => row.check_in || row.check_out).map(row => String(row.employee_id))
  ).size, [todayAttendance])
  const onLeaveToday = useMemo(
    () => todayAttendance.filter(row => String(row.status || '').toLowerCase() === 'leave').length,
    [todayAttendance]
  )
  const absentToday = Math.max(0, totalEmployees - presentToday - onLeaveToday)

  // ── Procurement summary ────────────────────────────────────────────────────
  const prfPending = useMemo(
    () => procurementRequests.filter(item => String(item.status || '').startsWith('pending')).length,
    [procurementRequests]
  )
  const prfApproved = useMemo(
    () => procurementRequests.filter(item => item.status === 'approved').length,
    [procurementRequests]
  )
  const prfRejected = useMemo(
    () => procurementRequests.filter(item => item.status === 'rejected').length,
    [procurementRequests]
  )
  const recentPrfs = useMemo(() => [...procurementRequests]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 4), [procurementRequests])

  // ── Maintenance summary ────────────────────────────────────────────────────
  const activeTasks = useMemo(() => maintenanceTasks.filter(task => task.status !== 'done'), [maintenanceTasks])
  const criticalTasks = useMemo(() => activeTasks.filter(task => ['critical', 'high'].includes(task.priority)).length, [activeTasks])
  const dueSoon = useMemo(() => {
    // Cutoff is derived from `today` (a stable prop-driven anchor) rather than
    // Date.now() so the memo stays pure across re-renders.
    const cutoff = today + 7 * 24 * 60 * 60 * 1000
    return activeTasks.filter(task => task.due_date && new Date(task.due_date).getTime() <= cutoff).length
  }, [activeTasks, today])
  const recentTasks = useMemo(() => activeTasks.slice(0, 4), [activeTasks])

  // ── HR summary continued: latest leave/overtime submissions ────────────────
  const recentLeaveRequests = useMemo(() => [...leaveRequests]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 4), [leaveRequests])

  // ── Trend series pulled from the weekly attendance rows ────────────────────
  const weekRows = useMemo(() => attendanceWeek.rows || [], [attendanceWeek.rows])
  const presentSeries = useMemo(() => weekRows.map(day => Number(day.present || 0)), [weekRows])
  const leaveSeries = useMemo(() => weekRows.map(day => Number(day.leave || 0)), [weekRows])
  const absentSeries = useMemo(() => weekRows.map(day => Number(day.absent || 0)), [weekRows])

  // Yesterday is the second-to-last row; today's live count comes from the
  // attendance endpoint, so compare against it rather than the last row.
  const deltaFor = series => (series.length >= 2 ? series[series.length - 2] : null)
  const presentDelta = deltaFor(presentSeries) === null ? null : presentToday - deltaFor(presentSeries)
  const leaveDelta = deltaFor(leaveSeries) === null ? null : onLeaveToday - deltaFor(leaveSeries)
  const absentDelta = deltaFor(absentSeries) === null ? null : absentToday - deltaFor(absentSeries)

  // ── What is actually waiting on this user right now ────────────────────────
  const attentionItems = useMemo(() => {
    const pendingLeaves = leaveRequests.filter(
      request => ['pending', 'manager_approved', 'hr_approved', 'cancellation_pending'].includes(request.status)
    ).length

    return [
      fullHrAccess && {
        key: 'leaves',
        count: pendingLeaves,
        label: `leave request${pendingLeaves === 1 ? '' : 's'} pending`,
        href: '/human-resources/leave',
        tone: 'amber',
      },
      fullProcurementAccess && {
        key: 'prfs',
        count: prfPending,
        label: `purchase request${prfPending === 1 ? '' : 's'} in workflow`,
        href: '/procurement/master?status=pending_procurement',
        tone: 'blue',
      },
      fullMaintenanceAccess && {
        key: 'critical',
        count: criticalTasks,
        label: `critical maintenance task${criticalTasks === 1 ? '' : 's'}`,
        href: '/maintenance',
        tone: 'red',
      },
      fullMaintenanceAccess && {
        key: 'due',
        count: dueSoon,
        label: 'due within 7 days',
        href: '/maintenance',
        tone: 'amber',
      },
    ].filter(Boolean)
  }, [leaveRequests, prfPending, criticalTasks, dueSoon,
      fullHrAccess, fullProcurementAccess, fullMaintenanceAccess])

  return (
    <div className="operations-dashboard mx-auto max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-8">

      {/* Page header */}
      <header className="operations-hero">
        <div>
          <p className="operations-eyebrow">ROTEM SRS / OPERATIONS OVERVIEW</p>
          <h1 className="operations-title">Operations Dashboard</h1>
          <p className="operations-intro">
            {user?.name ? `Welcome back, ${user.name.split(' ')[0]}. ` : ''}
            Live overview across the departments available to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading || refreshing}
          className="operations-refresh inline-flex items-center gap-2 rounded-lg px-4 py-3 text-xs font-bold disabled:opacity-50"
        >
          {loading || refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
        <div className="operations-hero-bottom">
          <span>{new Date(today).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Account-scoped overview</span>
        </div>
      </header>

      {/* What is waiting on you — hidden entirely on a clear day. */}
      <AttentionStrip items={attentionItems} />

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="operations-section-kicker">YOUR WORKSPACE</p><h2 className="text-xl font-bold text-secondary-700">Department overview</h2></div>
        <p className="text-xs text-neutral-500">Explore performance. Open a department to take action.</p>
      </div>

      {/* Module cards — one per department the user can see. */}
      <div className="operations-departments-grid">

        {fullHrAccess && <ModuleCard
          icon={Users}
          title="Human Resources"
          accent="people"
          recentLabel="Latest employee requests"
          subtitle="Workforce, attendance and leaves"
          href="/human-resources"
          loading={loading}
          kpis={[
            { label: 'Employees', value: totalEmployees, onClick: () => navigate('/human-resources/employees') },
            { label: 'Present', value: presentToday, tone: 'green', delta: presentDelta, spark: presentSeries, sub: totalEmployees ? `${Math.round((presentToday / totalEmployees) * 100)}% today` : null, onClick: () => navigate('/human-resources/attendance') },
            { label: 'On Leave', value: onLeaveToday, tone: 'amber', delta: leaveDelta, spark: leaveSeries, onClick: () => navigate('/human-resources/attendance?status=leave') },
            { label: 'Absent', value: absentToday, tone: 'red', delta: absentDelta, spark: absentSeries, onClick: () => navigate('/human-resources/attendance?status=absent') },
          ]}
          recent={recentLeaveRequests.map(request => ({
            id: `leave-${request.id}`,
            icon: FileText,
            iconTone: 'bg-primary/10 text-primary',
            title: request.employee_name || request.user?.name || 'Employee',
            sub: `${String(request.leave_type || request.type || 'leave').replaceAll('_', ' ')} · ${LEAVE_STATUS_LABEL[request.status] || request.status || 'submitted'}`,
            href: `/human-resources/leave?req=${request.id}`,
          }))}
          emptyRecent="No leave requests yet"
        />}

        {fullProcurementAccess && <ModuleCard
          icon={ShoppingCart}
          title="Procurement"
          accent="procurement"
          recentLabel="Recent purchase requests"
          subtitle="Requests, suppliers and orders"
          href="/procurement"
          primaryAction={{ label: 'New PRF', icon: FilePlus2, href: '/procurement/new' }}
          loading={loading}
          kpis={[
            { label: 'Total PRFs', value: procurementRequests.length, onClick: () => navigate('/procurement/master') },
            { label: 'In Workflow', value: prfPending, tone: 'amber', onClick: () => navigate('/procurement/master?status=pending_procurement') },
            { label: 'Approved', value: prfApproved, tone: 'green', onClick: () => navigate('/procurement/master?status=approved') },
            { label: 'Rejected', value: prfRejected, tone: 'red', onClick: () => navigate('/procurement/master?status=rejected') },
          ]}
          recent={recentPrfs.map(item => ({
            id: item.id,
            icon: ClipboardList,
            iconTone: 'bg-primary/10 text-primary',
            title: item.prf_number || `PRF #${item.id}`,
            sub: `${item.requester?.name || '—'} · ${item.items?.length || 0} item${(item.items?.length || 0) === 1 ? '' : 's'}`,
            href: `/procurement/${item.id}`,
            badge: <PrfStatusPill status={item.status} />,
          }))}
          emptyRecent="No purchase requests yet"
        />}

        {fullMaintenanceAccess && <ModuleCard
          icon={Wrench}
          title="Maintenance"
          accent="maintenance"
          recentLabel="Active work orders"
          subtitle="Preventive, corrective and heavy tasks"
          href="/maintenance"
          loading={loading}
          kpis={[
            { label: 'Active Tasks', value: activeTasks.length, onClick: () => navigate('/maintenance') },
            { label: 'Critical', value: criticalTasks, tone: 'red', onClick: () => navigate('/maintenance') },
            { label: 'Due 7 days', value: dueSoon, tone: 'amber', onClick: () => navigate('/maintenance') },
            { label: 'Fleet Checks', value: '→', tone: 'primary', onClick: () => navigate('/maintenance/fleet-checks') },
          ]}
          recent={recentTasks.map(task => ({
            id: `task-${task.id}`,
            icon: Wrench,
            iconTone: TASK_TONE[task.priority] || 'bg-neutral-100 text-neutral-500',
            title: task.title,
            sub: `${task.train_number ? `TS${String(task.train_number).padStart(2, '0')} · ` : ''}${task.due_date ? new Date(task.due_date).toLocaleDateString('en-GB') : 'No due date'}`,
            href: `/maintenance?task=${task.id}`,
            badge: <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${TASK_BADGE[task.priority] || 'bg-neutral-100 text-neutral-500'}`}>{task.priority || 'task'}</span>,
          }))}
          emptyRecent="No active maintenance tasks"
        />}

        {fullMaterialAccess && <ModuleCard
          icon={Package2}
          title="Material Control"
          accent="materials"
          recentLabel="Inventory workspace"
          subtitle="Inventory ledger, rotable parts, withdrawals"
          href="/inventory"
          loading={loading}
          kpis={[
            { label: 'Withdrawals', value: withdrawalStats?.total ?? 0, onClick: () => navigate('/maintenance/withdrawals') },
            { label: 'Out Now', value: withdrawalStats?.active ?? 0, tone: 'amber', sub: 'Not returned yet', onClick: () => navigate('/maintenance/withdrawals') },
            { label: 'Returned', value: withdrawalStats?.returned ?? 0, tone: 'green', onClick: () => navigate('/maintenance/withdrawals') },
            { label: 'This Month', value: withdrawalStats?.this_month ?? 0, tone: 'primary', onClick: () => navigate('/maintenance/withdrawals') },
          ]}
          recent={MATERIAL_SHORTCUTS}
          emptyRecent="Open Inventory for stock ledger and withdrawals"
        />}
      </div>

      {/* Analytics — lifted out of the department cards so every card keeps the
          same height and the charts get the full page width to breathe. */}
      {(fullHrAccess || fullProcurementAccess) && <>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><p className="operations-section-kicker">TRENDS</p><h2 className="text-xl font-bold text-secondary-700">Operational analytics</h2></div>
          <p className="text-xs text-neutral-500">Where the workload sits this week.</p>
        </div>
        <OperationsInsights
          hrAccess={fullHrAccess}
          procurementAccess={fullProcurementAccess}
          requests={procurementRequests}
          week={weekRows}
          weekLoading={attendanceWeek.loading}
          weekError={attendanceWeek.error}
          refreshing={refreshing}
        />
      </>}

      <ActivityStream
        leaveRequests={leaveRequests}
        procurementRequests={procurementRequests}
        maintenanceTasks={maintenanceTasks}
        hrAccess={fullHrAccess}
        procurementAccess={fullProcurementAccess}
        maintenanceAccess={fullMaintenanceAccess}
        now={today}
        loading={loading}
      />

      {/* Cross-department widgets — visible to any signed-in user. */}
      <div><p className="operations-section-kicker">ACROSS THE COMPANY</p><h2 className="text-xl font-bold text-secondary-700">People &amp; calendar</h2></div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-neutral-100 bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <span className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-pink-50 text-pink-600">
                <CakeSlice className="h-4 w-4" />
              </span>
              <span>
                <h2 className="text-sm font-bold text-secondary-700">Birthdays</h2>
                <p className="text-[10px] text-neutral-400">Today &amp; tomorrow</p>
              </span>
            </span>
            <span className="rounded-full bg-pink-50 px-2 py-1 text-[9px] font-bold text-pink-600">{birthdays.length}</span>
          </header>
          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {birthdays.length ? birthdays.map(person => (
              <div key={person.id} className="flex items-start gap-2.5 rounded-md border border-pink-100 bg-pink-50/40 p-3">
                <UserAvatar user={person.user} name={person.name} />
                <span className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-secondary-700">{person.name}</strong>
                  <span className="mt-0.5 block truncate text-[10px] text-neutral-500">{person.position || 'Employee'}</span>
                  <span className="mt-1 block text-[10px] font-bold text-pink-600">{person.date_label}</span>
                </span>
              </div>
            )) : <div className="py-10 text-center text-xs text-neutral-400">No birthdays today or tomorrow</div>}
          </div>
        </section>

        <div className="lg:col-span-2">
          <CalendarDashboardWidget />
        </div>
      </div>

      <footer className="flex items-center justify-between border-t border-neutral-100 pt-3 text-[10px] text-neutral-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Live data · scoped to your account
        </span>
        <span>© {new Date().getFullYear()} Rotem Industrial SRS</span>
      </footer>
    </div>
  )
}

// ── Small helpers ────────────────────────────────────────────────────────────

const MATERIAL_SHORTCUTS = [
  { id: 'mc-ledger', icon: Package2, iconTone: 'bg-primary/10 text-primary', title: 'Material ledger', sub: 'Stock on hand and item master', href: '/inventory' },
  { id: 'mc-rotable', icon: Package2, iconTone: 'bg-primary/10 text-primary', title: 'Rotable parts', sub: 'Serialised components in rotation', href: '/inventory/rotable' },
  { id: 'mc-bad', icon: Package2, iconTone: 'bg-amber-50 text-amber-600', title: 'Bad items', sub: 'Quarantined and scrapped stock', href: '/inventory/bad' },
]

const LEAVE_STATUS_LABEL = {
  pending: 'Pending',
  manager_approved: 'Waiting HR',
  hr_approved: 'Waiting Depot',
  approved: 'Approved',
  rejected: 'Rejected',
  cancellation_pending: 'Cancellation pending',
  cancelled: 'Cancelled',
  rescheduled: 'Rescheduled',
}

const PRF_STATUS_META = {
  pending_procurement: ['Waiting Procurement', 'bg-amber-50 text-amber-700'],
  pending_ehs:         ['Waiting EHS', 'bg-sky-50 text-sky-700'],
  pending_depot:       ['Waiting Depot', 'bg-indigo-50 text-indigo-700'],
  approved:            ['Approved', 'bg-emerald-50 text-emerald-700'],
  rejected:            ['Rejected', 'bg-red-50 text-red-700'],
  cancelled:           ['Cancelled', 'bg-neutral-100 text-neutral-500'],
}

function PrfStatusPill({ status }) {
  const [label, tone] = PRF_STATUS_META[status] || [String(status || '').replaceAll('_', ' '), 'bg-neutral-100 text-neutral-600']
  return <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold capitalize ${tone}`}>{label}</span>
}

const TASK_TONE = {
  critical: 'bg-red-50 text-red-600',
  high:     'bg-orange-50 text-orange-600',
  medium:   'bg-amber-50 text-amber-600',
  low:      'bg-neutral-100 text-neutral-500',
}

const TASK_BADGE = {
  critical: 'bg-red-50 text-red-700 border border-red-200',
  high:     'bg-orange-50 text-orange-700 border border-orange-200',
  medium:   'bg-amber-50 text-amber-700 border border-amber-200',
  low:      'bg-neutral-100 text-neutral-600 border border-neutral-200',
}
