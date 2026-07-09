import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../store/slices/authSlice'
import {
  ChevronLeft, ChevronRight, LogOut, Bell, Menu, X, CheckCheck,
  ShoppingCart, FilePlus2, LayoutDashboard, FileSpreadsheet,
} from 'lucide-react'
import { getNotifications, markAllRead, markOneRead } from '../services/leaveService'
import { useSidebar } from '../hooks/useSidebar'

// ── time formatter (matches HRLayout) ─────────────────────────────────────────
const fmtTime = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  const diffMin = Math.floor((new Date() - dt) / 60000)
  if (diffMin < 1)  return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH}h ago`
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Full Procurement module access: Admin, Depot Manager, Purchasing
const PROC_FULL_ROLES = ['admin', 'depot_manager', 'purchasing']

const NAV = [
  { label: 'Dashboard',    path: '/procurement',        icon: LayoutDashboard, end: true,  procOnly: true },
  { label: 'New PRF',      path: '/procurement/new',    icon: FilePlus2 },
  { label: 'Master List',  path: '/procurement/master', icon: FileSpreadsheet,             procOnly: true },
]

const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

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

  // ── notifications (shared with HRLayout pattern) ──────────────────────
  const [notifs, setNotifs] = useState([])
  const [open,   setOpen]   = useState(false)
  const panelRef = useRef()

  const fetchNotifs = useCallback(async () => {
    try { const r = await getNotifications(); setNotifs(r.data ?? []) } catch (_) {}
  }, [])

  useEffect(() => {
    fetchNotifs()
    const t = setInterval(fetchNotifs, 30000)
    return () => clearInterval(t)
  }, [fetchNotifs])

  useEffect(() => {
    const h = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const unread = notifs.filter(n => !n.read).length

  const handleMarkAll = async (e) => {
    e.stopPropagation()
    await markAllRead()
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleNotifClick = async (n) => {
    if (!n.read) {
      await markOneRead(n.id)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setOpen(false)
    if (n.data?.prf_id) {
      navigate(`/procurement/${n.data.prf_id}`)
    } else if (n.data?.leave_request_id) {
      navigate(`/human-resources/leave?req=${n.data.leave_request_id}`)
    }
  }

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
        {/* Logo / collapse toggle */}
        <div className={`flex border-b border-neutral-100 transition-all duration-200 ${collapsed ? 'items-center justify-center px-2 py-4 min-h-[64px]' : 'flex-col items-start gap-1 px-4 py-4 min-h-[82px]'}`}>
          <button
            onClick={() => collapsed ? setCollapsed(false) : navigate('/')}
            title={collapsed ? 'Expand' : 'Back to Dashboard'}
            className="max-w-full shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Rotem SRS Egypt" className={`transition-all duration-200 ${collapsed ? 'h-8 max-w-10' : 'h-10 max-w-full'} w-auto object-contain`} />
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

        {/* Bottom — logout */}
        <div className="p-2 border-t border-neutral-100">
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

            {/* Notification Bell */}
            <div className="relative" ref={panelRef}>
              <button
                onClick={() => setOpen(o => !o)}
                className="relative w-8 h-8 border border-neutral-100 rounded-lg flex items-center justify-center hover:bg-neutral-50 transition-colors text-secondary"
              >
                <Bell className="w-4 h-4" />
                {unread > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {open && (
                <div className="absolute right-0 top-10 w-[calc(100vw-2rem)] max-w-80 bg-white rounded-2xl border border-neutral-200 shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-primary" />
                      <p className="text-sm font-bold text-secondary-700">Notifications</p>
                      {unread > 0 && (
                        <span className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-full">{unread} new</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {unread > 0 && (
                        <button onClick={handleMarkAll} className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline">
                          <CheckCheck className="w-3 h-3" /> Mark all read
                        </button>
                      )}
                      <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
                    {notifs.length === 0 ? (
                      <div className="py-12 text-center text-neutral-300">
                        <Bell className="w-7 h-7 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">No notifications yet</p>
                      </div>
                    ) : notifs.map(n => (
                      <button key={n.id} onClick={() => handleNotifClick(n)}
                        className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${!n.read ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-400'}`}>
                          <ShoppingCart className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-bold truncate ${!n.read ? 'text-secondary-700' : 'text-neutral-500'}`}>{n.title}</p>
                          <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed line-clamp-2">{n.body}</p>
                          <p className="text-[10px] text-neutral-300 mt-1">{fmtTime(n.created_at)}</p>
                        </div>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="w-px h-6 bg-neutral-100" />

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name ?? 'User'}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5 capitalize">{user?.role?.replace('_', ' ') ?? ''}</p>
              </div>
              <div className="w-[34px] h-[34px] rounded-full bg-primary flex items-center justify-center text-white text-sm font-bold">
                {initials(user?.name)}
              </div>
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
