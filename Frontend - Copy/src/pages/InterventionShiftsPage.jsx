import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, CalendarOff, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
  Loader2, Moon, RefreshCw, Save, Search, Sparkles, Sun, Sunset, Users,
} from 'lucide-react'
import { attendanceService } from '../services/Attendanceservice'

const SHIFTS = {
  morning: { label: 'Morning', time: '06:30 - 15:30', chip: 'bg-amber-50 border-amber-300 text-amber-900', Icon: Sun },
  afternoon: { label: 'Afternoon', time: '15:00 - 00:00', chip: 'bg-orange-50 border-orange-300 text-orange-900', Icon: Sunset },
  night: { label: 'Night', time: '23:00 - 08:00', chip: 'bg-slate-800 border-slate-800 text-white', Icon: Moon },
}

const LEAVE_LABELS = {
  annual: 'Annual Leave', casual: 'Casual Leave', sick: 'Sick Leave', company_paid: 'Company Paid',
}

const dateKey = date => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const saturdayOf = value => {
  const date = value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : new Date()
  const distance = (date.getDay() + 1) % 7
  date.setDate(date.getDate() - distance)
  return dateKey(date)
}

const addDays = (value, amount) => {
  const date = new Date(`${value}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return dateKey(date)
}

const formatDay = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
const cellKey = (employeeId, date) => `${employeeId}:${date}`
const initials = name => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()
const AVATAR_COLORS = ['bg-primary', 'bg-cyan-700', 'bg-emerald-700', 'bg-orange-700', 'bg-violet-700', 'bg-rose-700', 'bg-indigo-700']

const shortTime = value => value ? String(value).slice(0, 5) : '--:--'

function EditableShift({ value, attendance, onChange }) {
  const shift = SHIFTS[value]
  const Icon = shift?.Icon
  return (
    <div className={`relative min-h-[62px] rounded-md border px-2.5 py-2 transition-all hover:-translate-y-px hover:shadow-sm ${shift ? shift.chip : 'border-dashed border-neutral-300 bg-white text-neutral-400 hover:border-primary/50'}`}>
      {shift ? (
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-bold"><Icon className="h-3 w-3" />{shift.label}</p>
          <p className={`mt-1 text-[9px] font-medium ${value === 'night' ? 'text-slate-300' : 'opacity-70'}`}>{shift.time}</p>
          {attendance && (
            <p className={`mt-1 border-t pt-1 text-[9px] font-bold ${value === 'night' ? 'border-slate-600 text-cyan-200' : 'border-current/15 text-primary'}`}>
              {shortTime(attendance.check_in)} - {shortTime(attendance.check_out)}
            </p>
          )}
        </>
      ) : null}
      {shift && <ChevronDown className={`absolute bottom-2 right-2 h-3 w-3 ${value === 'night' ? 'text-slate-300' : 'opacity-50'}`} />}
      <select value={value} onChange={event => onChange(event.target.value)} aria-label="Choose shift" className="absolute inset-0 h-full w-full cursor-pointer opacity-0">
        <option value="">Not planned</option>
        {Object.entries(SHIFTS).map(([key, item]) => <option key={key} value={key}>{item.label} · {item.time}</option>)}
      </select>
    </div>
  )
}

export default function InterventionShiftsPage() {
  const [weekStart, setWeekStart] = useState(() => saturdayOf())
  const [employees, setEmployees] = useState([])
  const [plans, setPlans] = useState({})
  const [leaves, setLeaves] = useState({})
  const [attendances, setAttendances] = useState({})
  const [draft, setDraft] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const response = await attendanceService.getInterventionShifts(weekStart)
      setWeekStart(response.week_start)
      setEmployees(response.employees || [])
      setPlans(Object.fromEntries((response.plans || []).map(plan => [cellKey(plan.employee_id, String(plan.shift_date).slice(0, 10)), plan.shift])))
      setLeaves(Object.fromEntries((response.leave_days || []).map(leave => [cellKey(leave.employee_id, leave.date), leave.leave_type])))
      setAttendances(Object.fromEntries((response.attendances || []).map(attendance => [cellKey(attendance.employee_id, String(attendance.date).slice(0, 10)), attendance])))
      setDraft({})
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load the Intervention shift plan.')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => { load() }, [load])

  const visibleEmployees = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return employees
    return employees.filter(employee => [employee.name, employee.arabic_name, employee.ibs_code, employee.position]
      .some(value => String(value || '').toLowerCase().includes(query)))
  }, [employees, search])

  const valueFor = (employeeId, date) => {
    const key = cellKey(employeeId, date)
    return Object.hasOwn(draft, key) ? draft[key] : (plans[key] || '')
  }

  const setShift = (employeeId, date, shift) => {
    setDraft(current => ({ ...current, [cellKey(employeeId, date)]: shift }))
    setMessage('')
  }

  const save = async () => {
    const rows = Object.entries(draft).map(([key, shift]) => {
      const [employeeId, date] = key.split(':')
      return { employee_id: Number(employeeId), date, shift: shift || null }
    })
    if (!rows.length) return
    setSaving(true)
    setError('')
    try {
      const response = await attendanceService.saveInterventionShifts({ week_start: weekStart, rows })
      await load()
      setMessage(response.message || 'Weekly plan saved.')
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not save the weekly plan.')
    } finally {
      setSaving(false)
    }
  }

  const counts = useMemo(() => {
    const result = Object.fromEntries(days.map(day => [day, { morning: 0, afternoon: 0, night: 0, off: 0, leave: 0 }]))
    employees.forEach(employee => days.forEach(day => {
      const leave = leaves[cellKey(employee.id, day)]
      if (leave) result[day].leave++
      else if (Number(employee.weekly_off_day) === new Date(`${day}T12:00:00`).getDay()) result[day].off++
      else {
        const shift = valueFor(employee.id, day)
        if (shift) result[day][shift]++
      }
    }))
    return result
  }, [days, employees, leaves, plans, draft])

  const isCurrentWeek = weekStart === saturdayOf()
  const isNextWeek = weekStart === addDays(saturdayOf(), 7)
  const today = dateKey(new Date())
  const totals = useMemo(() => days.reduce((summary, day) => ({
    morning: summary.morning + counts[day].morning,
    afternoon: summary.afternoon + counts[day].afternoon,
    night: summary.night + counts[day].night,
    off: summary.off + counts[day].off,
    leave: summary.leave + counts[day].leave,
  }), { morning: 0, afternoon: 0, night: 0, off: 0, leave: 0 }), [counts, days])
  const lastUpdated = useMemo(() => {
    const values = Object.values(plans)
    return values.length ? 'Saved plan' : 'No saved assignments yet'
  }, [plans])

  return (
    <div className="pb-8">
      <section className="flex flex-col gap-4 border-b border-neutral-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-secondary-700">Intervention Shift Plan</h1>
            <p className="mt-0.5 text-xs text-neutral-400">Weekly roster · Saturday to Friday · <strong className="text-secondary-600">{employees.length} employees</strong></p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-neutral-200 bg-white">
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="grid h-9 w-9 place-items-center border-r border-neutral-200 text-neutral-500 hover:bg-neutral-50" title="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setWeekStart(saturdayOf())} className={`h-9 border-r border-neutral-200 px-3 text-xs font-bold ${isCurrentWeek ? 'bg-primary text-white' : 'text-secondary-600 hover:bg-neutral-50'}`}>This Week</button>
            <button type="button" onClick={() => setWeekStart(addDays(saturdayOf(), 7))} className={`h-9 border-r border-neutral-200 px-3 text-xs font-bold ${isNextWeek ? 'bg-primary text-white' : 'text-secondary-600 hover:bg-neutral-50'}`}>Next Week</button>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="grid h-9 w-9 place-items-center text-neutral-500 hover:bg-neutral-50" title="Next week"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={load} disabled={loading} className="grid h-9 w-9 place-items-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={save} disabled={saving || !Object.keys(draft).length} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white hover:bg-primary/90 disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Plan <span className="opacity-80">({Object.keys(draft).length})</span>
          </button>
        </div>
      </section>

      <section className="mt-4 flex flex-col gap-3 rounded-md border border-neutral-200 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee, IBS or position..." className="h-9 w-full rounded-md border border-neutral-200 pl-9 pr-3 text-xs outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
          {Object.entries(SHIFTS).map(([key, shift]) => <span key={key} className={`rounded border px-2 py-1 ${shift.chip}`}>{shift.label} <span className="opacity-65">{shift.time}</span></span>)}
          <span className="rounded border border-slate-300 bg-slate-100 px-2 py-1 text-slate-600">Day Off</span>
          <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Approved Leave</span>
        </div>
      </section>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {message && <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-700">{message}</div>}

      <section className="mt-4 overflow-hidden rounded-md border border-neutral-200 bg-white shadow-sm">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full min-w-[1340px] border-collapse text-xs">
            <thead className="sticky top-0 z-30">
              <tr className="border-b border-neutral-200 bg-neutral-50 text-secondary-700">
                <th className="sticky left-0 z-40 w-[270px] min-w-[270px] border-r border-neutral-200 bg-neutral-50 px-4 py-3 text-left">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Employee</span>
                </th>
                {days.map(day => {
                  const [dow, ...dateParts] = formatDay(day).split(' ')
                  const isToday = day === today
                  return (
                    <th key={day} className={`min-w-[150px] border-r border-neutral-200 px-3 py-2 text-left last:border-r-0 ${isToday ? 'bg-primary/[0.06]' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-primary' : 'text-secondary-600'}`}>{dow}</span>
                        {isToday && <span className="rounded bg-primary px-1.5 py-0.5 text-[8px] font-bold text-white">TODAY</span>}
                      </div>
                      <p className="mt-0.5 text-[11px] font-medium text-neutral-500">{dateParts.join(' ')}</p>
                      <div className="mt-2 flex gap-1 text-[8px] font-bold">
                        <span className="rounded bg-amber-100 px-1 py-0.5 text-amber-800">M <strong>{counts[day].morning}</strong></span>
                        <span className="rounded bg-orange-100 px-1 py-0.5 text-orange-800">A <strong>{counts[day].afternoon}</strong></span>
                        <span className="rounded bg-slate-200 px-1 py-0.5 text-slate-700">N <strong>{counts[day].night}</strong></span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="h-52 text-center text-neutral-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading weekly plan...</td></tr>
              ) : visibleEmployees.map((employee, rowIndex) => (
                <tr key={employee.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60">
                  <td className="sticky left-0 z-20 border-r border-neutral-200 bg-white px-4 py-2.5 group-hover:bg-neutral-50">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${AVATAR_COLORS[rowIndex % AVATAR_COLORS.length]}`}>{initials(employee.name)}</span>
                      <div className="min-w-0">
                        <p className="truncate font-bold text-secondary-700" title={employee.name}>{employee.name}</p>
                        <p className="mt-0.5 truncate text-[9px] text-neutral-400">{employee.position} · {employee.work_location || 'No location'}</p>
                      </div>
                    </div>
                  </td>
                  {days.map(day => {
                    const key = cellKey(employee.id, day)
                    const leaveType = leaves[key]
                    const isOff = Number(employee.weekly_off_day) === new Date(`${day}T12:00:00`).getDay()
                    const shift = valueFor(employee.id, day)
                    const isToday = day === today
                    return (
                      <td key={day} className={`border-r border-neutral-100 px-2 py-2 last:border-r-0 ${isToday ? 'bg-primary/[0.025]' : ''}`}>
                        {leaveType ? (
                          <div className={`min-h-[62px] rounded-md border px-2.5 py-2 ${leaveType === 'annual' ? 'border-violet-300 bg-violet-50 text-violet-800' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
                            <p className="flex items-center gap-1.5 text-[10px] font-bold">{leaveType === 'annual' ? <Sparkles className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{LEAVE_LABELS[leaveType] || 'Approved Leave'}</p>
                            <p className="mt-1 text-[9px] opacity-65">{isOff ? 'Also scheduled off' : 'Approved request'}</p>
                          </div>
                        ) : isOff ? (
                          <div className="min-h-[62px] rounded-md border border-slate-300 bg-slate-100 px-2.5 py-2 text-slate-600">
                            <p className="flex items-center gap-1.5 text-[10px] font-bold"><CalendarOff className="h-3 w-3" />Day Off</p>
                            <p className="mt-1 text-[9px] opacity-65">Weekly rest day</p>
                          </div>
                        ) : <EditableShift value={shift} attendance={attendances[key]} onChange={value => setShift(employee.id, day, value)} />}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && !visibleEmployees.length && <div className="py-14 text-center text-xs text-neutral-400">No matching Intervention employees.</div>}
        </div>
        <footer className="flex flex-col gap-2 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-[10px] text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span><strong className="text-secondary-700">{visibleEmployees.length}</strong> employees</span><span>·</span>
            <span>Morning <strong className="text-amber-700">{totals.morning}</strong></span><span>·</span>
            <span>Afternoon <strong className="text-orange-700">{totals.afternoon}</strong></span><span>·</span>
            <span>Night <strong className="text-slate-700">{totals.night}</strong></span><span>·</span>
            <span>Day Off <strong className="text-secondary-700">{totals.off}</strong></span><span>·</span>
            <span>Leave <strong className="text-emerald-700">{totals.leave}</strong></span>
          </div>
          <span>{lastUpdated}</span>
        </footer>
      </section>
    </div>
  )
}
