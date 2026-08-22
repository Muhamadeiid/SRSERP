// src/components/dashboard/TopBar.jsx
import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import { Menu } from 'lucide-react'
import ProfileAvatar from '../profile/ProfileAvatar'
import NotificationBell from '../notifications/NotificationBell'

export default function TopBar({ sidebarW = '230px', isMobile = false, onMenuClick }) {
  const { user }    = useSelector((s) => s.auth)
  const [clock, setClock]   = useState('')

  /* ── clock ── */
  useEffect(() => {
    const tick = () => {
      const n = new Date()
      setClock(
        n.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        '  ·  ' +
        n.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header
      className="fixed top-0 right-0 min-h-[60px] bg-white border-b border-neutral-100 flex items-center px-4 sm:px-7 gap-3 sm:gap-4 z-40 transition-all duration-200"
      style={{ left: isMobile ? 0 : sidebarW }}>

      {isMobile && (
        <button
          onClick={onMenuClick}
          className="w-9 h-9 border border-neutral-100 rounded-lg flex items-center justify-center text-secondary hover:bg-neutral-50 transition-colors"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Search */}
      <div className="hidden sm:flex items-center gap-2 bg-neutral-50 rounded-lg px-3.5 h-9 flex-1 max-w-[480px]">
        <span className="text-neutral-400 text-sm">🔍</span>
        <input
          type="text"
          placeholder="Search Command Center..."
          className="bg-transparent border-none outline-none text-sm text-secondary-700 placeholder:text-neutral-400 w-full"
        />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 sm:gap-5 ml-auto">
        <span className="hidden md:inline text-xs font-medium text-neutral-400 tabular-nums">{clock}</span>

        {/* Bell — NotificationBell owns its own panel, polling, and outside-click. */}
        <NotificationBell />

        <div className="w-px h-6 bg-neutral-100" />

        {/* User */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name ?? 'User'}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">{user?.role ?? ''}</p>
          </div>
          <ProfileAvatar />
        </div>
      </div>
    </header>
  )
}
