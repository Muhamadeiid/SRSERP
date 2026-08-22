import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  AlertCircle, Bell, CalendarDays, Check, CheckCheck, ChevronDown, ClipboardCheck,
  Clock3, FileText, Search, Settings, ShieldAlert, Trash2, UserRoundCheck,
} from 'lucide-react'
import UserAvatar from '../components/profile/UserAvatar'
import {
  dismissNotification, fetchNotifications, markAllNotificationsRead,
  markNotificationRead, notificationEvents, notificationLinks, performNotificationAction,
} from '../services/notificationService'
import { notificationRequestTarget } from '../utils/notificationRoute'

const FILTERS = [
  ['all', 'All'], ['unread', 'Unread'], ['assigned', 'Assigned'], ['crit', 'Critical'], ['task', 'Tasks'],
  ['meeting', 'Meetings'], ['hr', 'HR'], ['leave', 'Leave'], ['ot', 'Overtime'],
  ['report', 'Reports'], ['sys', 'System'],
]

const CATEGORY = {
  crit: { icon: ShieldAlert, cls: 'notification-category--crit', label: 'Critical' },
  task: { icon: ClipboardCheck, cls: 'notification-category--task', label: 'Task' },
  meeting: { icon: CalendarDays, cls: 'notification-category--meeting', label: 'Meeting' },
  hr: { icon: UserRoundCheck, cls: 'notification-category--hr', label: 'HR' },
  leave: { icon: CalendarDays, cls: 'notification-category--leave', label: 'Leave' },
  ot: { icon: Clock3, cls: 'notification-category--ot', label: 'Overtime' },
  report: { icon: FileText, cls: 'notification-category--report', label: 'Report' },
  sys: { icon: Bell, cls: 'notification-category--sys', label: 'System' },
}

const isUnread = item => !item.read_at && !item.read

const groupLabel = value => {
  const date = new Date(value)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const week = new Date(today); week.setDate(week.getDate() - 7)
  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= week) return 'This week'
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

const formattedTime = value => new Date(value).toLocaleString('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
})

