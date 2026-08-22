import { useEffect, useMemo, useState } from 'react'
import { Bell, BellOff, Check, Clock3, Loader2, Mail, MessageCircle, ShieldAlert } from 'lucide-react'
import { getNotificationPreferences, updateNotificationPreferences } from '../services/notificationService'

const CATEGORIES = [
  ['crit', 'Critical incidents', 'Urgent faults and safety incidents'],
  ['task', 'Tasks', 'Assignments, updates and overdue tasks'],
  ['meeting', 'Meetings', 'Invitations, changes and reminders'],
  ['hr', 'HR', 'Interviews and employee workflow'],
  ['leave', 'Leave requests', 'Requests, approvals and decisions'],
  ['ot', 'Overtime', 'Requests, approvals and shift reminders'],
  ['report', 'Reports', 'Reviews and generated reports'],
  ['sys', 'System', 'Templates, configuration and maintenance'],
]

const defaults = Object.fromEntries(CATEGORIES.map(([key]) => [key, { in_app: true, email: false, whatsapp: false }]))

const addDuration = (value) => {
  if (value === 'always') return null
  const date = new Date()
  if (value === 'hour') date.setHours(date.getHours() + 1)
  if (value === 'tomorrow') {
    date.setDate(date.getDate() + 1)
    date.setHours(8, 0, 0, 0)
  }
  return date.toISOString()
}

export default function NotificationPreferencesPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [dnd, setDnd] = useState(false)
  const [dndDuration, setDndDuration] = useState('hour')
  const [dndUntil, setDndUntil] = useState(null)
  const [channels, setChannels] = useState(defaults)

  useEffect(() => {
    getNotificationPreferences()
      .then(response => {
        const data = response.data ?? response
        setDnd(Boolean(data.dnd_enabled))
        setDndUntil(data.dnd_until ?? null)
        setChannels({ ...defaults, ...(data.channels ?? {}) })
      })
      .catch(() => setError('Notification settings could not be loaded.'))
      .finally(() => setLoading(false))
  }, [])

  const dndLabel = useMemo(() => {
    if (!dnd) return 'Notifications are active'
    if (!dndUntil) return 'Do Not Disturb is on until you switch it off'
    return `Do Not Disturb until ${new Date(dndUntil).toLocaleString()}`
  }, [dnd, dndUntil])

  const toggleCategory = key => {
    setSaved(false)
    setChannels(previous => ({
      ...previous,
      [key]: { ...previous[key], in_app: !previous[key]?.in_app },
    }))
  }

  const toggleDnd = () => {
    setSaved(false)
    setDnd(previous => {
      const next = !previous
      setDndUntil(next ? addDuration(dndDuration) : null)
      return next
    })
  }

  const changeDuration = value => {
    setDndDuration(value)
    if (dnd) setDndUntil(addDuration(value))
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const response = await updateNotificationPreferences({ dndEnabled: dnd, dndUntil: dnd ? dndUntil : null, channels })
      const data = response.data ?? response
      setDnd(Boolean(data.dnd_enabled))
      setDndUntil(data.dnd_until ?? null)
      setChannels({ ...defaults, ...(data.channels ?? {}) })
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (requestError) {
      setError(requestError?.response?.data?.message ?? 'Notification settings could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="notification-prefs-loading"><Loader2 aria-label="Loading notification settings" /></div>

  return (
    <main className="notification-prefs-page">
      <header className="notification-prefs-header">
        <div className="notification-prefs-header__icon"><Bell /></div>
        <div>
          <h1>Notification Settings</h1>
          <p>Choose what reaches your notification center and pause alerts when you need quiet time.</p>
        </div>
      </header>

      {error && <div className="notification-prefs-error" role="alert"><ShieldAlert />{error}</div>}

      <section className={`notification-prefs-dnd ${dnd ? 'is-active' : ''}`}>
        <div className="notification-prefs-dnd__lead">{dnd ? <BellOff /> : <Bell />}</div>
        <div className="notification-prefs-dnd__copy">
          <h2>Do Not Disturb</h2>
          <p>{dndLabel}</p>
        </div>
        <select value={dndDuration} onChange={event => changeDuration(event.target.value)} disabled={!dnd} aria-label="Do Not Disturb duration">
          <option value="hour">For 1 hour</option>
          <option value="tomorrow">Until tomorrow 8:00</option>
          <option value="always">Until I turn it off</option>
        </select>
        <button type="button" className={`settings-switch ${dnd ? 'is-on' : ''}`} onClick={toggleDnd} aria-pressed={dnd} aria-label="Toggle Do Not Disturb"><span /></button>
      </section>

      <section className="notification-prefs-card">
        <div className="notification-prefs-card__heading">
          <div><h2>Notification Categories</h2><p>Disabled categories will not create new notifications for your account.</p></div>
          <span>In-app</span>
        </div>
        <div className="notification-prefs-list">
          {CATEGORIES.map(([key, label, description]) => (
            <div className="notification-prefs-row" key={key}>
              <div className={`notification-prefs-category notification-prefs-category--${key}`}><Bell /></div>
              <div className="notification-prefs-row__copy"><strong>{label}</strong><span>{description}</span></div>
              <button type="button" className={`settings-switch ${channels[key]?.in_app ? 'is-on' : ''}`} onClick={() => toggleCategory(key)} aria-pressed={Boolean(channels[key]?.in_app)} aria-label={`Toggle ${label}`}><span /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="notification-prefs-unavailable">
        <div><Mail /><span><strong>Email</strong><small>Not configured on this server</small></span></div>
        <div><MessageCircle /><span><strong>WhatsApp</strong><small>Not configured on this server</small></span></div>
      </section>

      <div className="notification-prefs-actions">
        <span><Clock3 /> Changes apply to new notifications only.</span>
        <button type="button" onClick={save} disabled={saving}>{saving ? <Loader2 /> : saved ? <Check /> : null}{saved ? 'Saved' : 'Save Changes'}</button>
      </div>
    </main>
  )
}
