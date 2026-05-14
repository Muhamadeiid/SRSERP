import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute    from './components/auth/ProtectedRoute'
import Login             from './pages/Login'
import DashboardPage     from './pages/Dashboard'
import ProductsPage      from './pages/Products'
import Users             from './pages/Users/Index'
import LeaveRequestsPage from './pages/LeaveRequestsPage'
import CalendarPage      from './pages/CalendarPage'
import HRLayout          from './layout/HRLayout'
import InventoryLayout   from './layout/InventoryLayout'
import MainLayout        from './layout/MainLayout'
import ProcurementLayout from './layout/ProcurementLayout'
import PrfDashboard      from './pages/PrfDashboard'
import PrfNewPage        from './pages/PrfNewPage'
import PrfDetail         from './pages/PrfDetail'
import PrfMasterList     from './pages/PrfMasterList'
import PoNewPage         from './pages/PoNewPage'
import PoDetail          from './pages/PoDetail'
import IgiNewPage        from './pages/IgiNewPage'
import IgiDetail         from './pages/IgiDetail'
import LeaveMasterList   from './pages/LeaveMasterList'

// HR tab components — each mounted at its own route
import WorkforceTab      from './components/hr/WorkforceTab'
import AttendanceTab     from './components/hr/AttendanceTab'
import CertificationsTab from './components/hr/CertificationsTab'
import DisciplinaryTab   from './components/hr/DisciplinaryTab'
import AssetsTab         from './components/hr/AssetsTab'
import OrgChartTab       from './components/hr/OrgChartTab'
import SettingsPage      from './pages/SettingsPage'

// ── Access rules ──────────────────────────────────────────────────────────────
// HR Full: Admin, Depot Manager (by role) OR any Human Resources dept user
const HR_FULL_ROLES = ['admin', 'depot_manager']
const HR_FULL_DEPTS = ['human_resources']

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

export default function App() {
  return (
    <BrowserRouter>
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

          {/* HR Full only */}
          <Route path="attendance" element={
            <ProtectedRoute roles={HR_FULL_ROLES} departments={HR_FULL_DEPTS} redirect="/human-resources/leave">
              <AttendanceTab />
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
    </BrowserRouter>
  )
}
