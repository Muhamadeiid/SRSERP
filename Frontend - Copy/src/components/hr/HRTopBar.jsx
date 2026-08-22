import { useState, useEffect } from 'react'
import { useSelector } from 'react-redux'
import ProfileAvatar from '../profile/ProfileAvatar'
import NotificationBell from '../notifications/NotificationBell'

export default function HRTopBar() {
  const { user } = useSelector((s) => s.auth)
  const [clock, setClock] = useState('')

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
    <header className="fixed top-0 left-[230px] right-0 h-[60px] bg-white border-b border-neutral-100 flex items-center px-7 gap-4 z-40">

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-neutral-400">
        <span>Operations</span>
        <span className="opacity-40">/</span>
        <span className="text-secondary-700 font-medium">Human Resources</span>
      </div>

      {/* Right */}
      <div className="ml-auto flex items-center gap-4">
        <span className="text-xs font-medium text-neutral-400 tabular-nums">{clock}</span>

        {/* Bell — NotificationBell owns its own panel, polling, and outside-click. */}
        <NotificationBell />

        <div className="w-px h-6 bg-neutral-100" />

        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name ?? 'User'}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">{user?.role}</p>
          </div>
          <ProfileAvatar size="sm" />
        </div>
      </div>
    </header>
  )
}