export default function NotificationCenterPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const links = useMemo(() => notificationLinks(pathname), [pathname])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ unread: 0, critical: 0 })
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [declining, setDeclining] = useState(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [search])

  const load = useCallback(async ({ append = false, quiet = false } = {}) => {
    append ? setLoadingMore(true) : !quiet && setLoading(true)
    setError('')
    try {
      const before = append && items.length ? items.at(-1)?.created_at : undefined
      const snapshot = await fetchNotifications({ tab: filter, limit: 50, search: query || undefined, before })
      const rows = snapshot.items ?? snapshot.data ?? []
      setItems(current => append ? [...current, ...rows] : rows)
      setHasMore(Boolean(snapshot.hasMore))
      setSummary({
        unread: Number(snapshot.unreadCount ?? snapshot.unread_count ?? 0),
        critical: Number(snapshot.criticalCount ?? 0),
      })
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'Notifications could not be loaded.')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [filter, items, query])

  useEffect(() => { load().catch(() => {}) }, [filter, query]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const refresh = () => load({ quiet: true }).catch(() => {})
    window.addEventListener(notificationEvents.snapshot, refresh)
    return () => window.removeEventListener(notificationEvents.snapshot, refresh)
  }, [load])

  const groups = useMemo(() => items.reduce((result, item) => {
    const key = groupLabel(item.created_at)
    ;(result[key] ??= []).push(item)
    return result
  }, {}), [items])

  const openItem = async item => {
    if (isUnread(item)) await markNotificationRead(item.id).catch(() => {})
    const target = notificationRequestTarget(item)
    if (target) navigate(`${target.path}${target.query ? `?${target.query}` : ''}`)
  }

  const runAction = async (item, action) => {
    if (action.action === 'decline' && declining !== item.id) {
      setDeclining(item.id); setReason(''); return
    }
    if (action.action === 'decline' && reason.trim().length < 5) return
    setBusyId(item.id)
    try {
      await performNotificationAction(item.id, action.action, {
        ...(action.payload ?? {}),
        ...(action.action === 'decline' ? { reason: reason.trim() } : {}),
      })
      setDeclining(null); setReason('')
      await load()
    } finally { setBusyId(null) }
  }

  const dismiss = async item => {
    setBusyId(item.id)
    try {
      await dismissNotification(item.id)
      setItems(current => current.filter(row => row.id !== item.id))
    } finally { setBusyId(null) }
  }

  const markAll = async () => {
    await markAllNotificationsRead()
    await load()
  }

  return (
    <main className="notification-center-page">
      <header className="notification-center-header">
        <div className="notification-center-heading">
          <span><Bell /></span>
          <div><h1>Notification Center</h1><p>Your alerts, approvals and operational updates in one place.</p></div>
        </div>
        <div className="notification-center-header__actions">
          {summary.unread > 0 && <button type="button" onClick={markAll}><CheckCheck /> Mark all read</button>}
          <button type="button" onClick={() => navigate(links.settings)}><Settings /> Settings</button>
        </div>
      </header>

      <section className="notification-center-summary" aria-label="Notification summary">
        <div><span className="notification-summary-icon notification-category--sys"><Bell /></span><p><strong>{items.length}</strong>Shown</p></div>
        <div><span className="notification-summary-icon notification-category--meeting"><AlertCircle /></span><p><strong>{summary.unread}</strong>Unread</p></div>
        <div><span className="notification-summary-icon notification-category--crit"><ShieldAlert /></span><p><strong>{summary.critical}</strong>Critical</p></div>
      </section>

      <section className="notification-center-card">
        <div className="notification-center-toolbar">
          <label className="notification-center-search"><Search /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notifications..." /></label>
          <label className="notification-center-filter"><span>Filter</span><select value={filter} onChange={event => setFilter(event.target.value)}>{FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown /></label>
        </div>

        {error && <div className="notification-center-error"><ShieldAlert />{error}<button type="button" onClick={() => load()}>Retry</button></div>}
        {loading && <div className="notification-center-empty"><span className="srs-loading-spinner" /><p>Loading notifications...</p></div>}
        {!loading && !error && items.length === 0 && <div className="notification-center-empty"><Check /><h2>No notifications found</h2><p>Try another filter or search phrase.</p></div>}

        {!loading && Object.entries(groups).map(([group, rows]) => (
          <div className="notification-center-group" key={group}>
            <h2>{group}<span>{rows.length}</span></h2>
            {rows.map(item => {
              const config = CATEGORY[item.category] ?? CATEGORY.sys
              const Icon = config.icon
              const actions = Array.isArray(item.actions) ? item.actions : []
              const sender = item.sender ? { ...item.sender, has_profile_photo: Boolean(item.sender.profile_photo_path) } : null
              return (
                <article className={`notification-center-item ${isUnread(item) ? 'is-unread' : ''} ${item.priority === 'warn' || item.priority === 'crit' ? 'is-important' : ''}`} key={item.id}>
                  <button className="notification-center-item__main" type="button" onClick={() => openItem(item)}>
                    {sender ? <UserAvatar user={sender} size="md" /> : <span className={`notification-item__icon ${config.cls}`}><Icon /></span>}
                    <span className="notification-center-item__copy"><strong>{item.title}</strong><span>{item.description || item.body}</span><small><em className={config.cls}>{config.label}</em>{formattedTime(item.created_at)}</small></span>
                    {isUnread(item) && <span className="notification-center-item__dot" aria-label="Unread" />}
                  </button>
                  <div className="notification-center-item__controls">
                    {actions.map((action, index) => <button key={`${action.action}-${index}`} type="button" disabled={busyId === item.id} className={`notification-action notification-action--${action.style || 'default'}`} onClick={() => runAction(item, action)}>{action.label}</button>)}
                    <button type="button" className="notification-center-dismiss" disabled={busyId === item.id} onClick={() => dismiss(item)} aria-label="Archive notification"><Trash2 /></button>
                  </div>
                  {declining === item.id && <div className="notification-center-decline"><input value={reason} onChange={event => setReason(event.target.value)} placeholder="Reason for rejection" autoFocus /><button type="button" disabled={reason.trim().length < 5} onClick={() => runAction(item, { action: 'decline' })}>Confirm reject</button><button type="button" onClick={() => setDeclining(null)}>Cancel</button></div>}
                </article>
              )
            })}
          </div>
        ))}

        {!loading && hasMore && <div className="notification-center-more"><button type="button" disabled={loadingMore} onClick={() => load({ append: true })}>{loadingMore ? 'Loading...' : 'Load more'}</button></div>}
      </section>
    </main>
  )
}
