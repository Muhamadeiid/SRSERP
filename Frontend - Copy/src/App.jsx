import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import ProtectedRoute    from './components/auth/ProtectedRoute'
import Login             from './pages/Login'
import DashboardPage     from './pages/Dashboard'
import ProductsPage      from './pages/Products'
import Users             from './pages/Users/index'
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

// Dashboard / Inventory: Admin & Depot Manager only (not HR dept)
const DASH_ROLES    = ['admin', 'depot_manager']

// Calendar / approvals: managers and above
const MANAGE_ROLES  = ['admin', 'depot_manager', 'manager']

// Procurement module: Admin, Depot Manager, Purchasing only
const PROC_ROLES    = ['admin', 'depot_manager', 'purchasing']

// Everyone (all authenticated users — leave requests, notifications)
// No roles prop = no restriction beyond being logged in

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

        {/* Main Layout — Dashboard + main sidebar (Admin & Depot Manager only) */}
        <Route element={
          <ProtectedRoute roles={DASH_ROLES} redirect="/human-resources/leave">
            <MainLayout />
          </ProtectedRoute>
        }>
          <Route path="/"            element={<DashboardPage />} />
          <Route path="/maintenance" element={<ComingSoon title="Maintenance" />} />
          <Route path="/control"     element={<ComingSoon title="Control" />} />
          <Route path="/users"       element={<Users />} />
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

        {/* HR Layout — HR Full access required to enter (Admin, Depot Manager, HR dept) */}
        <Route path="/human-resources" element={
          <ProtectedRoute
            roles={HR_FULL_ROLES}
            departments={HR_FULL_DEPTS}
            redirect="/login"
          >
            <HRLayout />
          </ProtectedRoute>
        }>
          {/* Workforce — default HR home */}
          <Route index element={<WorkforceTab />} />

          {/* Leave Requests — all HR-authorized users */}
          <Route path="leave" element={<LeaveRequestsPage />} />

          {/* Master List — Leaves & Overtime */}
          <Route path="leave-master" element={<LeaveMasterList />} />

          {/* Calendar */}
          <Route path="calendar" element={<CalendarPage />} />

          {/* All other tabs — same HR Full access (already guarded at layout level) */}
          <Route path="attendance"     element={<AttendanceTab />} />
          <Route path="certifications" element={<CertificationsTab />} />
          <Route path="disciplinary"   element={<DisciplinaryTab />} />
          <Route path="assets"         element={<AssetsTab />} />
          <Route path="org-chart"      element={<OrgChartTab />} />
          <Route path="settings"       element={<SettingsPage />} />
        </Route>

        {/* New PRF — any authenticated user can submit */}
        <Route element={
          <ProtectedRoute redirect="/login">
            <ProcurementLayout />
          </ProtectedRoute>
        }>
          <Route path="/procurement/new" element={<PrfNewPage />} />
        </Route>

        {/* Procurement module — Admin, Depot Manager, Purchasing only */}
        <Route path="/procurement" element={
          <ProtectedRoute roles={PROC_ROLES} redirect="/login">
            <ProcurementLayout />
          </ProtectedRoute>
        }>
          <Route index                    element={<PrfDashboard />} />
          <Route path="master"            element={<PrfMasterList />} />
          <Route path="po/new/:prfId"     element={<PoNewPage    />} />
          <Route path="po/:id"            element={<PoDetail     />} />
          <Route path="igi/new/:poId"     element={<IgiNewPage   />} />
          <Route path="igi/:id"           element={<IgiDetail    />} />
          <Route path=":id"               element={<PrfDetail    />} />
        </Route>

        {/* Catch-all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
