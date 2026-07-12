import { useState, useEffect, useCallback } from 'react'
import { useSelector } from 'react-redux'
import { ChevronLeft, ChevronRight, Loader2, Calendar, Users, Umbrella, Activity, AlertTriangle } from 'lucide-react'
import { getCalendarLeaves } from '../services/leaveService'

// ── helpers ───────────────────────────────────────────────────
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']
const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const LEAVE_COLORS = {
  annual:  { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500'   },
  casual:  { bg: 'bg-purple-100', text: 'text-purple-700', dot: 'bg-purple-500' },
  sick:    { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500'    },
  early:   { bg: 'bg-orange-100', text: 'text-orange-700', dot: 'bg-orange-500' },
  default: { bg: 'bg-neutral-100',text: 'text-neutral-600',dot: 'bg-neutral-400'},
}

function getColor(leaveType) {
  return LEAVE_COLORS[leaveType] ?? LEAVE_COLORS.default
}

function toDateKey(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function parseDateKey(value) {
  // Accept either 'YYYY-MM-DD' or full ISO 'YYYY-MM-DDTHH:MM:SS...Z'
  const s = String(value).slice(0, 10)
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

// Returns array of date strings YYYY-MM-DD between start and end inclusive
function dateRange(start, end) {
  const dates = []
  const cur = parseDateKey(start)
  const last = parseDateKey(end)
  while (cur <= last) {
    dates.push(toDateKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// Build a map: { 'YYYY-MM-DD': [leave, leave, ...] }
function buildLeaveMap(leaves) {
  const map = {}
  for (const leave of leaves) {
    if (!leave.start_date || !leave.end_date) continue
    const dates = dateRange(leave.start_date, leave.end_date)
    for (const d of dates) {
      if (!map[d]) map[d] = []
      map[d].push(leave)
    }
  }
  return map
}

// ── day cell popup ────────────────────────────────────────────
function DayPopup({ date, leaves, onClose }) {
  const label = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-neutral-100 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-secondary-700">{label}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{leaves.length} employee{leaves.length !== 1 ? 's' : ''} on leave</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 text-lg leading-none">&times;</button>
        </div>
        <div className="divide-y divide-neutral-50 max-h-64 overflow-y-auto">
          {leaves.map(l => {
            const c = getColor(l.leave_type)
            return (
              <div key={l.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${c.dot}`} />
                <div>
                  <p className="text-sm font-semibold text-secondary-700">{l.employee_name}</p>
                  <p className="text-xs text-neutral-400 capitalize">
                    {l.leave_type?.replace('_', ' ')} leave
                    {l.days > 1 ? ` · ${l.days} days` : ''}
                  </p>
                </div>
                <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${c.bg} ${c.text}`}>
                  {l.leave_type}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────
export default function CalendarPage() {
  const today = new Date()
  const [year,    setYear]    = useState(today.getFullYear())
  const [month,   setMonth]   = useState(today.getMonth())   // 0-based
  const [leaves,  setLeaves]  = useState([])
  const [loading, setLoading] = useState(true)
  const [popup,   setPopup]   = useState(null) // { date, leaves }

  const fetchLeaves = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getCalendarLeaves()
      setLeaves(res.data ?? [])
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchLeaves() }, [fetchLeaves])

  const leaveMap = buildLeaveMap(leaves)

  // Calendar grid
  const firstDay = new Date(year, month, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = toDateKey(today)

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y-1) } else setMonth(m => m-1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y+1) } else setMonth(m => m+1) }

  // Stats for today — use leaveMap (already normalised to YYYY-MM-DD keys)
  const todayLeavesActive = leaveMap[todayStr] ?? []
  const uniqueOnLeaveToday = [...new Set(todayLeavesActive.map(l => l.employee_name))].length

  // Stats for current month (for reference)
  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`
  const monthLeaves = leaves.filter(l => l.start_date?.startsWith(monthStr) || l.end_date?.startsWith(monthStr))
  const sickSummary = Object.values(
    leaves
      .filter(l => l.leave_type === 'sick')
      .reduce((acc, l) => {
        const key = l.employee_name || `Employee #${l.employee_id ?? l.id}`
        if (!acc[key]) {
          acc[key] = {
            employee_name: key,
            requests: 0,
            days: 0,
            last_date: l.end_date || l.start_date,
          }
        }
        acc[key].requests += 1
        acc[key].days += Number(l.days || 0)
        const last = l.end_date || l.start_date
        if (last && (!acc[key].last_date || last > acc[key].last_date)) acc[key].last_date = last
        return acc
      }, {})
  ).sort((a, b) => b.requests - a.requests || b.days - a.days || String(b.last_date).localeCompare(String(a.last_date)))
  const sickWatchlist = sickSummary.filter(s => s.requests >= 3 || s.days >= 3)

  return (
    <div className="p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-secondary-700">Leave Calendar</h1>
          <p className="text-sm text-neutral-400 mt-0.5">Approved leave requests shown by date</p>
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-neutral-300" />}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-neutral-100 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center"><Calendar className="w-4 h-4 text-primary" /></div>
          <div>
            <p className="text-xs text-neutral-400">Today</p>
            <p className="text-base font-extrabold text-secondary-700">
              {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center"><Umbrella className="w-4 h-4 text-blue-500" /></div>
          <div>
            <p className="text-xs text-neutral-400">On Leave Today</p>
            <p className="text-lg font-extrabold text-secondary-700">{todayLeavesActive.length}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-neutral-100 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center"><Users className="w-4 h-4 text-purple-500" /></div>
          <div>
            <p className="text-xs text-neutral-400">Employees on Leave Today</p>
            <p className="text-lg font-extrabold text-secondary-700">{uniqueOnLeaveToday}</p>
          </div>
        </div>
      </div>

      {/* Calendar card */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">

        {/* Month nav */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="text-center">
            <p className="text-base font-extrabold text-secondary-700">{MONTHS[month]} {year}</p>
          </div>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-400 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-neutral-100">
          {DAYS.map(d => (
            <div key={d} className={`py-2 text-center text-xs font-bold uppercase tracking-wide ${d==='Fri'||d==='Sat'?'text-red-400':'text-neutral-400'}`}>
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`e-${i}`} className="min-h-[90px] border-b border-r border-neutral-50 bg-neutral-50/40" />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day   = i + 1
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
            const dayLeaves = leaveMap[dateStr] ?? []
            const isToday   = dateStr === todayStr
            const dow       = (firstDay + i) % 7  // 0=Sun,5=Fri,6=Sat
            const isWeekend = dow === 5 || dow === 6

            return (
              <div
                key={day}
                onClick={() => dayLeaves.length > 0 && setPopup({ date: dateStr, leaves: dayLeaves })}
                className={`min-h-[90px] border-b border-r border-neutral-50 p-1.5 transition-colors
                  ${dayLeaves.length > 0 ? 'cursor-pointer hover:bg-primary-50/30' : ''}
                  ${isWeekend ? 'bg-red-50/20' : ''}
                `}
              >
                {/* Day number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full
                    ${isToday ? 'bg-primary text-white' : isWeekend ? 'text-red-400' : 'text-neutral-500'}
                  `}>
                    {day}
                  </span>
                  {dayLeaves.length > 2 && (
                    <span className="text-[9px] font-bold text-neutral-400">+{dayLeaves.length - 2}</span>
                  )}
                </div>

                {/* Leave pills — show max 2 */}
                <div className="space-y-0.5">
                  {dayLeaves.slice(0, 2).map((l, idx) => {
                    const c = getColor(l.leave_type)
                    return (
                      <div key={idx} className={`rounded px-1.5 py-0.5 flex items-center gap-1 ${c.bg}`}>
                        <span className={`text-[10px] font-semibold truncate ${c.text}`}>
                          {l.employee_name?.split(' ')[0]}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sick leave watchlist */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-red-500" />
            </div>
            <div>
              <p className="text-base font-extrabold text-secondary-700">Sick Leave Watchlist</p>
              <p className="text-xs text-neutral-400">Employees with repeated approved sick leave</p>
            </div>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-red-50 text-red-600">
            {sickWatchlist.length} flagged
          </span>
        </div>
        {sickSummary.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-neutral-400">No approved sick leaves yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-[11px] uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="text-left px-6 py-3 font-bold">Employee</th>
                  <th className="text-left px-4 py-3 font-bold">Sick Requests</th>
                  <th className="text-left px-4 py-3 font-bold">Total Days</th>
                  <th className="text-left px-4 py-3 font-bold">Last Sick Leave</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {sickSummary.slice(0, 10).map(row => {
                  const flagged = row.requests >= 3 || row.days >= 3
                  return (
                    <tr key={row.employee_name}>
                      <td className="px-6 py-3 font-semibold text-secondary-700">{row.employee_name}</td>
                      <td className="px-4 py-3 text-neutral-600">{row.requests}</td>
                      <td className="px-4 py-3 text-neutral-600">{row.days}</td>
                      <td className="px-4 py-3 text-neutral-500">{row.last_date || '-'}</td>
                      <td className="px-4 py-3">
                        {flagged ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
                            <AlertTriangle className="w-3 h-3" /> Review
                          </span>
                        ) : (
                          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-bold text-neutral-500">Normal</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {Object.entries(LEAVE_COLORS).filter(([k]) => k !== 'default').map(([type, c]) => (
          <div key={type} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${c.dot}`} />
            <span className="text-xs font-medium text-neutral-500 capitalize">{type} Leave</span>
          </div>
        ))}
      </div>

      {/* Day popup */}
      {popup && (
        <DayPopup
          date={popup.date}
          leaves={popup.leaves}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  )
}
