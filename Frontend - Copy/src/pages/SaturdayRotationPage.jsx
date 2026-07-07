import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Printer, RefreshCw, Search, Users } from 'lucide-react'
import { bulkUpdateSaturdayGroup, getEmployees } from '../services/employeeService'
import { getSettings } from '../services/settingsService'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const TEAM_STYLE = {
  A: {
    label: 'Team A',
    header: 'bg-[#11aee3] text-white',
    cardHead: 'bg-[#10aee0] text-black',
    panel: 'border-[#0d8fc0]',
    dateBand: 'bg-[#11aee3] text-black',
  },
  B: {
    label: 'Team B',
    header: 'bg-[#c24f4b] text-white',
    cardHead: 'bg-[#c24f4b] text-black',
    panel: 'border-[#9f3430]',
    dateBand: 'bg-[#c24f4b] text-black',
  },
}

const DEFAULT_POLICY = {
  attendance_saturday_rotation_enabled: '1',
  attendance_group_a_off_even_week: '1',
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())
}

function saturdaysForMonth(year, month) {
  const dates = []
  const cursor = new Date(year, month, 1)
  while (cursor.getMonth() === month) {
    if (cursor.getDay() === 6) dates.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function formatSaturday(date) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function splitSchedule(year, month, team, policy) {
  const enabled = isTruthy(policy.attendance_saturday_rotation_enabled)
  const groupAOffEven = isTruthy(policy.attendance_group_a_off_even_week)
  const days = saturdaysForMonth(year, month)

  return days.reduce((acc, date) => {
    const even = isoWeek(date) % 2 === 0
    const aOff = enabled && even === groupAOffEven
    const isOff = team === 'A' ? aOff : !aOff
    acc[isOff ? 'off' : 'working'].push(date)
    return acc
  }, { off: [], working: [] })
}

function offTeamForSaturday(date, policy) {
  if (!date || !isTruthy(policy.attendance_saturday_rotation_enabled)) return null
  const even = isoWeek(date) % 2 === 0
  const groupAOffEven = isTruthy(policy.attendance_group_a_off_even_week)
  return even === groupAOffEven ? 'A' : 'B'
}

function clean(value, fallback = 'Unassigned') {
  return String(value ?? '').trim() || fallback
}

function titleCase(value) {
  return clean(value, 'Other')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function twoPartName(value) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, 2).join(' ') || 'Unnamed'
}

function sectionFor(emp) {
  const position = clean(emp.position, '').toLowerCase()
  const location = clean(emp.work_location, '').toLowerCase()
  const department = clean(emp.department, '').toLowerCase()
  const roleText = `${position} ${department}`

  const isFieldTechnician = /technician|worker|supervisor|store\s*keeper|storekeeper/.test(roleText)
  const isWhiteCollar = /head|manager|engineer|officer|admin|document|procurement|material|safety|pm|hr/.test(roleText)

  if (isWhiteCollar && !isFieldTechnician) {
    return 'Office / Engineers'
  }
  if (isFieldTechnician && (location.includes('tura') || location.includes('tora'))) return 'Tura Technician'
  if (isFieldTechnician && (location.includes('kozzika') || location.includes('kozz'))) return 'Kozzika Technician'
  if (department.includes('intervention')) return 'Intervention'
  if (isWhiteCollar) return 'Office / Engineers'
  return 'Other Technicians'
}

function roleLabel(emp) {
  const position = clean(emp.position, '')
  if (position) return position
  return titleCase(emp.department)
}

function groupEmployees(employees) {
  const sections = {}
  for (const emp of employees) {
    const section = sectionFor(emp)
    const role = roleLabel(emp)
    sections[section] ??= {}
    sections[section][role] ??= []
    sections[section][role].push(emp)
  }
  return sections
}

function RoleCard({ role, people, team, selectedIds, onToggle }) {
  const style = TEAM_STYLE[team]
  return (
    <div className="border border-neutral-500 bg-white min-h-[68px]">
      <div className={`${style.cardHead} px-2 py-1 text-center text-[11px] font-semibold leading-tight border-b border-neutral-500`}>
        {role}
      </div>
      <div className="px-2 py-2 text-center text-[11px] leading-snug">
        {people.map(p => (
          <div key={p.id} className={`rounded px-1 py-0.5 ${selectedIds.includes(p.id) ? 'bg-black/5' : ''}`}>
            <span title={p.name}>{twoPartName(p.name)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SectionBlock({ title, grouped, team, selectedIds, onToggle }) {
  const roles = Object.entries(grouped ?? {}).sort(([a], [b]) => a.localeCompare(b))
  if (roles.length === 0) return null

  return (
    <section className="space-y-2">
      {title !== 'Office / Engineers' && (
        <h3 className="mx-auto w-full max-w-[420px] border-[3px] border-black bg-white py-1 text-center text-2xl font-black leading-tight">
          {title}
        </h3>
      )}
      <div className={`grid gap-2 ${title === 'Office / Engineers' ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'}`}>
        {roles.map(([role, people]) => (
          <RoleCard key={role} role={role} people={people} team={team} selectedIds={selectedIds} onToggle={onToggle} />
        ))}
      </div>
    </section>
  )
}

function DatesBox({ team, schedule, year, month }) {
  const style = TEAM_STYLE[team]
  return (
    <div className="border border-neutral-500 text-center text-base leading-relaxed">
      <div className={`${style.dateBand} px-3 py-2`}>
        <p>Off Saturday during {MONTHS[month]} {year}</p>
        {schedule.off.length > 0 ? schedule.off.map(d => (
          <p key={d.toISOString()}>- {formatSaturday(d)}</p>
        )) : <p>- No off Saturdays</p>}
      </div>
      <div className="bg-white px-3 py-2">
        <p>Working Saturday during {MONTHS[month]} {year}</p>
        {schedule.working.length > 0 ? schedule.working.map(d => (
          <p key={d.toISOString()}>- {formatSaturday(d)}</p>
        )) : <p>- No working Saturdays</p>}
      </div>
    </div>
  )
}

function TeamPanel({ team, employees, year, month, policy, selectedIds, onToggle }) {
  const style = TEAM_STYLE[team]
  const sections = groupEmployees(employees)
  const schedule = splitSchedule(year, month, team, policy)
  const orderedSections = ['Office / Engineers', 'Tura Technician', 'Kozzika Technician', 'Intervention', 'Other Technicians']

  return (
    <div className="space-y-3">
      <div className={`border-[3px] ${style.panel}`}>
        <div className={`${style.header} py-1 text-center text-2xl font-black`}>
          {style.label}
        </div>
      </div>
      <div className="space-y-3">
        {orderedSections.map(section => (
          <SectionBlock key={section} title={section} grouped={sections[section]} team={team} selectedIds={selectedIds} onToggle={onToggle} />
        ))}
        {employees.length === 0 && (
          <div className="border border-dashed border-neutral-300 bg-white py-10 text-center text-sm text-neutral-400">
            No employees assigned to Group {team}
          </div>
        )}
      </div>
      <DatesBox team={team} schedule={schedule} year={year} month={month} />
    </div>
  )
}

function EmployeeMiniList({ title, employees, tone = 'neutral' }) {
  const tones = {
    blue: 'border-[#11aee3] bg-[#e7f7fc]',
    red: 'border-[#c24f4b] bg-[#fff0ef]',
    amber: 'border-amber-200 bg-amber-50',
    neutral: 'border-neutral-200 bg-white',
  }
  return (
    <div className={`rounded-xl border ${tones[tone]} p-3`}>
      <p className="text-xs font-black uppercase tracking-wide text-secondary-700 mb-2">{title}</p>
      <div className="max-h-44 overflow-y-auto space-y-1">
        {employees.length ? employees.map(emp => (
          <div key={emp.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5 text-xs">
            <span className="font-semibold text-secondary-700 truncate">{emp.name}</span>
            <span className="text-neutral-400 shrink-0">{emp.saturday_group ? `Group ${emp.saturday_group}` : 'Not set'}</span>
          </div>
        )) : (
          <p className="text-xs text-neutral-400 py-2">No employees</p>
        )}
      </div>
    </div>
  )
}

export default function SaturdayRotationPage() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [employees, setEmployees] = useState([])
  const [policy, setPolicy] = useState(DEFAULT_POLICY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [assigning, setAssigning] = useState(false)
  const [selectedSaturdayIndex, setSelectedSaturdayIndex] = useState(0)
  const [employeeSearch, setEmployeeSearch] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [empRes, settingsRes] = await Promise.all([
        getEmployees({ view: 'active', per_page: 500 }),
        getSettings(),
      ])
      setEmployees(empRes.data ?? [])
      setPolicy({ ...DEFAULT_POLICY, ...(settingsRes.data ?? {}) })
      setSelectedIds([])
    } catch (e) {
      setError(e.message || 'Unable to load Saturday rotation plan')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const grouped = useMemo(() => ({
    A: employees.filter(emp => emp.saturday_group === 'A'),
    B: employees.filter(emp => emp.saturday_group === 'B'),
    unset: employees.filter(emp => !emp.saturday_group),
  }), [employees])

  const searchResults = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase()
    if (!query) return []

    return employees
      .filter(emp => [
        emp.name,
        emp.arabic_name,
        emp.ibs_code,
        emp.punch_code,
        emp.position,
        emp.department,
        emp.work_location,
      ].some(value => String(value ?? '').toLowerCase().includes(query)))
      .sort((a, b) => {
        const aName = String(a.name ?? '').toLowerCase()
        const bName = String(b.name ?? '').toLowerCase()
        const aStarts = aName.startsWith(query) ? 0 : 1
        const bStarts = bName.startsWith(query) ? 0 : 1
        return aStarts - bStarts || aName.localeCompare(bName)
      })
      .slice(0, 24)
  }, [employees, employeeSearch])

  const monthSaturdays = useMemo(() => saturdaysForMonth(year, month), [year, month])
  const selectedSaturday = monthSaturdays[Math.min(selectedSaturdayIndex, Math.max(0, monthSaturdays.length - 1))] ?? null
  const offTeam = offTeamForSaturday(selectedSaturday, policy)
  const workingTeam = offTeam === 'A' ? 'B' : offTeam === 'B' ? 'A' : null
  const offEmployees = offTeam ? grouped[offTeam] : []
  const workingEmployees = workingTeam ? grouped[workingTeam] : []

  const toggleSelected = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const assignSelected = async (group) => {
    if (!selectedIds.length) return
    setAssigning(true)
    setError('')
    try {
      const res = await bulkUpdateSaturdayGroup(selectedIds, group)
      const updated = res.data ?? []
      const byId = Object.fromEntries(updated.map(emp => [emp.id, emp]))
      setEmployees(prev => prev.map(emp => byId[emp.id] ? { ...emp, ...byId[emp.id] } : emp))
      setSelectedIds([])
    } catch (e) {
      setError(e.message || 'Unable to assign Saturday group')
    } finally {
      setAssigning(false)
    }
  }

  const prevMonth = () => {
    setSelectedSaturdayIndex(0)
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    setSelectedSaturdayIndex(0)
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const printPlan = () => {
    const plan = document.querySelector('.saturday-plan-print')
    if (!plan) {
      window.print()
      return
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=800')
    if (!printWindow) {
      window.print()
      return
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map(node => node.outerHTML)
      .join('\n')

    printWindow.document.write(`<!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Saturday Rotation Plan</title>
          ${styles}
          <style>
            @page { size: A4 landscape; margin: 5mm; }
            * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            html, body { margin: 0; background: #fff; }
            .saturday-plan-print { width: 287mm; overflow: visible; border: 0 !important; background: #fff; }
            .saturday-plan-sheet { width: 287mm !important; min-width: 0 !important; padding: 0 !important; font-size: 9pt !important; }
          </style>
        </head>
        <body>
          <div class="saturday-plan-print">${plan.innerHTML}</div>
        </body>
      </html>`)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  return (
    <div className="saturday-rotation-page p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700">Saturday Rotation Plan</h1>
          <p className="text-sm text-neutral-400 mt-0.5">Grouped from Workforce Saturday Group A/B</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="h-9 px-4 rounded-lg bg-white border border-neutral-200 flex items-center gap-2 text-sm font-bold text-secondary-700">
            <CalendarDays className="w-4 h-4 text-primary" />
            {MONTHS[month]} {year}
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={load} disabled={loading} className="p-2 rounded-lg bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
          <button onClick={printPlan} className="p-2 rounded-lg bg-secondary-700 text-white hover:bg-secondary-800">
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 print:hidden">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_1.2fr] gap-4 print:hidden">
        <div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-secondary-700">Assign Saturday Group</p>
              <p className="text-xs text-neutral-400">Search, select employees, then assign A/B.</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              {selectedIds.length} selected
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => assignSelected('A')}
              disabled={!selectedIds.length || assigning}
              className="px-4 py-2 rounded-lg bg-[#11aee3] text-white text-sm font-bold disabled:opacity-40"
            >
              {assigning ? 'Saving...' : 'Assign Group A'}
            </button>
            <button
              onClick={() => assignSelected('B')}
              disabled={!selectedIds.length || assigning}
              className="px-4 py-2 rounded-lg bg-[#c24f4b] text-white text-sm font-bold disabled:opacity-40"
            >
              {assigning ? 'Saving...' : 'Assign Group B'}
            </button>
            <button
              onClick={() => setSelectedIds([])}
              disabled={!selectedIds.length || assigning}
              className="px-4 py-2 rounded-lg bg-neutral-100 text-neutral-500 text-sm font-bold disabled:opacity-40"
            >
              Clear
            </button>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                placeholder="Search employee name, code, role..."
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm font-semibold text-secondary-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>
            {employeeSearch.trim() && (
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-secondary-700">Search results</p>
                  <p className="text-[11px] font-semibold text-neutral-400">{searchResults.length} shown</p>
                </div>
                <div className="grid max-h-52 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {searchResults.map(emp => (
                    <label
                      key={emp.id}
                      className={`flex items-center gap-2 rounded-md bg-white px-2 py-2 text-xs shadow-sm ${selectedIds.includes(emp.id) ? 'ring-1 ring-primary' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(emp.id)}
                        onChange={() => toggleSelected(emp.id)}
                        className="h-3.5 w-3.5 rounded border-neutral-300"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-secondary-700">{emp.name}</span>
                        <span className="block truncate text-[11px] font-medium text-neutral-400">
                          {[emp.position, emp.department].filter(Boolean).join(' - ') || 'No role data'}
                        </span>
                      </span>
                      <span className="shrink-0 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-black text-neutral-500">
                        {emp.saturday_group ? `Group ${emp.saturday_group}` : 'Not set'}
                      </span>
                    </label>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="col-span-full py-3 text-center text-xs font-semibold text-neutral-400">No employees found</p>
                  )}
                </div>
              </div>
            )}
          </div>
          {grouped.unset.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-700 mb-2">{grouped.unset.length} not assigned</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
                {grouped.unset.map(emp => (
                  <label key={emp.id} className={`flex items-center gap-2 rounded-md bg-white/70 px-2 py-1.5 text-xs ${selectedIds.includes(emp.id) ? 'ring-1 ring-amber-400' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(emp.id)}
                      onChange={() => toggleSelected(emp.id)}
                      className="h-3.5 w-3.5 rounded border-neutral-300"
                    />
                    <span className="font-semibold text-secondary-700 truncate">{emp.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1">
              <p className="text-sm font-black text-secondary-700">Who is off?</p>
              <p className="text-xs text-neutral-400">Attendance uses the same Group A/B assignments from this page.</p>
            </div>
            <select
              value={selectedSaturdayIndex}
              onChange={e => setSelectedSaturdayIndex(Number(e.target.value))}
              className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-secondary-700 outline-none focus:border-primary"
            >
              {monthSaturdays.map((date, index) => (
                <option key={date.toISOString()} value={index}>{formatSaturday(date)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EmployeeMiniList
              title={offTeam ? `Off - Group ${offTeam}` : 'Off'}
              employees={offEmployees}
              tone={offTeam === 'A' ? 'blue' : 'red'}
            />
            <EmployeeMiniList
              title={workingTeam ? `Working - Group ${workingTeam}` : 'Working'}
              employees={workingEmployees}
              tone={workingTeam === 'A' ? 'blue' : 'red'}
            />
          </div>
          {grouped.unset.length > 0 && (
            <EmployeeMiniList title="Not assigned, Attendance treats them as off on Saturdays" employees={grouped.unset} tone="amber" />
          )}
        </div>
      </div>

      <div className="saturday-plan-print bg-white border border-neutral-200 overflow-x-auto print:border-0">
        <div className="saturday-plan-sheet min-w-[1120px] p-4 font-sans text-black">
          <div className="mx-auto mb-1 w-[610px] border border-black py-1 text-center text-3xl leading-tight">
            CML1 Saturday Rotation Plan - {MONTHS[month]}
          </div>

          <div className="grid grid-cols-[1fr_70px_1fr] gap-6">
            <TeamPanel
              team="A"
              employees={grouped.A}
              year={year}
              month={month}
              policy={policy}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
            />

            <div className="relative flex justify-center">
              <div className="absolute top-5 bottom-0 border-l border-dashed border-neutral-400" />
              <div className="mt-12 space-y-2 w-full">
                <div className="border border-neutral-500 bg-[#b8a7cc] py-1 text-center text-xl font-black">PM</div>
                <div className="border border-neutral-500 bg-[#dfeccb] py-2 text-center text-[11px]">Rotation</div>
                <div className="border border-neutral-500 bg-[#b8a7cc] py-1 text-center text-xl font-black">HR</div>
                <div className="border border-neutral-500 bg-[#dfeccb] py-2 text-center text-[11px]">Support</div>
                <div className="border border-neutral-500 bg-[#b8a7cc] py-1 text-center text-xl font-black">Safety</div>
                <div className="border border-neutral-500 bg-[#dfeccb] py-2 text-center text-[11px]">Cover</div>
              </div>
            </div>

            <TeamPanel
              team="B"
              employees={grouped.B}
              year={year}
              month={month}
              policy={policy}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 print:hidden">
        <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <div>
            <p className="text-xs text-neutral-400">Group A</p>
            <p className="text-lg font-black text-secondary-700">{grouped.A.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-red-500" />
          <div>
            <p className="text-xs text-neutral-400">Group B</p>
            <p className="text-lg font-black text-secondary-700">{grouped.B.length}</p>
          </div>
        </div>
        <div className="rounded-xl border border-neutral-100 bg-white px-4 py-3 flex items-center gap-3">
          <Users className="w-5 h-5 text-amber-500" />
          <div>
            <p className="text-xs text-neutral-400">Not Assigned</p>
            <p className="text-lg font-black text-secondary-700">{grouped.unset.length}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
