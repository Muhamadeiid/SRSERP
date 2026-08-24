import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import ProtectedRoute    from './components/auth/ProtectedRoute'
import { getMe } from './services/authService'
import { logout, refreshUser } from './store/slices/authSlice'
import MaintenanceTaskToasts from './components/notifications/MaintenanceTaskToasts'
import { startNotificationSubscription, stopNotificationSubscription } from './services/notificationService'

const lazyWithRetry = importer => lazy(async () => {
  try {
    return await importer()
  } catch (error) {
    const message = String(error?.message || error)
    const isChunkFailure = /dynamically imported module|module script|loading chunk|failed to fetch/i.test(message)
    const lastRecovery = Number(sessionStorage.getItem('srs_chunk_recovery') || 0)

    if (isChunkFailure && Date.now() - lastRecovery > 30000) {
      sessionStorage.setItem('srs_chunk_recovery', String(Date.now()))
      const url = new URL(window.location.href)
      url.searchParams.set('_refresh', String(Date.now()))
      window.location.replace(url.toString())
      return new Promise(() => {})
    }

    throw error
  }
})

// Keep the import functions reusable. Calling the same importer ahead of a
// navigation warms Vite's module cache, so React.lazy can render immediately.
const importDashboard       = () => import('./pages/Dashboard')
const importProducts        = () => import('./pages/Products')
const importLeaveRequests   = () => import('./pages/LeaveRequestsPage')
const importWorkCalendar    = () => import('./pages/WorkCalendarPage')
const importHRLayout        = () => import('./layout/HRLayout')
const importInventoryLayout = () => import('./layout/InventoryLayout')
const importMainLayout      = () => import('./layout/MainLayout')
const importProcLayout      = () => import('./layout/ProcurementLayout')
const importPrfDashboard    = () => import('./pages/PrfDashboard')
const importWorkforce       = () => import('./components/hr/WorkforceTab')
const importAttendance      = () => import('./components/hr/AttendanceTab')

const Login             = lazyWithRetry(() => import('./pages/Login'))
const DashboardPage     = lazyWithRetry(importDashboard)
const ProductsPage      = lazyWithRetry(importProducts)
const Users             = lazyWithRetry(() => import('./pages/Users/Index'))
const LeaveRequestsPage = lazyWithRetry(importLeaveRequests)
const CalendarPage      = lazyWithRetry(() => import('./pages/CalendarPage'))
const WorkCalendarPage  = lazyWithRetry(importWorkCalendar)
const HRLayout          = lazyWithRetry(importHRLayout)
const InventoryLayout   = lazyWithRetry(importInventoryLayout)
const MainLayout        = lazyWithRetry(importMainLayout)
const ProcurementLayout = lazyWithRetry(importProcLayout)
const PrfDashboard      = lazyWithRetry(importPrfDashboard)
const PrfNewPage        = lazyWithRetry(() => import('./pages/PrfNewPage'))
const PrfDetail         = lazyWithRetry(() => import('./pages/PrfDetail'))
const PrfMasterList     = lazyWithRetry(() => import('./pages/PrfMasterList'))
const PoNewPage         = lazyWithRetry(() => import('./pages/PoNewPage'))
const PoDetail          = lazyWithRetry(() => import('./pages/PoDetail'))
const IgiNewPage        = lazyWithRetry(() => import('./pages/IgiNewPage'))
const IgiDetail         = lazyWithRetry(() => import('./pages/IgiDetail'))
const LeaveMasterList   = lazyWithRetry(() => import('./pages/LeaveMasterList'))
const WeeklyLeaveReportPage = lazyWithRetry(() => import('./pages/WeeklyLeaveReportPage'))
const ResignationsPage  = lazyWithRetry(() => import('./pages/ResignationsPage'))
const InternalSalaryPage = lazyWithRetry(() => import('./pages/InternalSalaryPage'))
const CcpAttendancePage = lazyWithRetry(() => import('./pages/CcpAttendancePage'))
const SaturdayRotationPage = lazyWithRetry(() => import('./pages/SaturdayRotationPage'))
const InterventionShiftsPage = lazyWithRetry(() => import('./pages/InterventionShiftsPage'))
const MaintenanceLayout    = lazyWithRetry(() => import('./layout/MaintenanceLayout'))
const MaintenanceDashboard = lazyWithRetry(() => import('./pages/MaintenanceDashboard'))
const MaintenanceTab       = lazyWithRetry(() => import('./pages/MaintenanceTab'))
const FleetChecksPage      = lazyWithRetry(() => import('./pages/FleetChecksPage'))
const WithdrawalsPage      = lazyWithRetry(() => import('./pages/WithdrawalsPage'))

