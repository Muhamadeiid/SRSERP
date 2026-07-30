import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Loader2, RefreshCw, Save, Search } from 'lucide-react'
import { attendanceService } from '../services/Attendanceservice'

const today = () => new Date().toISOString().slice(0, 10)
const timeValue = value => value ? String(value).slice(0, 5) : ''

export default function CcpAttendancePage() {
  const [date, setDate] = useState(today())
  const [employees, setEmployees] = useState([])
  const [drafts, setDrafts] = useState({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await attendanceService.getCcpDaily(date)
      const rows = response.data ?? []
      setEmployees(rows)
      setDrafts(Object.fromEntries(rows.map(employee => {
        const record = employee.attendance
        return [employee.id, {
          check_in: timeValue(record?.check_in),
          check_out: timeValue(record?.check_out),
          status: record?.status || 'present',
          notes: record?.notes || '',
        }]
      })))
    } catch (requestError) {
      setEmployees([])
      setError(requestError?.response?.data?.message || 'Unable to load CCP attendance.')
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return employees
    return employees.filter(employee => [
      employee.name,
      employee.arabic_name,
      employee.ibs_code,
      employee.position,
      employee.department,
      employee.work_location,
    ].some(value => String(value ?? '').toLowerCase().includes(query)))
  }, [employees, search])

  const updateDraft = (employeeId, key, value) => {
    setDrafts(current => ({
      ...current,
      [employeeId]: { ...current[employeeId], [key]: value },
    }))
  }

  const save = async employee => {
    setSavingId(employee.id)
    setError('')
    setMessage('')
    try {
      await attendanceService.saveCcpDaily({
        employee_id: employee.id,
        date,
        ...drafts[employee.id],
      })
      setMessage(`${employee.name} saved successfully.`)
      await load()
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to save attendance.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700">CCP Daily Attendance</h1>
          <p className="mt-0.5 text-sm text-neutral-400">CM Intervention and Mainline employees only</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-y border-neutral-200 bg-white px-4 py-3">
        <label className="flex items-center gap-2 text-sm font-bold text-secondary-700">
          <CalendarDays className="h-4 w-4 text-primary" />
          <input
            type="date"
            value={date}
            onChange={event => setDate(event.target.value)}
            className="h-9 rounded-lg border border-neutral-200 px-3 font-semibold outline-none focus:border-primary"
          />
        </label>
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search employee..."
            className="h-9 w-full rounded-lg border border-neutral-200 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        <span className="text-xs font-bold text-neutral-400">{filtered.length} employees</span>
      </div>

      {error && <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">{error}</div>}
      {message && <div className="flex items-center gap-2 border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-700"><Check className="h-4 w-4" />{message}</div>}

      <div className="overflow-x-auto border border-neutral-200 bg-white">
        <table className="w-full min-w-[980px] table-fixed text-sm">
          <thead className="bg-neutral-50 text-[11px] uppercase text-neutral-500">
            <tr>
              <th className="w-[270px] px-4 py-3 text-left">Employee</th>
              <th className="w-[150px] px-3 py-3 text-left">Location</th>
              <th className="w-[130px] px-3 py-3 text-left">Check In</th>
              <th className="w-[130px] px-3 py-3 text-left">Check Out</th>
              <th className="w-[160px] px-3 py-3 text-left">Status</th>
              <th className="px-3 py-3 text-left">Notes</th>
              <th className="w-[70px] px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map(employee => {
              const draft = drafts[employee.id] ?? {}
              const disabled = employee.on_leave || savingId === employee.id
              return (
                <tr key={employee.id} className={employee.on_leave ? 'bg-violet-50/60' : 'hover:bg-neutral-50'}>
                  <td className="px-4 py-3">
                    <p className="truncate font-bold text-secondary-700">{employee.name}</p>
                    <p className="truncate text-xs text-neutral-400">{employee.position} · {employee.department}</p>
                  </td>
                  <td className="px-3 py-3 font-semibold text-neutral-600">{employee.work_location || '-'}</td>
                  <td className="px-3 py-3"><input type="time" value={draft.check_in || ''} disabled={disabled} onChange={e => updateDraft(employee.id, 'check_in', e.target.value)} className="h-9 w-full rounded border border-neutral-200 px-2 disabled:bg-neutral-100" /></td>
                  <td className="px-3 py-3"><input type="time" value={draft.check_out || ''} disabled={disabled} onChange={e => updateDraft(employee.id, 'check_out', e.target.value)} className="h-9 w-full rounded border border-neutral-200 px-2 disabled:bg-neutral-100" /></td>
                  <td className="px-3 py-3">
                    {employee.on_leave ? (
                      <span className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-700">On Leave</span>
                    ) : (
                      <select value={draft.status || 'present'} onChange={e => updateDraft(employee.id, 'status', e.target.value)} className="h-9 w-full rounded border border-neutral-200 bg-white px-2">
                        <option value="present">Present</option>
                        <option value="absent">Absent</option>
                        <option value="late">Late</option>
                        <option value="intervention">Intervention</option>
                        <option value="wfh">WFH</option>
                        <option value="incomplete">Incomplete</option>
                        <option value="shortage">Shortage</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-3"><input value={draft.notes || ''} disabled={disabled} onChange={e => updateDraft(employee.id, 'notes', e.target.value)} placeholder="Optional" className="h-9 w-full rounded border border-neutral-200 px-2 disabled:bg-neutral-100" /></td>
                  <td className="px-3 py-3 text-center">
                    <button type="button" onClick={() => save(employee)} disabled={disabled} title="Save attendance" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white disabled:opacity-30">
                      {savingId === employee.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && filtered.length === 0 && <div className="py-16 text-center text-sm font-semibold text-neutral-400">No eligible employees found.</div>}
        {loading && <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>}
      </div>
    </div>
  )
}
