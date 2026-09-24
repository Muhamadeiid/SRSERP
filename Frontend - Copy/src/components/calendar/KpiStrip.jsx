import { createElement } from 'react'
import { BriefcaseBusiness, CalendarCheck2, ClipboardCheck, UsersRound } from 'lucide-react'

const TILES = [
  {
    key: 'meeting', label: 'Meetings this month', icon: CalendarCheck2,
    value: stats => stats.meetingsThisMonth ?? 0,
    sub: stats => `${stats.meetingsToday ?? 0} today`,
  },
  {
    key: 'task', label: 'Open tasks', icon: ClipboardCheck,
    value: stats => stats.tasksPending ?? 0,
    sub: stats => (stats.tasksOverdue ? `${stats.tasksOverdue} overdue` : 'Nothing overdue'),
    alert: stats => (stats.tasksOverdue ?? 0) > 0,
  },
  {
    key: 'interview', label: 'Interviews', icon: UsersRound,
    value: stats => stats.interviewsScheduled ?? 0,
    sub: stats => `${stats.interviewsThisWeek ?? 0} in the next 7 days`,
  },
  {
    key: 'leave', label: 'Leave days', icon: BriefcaseBusiness,
    value: stats => stats.leaveDaysThisMonth ?? 0,
    sub: stats => (stats.leaveBalance == null ? 'No balance linked' : `${stats.leaveBalance} days available`),
  },
]

export default function KpiStrip({ stats, loading }) {
  return (
    <div className="cal-stats">
      {TILES.map(tile => (
        <div key={tile.key} className="cal-stat" data-type={tile.key}>
          <span className="cal-stat-icon" aria-hidden="true">{createElement(tile.icon, { className: 'h-5 w-5' })}</span>
          <div>
            <p className="cal-stat-value">{loading ? '—' : tile.value(stats)}</p>
            <p className="cal-stat-label">{tile.label}</p>
            <p className={`cal-stat-sub ${!loading && tile.alert?.(stats) ? 'cal-stat-sub--alert' : ''}`}>
              {loading ? 'Loading…' : tile.sub(stats)}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
