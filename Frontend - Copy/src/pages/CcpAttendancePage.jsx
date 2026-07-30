import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, ClipboardPaste, Loader2, RefreshCw, Save, Search, X } from 'lucide-react'
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
  const [dirtyIds, setDirtyIds] = useState([])
  const [bulkSaving, setBulkSaving] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await attendanceService.getCcpDaily(date)
      const rows = response.data ?? []
      setEmployees(rows)
      setDirtyIds([])
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
    setDirtyIds(current => current.includes(employeeId) ? current : [...current, employeeId])
  }

  const parseTime = value => {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const serial = Number(raw)
    if (!Number.isNaN(serial) && serial >= 0 && serial < 1) {
      const minutes = Math.round(serial * 24 * 60) % (24 * 60)
      return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    }
    const match = raw.match(/^(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?$/i)
    if (!match) return ''
    let hour = Number(match[1])
    const minute = Number(match[2])
    const period = match[3]?.toUpperCase()
    if (period === 'PM' && hour < 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0
    if (hour > 23 || minute > 59) return ''
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  const parseStatus = value => {
    const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_')
    const aliases = { intervention: 'intervention', present: 'present', absent: 'absent', late: 'late', wfh: 'wfh', incomplete: 'incomplete', shortage: 'shortage' }
    return aliases[raw] || 'present'
  }

  const applyPaste = () => {
    let rows = pasteText.split(/\r?\n/).map(line => line.split('\t').map(cell => cell.trim())).filter(row => row.some(Boolean))
    if (!rows.length) return
    if (rows[0].some(cell => /employee|name|ibs|punch|check.?in/i.test(cell))) rows = rows.slice(1)

    const employeeByKey = new Map()
    employees.forEach(employee => {
      ;[employee.id, employee.ibs_code, employee.punch_code, employee.name].filter(Boolean)
        .forEach(key => employeeByKey.set(String(key).trim().toLowerCase(), employee))
    })
    const hasEmployeeColumn = rows.some(row => employeeByKey.has(String(row[0] ?? '').toLowerCase()))
    const changed = []
    const nextDrafts = { ...drafts }

    rows.forEach((cells, index) => {
      const employee = hasEmployeeColumn
        ? employeeByKey.get(String(cells[0] ?? '').toLowerCase())
        : filtered[index]
      if (!employee || employee.on_leave) return
      const offset = hasEmployeeColumn ? 1 : 0
      nextDrafts[employee.id] = {
        check_in: parseTime(cells[offset]),
        check_out: parseTime(cells[offset + 1]),
        status: parseStatus(cells[offset + 2]),
        notes: cells[offset + 3] || '',
      }
      changed.push(employee.id)
    })

    setDrafts(nextDrafts)
    setDirtyIds(current => [...new Set([...current, ...changed])])
    setMessage(`${changed.length} rows pasted. Review them, then click Save All.`)
    setPasteOpen(false)
    setPasteText('')
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
      setDirtyIds(current => current.filter(id => id !== employee.id))
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to save attendance.')
    } finally {
      setSavingId(null)
    }
  }

  const saveAll = async () => {
    if (!dirtyIds.length) return
    setBulkSaving(true)
    setError('')
    setMessage('')
    try {
      const result = await attendanceService.saveCcpDailyBulk({
        date,
        rows: dirtyIds.map(employeeId => ({ employee_id: employeeId, ...drafts[employeeId] })),
      })
      setMessage(result.message || `${dirtyIds.length} attendance records saved.`)
      await load()
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'Unable to save attendance.')
    } finally {
      setBulkSaving(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700">CCP Daily Attendance</h1>
          <p className="mt-0.5 text-sm text-neutral-400">CM Intervention and Mainline employees only</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPasteOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-bold text-neutral-600">
            <ClipboardPaste className="h-4 w-4" /> Paste from Excel
          </button>
          <button type="button" onClick={saveAll} disabled={!dirtyIds.length || bulkSaving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-white disabled:opacity-40">
            {bulkSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save All ({dirtyIds.length})
          </button>
          <button type="button" onClick={load} disabled={loading} title="Refresh" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-600 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {pasteOpen && (
        <div className="border border-blue-200 bg-blue-50 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-secondary-700">Paste rows from Excel</p>
              <p className="text-xs text-neutral-500">Use: Employee/IBS/Punch | Check In | Check Out | Status | Notes. You can also paste only Check In and Check Out in the same row order.</p>
            </div>
            <button type="button" onClick={() => setPasteOpen(false)} title="Close"><X className="h-4 w-4" /></button>
          </div>
          <textarea autoFocus value={pasteText} onChange={event => setPasteText(event.target.value)} rows={7} placeholder={'432558\t08:00\t17:00\tPresent\t\n1022\t08:10\t17:05\tLate\tTraffic'} className="w-full resize-y border border-blue-200 bg-white p-3 font-mono text-sm outline-none focus:border-primary" />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => setPasteOpen(false)} className="h-9 px-3 text-sm font-bold text-neutral-500">Cancel</button>
            <button type="button" onClick={applyPaste} disabled={!pasteText.trim()} className="h-9 bg-primary px-4 text-sm font-bold text-white disabled:opacity-40">Apply to Table</button>
          </div>
        </div>
      )}

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
