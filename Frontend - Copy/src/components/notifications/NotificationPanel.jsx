import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Bell, CalendarDays, Check, CheckCheck, ClipboardCheck,
  Clock3, FileText, Settings, ShieldAlert, Trash2, UserRoundCheck, X,
} from 'lucide-react'
import UserAvatar from '../profile/UserAvatar'
import {
  dismissNotification,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationEvents,
  notificationLinks,
  performNotificationAction,
} from '../../services/notificationService'
import { notificationRequestTarget } from '../../utils/notificationRoute'

const TABS = [
  ['all', 'All'], ['unread', 'Unread'], ['leave', 'Leave'], ['ot', 'OT'], ['assigned', 'Assigned'],
]

const CATEGORY = {
  crit: { icon: ShieldAlert, cls: 'notification-category--crit' },
  task: { icon: ClipboardCheck, cls: 'notification-category--task' },
  meeting: { icon: CalendarDays, cls: 'notification-category--meeting' },
  hr: { icon: UserRoundCheck, cls: 'notification-category--hr' },
  leave: { icon: CalendarDays, cls: 'notification-category--leave' },
  ot: { icon: Clock3, cls: 'notification-category--ot' },
  report: { icon: FileText, cls: 'notification-category--report' },
  sys: { icon: Bell, cls: 'notification-category--sys' },
}

const isUnread = (item) => !item.read_at && !item.read

const bucketFor = (value) => {
  const date = new Date(value)
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startYesterday = new Date(startToday)
  startYesterday.setDate(startYesterday.getDate() - 1)
  if (date >= startToday) return 'Today'
  if (date >= startYesterday) return 'Yesterday'
  return 'Earlier'
}

const timeAgo = (value) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function NotificationPanel({ onClose }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const links = useMemo(() => notificationLinks(pathname), [pathname])
  const [tab, setTab] = useState('all')
  const [items, setItems] = useState([])
  const [counts, setCounts] = useState({ unread: 0 })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [declining, setDeclining] = useState(null)
  const [reason, setReason] = useState('')

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const snapshot = await fetchNotifications({ tab, limit: 30 })
      setItems(snapshot.items ?? snapshot.data ?? [])
      setCounts({ unread: Number(snapshot.unreadCount ?? snapshot.unread_count ?? 0) })
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [tab])

  useEffect(() => { load().catch(() => {}) }, [load])
  useEffect(() => {
    const refresh = () => load(false).catch(() => {})
    window.addEventListener(notificationEvents.snapshot, refresh)
    return () => window.removeEventListener(notificationEvents.snapshot, refresh)
  }, [load])

  const groups = useMemo(() => items.reduce((result, item) => {
    const bucket = bucketFor(item.created_at)
    ;(result[bucket] ??= []).push(item)
    return result
  }, {}), [items])

  const goToItem = async (item) => {
    if (isUnread(item)) await markNotificationRead(item.id).catch(() => {})
    const target = item.link
      ? { path: item.link, query: '' }
      : notificationRequestTarget(item)
    if (target) navigate(`${target.path}${target.query ? `?${target.query}` : ''}`)
    onClose?.()
  }

  const runAction = async (item, action) => {
    if (action.action === 'decline' && declining !== item.id) {
      setDeclining(item.id)
      setReason('')
      return
    }
    if (action.action === 'decline' && reason.trim().length < 5) return

    setBusyId(item.id)
    try {
      await performNotificationAction(item.id, action.action, {
        ...(action.payload ?? {}),
        ...(action.action === 'decline' ? { reason: reason.trim() } : {}),
      })
      setDeclining(null)
      setReason('')
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const markAll = async () => {
    await markAllNotificationsRead()
    await load()
  }

  const dismiss = async (event, item) => {
    event.stopPropagation()
    setBusyId(item.id)
    try {
      await dismissNotification(item.id)
      setItems(current => current.filter(row => row.id !== item.id))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="notification-panel" aria-label="Notifications panel">
      <div className="notification-panel__tail" />
      <header className="notification-panel__header">
        <div>
          <h2>Notifications</h2>
          <p>{counts.unread ? `${counts.unread} unread` : 'You are all caught up'}</p>
        </div>
        <div className="notification-panel__header-actions">
          {counts.unread > 0 && <button type="button" onClick={markAll}><CheckCheck /> Mark all read</button>}
          <button type="button" onClick={onClose} aria-label="Close notifications"><X /></button>
        </div>
      </header>

      <nav className="notification-panel__tabs" aria-label="Notification filters">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>

      <div className="notification-panel__body">
        {loading && <div className="notification-panel__empty"><span className="srs-loading-spinner" /><p>Loading notifications...</p></div>}
        {!loading && items.length === 0 && <div className="notification-panel__empty"><Check /><p>No notifications in this view</p></div>}
        {!loading && ['Today', 'Yesterday', 'Earlier'].map(group => groups[group]?.length ? (
          <div key={group} className="notification-group">
            <h3>{group}</h3>
            {groups[group].map(item => {
              const config = CATEGORY[item.category] ?? CATEGORY.sys
              const Icon = config.icon
              const actions = Array.isArray(item.actions) ? item.actions : []
              const sender = item.sender ? { ...item.sender, has_profile_photo: Boolean(item.sender.profile_photo_path) } : null
              return (
                <article key={item.id} className={`notification-item ${isUnread(item) ? 'notification-item--unread' : ''} ${item.priority === 'warn' || item.priority === 'crit' ? 'notification-item--important' : ''}`}>
                  <button type="button" className="notification-item__main" onClick={() => goToItem(item)}>
                    {sender
                      ? <UserAvatar user={sender} size="md" />
                      : <span className={`notification-item__icon ${config.cls}`}><Icon /></span>}
                    <span className="notification-item__content">
                      <span className="notification-item__title">{item.title}</span>
                      <span className="notification-item__description">{item.description || item.body}</span>
                      {Array.isArray(item.meta) && item.meta.length > 0 && (
                        <span className="notification-item__meta">{item.meta.map((meta, index) => <em key={index}>{meta.value || meta.text}</em>)}</span>
                      )}
                    </span>
                    <span className="notification-item__time">{timeAgo(item.created_at)}</span>
                  </button>

                  {actions.length > 0 && (
                    <div className="notification-item__actions">
                      {actions.map((action, index) => (
                        <button
                          key={`${action.action}-${index}`}
                          type="button"
                          disabled={busyId === item.id}
                          className={`notification-action notification-action--${action.style || 'default'}`}
                          onClick={() => runAction(item, action)}
                        >{action.label}</button>
                      ))}
                      <button type="button" className="notification-dismiss" onClick={(event) => dismiss(event, item)} aria-label="Dismiss"><Trash2 /></button>
                    </div>
                  )}

                  {declining === item.id && (
                    <div className="notification-item__decline">
                      <input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for rejection" autoFocus />
                      <button type="button" disabled={reason.trim().length < 5 || busyId === item.id} onClick={() => runAction(item, { action: 'decline' })}>Confirm reject</button>
                      <button type="button" onClick={() => setDeclining(null)}>Cancel</button>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        ) : null)}
      </div>

      <footer className="notification-panel__footer">
        <button type="button" onClick={() => { onClose?.(); navigate(links.center) }}>View all notifications</button>
        <button type="button" onClick={() => { onClose?.(); navigate(links.settings) }} aria-label="Notification settings"><Settings /></button>
      </footer>
    </section>
  )
}
