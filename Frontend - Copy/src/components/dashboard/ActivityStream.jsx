import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ClipboardList, FileText, Wrench } from 'lucide-react'

const SOURCES = {
  hr:          { label: 'HR',          dot: '#005782', icon: FileText },
  procurement: { label: 'Procurement', dot: '#177b78', icon: ClipboardList },
  maintenance: { label: 'Maintenance', dot: '#b5843b', icon: Wrench },
}

/** "2m ago" / "3h ago" / "12 Sep" — short enough for a dense feed. */
function relativeTime(value, now) {
  if (!value) return ''
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return ''
  const minutes = Math.floor((now - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(then).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/**
 * One merged feed instead of a "recent 4" list inside every department card.
 *
 * Leave requests, purchase requests and maintenance tasks are interleaved by
 * timestamp and colour-coded by source, so the newest thing that happened
 * anywhere in the depot is always the first row.
 */
export default function ActivityStream({
  leaveRequests = [], procurementRequests = [], maintenanceTasks = [],
  hrAccess, procurementAccess, maintenanceAccess,
  now, loading, limit = 8,
}) {
  const navigate = useNavigate()

  const entries = useMemo(() => {
    const rows = []

    if (hrAccess) {
      leaveRequests.forEach(request => {
        rows.push({
          id: `hr-${request.id}`,
          source: 'hr',
          title: request.employee_name || request.user?.name || 'Employee',
          detail: `${String(request.leave_type || request.type || 'leave').replaceAll('_', ' ')} · ${String(request.status || '').replaceAll('_', ' ')}`,
          at: request.updated_at || request.created_at,
          href: `/human-resources/leave?req=${request.id}`,
        })
      })
    }

    if (procurementAccess) {
      procurementRequests.forEach(item => {
        rows.push({
          id: `prf-${item.id}`,
          source: 'procurement',
          title: item.prf_number || `PRF #${item.id}`,
          detail: `${item.requester?.name || '—'} · ${String(item.status || '').replaceAll('_', ' ')}`,
          at: item.updated_at || item.created_at,
          href: `/procurement/${item.id}`,
        })
      })
    }

    if (maintenanceAccess) {
      maintenanceTasks.filter(task => task.status !== 'done').forEach(task => {
        rows.push({
          id: `task-${task.id}`,
          source: 'maintenance',
          title: task.title,
          detail: `${task.train_number ? `TS${String(task.train_number).padStart(2, '0')} · ` : ''}${String(task.priority || 'task')}`,
          at: task.updated_at || task.created_at,
          href: `/maintenance?task=${task.id}`,
        })
      })
    }

    return rows
      .filter(row => row.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit)
  }, [leaveRequests, procurementRequests, maintenanceTasks,
      hrAccess, procurementAccess, maintenanceAccess, limit])

  return (
    <section className="operations-activity">
      <header>
        <div>
          <p className="operations-section-kicker">LIVE FEED</p>
          <h2>Recent activity</h2>
          <p>Newest events across every department you can see</p>
        </div>
      </header>

      {loading && entries.length === 0 ? (
        <div className="operations-activity-skeleton">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index}>
              <span className="operations-activity-skeleton-dot" />
              <span className="operations-activity-skeleton-line" />
            </div>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="operations-activity-empty">
          <Activity className="h-7 w-7" />
          <p>Nothing has happened yet today</p>
        </div>
      ) : (
        <ol className="operations-activity-list">
          {entries.map(entry => {
            const source = SOURCES[entry.source]
            return (
              <li key={entry.id}>
                <button type="button" onClick={() => navigate(entry.href)}>
                  <span className="operations-activity-dot" style={{ background: source.dot }} aria-hidden="true" />
                  <span className="operations-activity-body">
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                  </span>
                  <span className="operations-activity-meta">
                    <span className="operations-activity-source">{source.label}</span>
                    <time dateTime={entry.at}>{relativeTime(entry.at, now)}</time>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