// HR tab components — each mounted at its own route
const WorkforceTab      = lazyWithRetry(importWorkforce)
const AttendanceTab     = lazyWithRetry(importAttendance)
const CertificationsTab = lazyWithRetry(() => import('./components/hr/CertificationsTab'))
const DisciplinaryTab   = lazyWithRetry(() => import('./components/hr/DisciplinaryTab'))
const AssetsTab         = lazyWithRetry(() => import('./components/hr/AssetsTab'))
const OrgChartTab       = lazyWithRetry(() => import('./components/hr/OrgChartTab'))
const SettingsPage      = lazyWithRetry(() => import('./pages/SettingsPage'))
const NotificationPreferencesPage = lazyWithRetry(() => import('./pages/NotificationPreferencesPage'))
const NotificationCenterPage = lazyWithRetry(() => import('./pages/NotificationCenterPage'))

// ── Access rules ──────────────────────────────────────────────────────────────
// HR Full: Admin, Depot Manager, or the dedicated HR role
const HR_FULL_ROLES = ['admin', 'depot_manager', 'hr']
const HR_FULL_DEPTS = []

// Dashboard / Inventory: Admin & Depot Manager only
const DASH_ROLES    = ['admin', 'depot_manager']

// Procurement full module: Admin, Depot Manager, Purchasing only
const PROC_ROLES    = ['admin', 'depot_manager', 'purchasing']

// Everyone (all authenticated users — no roles prop = just needs to be logged in)

const ComingSoon = ({ title }) => (
  <div className="flex items-center justify-center h-64">
    <div className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-white border border-neutral-100 flex items-center justify-center mx-auto mb-4 shadow-sm text-2xl">🚧</div>
      <p className="text-sm font-semibold text-secondary-700">{title}</p>
      <p className="text-xs text-neutral-400 mt-1">Coming soon</p>
    </div>
  </div>
)

const PageFallback = () => (
  <div className="min-h-screen bg-neutral-50 flex items-center justify-center overflow-hidden">
    <div className="text-center">
      <div className="srs-loading-spinner mx-auto" aria-hidden="true" />
      <p className="mt-4 text-xs font-semibold text-neutral-400">Loading...</p>
    </div>
  </div>
)

const AttendanceByRole = () => {
  const role = useSelector(state => state.auth.user?.role)
  return String(role ?? '').trim().toLowerCase() === 'ccp' ? <CcpAttendancePage /> : <AttendanceTab />
}

const AuthSync = () => {
  const dispatch = useDispatch()
  const token = useSelector(state => state.auth.token)

  useEffect(() => {
    if (!token) {
      // Tear down any lingering notification poll so the next user starts clean.
      stopNotificationSubscription()
      return
    }

    getMe()
      .then(user => dispatch(refreshUser(user)))
      .catch(error => {
        if (error?.response?.status === 401) dispatch(logout())
      })

    // Start fresh for this session; startNotificationSubscription tears down any
    // stale state first so a user switch does not replay the previous user's ids.
    startNotificationSubscription()
    return () => stopNotificationSubscription()
  }, [dispatch, token])

  return null
}

