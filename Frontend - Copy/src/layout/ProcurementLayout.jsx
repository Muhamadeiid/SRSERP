import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../store/slices/authSlice'
import {
  ChevronLeft, ChevronRight, LogOut, Menu,
  FilePlus2, LayoutDashboard, FileSpreadsheet,
} from 'lucide-react'
import { useSidebar } from '../hooks/useSidebar'
import ProfileAvatar from '../components/profile/ProfileAvatar'
import NotificationBell from '../components/notifications/NotificationBell'

// Full Procurement module access: Admin, Depot Manager, Purchasing
const PROC_FULL_ROLES = ['admin', 'depot_manager', 'purchasing']

const NAV = [
  { label: 'Dashboard',    path: '/procurement',        icon: LayoutDashboard, end: true,  procOnly: true },
  { label: 'New PRF',      path: '/procurement/new',    icon: FilePlus2 },
  { label: 'Master List',  path: '/procurement/master', icon: FileSpreadsheet,             procOnly: true },
]

export default function ProcurementLayout() {
  const { collapsed, setCollapsed, isMobile } = useSidebar()
  const navigate  = useNavigate()
  const dispatch  = useDispatch()
  const { user }  = useSelector(s => s.auth)
  const isProcFull = PROC_FULL_ROLES.includes(user?.role)
  const navItems   = NAV.filter(item => !item.procOnly || isProcFull)
  const sidebarW       = collapsed ? '68px' : '240px'
  const sidebarVisible = !isMobile || !collapsed
  const mainOffset     = isMobile ? 0 : sidebarW

  const handleLogout = () => { dispatch(logout()); navigate('/login') }

  return (
    <div className="font-sans bg-neutral-50 min-h-screen flex overflow-x-hidden">

      {isMobile && (
        <div
          className={`fixed inset-0 bg-black/30 z-40 transition-opacity duration-200 ${sidebarVisible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          onClick={() => setCollapsed(true)}
        />
      )}

      {/* Sidebar */}
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
            <span className="block max-w-full text-[10px] text-neutral-400 uppercase tracking-widest break-words leading-snug">Purchase Requests</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
          {!collapsed && (
            <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-widest px-3 py-1.5">Modules</p>
          )}
          {navItems.map(item => (
            <NavLink
              key={item.label}
              to={item.path}
              end={item.end}
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
          ))}
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

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-200" style={{ marginLeft: mainOffset }}>
        <header className="min-h-[60px] bg-white border-b border-neutral-100 flex items-center px-4 sm:px-6 gap-3 sticky top-0 z-30">
          {isMobile && (
            <button
              onClick={() => setCollapsed(false)}
              className="w-9 h-9 border border-neutral-100 rounded-lg flex items-center justify-center text-secondary hover:bg-neutral-50 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1.5 text-sm text-neutral-400 min-w-0">
            <span className="text-secondary-700 font-medium">Rotem SRS</span>
            <span className="opacity-40">/</span>
            <span className="text-secondary-700 font-semibold">Procurement</span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">

            {/* Notification Bell — owns its own panel, polling, outside-click. */}
            <NotificationBell />

            <div className="w-px h-6 bg-neutral-100" />

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name ?? 'User'}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 capitalize">{user?.role?.replace('_', ' ') ?? ''}</p>
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
