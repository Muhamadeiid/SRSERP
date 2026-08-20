import { BriefcaseBusiness, CalendarCheck2, ClipboardList, UsersRound } from 'lucide-react'

const CARDS = [
  { key: 'meetings', label: 'Meetings', icon: CalendarCheck2, tone: 'bg-blue-50 text-blue-700', value: stats => stats.meetingsThisMonth ?? 0, detail: stats => `${stats.meetingsToday ?? 0} today` },
  { key: 'tasks', label: 'Pending Tasks', icon: ClipboardList, tone: 'bg-amber-50 text-amber-700', value: stats => stats.tasksPending ?? 0, detail: stats => `${stats.tasksOverdue ?? 0} overdue` },
  { key: 'interviews', label: 'Interviews', icon: UsersRound, tone: 'bg-purple-50 text-purple-700', value: stats => stats.interviewsScheduled ?? 0, detail: stats => `${stats.interviewsThisWeek ?? 0} next 7 days` },
  { key: 'leave', label: 'Leave Days', icon: BriefcaseBusiness, tone: 'bg-teal-50 text-teal-700', value: stats => stats.leaveDaysThisMonth ?? 0, detail: stats => stats.leaveBalance == null ? 'No balance linked' : `${stats.leaveBalance} days available` },
]

export default function KpiStrip({ stats, loading }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {CARDS.map(card => {
        const Icon = card.icon
        return (
          <div key={card.key} className="flex min-h-[92px] items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${card.tone}`}><Icon className="h-5 w-5" /></div>
            <div><p className="text-[10px] font-bold uppercase text-neutral-400">{card.label}</p><p className="mt-0.5 text-2xl font-extrabold text-secondary-700">{loading ? '—' : card.value(stats)}</p><p className="text-[10px] font-semibold text-neutral-400">{loading ? 'Loading...' : card.detail(stats)}</p></div>
          </div>
        )
      })}
    </div>
  )
}
