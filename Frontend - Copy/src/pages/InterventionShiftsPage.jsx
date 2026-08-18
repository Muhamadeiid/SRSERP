import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, RefreshCw, Save, Search, Users } from 'lucide-react'
import { attendanceService } from '../services/Attendanceservice'

const SHIFTS = {
  morning: { label: 'Morning', time: '06:30 - 15:30', chip: 'bg-sky-50 border-sky-200 text-sky-800' },
  afternoon: { label: 'Afternoon', time: '15:00 - 00:00', chip: 'bg-amber-50 border-amber-200 text-amber-800' },
  night: { label: 'Night', time: '23:00 - 08:00', chip: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
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

export default function InterventionShiftsPage() {
  const [weekStart, setWeekStart] = useState(() => saturdayOf())
  const [employees, setEmployees] = useState([])
  const [plans, setPlans] = useState({})
  const [leaves, setLeaves] = useState({})
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

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold text-secondary-700">Intervention Shift Plan</h1>
          </div>
          <p className="mt-1 text-xs text-neutral-400">Weekly roster · Saturday to Friday · {employees.length} employees</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="h-9 w-9 rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50" title="Previous week"><ChevronLeft className="mx-auto h-4 w-4" /></button>
          <button type="button" onClick={() => setWeekStart(saturdayOf())} className={`h-9 rounded-md border px-3 text-xs font-bold ${isCurrentWeek ? 'border-primary bg-primary text-white' : 'border-neutral-200 bg-white text-secondary-600'}`}>This Week</button>
          <button type="button" onClick={() => setWeekStart(addDays(saturdayOf(), 7))} className={`h-9 rounded-md border px-3 text-xs font-bold ${isNextWeek ? 'border-primary bg-primary text-white' : 'border-neutral-200 bg-white text-secondary-600'}`}>Next Week</button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="h-9 w-9 rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50" title="Next week"><ChevronRight className="mx-auto h-4 w-4" /></button>
          <button type="button" onClick={load} disabled={loading} className="h-9 w-9 rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"><RefreshCw className={`mx-auto h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={save} disabled={saving || !Object.keys(draft).length} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-bold text-white disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Plan ({Object.keys(draft).length})
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-y border-neutral-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search employee, IBS or position..." className="h-9 w-full rounded-md border border-neutral-200 pl-9 pr-3 text-xs outline-none focus:border-primary" />
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-semibold">
          {Object.entries(SHIFTS).map(([key, shift]) => <span key={key} className={`rounded border px-2 py-1 ${shift.chip}`}>{shift.label} · {shift.time}</span>)}
          <span className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-neutral-600">Day Off</span>
          <span className="rounded border border-violet-200 bg-violet-50 px-2 py-1 text-violet-700">Approved Leave</span>
        </div>
      </div>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>}
      {message && <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-700">{message}</div>}

      <div className="overflow-hidden border border-neutral-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50 text-secondary-700">
                <th className="sticky left-0 z-20 min-w-[240px] border-r border-neutral-200 bg-neutral-50 px-4 py-3 text-left">
                  <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Employee</span>
                </th>
                {days.map(day => (
                  <th key={day} className="min-w-[150px] border-r border-neutral-200 px-2 py-2 text-left last:border-r-0">
                    <p className="font-bold">{formatDay(day)}</p>
                    <p className="mt-1 font-normal text-[9px] text-neutral-400">M {counts[day].morning} · A {counts[day].afternoon} · N {counts[day].night}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="8" className="h-52 text-center text-neutral-400"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading weekly plan...</td></tr>
              ) : visibleEmployees.map((employee, rowIndex) => (
                <tr key={employee.id} className={`border-b border-neutral-100 last:border-0 ${rowIndex % 2 ? 'bg-neutral-50/40' : 'bg-white'}`}>
                  <td className={`sticky left-0 z-10 border-r border-neutral-200 px-4 py-2.5 ${rowIndex % 2 ? 'bg-[#fafafa]' : 'bg-white'}`}>
                    <p className="font-bold text-secondary-700">{employee.name}</p>
                    <p className="mt-0.5 truncate text-[10px] text-neutral-400">{employee.position} · {employee.work_location || 'No location'}</p>
                  </td>
                  {days.map(day => {
                    const key = cellKey(employee.id, day)
                    const leaveType = leaves[key]
                    const isOff = Number(employee.weekly_off_day) === new Date(`${day}T12:00:00`).getDay()
                    const shift = valueFor(employee.id, day)
                    if (leaveType) return (
                      <td key={day} className="border-r border-neutral-100 bg-violet-50 px-2 py-2 align-middle last:border-r-0">
                        <div className="rounded border border-violet-200 bg-white/70 px-2 py-2 text-violet-700">
                          <p className="font-bold">{LEAVE_LABELS[leaveType] || 'Approved Leave'}</p>
                          {isOff && <p className="mt-0.5 text-[9px] text-neutral-500">Scheduled Day Off</p>}
                        </div>
                      </td>
                    )
                    if (isOff) return (
                      <td key={day} className="border-r border-neutral-200 bg-neutral-100 px-2 py-2 align-middle last:border-r-0">
                        <div className="rounded border border-neutral-300 bg-neutral-200/60 px-2 py-2 text-neutral-600"><p className="font-bold">Day Off</p><p className="mt-0.5 text-[9px]">Weekly rest day</p></div>
                      </td>
                    )
                    return (
                      <td key={day} className="border-r border-neutral-100 px-2 py-2 last:border-r-0">
                        <select value={shift} onChange={event => setShift(employee.id, day, event.target.value)} className={`h-12 w-full rounded border px-2 text-[10px] font-semibold outline-none focus:border-primary ${shift ? SHIFTS[shift].chip : 'border-dashed border-neutral-300 bg-white text-neutral-400'}`}>
                          <option value="">Not planned</option>
                          {Object.entries(SHIFTS).map(([value, item]) => <option key={value} value={value}>{item.label} · {item.time}</option>)}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !visibleEmployees.length && <div className="py-14 text-center text-xs text-neutral-400">No matching Intervention employees.</div>}
      </div>
    </div>
  )
}
