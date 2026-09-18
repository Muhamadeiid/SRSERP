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
  user, loading, onRefresh,
  fullHrAccess, fullProcurementAccess, fullMaintenanceAccess, fullMaterialAccess,
  empStats, todayAttendance = [], leaveRequests = [],
  procurementRequests = [], maintenanceTasks = [], birthdays = [],
}) {
  const navigate = useNavigate()
  // Capture "now" once at mount so date-based memos stay pure. Manual refreshes
  // re-fetch the tasks; the 7-day window is a UX cue, not audit-grade.
  const [today] = useState(() => Date.now())

  // ── HR summary ─────────────────────────────────────────────────────────────
  const totalEmployees = empStats?.total_employees ?? 0
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

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">

      {/* Page header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight text-secondary-700 sm:text-[28px]">Operations Dashboard</h1>
          <p className="mt-1 text-sm text-neutral-400">
            {user?.name ? `Welcome back, ${user.name.split(' ')[0]}. ` : ''}
            Live overview across the departments available to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-neutral-100 bg-white px-3 py-2 text-xs font-bold text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </header>

      {/* Module cards — one per department the user can see. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">

        {fullHrAccess && <ModuleCard
          icon={Users}
          title="Human Resources"
          subtitle="Workforce, attendance and leaves"
          href="/human-resources"
          loading={loading}
          kpis={[
            { label: 'Employees', value: totalEmployees, onClick: () => navigate('/human-resources/employees') },
            { label: 'Present', value: presentToday, tone: 'green', sub: totalEmployees ? `${Math.round((presentToday / totalEmployees) * 100)}% today` : null, onClick: () => navigate('/human-resources/attendance') },
            { label: 'On Leave', value: onLeaveToday, tone: 'amber', onClick: () => navigate('/human-resources/attendance?status=leave') },
            { label: 'Absent', value: absentToday, tone: 'red', onClick: () => navigate('/human-resources/attendance?status=absent') },
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
          subtitle="Inventory ledger, rotable parts, withdrawals"
          href="/inventory"
          loading={loading}
          kpis={[
            { label: 'Inventory', value: '→', tone: 'primary', onClick: () => navigate('/inventory') },
            { label: 'Rotable', value: '→', tone: 'primary', onClick: () => navigate('/inventory/rotable') },
            { label: 'Bad Items', value: '→', tone: 'amber', onClick: () => navigate('/inventory/bad') },
            { label: 'Reports', value: '→', tone: 'primary', onClick: () => navigate('/inventory/reports') },
          ]}
          recent={[]}
          emptyRecent="Open Inventory for stock ledger and withdrawals"
        />}
      </div>

      {/* Cross-department widgets — visible to any signed-in user. */}
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

