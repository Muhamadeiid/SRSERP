import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../store/slices/authSlice'
import {
  Package, RotateCcw, AlertTriangle, BarChart3,
  ChevronLeft, ChevronRight, LogOut, Bell, Plus, Download, Menu,
} from 'lucide-react'
import { useSidebar } from '../hooks/useSidebar'

const NAV_ITEMS = [
  { label: 'Material Ledger', path: '/inventory',         icon: Package,       end: true },
  { label: 'Rotable Parts',   path: '/inventory/rotable', icon: RotateCcw             },
  { label: 'Bad Items',       path: '/inventory/bad',     icon: AlertTriangle         },
  { label: 'Reports',         path: '/inventory/reports', icon: BarChart3             },
]

const initials = (name) =>
  name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

export default function InventoryLayout() {
  const { collapsed, setCollapsed, isMobile } = useSidebar()
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector(s => s.auth)
  const sidebarW = collapsed ? '68px' : '260px'
  const sidebarVisible = !isMobile || !collapsed
  const mainOffset = isMobile ? 0 : sidebarW

  const handleLogout = () => {
    dispatch(logout())
    navigate('/login')
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
        <div className="flex items-center gap-3 px-4 py-5 border-b border-neutral-100 min-h-[64px]">
          <button
            onClick={() => collapsed ? setCollapsed(false) : navigate('/')}
            title={collapsed ? 'Expand' : 'Back to Dashboard'}
            className="shrink-0 hover:opacity-80 transition-opacity"
          >
            <img src="/logo.png" alt="Rotem SRS Egypt" className={`transition-all duration-200 ${collapsed ? 'h-8' : 'h-10'} w-auto object-contain`} />
          </button>
          <div className={`flex flex-col leading-tight overflow-hidden transition-all duration-200 ${collapsed ? 'w-0 opacity-0' : 'w-full opacity-100'}`}>
            <span className="text-[10px] text-neutral-400 uppercase tracking-widest whitespace-nowrap mt-0.5">Stock Management</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Nav Items */}
          <nav className="px-2 py-1 space-y-0.5">
            {!collapsed && (
              <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-widest px-3 py-1.5">Modules</p>
            )}
            {NAV_ITEMS.map(item => (
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
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Stock Health */}
          {!collapsed && (
            <div className="px-4 pt-3 pb-3">
              <div className="border-t border-neutral-100 mb-3" />
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-3">Stock Health</p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-500">Healthy Items</span>
                    <span className="font-bold text-secondary-700 text-[10px]">Load page</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: '0%' }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-neutral-500">Low Stock</span>
                    <span className="font-bold text-secondary-700 text-[10px]">Load page</span>
                  </div>
                  <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: '0%' }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom */}
        <div className="p-2 border-t border-neutral-100 space-y-1">
          {!collapsed && (
            <>
              <button className="w-full flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors">
                <Plus className="w-4 h-4" />
                Add New Item
              </button>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-neutral-400 hover:text-secondary text-sm rounded-lg hover:bg-neutral-50 transition-colors">
                <Download className="w-4 h-4" />
                Export Data
              </button>
            </>
          )}
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
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-neutral-400 min-w-0">
            <span className="text-secondary-700 font-medium">Rotem SRS</span>
            <span className="opacity-40">/</span>
            <span className="text-neutral-500">Inventory Control</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <button className="w-8 h-8 border border-neutral-100 rounded-lg flex items-center justify-center hover:bg-neutral-50 transition-colors text-secondary">
              <Bell className="w-4 h-4" />
            </button>
            <div className="w-px h-6 bg-neutral-100" />
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name}</p>
                <p className="text-[11px] text-neutral-400 mt-0.5">{user?.role}</p>
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
