import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../store/slices/authSlice'
import {
  Wrench, BarChart3, Zap, CalendarClock, HardHat, Cog,
  ChevronLeft, ChevronRight, LogOut, Bell, Menu, Construction, X, CheckCheck,
  ClipboardCheck, ArrowLeftRight,
} from 'lucide-react'
import { useSidebar } from '../hooks/useSidebar'
import { getNotifications, markAllRead, markOneRead } from '../services/leaveService'

const NAV_ITEMS = [
  { label: 'Dashboard',    path: '/maintenance',          icon: BarChart3,     end: true },
  { label: 'CM — Corrective', path: '/maintenance/cm',    icon: Zap                      },
  { label: 'PM — Preventive', path: '/maintenance/pm',    icon: CalendarClock             },
  { label: 'HM — Heavy',      path: '/maintenance/hm',   icon: HardHat                   },
  { label: 'Fleet Checks', path: '/maintenance/fleet-checks', icon: ClipboardCheck         },
  { label: 'Withdrawals',  path: '/maintenance/withdrawals',  icon: ArrowLeftRight          },
  { label: 'Equipment',    path: '/maintenance/equipment', icon: Cog                      },
]

const initials = (name) =>
  name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

const fmtTime = value => value
  ? new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''

export default function MaintenanceLayout() {
  const { collapsed, setCollapsed, isMobile } = useSidebar()
  const navigate  = useNavigate()
  const location  = useLocation()
  const dispatch  = useDispatch()
  const { user }  = useSelector(s => s.auth)
  const visibleNavItems = user?.role === 'admin' ? NAV_ITEMS : NAV_ITEMS.slice(0, 1)
  const sidebarW  = collapsed ? '68px' : '240px'
  const sidebarVisible = !isMobile || !collapsed
  const mainOffset = isMobile ? 0 : sidebarW
  const [notifs, setNotifs] = useState([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const panelRef = useRef()

  const activeNav = visibleNavItems.find(n =>
    n.end ? location.pathname === n.path : location.pathname.startsWith(n.path)
  )
  const pageLabel = activeNav?.label ?? 'Maintenance'

  const handleLogout = () => { dispatch(logout()); navigate('/login') }

  const fetchNotifs = useCallback(async () => {
    try {
      const result = await getNotifications()
      setNotifs(result.data ?? [])
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchNotifs()
    const timer = setInterval(fetchNotifs, 30000)
    return () => clearInterval(timer)
  }, [fetchNotifs])

  useEffect(() => {
    const close = event => {
      if (panelRef.current && !panelRef.current.contains(event.target)) setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const unread = notifs.filter(notification => !notification.read).length
  const handleMarkAll = async event => {
    event.stopPropagation()
    await markAllRead()
    setNotifs(current => current.map(notification => ({ ...notification, read: true })))
  }
  const handleNotifClick = async notification => {
    if (!notification.read) {
      await markOneRead(notification.id)
      setNotifs(current => current.map(item => item.id === notification.id ? { ...item, read: true } : item))
    }
    setNotificationsOpen(false)
    navigate(notification.data?.path || '/maintenance')
  }

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
            onClick={() => collapsed ? setCollapsed(false) : navigate('/')}
            title={collapsed ? 'Expand' : 'Back to Dashboard'}
            className="max-w-full shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Rotem SRS Egypt" className={`transition-all duration-200 ${collapsed ? 'h-8 max-w-10' : 'h-10 max-w-full'} w-auto object-contain`} />
          </button>
          <div className={`flex flex-col leading-tight transition-all duration-200 ${collapsed ? 'hidden w-0 opacity-0' : 'w-full opacity-100'}`}>
            <span className="block max-w-full text-[10px] text-neutral-400 uppercase tracking-widest break-words leading-snug">Maintenance</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="px-2 py-1 space-y-0.5">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-widest px-3 py-1.5">Modules</p>
            )}
            {visibleNavItems.map(item => (
              <NavLink
                key={item.label}
                to={item.path}
                end={item.end}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) => `
                  flex items-center rounded-lg text-sm font-medium
                  transition-all no-underline
                  ${collapsed ? 'justify-center px-0 py-3' : 'gap-2.5 px-3 py-2.5'}
                  ${isActive ? 'bg-primary-50 text-primary font-semibold' : 'text-secondary hover:bg-neutral-50'}
                `}
              >
                <item.icon className="w-[18px] h-[18px] shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1 break-words leading-tight">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Dev banner */}
          {!collapsed && (
            <div className="px-4 pt-3 pb-3">
              <div className="border-t border-neutral-100 mb-3" />
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <Construction className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-amber-700">Under Development</p>
                  <p className="text-[10px] text-amber-600 mt-0.5">Admin-only preview</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="p-2 border-t border-neutral-100 space-y-1">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`w-full flex items-center py-2 text-neutral-400 hover:text-secondary text-sm rounded-lg hover:bg-neutral-50 transition-colors ${collapsed ? 'justify-center' : 'gap-2.5 px-3'}`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <><ChevronLeft className="w-4 h-4 shrink-0" /><span>Collapse</span></>}
          </button>
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

          <div className="hidden sm:flex flex-1 flex-wrap items-center gap-1.5 text-sm text-neutral-400 min-w-0">
            <span className="text-secondary-700 font-medium break-words">Rotem SRS</span>
            <span className="opacity-40">/</span>
            <span className="text-neutral-500 break-words">Maintenance</span>
            <span className="opacity-40">/</span>
            <span className="text-secondary-700 font-semibold break-words">{pageLabel}</span>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <div className="relative" ref={panelRef}>
              <button onClick={() => setNotificationsOpen(open => !open)} className="relative w-8 h-8 border border-neutral-100 rounded-lg flex items-center justify-center hover:bg-neutral-50 transition-colors text-secondary">
                <Bell className="w-4 h-4" />
                {unread > 0 && <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">{unread > 9 ? '9+' : unread}</span>}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 top-10 w-[calc(100vw-2rem)] max-w-80 bg-white border border-neutral-200 shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      <p className="text-sm font-bold text-secondary-700">Notifications</p>
                      {unread > 0 && <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full">{unread} new</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      {unread > 0 && <button onClick={handleMarkAll} className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline"><CheckCheck className="w-3 h-3" /> Mark all read</button>}
                      <button onClick={() => setNotificationsOpen(false)} className="p-1 text-neutral-400 hover:bg-neutral-100"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
                    {notifs.length === 0 ? (
                      <div className="py-10 text-center text-neutral-300"><Bell className="w-7 h-7 mx-auto mb-2 opacity-40" /><p className="text-xs">No notifications yet</p></div>
                    ) : notifs.map(notification => (
                      <button key={notification.id} onClick={() => handleNotifClick(notification)} className={`w-full text-left px-4 py-3 hover:bg-neutral-50 flex items-start gap-3 ${!notification.read ? 'bg-blue-50/50' : ''}`}>
                        <Bell className={`w-4 h-4 mt-1 shrink-0 ${!notification.read ? 'text-primary' : 'text-neutral-300'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-bold truncate ${!notification.read ? 'text-secondary-700' : 'text-neutral-500'}`}>{notification.title}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed line-clamp-2">{notification.body}</p>
                          <p className="text-[10px] text-neutral-300 mt-1">{fmtTime(notification.created_at)}</p>
                        </div>
                        {!notification.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="w-px h-6 bg-neutral-100" />
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:block min-w-0 max-w-[180px] text-right">
                <p className="text-sm font-bold text-secondary-700 leading-tight break-words">{user?.name ?? 'User'}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 capitalize break-words">{user?.role?.replace('_', ' ') ?? ''}</p>
              </div>
              <div className="w-[34px] h-[34px] rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                {initials(user?.name)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
