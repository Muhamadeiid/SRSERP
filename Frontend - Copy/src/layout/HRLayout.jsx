import { useState, useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../store/slices/authSlice'
import {
  Users, Calendar, Clock, ShieldCheck,
  AlertTriangle, ChevronLeft, ChevronRight, ChevronDown,
  LogOut, FileText, Package, Settings,
  GitBranch, Menu, FilePlus2, FileSpreadsheet, UserMinus, CalendarDays,
  ClipboardList, Briefcase,
} from 'lucide-react'
import { useSidebar } from '../hooks/useSidebar'
import ProfileAvatar from '../components/profile/ProfileAvatar'
import NotificationBell from '../components/notifications/NotificationBell'

// Roles that have full HR module access (workforce, attendance, assets, etc.)
const HR_FULL_ROLES_NAV = ['admin', 'depot_manager', 'hr']

// ── nav definition (grouped) ──────────────────────────────────────
// hrOnly: true  → visible only to HR Full (admin / depot_manager / HR dept)
// roles array   → visible to these specific roles
// neither       → visible to all authenticated users
const NAV_GROUPS = [
  {
    key: 'workforce', label: 'Workforce', icon: Users, hrOnly: true,
    items: [
      { label: 'Employee List', path: '/human-resources',           icon: Users,     end: true, hrOnly: true },
      { label: 'Org Chart',     path: '/human-resources/org-chart', icon: GitBranch,            hrOnly: true },
    ],
  },
  {
    key: 'leaves', label: 'Leaves', icon: FileText,
    items: [
      { label: 'Leave Requests',     path: '/human-resources/leave',               icon: FileText },
      { label: 'Overtime',           path: '/human-resources/overtime',             icon: Clock },
      { label: 'Resignations',       path: '/human-resources/resignations',        icon: UserMinus, hrOnly: true },
      { label: 'Master List',        path: '/human-resources/leave-master',        icon: FileSpreadsheet, hrOnly: true },
      { label: 'Weekly Report',      path: '/human-resources/weekly-leave-report', icon: CalendarDays,    hrOnly: true },
    ],
  },
  {
    key: 'attendance', label: 'Attendance', icon: ClipboardList,
    items: [
      { label: 'Attendance',        path: '/human-resources/attendance',         icon: Clock,           roles: ['admin','depot_manager','hr','ccp'] },
      { label: 'Intervention Shifts', path: '/human-resources/intervention-shifts', icon: CalendarDays, roles: ['admin','depot_manager','hr','ccp'] },
      { label: 'Saturday Rotation',  path: '/human-resources/saturday-rotation', icon: CalendarDays,    hrOnly: true },
      { label: 'Internal Salary',   path: '/human-resources/internal-salary',   icon: FileSpreadsheet, hrOnly: true },
      { label: 'Attendance Calendar', path: '/human-resources/calendar', icon: Calendar, hrOnly: true },
    ],
  },
  {
    key: 'operations', label: 'Operations', icon: Briefcase, hrOnly: true,
    items: [
      { label: 'Certifications',     path: '/human-resources/certifications', icon: ShieldCheck,  hrOnly: true },
      { label: 'Disciplinary',       path: '/human-resources/disciplinary',   icon: AlertTriangle, hrOnly: true },
      { label: 'Assets & Clearance', path: '/human-resources/assets',         icon: Package,       hrOnly: true },
    ],
  },
  {
    key: 'settings', label: 'Settings', icon: Settings, hrOnly: true, solo: true,
    items: [
      { label: 'Settings', path: '/human-resources/settings', icon: Settings, hrOnly: true },
    ],
  },
]

// Start fetching a page chunk while the user is hovering/focusing its link,
// so the actual navigation does not wait for the JavaScript file.
const ROUTE_PREFETCHERS = {
  '/human-resources': () => import('../components/hr/WorkforceTab'),
  '/human-resources/org-chart': () => import('../components/hr/OrgChartTab'),
  '/human-resources/leave': () => import('../pages/LeaveRequestsPage'),
  '/human-resources/overtime': () => import('../pages/LeaveRequestsPage'),
  '/human-resources/resignations': () => import('../pages/ResignationsPage'),
  '/human-resources/leave-master': () => import('../pages/LeaveMasterList'),
  '/human-resources/weekly-leave-report': () => import('../pages/WeeklyLeaveReportPage'),
  '/human-resources/attendance': () => import('../components/hr/AttendanceTab'),
  '/human-resources/saturday-rotation': () => import('../pages/SaturdayRotationPage'),
  '/human-resources/intervention-shifts': () => import('../pages/InterventionShiftsPage'),
  '/human-resources/internal-salary': () => import('../pages/InternalSalaryPage'),
  '/human-resources/calendar': () => import('../pages/CalendarPage'),
  '/human-resources/certifications': () => import('../components/hr/CertificationsTab'),
  '/human-resources/disciplinary': () => import('../components/hr/DisciplinaryTab'),
  '/human-resources/assets': () => import('../components/hr/AssetsTab'),
  '/human-resources/settings': () => import('../pages/SettingsPage'),
}

const prefetchRoute = (path) => {
  const loader = ROUTE_PREFETCHERS[path]
  if (loader) loader().catch(() => undefined)
}

export default function HRLayout() {
  const { collapsed, setCollapsed, isMobile } = useSidebar()
  const navigate  = useNavigate()
  const location  = useLocation()
  const dispatch  = useDispatch()
  const { user }  = useSelector(s => s.auth)
  const sidebarW  = collapsed ? '68px' : '240px'
  const sidebarVisible = !isMobile || !collapsed
  const mainOffset = isMobile ? 0 : sidebarW

  // ── filter nav by role ───────────────────────────────────────
  const role      = String(user?.role ?? 'staff').trim().toLowerCase()
  const isHRFull  = HR_FULL_ROLES_NAV.includes(role) || role === 'hr'

  const canSee = (item) => {
    if (item.hrOnly) return isHRFull
    if (item.roles)  return item.roles.includes(role)
    return true
  }

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(canSee),
  })).filter(g => g.items.length > 0 && canSee(g))

  const allItems = visibleGroups.flatMap(g => g.items)
  const activeNav = allItems.find(n =>
    n.end ? location.pathname === n.path : location.pathname.startsWith(n.path)
  )
  const pageLabel = activeNav?.label ?? 'Human Resources'

  const activeGroupKey = visibleGroups.find(g =>
    g.items.some(n => n.end ? location.pathname === n.path : location.pathname.startsWith(n.path))
  )?.key

  const [openGroups, setOpenGroups] = useState(() => {
    if (activeGroupKey) return { [activeGroupKey]: true }
    return {}
  })
  useEffect(() => {
    if (activeGroupKey) setOpenGroups(prev => {
      if (prev[activeGroupKey]) return prev
      return { ...prev, [activeGroupKey]: true }
    })
  }, [activeGroupKey])

  const toggleGroup = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  const handleLogout = () => { dispatch(logout()); navigate('/login') }

  return (
    <div className="font-sans bg-neutral-50 min-h-screen flex overflow-x-hidden">

      {isMobile && (
        <div
          className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${sidebarVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`fixed top-0 left-0 bottom-0 bg-white border-r border-neutral-100 flex flex-col z-50 transition-all duration-200 overflow-hidden ${isMobile && !sidebarVisible ? '-translate-x-full' : 'translate-x-0'}`}
        style={{ width: sidebarW }}
      >
        {/* Logo */}
        <div className={`flex border-b border-neutral-100 transition-all duration-200 ${collapsed ? 'items-center justify-center px-2 py-4 min-h-[64px]' : 'flex-col items-start gap-1 px-4 py-4 min-h-[82px]'}`}>
          <button
            onClick={() => navigate('/')}
            title="Back to Dashboard"
            className="max-w-full shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Rotem SRS Egypt" className={`object-contain transition-all duration-200 ${collapsed ? 'h-7 w-11' : 'h-10 max-w-full w-auto'}`} />
          </button>
          <div className={`flex flex-col leading-tight transition-all duration-200 ${collapsed ? 'hidden w-0 opacity-0' : 'w-full opacity-100'}`}>
            <span className="block max-w-full text-[10px] text-neutral-400 uppercase tracking-widest break-words leading-snug">Human Resources</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {!collapsed && (
            <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-widest px-3 py-1.5">Modules</p>
          )}
          {visibleGroups.map(group => {
            const isOpen = !!openGroups[group.key]
            const groupActive = group.key === activeGroupKey

            if (group.solo) {
              const item = group.items[0]
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onMouseEnter={() => prefetchRoute(item.path)}
                  onFocus={() => prefetchRoute(item.path)}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    `flex items-center rounded-lg text-sm font-medium transition-all no-underline
                     ${collapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3 py-2.5'}
                     ${isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-secondary hover:bg-neutral-50'}`
                  }
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {!collapsed && <span className="min-w-0 flex-1 break-words leading-tight">{item.label}</span>}
                </NavLink>
              )
            }

            if (collapsed) {
              return group.items.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onMouseEnter={() => prefetchRoute(item.path)}
                  onFocus={() => prefetchRoute(item.path)}
                  title={item.label}
                  className={({ isActive }) =>
                    `flex items-center justify-center rounded-lg text-sm font-medium transition-all no-underline px-0 py-3
                     ${isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-secondary hover:bg-neutral-50'}`
                  }
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                </NavLink>
              ))
            }

            return (
              <div key={group.key} className="space-y-0.5">
                <button
                  onClick={() => toggleGroup(group.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                    ${groupActive ? 'text-primary' : 'text-secondary hover:bg-neutral-50'}`}
                >
                  <group.icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="min-w-0 flex-1 text-left break-words leading-tight">{group.label}</span>
                  <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  {group.items.map(item => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.end}
                      onMouseEnter={() => prefetchRoute(item.path)}
                      onFocus={() => prefetchRoute(item.path)}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 pl-9 pr-3 py-2 rounded-lg text-[13px] font-medium transition-all no-underline
                         ${isActive ? 'bg-primary/10 text-primary font-semibold' : 'text-neutral-500 hover:bg-neutral-50 hover:text-secondary'}`
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span className="min-w-0 flex-1 break-words leading-tight">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        {/* Bottom controls */}
        <div className="space-y-1 border-t border-neutral-100 p-2">
          {!isMobile && <button type="button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className={`flex w-full items-center rounded-lg py-2 text-sm text-neutral-400 transition-colors hover:bg-neutral-50 hover:text-secondary ${collapsed ? 'justify-center' : 'gap-2.5 px-3'}`}>
            {collapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <><ChevronLeft className="h-[18px] w-[18px]" /><span>Collapse</span></>}
          </button>}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center py-2 text-neutral-400 hover:text-red-500 text-sm rounded-lg hover:bg-red-50 transition-colors ${collapsed ? 'justify-center' : 'gap-2.5 px-3'}`}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* ── Main Area ── */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200" style={{ marginLeft: mainOffset }}>

        {/* Topbar */}
        <header className="min-h-[60px] bg-white border-b border-neutral-100 flex items-center px-4 sm:px-6 gap-3 sticky top-0 z-30">

          {isMobile && (
            <button
              onClick={() => setCollapsed(false)}
              className="w-9 h-9 border border-neutral-100 rounded-lg flex items-center justify-center text-secondary hover:bg-neutral-50 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          {/* Breadcrumb */}
          <div className="hidden sm:flex flex-1 flex-wrap items-center gap-1.5 text-sm text-neutral-400 min-w-0">
            <span className="text-secondary-700 font-medium break-words">Rotem SRS</span>
            <span className="opacity-40">/</span>
            <span className="text-neutral-500 break-words">Human Resources</span>
            <span className="opacity-40">/</span>
            <span className="text-secondary-700 font-semibold break-words">{pageLabel}</span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">

            {/* ── Notification Bell — owns its own panel, polling, outside-click. ── */}
            <NotificationBell />

            <div className="w-px h-6 bg-neutral-100" />

            {/* User info */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:block min-w-0 max-w-[180px] text-right">
                <p className="text-sm font-bold text-secondary-700 leading-tight break-words">{user?.name ?? 'User'}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 capitalize break-words">{user?.role?.replace('_', ' ') ?? ''}</p>
              </div>
              <ProfileAvatar />
            </div>

          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
