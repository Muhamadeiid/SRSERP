import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, Award, Bell, CakeSlice, CalendarDays, CheckCircle2,
  Clock3, Loader2, RefreshCw, Search, ShieldCheck, UserCheck, Users,
} from 'lucide-react'
import { attendanceService } from '../../services/Attendanceservice'

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next }
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()
const listFrom = response => Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []
const isLeave = row => ['on_leave', 'leave', 'annual', 'casual', 'sick', 'company_paid'].includes(String(row?.status || '').toLowerCase())
const isAbsent = row => String(row?.status || '').toLowerCase() === 'absent'
const isPresent = row => Boolean(row?.check_in || row?.check_out) && !isLeave(row)

function KpiCard({ title, value, sub, tone, icon: Icon, onClick, loading }) {
  const palette = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-sky-50 text-sky-700 border-sky-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  }[tone]
  return (
    <button type="button" onClick={onClick} className="min-h-[150px] rounded-md border border-neutral-200 bg-white p-4 text-left shadow-sm transition hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-9 w-9 place-items-center rounded-md border ${palette}`}><Icon className="h-4 w-4" /></span>
        <ArrowRight className="h-4 w-4 text-neutral-300" />
      </div>
      <p className="mt-4 text-[11px] font-bold uppercase text-neutral-400">{title}</p>
      <p className="mt-1 text-3xl font-extrabold text-secondary-700">{loading ? '...' : value}</p>
      <p className="mt-2 text-[11px] text-neutral-500">{sub}</p>
    </button>
  )
}

function StatusBadge({ status }) {
  const meta = {
    approved: ['Approved', 'bg-emerald-50 text-emerald-700'],
    rejected: ['Rejected', 'bg-red-50 text-red-700'],
    pending: ['Pending', 'bg-amber-50 text-amber-700'],
    manager_approved: ['Waiting HR', 'bg-sky-50 text-sky-700'],
    hr_approved: ['Waiting Depot', 'bg-violet-50 text-violet-700'],
  }[status] || [String(status || '').replaceAll('_', ' '), 'bg-neutral-100 text-neutral-600']
  return <span className={`rounded-full px-2 py-1 text-[9px] font-bold capitalize ${meta[1]}`}>{meta[0]}</span>
}

