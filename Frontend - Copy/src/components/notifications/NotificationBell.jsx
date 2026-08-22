import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { fetchNotifications, notificationEvents } from '../../services/notificationService'
import NotificationPanel from './NotificationPanel'

const getCounts = (snapshot = {}) => ({
  unread: Number(snapshot.unreadCount ?? snapshot.unread_count ?? 0),
  critical: Number(snapshot.criticalCount ?? snapshot.critical_count ?? 0),
})

export default function NotificationBell({ onClick, open, className = '' }) {
  const [counts, setCounts] = useState({ unread: 0, critical: 0 })
  const [internalOpen, setInternalOpen] = useState(false)
  const rootRef = useRef(null)
  const isOpen = open ?? internalOpen

  useEffect(() => {
    let active = true

    const update = (event) => setCounts(getCounts(event.detail))
    window.addEventListener(notificationEvents.snapshot, update)

    fetchNotifications({ tab: 'all', limit: 1 })
      .then((snapshot) => { if (active) setCounts(getCounts(snapshot)) })
      .catch(() => {})

    return () => {
      active = false
      window.removeEventListener(notificationEvents.snapshot, update)
    }
  }, [])

  useEffect(() => {
    if (open !== undefined || !internalOpen) return
    const closeOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setInternalOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [open, internalOpen])

  const label = counts.unread
    ? `Notifications, ${counts.unread} unread`
    : 'Notifications'

  const toggle = () => onClick ? onClick() : setInternalOpen(value => !value)
  const close = () => onClick ? (isOpen && onClick()) : setInternalOpen(false)

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={isOpen}
        title={label}
        className={`notification-bell ${isOpen ? 'notification-bell--open' : ''} ${counts.critical ? 'notification-bell--critical' : ''} ${className}`}
      >
        <Bell className={`notification-bell__icon ${counts.unread ? 'notification-bell__icon--unread' : ''}`} />
        {counts.unread > 0 && (
          <span className="notification-bell__badge" aria-hidden="true">
            {counts.unread > 9 ? '9+' : counts.unread}
          </span>
        )}
      </button>
      {isOpen && <NotificationPanel onClose={close} />}
    </span>
  )
}
