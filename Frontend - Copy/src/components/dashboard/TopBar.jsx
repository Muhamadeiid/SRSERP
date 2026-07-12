// src/components/dashboard/TopBar.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { Bell, X, CheckCheck, Calendar, Clock, Menu } from 'lucide-react'
import { getNotifications, markAllRead, markOneRead } from '../../services/leaveService'
import { useNavigate } from 'react-router-dom'

const fmtTime = (d) => {
  if (!d) return ''
  const dt  = new Date(d)
  const now = new Date()
  const diffMin = Math.floor((now - dt) / 60000)
  if (diffMin < 1)  return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `${diffH}h ago`
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

const TYPE_ICON = {
  lrf: <Calendar className="w-3.5 h-3.5" />,
  otr: <Clock    className="w-3.5 h-3.5" />,
}

export default function TopBar({ sidebarW = '230px', isMobile = false, onMenuClick }) {
  const { user }    = useSelector((s) => s.auth)
  const navigate    = useNavigate()
  const [clock, setClock]   = useState('')
  const [notifs, setNotifs] = useState([])
  const [open, setOpen]     = useState(false)
  const panelRef = useRef()

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

  /* ── fetch notifications ── */
  const fetchNotifs = useCallback(async () => {
    try {
      const res = await getNotifications()
      setNotifs(res.data ?? [])
    } catch (_) {}
  }, [])

  useEffect(() => {
    fetchNotifs()
    const t = setInterval(fetchNotifs, 30000)
    return () => clearInterval(t)
  }, [fetchNotifs])

  /* ── close on outside click ── */
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

  const handleClick = async (n) => {
    if (!n.read) {
      await markOneRead(n.id)
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, read: true } : x))
    }
    setOpen(false)
    if (n.data?.leave_request_id) {
      const isReschedule = n.event === 'lrf_rescheduled' || n.event === 'otr_rescheduled'
      const param = isReschedule ? 'resubmit' : 'req'
      navigate(`/human-resources/leave?${param}=${n.data.leave_request_id}`)
    }
  }

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

        {/* Bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setOpen(o => !o)}
            className="relative w-8 h-8 flex items-center justify-center hover:text-primary transition-colors text-secondary">
            <Bell className="w-4 h-4" />
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-1">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-10 w-[calc(100vw-2rem)] max-w-80 bg-white rounded-2xl border border-neutral-200 shadow-2xl z-50 overflow-hidden">
              {/* Header */}
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
                    <button onClick={handleMarkAll}
                      className="flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline">
                      <CheckCheck className="w-3 h-3" /> Mark all read
                    </button>
                  )}
                  <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-neutral-100 text-neutral-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-neutral-50">
                {notifs.length === 0 ? (
                  <div className="py-12 text-center text-neutral-300">
                    <Bell className="w-7 h-7 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No notifications yet</p>
                  </div>
                ) : notifs.map(n => (
                  <button key={n.id} onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-neutral-50 transition-colors flex items-start gap-3 ${!n.read ? 'bg-blue-50/50' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${!n.read ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-400'}`}>
                      {TYPE_ICON[n.type?.split('_')[0]] ?? <Bell className="w-3.5 h-3.5" />}
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

              {/* Footer */}
              {notifs.length > 0 && (
                <div className="px-4 py-2.5 border-t border-neutral-100 text-center">
                  <button onClick={() => { setOpen(false); navigate('/human-resources/leave-requests') }}
                    className="text-[11px] text-primary font-semibold hover:underline">
                    View all in Leave Requests →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="w-px h-6 bg-neutral-100" />

        {/* User */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold text-secondary-700 leading-none">{user?.name ?? 'User'}</p>
            <p className="text-[11px] text-neutral-400 mt-0.5">{user?.role ?? ''}</p>
          </div>
          <div className="w-[34px] h-[34px] rounded-full bg-amber-400 flex items-center justify-center text-white text-sm font-extrabold">
            {user?.name?.charAt(0).toUpperCase() ?? 'U'}
          </div>
        </div>
      </div>
    </header>
  )
}