export default function HRDashboardView({
  user, loading, empStats, employees, requests, notifications, todayAttendance,
  maintenanceTasks, onRefresh,
}) {
  const navigate = useNavigate()
  const [weeklyRows, setWeeklyRows] = useState([])
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [awardSearch, setAwardSearch] = useState('')
  const [weekReload, setWeekReload] = useState(0)

  useEffect(() => {
    let active = true
    const today = new Date()
    const rangeStart = addDays(today, -6)
    setWeeklyLoading(true)
    Promise.all(Array.from({ length: 7 }, (_, index) => {
      const date = addDays(rangeStart, index)
      return attendanceService.getAttendance({ date: dateKey(date) })
        .then(response => ({ date, rows: listFrom(response) }))
        .catch(() => ({ date, rows: [] }))
    })).then(result => { if (active) setWeeklyRows(result) }).finally(() => { if (active) setWeeklyLoading(false) })
    return () => { active = false }
  }, [weekReload])

  const total = empStats?.total_employees ?? employees.length
  const present = useMemo(() => todayAttendance.filter(isPresent).length, [todayAttendance])
  const absent = useMemo(() => todayAttendance.filter(isAbsent).length, [todayAttendance])
  const leaveToday = useMemo(() => todayAttendance.filter(isLeave).length, [todayAttendance])
  const percentage = value => total ? Math.round((value / total) * 100) : 0

  const weeklyStats = useMemo(() => weeklyRows.map(({ date, rows }) => ({
    key: dateKey(date),
    label: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    present: rows.filter(isPresent).length,
    absent: rows.filter(isAbsent).length,
    leave: rows.filter(isLeave).length,
  })), [weeklyRows])
  const chartMax = Math.max(total, ...weeklyStats.flatMap(day => [day.present, day.absent, day.leave]), 1)

  const leaveApplications = useMemo(() => requests
    .filter(request => request.type === 'lrf')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5), [requests])

  const notices = useMemo(() => {
    const now = new Date()
    const tomorrow = addDays(now, 1)
    const birthdays = employees.filter(employee => {
      if (!employee.birth_date) return false
      const birthDate = new Date(`${String(employee.birth_date).slice(0, 10)}T12:00:00`)
      return (birthDate.getMonth() === now.getMonth() && birthDate.getDate() === now.getDate())
        || (birthDate.getMonth() === tomorrow.getMonth() && birthDate.getDate() === tomorrow.getDate())
    }).map(employee => {
      const birthDate = new Date(`${String(employee.birth_date).slice(0, 10)}T12:00:00`)
      const todayBirthday = birthDate.getMonth() === now.getMonth() && birthDate.getDate() === now.getDate()
      return {
        id: `birthday-${employee.id}`, title: `${employee.name}'s birthday`, kind: 'Birthday',
        dateLabel: todayBirthday ? 'Today' : 'Tomorrow', href: '/human-resources', birthday: true,
      }
    })
    const notificationItems = notifications.filter(item => !item.read).slice(0, 3).map(item => ({
      id: `notification-${item.id}`, title: item.message || item.title || 'New notification',
      kind: 'Notification', date: item.created_at, href: '/human-resources/leave', priority: true,
    }))
    const taskItems = maintenanceTasks.filter(task => task.status !== 'done').slice(0, 3).map(task => ({
      id: `task-${task.id}`, title: task.title, kind: task.priority || 'Task', date: task.due_date,
      href: `/maintenance?task=${task.id}`, priority: ['high', 'critical'].includes(task.priority),
    }))
    return [...birthdays, ...taskItems, ...notificationItems].slice(0, 7)
  }, [employees, notifications, maintenanceTasks])

  const recognition = useMemo(() => {
    const scores = new Map()
    weeklyRows.forEach(({ rows }) => rows.forEach(row => {
      if (!row.employee_id || !isPresent(row)) return
      const current = scores.get(row.employee_id) || {
        id: row.employee_id, name: row.employee?.name || row.employee_name || 'Employee',
        department: row.employee?.department || '', present: 0, late: 0,
      }
      current.present += 1
      if (String(row.status).toLowerCase() === 'late') current.late += 1
      scores.set(row.employee_id, current)
    }))
    return [...scores.values()]
      .sort((a, b) => (b.present - b.late) - (a.present - a.late))
      .filter(item => item.name.toLowerCase().includes(awardSearch.toLowerCase()))
      .slice(0, 8)
  }, [weeklyRows, awardSearch])

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-secondary-700">Human Resources Dashboard</h1>
          <p className="mt-1 text-xs text-neutral-400">Live workforce, attendance, leave and operational activity.</p>
        </div>
        <button type="button" onClick={() => { onRefresh(); setWeekReload(value => value + 1) }} disabled={loading || weeklyLoading} className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 text-xs font-bold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </button>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard title="Total Employees" value={total} sub="Active workforce" tone="green" icon={Users} loading={loading} onClick={() => navigate('/human-resources')} />
        <KpiCard title="Present Today" value={present} sub={`${percentage(present)}% of the workforce has a punch today`} tone="blue" icon={UserCheck} loading={loading} onClick={() => navigate('/human-resources/attendance')} />
        <KpiCard title="Absent Today" value={absent} sub={`${percentage(absent)}% marked absent today`} tone="red" icon={AlertCircle} loading={loading} onClick={() => navigate('/human-resources/attendance?status=absent')} />
        <KpiCard title="Today Leave" value={leaveToday} sub={`${percentage(leaveToday)}% on approved leave`} tone="amber" icon={CalendarDays} loading={loading} onClick={() => navigate('/human-resources/attendance?status=leave')} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-md border border-neutral-200 bg-white shadow-sm xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <div><h2 className="text-sm font-bold text-secondary-700">Daily Attendance Statistic</h2><p className="text-[10px] text-neutral-400">Last 7 days · through today</p></div>
            <div className="flex gap-3 text-[10px] font-bold"><span className="text-emerald-600">● Present</span><span className="text-red-500">● Absent</span><span className="text-amber-500">● Leave</span></div>
          </div>
          <div className="h-[300px] px-4 pb-4 pt-6">
            {weeklyLoading ? <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
              <div className="flex h-full items-end gap-3 border-b border-neutral-200 pl-2">
                {weeklyStats.map(day => (
                  <div key={day.key} className="flex h-full flex-1 flex-col justify-end">
                    <div className="flex flex-1 items-end justify-center gap-1">
                      {[['present', 'bg-emerald-500'], ['absent', 'bg-red-400'], ['leave', 'bg-amber-400']].map(([key, color]) => (
                        <div key={key} title={`${key}: ${day[key]}`} className={`w-1/4 min-w-[8px] max-w-[24px] rounded-t ${color}`} style={{ height: `${Math.max(day[key] ? 5 : 0, (day[key] / chartMax) * 100)}%` }} />
                      ))}
                    </div>
                    <p className="py-2 text-center text-[10px] font-bold text-neutral-500">{day.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3"><h2 className="text-sm font-bold text-secondary-700">Leave Applications</h2><button onClick={() => navigate('/human-resources/leave')} className="text-[10px] font-bold text-primary">See all</button></div>
          <div className="divide-y divide-neutral-100">
            {leaveApplications.length ? leaveApplications.map(request => (
              <button key={request.id} onClick={() => navigate(`/human-resources/leave?req=${request.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[9px] font-bold text-white">{initials(request.employee_name)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-secondary-700">{request.employee_name}</span><span className="mt-0.5 block text-[10px] capitalize text-neutral-400">{String(request.leave_type || 'leave').replaceAll('_', ' ')}</span></span>
                <StatusBadge status={request.status} />
              </button>
            )) : <div className="py-12 text-center text-xs text-neutral-400">No leave applications</div>}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="rounded-md border border-neutral-200 bg-white shadow-sm xl:col-span-4">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3"><span className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><span><h2 className="text-sm font-bold text-secondary-700">Upcoming</h2><p className="text-[9px] text-neutral-400">Tasks, birthdays and notifications</p></span></span><span className="rounded-full bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary">{notices.length}</span></div>
          <div className="space-y-2 p-3">
            {notices.length ? notices.map(item => (
              <button key={item.id} onClick={() => navigate(item.href)} className={`w-full rounded-md border p-3 text-left transition hover:bg-neutral-50 ${item.birthday ? 'border-pink-200 bg-pink-50/60' : item.priority ? 'border-l-4 border-l-primary' : 'border-neutral-200'}`}>
                <div className="flex items-start gap-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${item.birthday ? 'bg-pink-100 text-pink-600' : item.id.startsWith('task-') ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'}`}>
                    {item.birthday ? <CakeSlice className="h-4 w-4" /> : item.id.startsWith('task-') ? <Clock3 className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-secondary-700">{item.title}</span><span className="mt-2 flex items-center justify-between text-[9px] text-neutral-400"><span className="capitalize">{item.kind}</span><strong className={item.birthday ? 'text-pink-600' : ''}>{item.dateLabel || (item.date ? new Date(item.date).toLocaleDateString('en-GB') : 'Open')}</strong></span></span>
                </div>
              </button>
            )) : <div className="py-10 text-center"><CheckCircle2 className="mx-auto h-6 w-6 text-emerald-500" /><p className="mt-2 text-xs text-neutral-400">No active notices</p></div>}
          </div>
        </div>

        <div className="rounded-md border border-neutral-200 bg-white shadow-sm xl:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-4 py-3">
            <div className="flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" /><div><h2 className="text-sm font-bold text-secondary-700">Attendance Recognition</h2><p className="text-[9px] text-neutral-400">Calculated from this week's attendance</p></div></div>
            <label className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" /><input value={awardSearch} onChange={event => setAwardSearch(event.target.value)} placeholder="Search employee..." className="h-8 rounded-md border border-neutral-200 pl-8 pr-3 text-xs outline-none focus:border-primary" /></label>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead><tr className="border-b border-neutral-100 text-[9px] uppercase text-neutral-400"><th className="px-4 py-3">#</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Department</th><th className="px-4 py-3">Present Days</th><th className="px-4 py-3">Late Days</th></tr></thead>
              <tbody>{recognition.length ? recognition.map((item, index) => (
                <tr key={item.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50"><td className="px-4 py-3 font-bold text-neutral-400">{String(index + 1).padStart(2, '0')}</td><td className="px-4 py-3"><span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-full bg-secondary-700 text-[8px] font-bold text-white">{initials(item.name)}</span><strong className="text-secondary-700">{item.name}</strong></span></td><td className="px-4 py-3 text-neutral-500">{item.department || '—'}</td><td className="px-4 py-3 font-bold text-emerald-600">{item.present}</td><td className="px-4 py-3 font-bold text-amber-600">{item.late}</td></tr>
              )) : <tr><td colSpan="5" className="py-12 text-center text-neutral-400">No attendance data for this week</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-neutral-100 pt-3 text-[10px] text-neutral-400"><span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Live data · no static records</span><span>{user?.name || 'HR Dashboard'}</span></footer>
    </div>
  )
}
