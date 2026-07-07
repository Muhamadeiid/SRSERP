import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute    from './components/auth/ProtectedRoute'
const Login             = lazy(() => import('./pages/Login'))
const DashboardPage     = lazy(() => import('./pages/Dashboard'))
const ProductsPage      = lazy(() => import('./pages/Products'))
const Users             = lazy(() => import('./pages/Users/Index'))
const LeaveRequestsPage = lazy(() => import('./pages/LeaveRequestsPage'))
const CalendarPage      = lazy(() => import('./pages/CalendarPage'))
const HRLayout          = lazy(() => import('./layout/HRLayout'))
const InventoryLayout   = lazy(() => import('./layout/InventoryLayout'))
const MainLayout        = lazy(() => import('./layout/MainLayout'))
const ProcurementLayout = lazy(() => import('./layout/ProcurementLayout'))
const PrfDashboard      = lazy(() => import('./pages/PrfDashboard'))
const PrfNewPage        = lazy(() => import('./pages/PrfNewPage'))
const PrfDetail         = lazy(() => import('./pages/PrfDetail'))
const PrfMasterList     = lazy(() => import('./pages/PrfMasterList'))
const PoNewPage         = lazy(() => import('./pages/PoNewPage'))
const PoDetail          = lazy(() => import('./pages/PoDetail'))
const IgiNewPage        = lazy(() => import('./pages/IgiNewPage'))
const IgiDetail         = lazy(() => import('./pages/IgiDetail'))
const LeaveMasterList   = lazy(() => import('./pages/LeaveMasterList'))
const ResignationsPage  = lazy(() => import('./pages/ResignationsPage'))
const SaturdayRotationPage = lazy(() => import('./pages/SaturdayRotationPage'))

// HR tab components — each mounted at its own route
const WorkforceTab      = lazy(() => import('./components/hr/WorkforceTab'))
const AttendanceTab     = lazy(() => import('./components/hr/AttendanceTab'))
const CertificationsTab = lazy(() => import('./components/hr/CertificationsTab'))
const DisciplinaryTab   = lazy(() => import('./components/hr/DisciplinaryTab'))
const AssetsTab         = lazy(() => import('./components/hr/AssetsTab'))
const OrgChartTab       = lazy(() => import('./components/hr/OrgChartTab'))
const SettingsPage      = lazy(() => import('./pages/SettingsPage'))

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
  <div className="min-h-screen bg-neutral-50" />
)

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/maintenance" element={<ComingSoon title="Maintenance" />} />
          <Route path="/control"     element={<ComingSoon title="Control" />} />
          <Route path="/users"       element={
            <ProtectedRoute roles={['admin']} redirect="/">
              <Users />
            </ProtectedRoute>
          } />
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

          {/* Leave Requests & Calendar — all authenticated users */}
          <Route path="leave"        element={<LeaveRequestsPage />} />
          <Route path="leave-master" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <LeaveMasterList />
            </ProtectedRoute>
          } />
          <Route path="calendar"     element={<CalendarPage />} />
          <Route path="resignations" element={<ResignationsPage />} />

          {/* HR Full only */}
          <Route path="attendance" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <AttendanceTab />
            </ProtectedRoute>
          } />
          <Route path="saturday-rotation" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <SaturdayRotationPage />
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
