import { useMemo, useState } from 'react'
import {
  CakeSlice, Loader2, Package2, RefreshCw, ShieldCheck, ShoppingCart,
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
  // ── Maintenance summary ────────────────────────────────────────────────────
  const activeTasks = useMemo(() => maintenanceTasks.filter(task => task.status !== 'done'), [maintenanceTasks])
  const criticalTasks = useMemo(() => activeTasks.filter(task => ['critical', 'high'].includes(task.priority)).length, [activeTasks])
  const dueSoon = useMemo(() => {
    // Cutoff is derived from `today` (a stable prop-driven anchor) rather than
    // Date.now() so the memo stays pure across re-renders.
    const cutoff = today + 7 * 24 * 60 * 60 * 1000
    return activeTasks.filter(task => task.due_date && new Date(task.due_date).getTime() <= cutoff).length
  }, [activeTasks, today])

  // ── Trend series pulled from the weekly attendance rows ────────────────────
  const weekRows = useMemo(() => attendanceWeek.rows || [], [attendanceWeek.rows])
  const presentSeries = useMemo(() => weekRows.map(day => Number(day.present || 0)), [weekRows])

  // Yesterday is the second-to-last row; today's live count comes from the
  // attendance endpoint, so compare against it rather than the last row.
  const yesterdayPresent = presentSeries.length >= 2 ? presentSeries[presentSeries.length - 2] : null
  const presentDelta = yesterdayPresent === null ? null : presentToday - yesterdayPresent

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
          subtitle="Workforce, attendance and leaves"
          href="/human-resources"
          loading={loading}
          hero={{
            label: totalEmployees ? `present today · ${Math.round((presentToday / totalEmployees) * 100)}% of the workforce` : 'present today',
            value: presentToday,
            tone: 'green',
            delta: presentDelta,
            spark: presentSeries,
          }}
          stats={[
            { label: 'Employees', value: totalEmployees },
            { label: 'On leave',  value: onLeaveToday, tone: 'amber' },
            { label: 'Absent',    value: absentToday,  tone: 'red' },
          ]}
        />}

        {fullProcurementAccess && <ModuleCard
          icon={ShoppingCart}
          title="Procurement"
          accent="procurement"
          subtitle="Requests, suppliers and orders"
          href="/procurement"
          loading={loading}
          hero={{
            label: 'purchase requests moving through the workflow',
            value: prfPending,
            tone: prfPending ? 'amber' : undefined,
          }}
          stats={[
            { label: 'Total PRFs', value: procurementRequests.length },
            { label: 'Approved',   value: prfApproved, tone: 'green' },
            { label: 'Rejected',   value: prfRejected, tone: 'red' },
          ]}
        />}

        {fullMaintenanceAccess && <ModuleCard
          icon={Wrench}
          title="Maintenance"
          accent="maintenance"
          subtitle="Preventive, corrective and heavy tasks"
          href="/maintenance"
          loading={loading}
          hero={{
            label: 'work orders open across the fleet',
            value: activeTasks.length,
          }}
          stats={[
            { label: 'Critical',    value: criticalTasks, tone: 'red' },
            { label: 'Due 7 days',  value: dueSoon, tone: 'amber' },
            { label: 'Total tasks', value: maintenanceTasks.length },
          ]}
        />}

        {fullMaterialAccess && <ModuleCard
          icon={Package2}
          title="Material Control"
          accent="materials"
          subtitle="Inventory ledger, rotable parts, withdrawals"
          href="/inventory"
          loading={loading}
          hero={{
            label: 'items withdrawn and not yet returned',
            value: withdrawalStats?.active ?? 0,
            tone: withdrawalStats?.active ? 'amber' : undefined,
          }}
          stats={[
            { label: 'Withdrawals', value: withdrawalStats?.total ?? 0 },
            { label: 'Returned',    value: withdrawalStats?.returned ?? 0, tone: 'green' },
            { label: 'This month',  value: withdrawalStats?.this_month ?? 0 },
          ]}
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

      {/* Individual leave/permission rows are deliberately absent: a manager
          does not need a per-person list here, and the same data reads better
          next to the attendance overview inside the HR module. The pending
          count still surfaces in the attention strip above. */}
      <ActivityStream
        procurementRequests={procurementRequests}
        maintenanceTasks={maintenanceTasks}
        hrAccess={false}
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