const RoutePreloader = () => {
  const { token, user } = useSelector(state => state.auth)
  const location = useLocation()

  useEffect(() => {
    if (!token) return

    const role = String(user?.role ?? '').trim().toLowerCase()
    const isHRRoute = location.pathname.startsWith('/human-resources')
    const loaders = isHRRoute
      ? [importMainLayout, importDashboard, importLeaveRequests, importWorkCalendar]
      : [importHRLayout, importLeaveRequests, importWorkCalendar]

    if (['admin', 'depot_manager', 'hr'].includes(role)) {
      // From the dashboard, /human-resources opens Workforce first. Put it
      // ahead of the heavier request page so user intent never queues behind it.
      if (!isHRRoute) loaders.splice(1, 0, importWorkforce)
      loaders.push(importAttendance)
    }
    if (['admin', 'depot_manager', 'purchasing'].includes(role)) {
      loaders.push(importProcLayout, importPrfDashboard)
    }
    if (['admin', 'depot_manager'].includes(role)) {
      loaders.push(importInventoryLayout, importProducts)
    }

    let cancelled = false
    let timer
    let idleId
    let index = 0

    const scheduleNext = () => {
      if (cancelled || index >= loaders.length) return
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(warmNext, { timeout: 1500 })
      } else {
        timer = window.setTimeout(warmNext, 350)
      }
    }

    const warmNext = () => {
      if (cancelled || index >= loaders.length) return
      loaders[index++]().catch(() => undefined).finally(() => {
        timer = window.setTimeout(scheduleNext, 120)
      })
    }

    // Let the currently visible page finish first, then warm likely destinations
    // one by one instead of competing with its API requests.
    if ('requestIdleCallback' in window) {
      idleId = window.requestIdleCallback(warmNext, { timeout: 1200 })
    } else {
      timer = window.setTimeout(warmNext, 600)
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId)
    }
  }, [token, user?.role, location.pathname])

  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthSync />
      <RoutePreloader />
      <MaintenanceTaskToasts />
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />

        {/* Main Layout — Dashboard + main sidebar (all authenticated users) */}
        <Route element={
          <ProtectedRoute redirect="/login">
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/"            element={<DashboardPage />} />
          <Route path="/work-calendar" element={<WorkCalendarPage />} />
          <Route path="/notification-settings" element={<NotificationPreferencesPage />} />
          <Route path="/notifications" element={<NotificationCenterPage />} />
          <Route path="/control"     element={<ComingSoon title="Control" />} />
          <Route path="/users"       element={
            <ProtectedRoute roles={['admin']} redirect="/">
              <Users />
            </ProtectedRoute>
          } />
        </Route>

        {/* Maintenance Layout — Admin only (under development) */}
        <Route path="/maintenance" element={
          <ProtectedRoute roles={['admin', 'depot_manager', 'manager']} allowTeamManager redirect="/">
            <MaintenanceLayout />
          </ProtectedRoute>
        }>
          <Route index element={<MaintenanceDashboard />} />
          <Route path="cm" element={<MaintenanceTab key="cm" type="cm" label="Corrective Maintenance" departments={['cm','cm_intervention']} />} />
          <Route path="pm" element={<MaintenanceTab key="pm" type="pm" label="Preventive Maintenance" departments={['pm']} />} />
          <Route path="hm" element={<MaintenanceTab key="hm" type="hm" label="Heavy Maintenance" departments={['hm']} />} />
          <Route path="fleet-checks" element={<FleetChecksPage />} />
          <Route path="withdrawals"  element={<WithdrawalsPage />} />
          <Route path="equipment"   element={<ComingSoon title="Equipment Register" />} />
          {/* Notification pages nested per-layout so the module shell stays around
              the notification center. See notificationLinks() below. */}
          <Route path="notifications" element={<NotificationCenterPage />} />
          <Route path="notification-settings" element={<NotificationPreferencesPage />} />
        </Route>

        {/* Inventory Layout (Admin & Depot Manager only) */}
        <Route path="/inventory" element={
          <ProtectedRoute roles={DASH_ROLES} redirect="/human-resources/leave">
            <InventoryLayout />
          </ProtectedRoute>
        }>
          <Route index element={<ProductsPage />} />
          <Route path="rotable" element={<ComingSoon title="Rotable Parts" />} />
          <Route path="bad"     element={<ComingSoon title="Bad Items"     />} />
          <Route path="reports" element={<ComingSoon title="Reports"       />} />
          <Route path="notifications" element={<NotificationCenterPage />} />
          <Route path="notification-settings" element={<NotificationPreferencesPage />} />
        </Route>

        {/* HR Layout — any authenticated user can enter.
            Sensitive sub-routes have their own per-route guards. */}
        <Route path="/human-resources" element={
          <ProtectedRoute redirect="/login">
            <HRLayout />
          </ProtectedRoute>
        }>
          {/* Workforce — HR Full only; non-HR users redirected to leave form */}
          <Route index element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <WorkforceTab />
            </ProtectedRoute>
          } />

          {/* Requests — all authenticated users */}
          <Route path="leave"        element={<LeaveRequestsPage showOnly="lrf" />} />
          <Route path="overtime"     element={<LeaveRequestsPage key="otr" initialTab="otr" showOnly="otr" />} />
          <Route path="leave-master" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <LeaveMasterList />
            </ProtectedRoute>
          } />
          <Route path="weekly-leave-report" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <WeeklyLeaveReportPage />
            </ProtectedRoute>
          } />
          {/* The attendance/leave calendar remains restricted to HR leadership. */}
          <Route path="calendar" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/work-calendar">
              <CalendarPage />
            </ProtectedRoute>
          } />
          <Route path="resignations" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <ResignationsPage />
            </ProtectedRoute>
          } />
          <Route path="internal-salary" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <InternalSalaryPage />
            </ProtectedRoute>
          } />

          {/* HR Full only */}
          <Route path="attendance" element={
            <ProtectedRoute roles={[...HR_FULL_ROLES, 'ccp']} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <AttendanceByRole />
            </ProtectedRoute>
          } />
          <Route path="saturday-rotation" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <SaturdayRotationPage />
            </ProtectedRoute>
          } />
          <Route path="intervention-shifts" element={
            <ProtectedRoute roles={[...HR_FULL_ROLES, 'ccp']} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <InterventionShiftsPage />
            </ProtectedRoute>
          } />
          <Route path="certifications" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <CertificationsTab />
            </ProtectedRoute>
          } />
          <Route path="disciplinary" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <DisciplinaryTab />
            </ProtectedRoute>
          } />
          <Route path="assets" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <AssetsTab />
            </ProtectedRoute>
          } />
          <Route path="org-chart" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <OrgChartTab />
            </ProtectedRoute>
          } />
          <Route path="settings" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="notifications" element={<NotificationCenterPage />} />
          <Route path="notification-settings" element={<NotificationPreferencesPage />} />
        </Route>

        {/* Procurement — any authenticated user can reach New PRF and PRF detail.
            Dashboard, Master List, PO, IGI are restricted to PROC_ROLES inside. */}
        <Route path="/procurement" element={
          <ProtectedRoute redirect="/login">
            <ProcurementLayout />
          </ProtectedRoute>
        }>
          <Route index element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <PrfDashboard />
            </ProtectedRoute>
          } />
          <Route path="master" element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <PrfMasterList />
            </ProtectedRoute>
          } />
          <Route path="po/new/:prfId" element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <PoNewPage />
            </ProtectedRoute>
          } />
          <Route path="po/:id" element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <PoDetail />
            </ProtectedRoute>
          } />
          <Route path="igi/new/:poId" element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <IgiNewPage />
            </ProtectedRoute>
          } />
          <Route path="igi/:id" element={
            <ProtectedRoute roles={PROC_ROLES} redirect="/human-resources/leave">
              <IgiDetail />
            </ProtectedRoute>
          } />
          <Route path="notifications" element={<NotificationCenterPage />} />
          <Route path="notification-settings" element={<NotificationPreferencesPage />} />
          {/* PRF detail and new PRF — all authenticated users (EHS, managers, staff, etc.) */}
          <Route path="new" element={<PrfNewPage />} />
          <Route path=":id" element={<PrfDetail  />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
