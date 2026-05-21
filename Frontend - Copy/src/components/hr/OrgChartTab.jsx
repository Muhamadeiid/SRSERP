import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, UserCheck, X, Loader2,
         RefreshCw, Users, ShieldCheck, Plus, Minus, AlertCircle } from 'lucide-react'

const BASE = import.meta.env.VITE_API_URL ?? 'https://srs-backend.onrender.com/api'
const api = async (path, opts = {}) => {
  const token = localStorage.getItem('srs_token')
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...opts,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const initials = name => name?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() ?? '?'

const DEPT_COLOR = {
  cm:              'bg-primary/10 text-primary',
  hm:              'bg-orange-100 text-orange-700',
  pm:              'bg-blue-100 text-blue-700',
  warranty:        'bg-green-100 text-green-700',
  cm_intervention: 'bg-secondary/10 text-secondary-700',
  admin:           'bg-purple-100 text-purple-700',
}

const AVATAR_COLORS = [
  'bg-primary text-white',
  'bg-blue-500 text-white',
  'bg-green-600 text-white',
  'bg-purple-600 text-white',
  'bg-amber-500 text-white',
  'bg-rose-500 text-white',
]

// ── Single org node card ─────────────────────────────────────────────────────
function OrgNode({ emp, all, onchange, onSelectMgr, depth = 0, colorIdx = 0 }) {
  const [open,    setOpen]    = useState(depth < 2)
  const [editing, setEditing] = useState(false)
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(false)
  const inputRef = useRef()

  const reports    = all.filter(e => e.direct_manager_id === emp.id)
  const hasReports = reports.length > 0
  const isRoot     = depth === 0
  const deptKey    = emp.department?.toLowerCase()
  const deptBadge  = DEPT_COLOR[deptKey] ?? 'bg-neutral-100 text-neutral-500'
  const avatarBg   = AVATAR_COLORS[colorIdx % AVATAR_COLORS.length]

  const filtered = all.filter(e =>
    e.id !== emp.id &&
    (!search.trim() || e.name.toLowerCase().includes(search.toLowerCase()))
  ).slice(0, 8)

  const setManager = async (mgr) => {
    setSaving(true)
    try {
      await api(`/employees/${emp.id}/manager`, {
        method: 'PUT',
        body: JSON.stringify({ direct_manager_id: mgr?.id ?? null }),
      })
      onchange()
    } finally { setSaving(false); setEditing(false); setSearch('') }
  }

  return (
    <div className="flex flex-col items-center">

      {/* ── Card ── */}
      <div
        onClick={() => onSelectMgr(emp)}
        className={`group relative bg-white rounded-2xl border-2 w-44 p-3 text-center transition-all hover:shadow-xl cursor-pointer
          ${isRoot ? 'border-primary shadow-primary/20 shadow-md' : 'border-neutral-200 shadow-sm hover:border-primary/40'}`}
      >
        {/* Avatar */}
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black mx-auto mb-2 ${isRoot ? 'bg-white text-primary border-2 border-primary' : avatarBg}`}>
          {initials(emp.name)}
        </div>

        {/* Name */}
        <p className={`text-[11px] font-bold leading-tight ${isRoot ? 'text-primary' : 'text-secondary-700'}`}>
          {emp.name}
        </p>

        {/* Position */}
        {emp.position && (
          <p className="text-[10px] text-neutral-400 mt-0.5 truncate" title={emp.position}>{emp.position}</p>
        )}

        {/* Dept badge */}
        {deptKey && DEPT_COLOR[deptKey] && (
          <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-full mt-1.5 ${deptBadge}`}>
            {deptKey.replace('_', ' ').toUpperCase()}
          </span>
        )}

        {/* Reports count */}
        {hasReports && (
          <div className="mt-1.5">
            <span className={`text-[9px] font-semibold ${isRoot ? 'text-primary/70' : 'text-neutral-400'}`}>
              {reports.length} report{reports.length > 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* "Manage team" hint on hover */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-1.5">
          <span className="text-[9px] text-primary font-semibold bg-primary/8 px-2 py-0.5 rounded-full">
            Manage team →
          </span>
        </div>

        {/* Assign manager button — hidden only for depot_manager */}
        {emp.user_role !== 'depot_manager' && !editing && (
          <button
            onClick={e => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.focus(), 50) }}
            className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 w-5 h-5 rounded-full bg-neutral-100 hover:bg-primary hover:text-white text-neutral-400 flex items-center justify-center"
            title="Change direct manager"
          >
            <UserCheck className="w-3 h-3" />
          </button>
        )}

        {/* Inline manager search */}
        {editing && (
          <div className="mt-2 relative" onClick={e => e.stopPropagation()}>
            <p className="text-[9px] text-neutral-400 mb-1">Set manager for {emp.name.split(' ')[0]}</p>
            <div className="flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="absolute left-1.5 top-1.5 w-3 h-3 text-neutral-400 pointer-events-none" />
                <input
                  ref={inputRef}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="w-full pl-5 pr-1 py-1 text-[10px] border border-neutral-200 rounded-lg outline-none focus:border-primary"
                />
              </div>
              <button onClick={() => { setEditing(false); setSearch('') }} className="text-neutral-300 hover:text-neutral-500 shrink-0">
                <X className="w-3 h-3" />
              </button>
            </div>
            {saving && <Loader2 className="w-3 h-3 animate-spin text-primary mx-auto mt-1" />}
            {search && filtered.length > 0 && (
              <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-40 overflow-y-auto text-left">
                <button
                  onClick={() => setManager(null)}
                  className="w-full px-3 py-1.5 hover:bg-red-50 text-[10px] text-red-400 text-left border-b border-neutral-50"
                >
                  Remove manager
                </button>
                {filtered.map(e => (
                  <button key={e.id} onClick={() => setManager(e)}
                    className="w-full px-3 py-1.5 hover:bg-primary/5 text-[10px] text-secondary-700 text-left flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-black shrink-0">
                      {initials(e.name)}
                    </div>
                    <span className="truncate">{e.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Collapse / expand button */}
        {hasReports && (
          <button
            onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
            className={`absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 transition-colors
              ${open ? 'bg-primary border-primary text-white' : 'bg-white border-neutral-300 text-neutral-500 hover:border-primary hover:text-primary'}`}
          >
            {open ? <Minus className="w-2.5 h-2.5" /> : <Plus className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>

      {/* ── Connector + children ── */}
      {hasReports && open && (
        <>
          <div className="h-5" />
          <div className="w-px h-5 bg-neutral-300" />

          <div className="flex items-start">
            {reports.map((r, i) => (
              <div key={r.id} className="flex flex-col items-center relative px-3">
                {reports.length > 1 && (
                  <div className={`absolute top-0 h-px bg-neutral-300
                    ${i === 0                   ? 'left-1/2 right-0'   :
                      i === reports.length - 1   ? 'left-0 right-1/2'  :
                                                   'left-0 right-0'}`}
                  />
                )}
                <div className="w-px h-5 bg-neutral-300" />
                <OrgNode
                  emp={r}
                  all={all}
                  onchange={onchange}
                  onSelectMgr={onSelectMgr}
                  depth={depth + 1}
                  colorIdx={colorIdx + i + 1}
                />

              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Team Management Panel (slide-in drawer) ──────────────────────────────────
function TeamPanel({ manager, all, onchange, onClose }) {
  const [search,  setSearch]  = useState('')
  const [saving,  setSaving]  = useState(null)
  const inputRef = useRef()

  useEffect(() => {
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 150)
  }, [manager?.id])

  if (!manager) return null

  const reports = all.filter(e => e.direct_manager_id === manager.id)
  const avatarBg = AVATAR_COLORS[manager.id % AVATAR_COLORS.length]

  const searchResults = search.trim()
    ? all.filter(e =>
        e.id !== manager.id &&
        e.direct_manager_id !== manager.id &&
        e.name.toLowerCase().includes(search.toLowerCase())
      ).slice(0, 10)
    : []

  const addReport = async (emp) => {
    setSaving(emp.id)
    try {
      await api(`/employees/${emp.id}/manager`, {
        method: 'PUT',
        body: JSON.stringify({ direct_manager_id: manager.id }),
      })
      onchange()
      setSearch('')
    } finally { setSaving(null) }
  }

  const removeReport = async (emp) => {
    setSaving(emp.id)
    try {
      await api(`/employees/${emp.id}/manager`, {
        method: 'PUT',
        body: JSON.stringify({ direct_manager_id: null }),
      })
      onchange()
    } finally { setSaving(null) }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/25 z-40 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 w-[400px] max-w-full bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100 shrink-0">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-base font-black shrink-0 ${
            manager.user_role === 'depot_manager'
              ? 'bg-primary text-white'
              : avatarBg
          }`}>
            {initials(manager.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-secondary-700 truncate">{manager.name}</p>
            {manager.position && <p className="text-xs text-neutral-400 truncate mt-0.5">{manager.position}</p>}
            <p className="text-[11px] text-primary font-semibold mt-1">
              {reports.length} direct report{reports.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search / Add */}
        <div className="px-5 py-4 border-b border-neutral-100 shrink-0">
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">Add to team</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employee by name…"
              className="w-full pl-9 pr-8 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 border border-neutral-100 rounded-xl overflow-hidden divide-y divide-neutral-50 max-h-52 overflow-y-auto">
              {searchResults.map(emp => {
                const currentMgr = emp.direct_manager_id ? all.find(e => e.id === emp.direct_manager_id) : null
                return (
                  <button
                    key={emp.id}
                    onClick={() => addReport(emp)}
                    disabled={saving === emp.id}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                      {initials(emp.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {currentMgr
                          ? <span className="text-amber-500">Currently under {currentMgr.name.split(' ')[0]}</span>
                          : emp.position ?? '—'
                        }
                      </p>
                    </div>
                    {saving === emp.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
                      : <span className="flex items-center gap-1 text-xs text-primary font-semibold shrink-0 bg-primary/8 px-2 py-1 rounded-lg">
                          <Plus className="w-3 h-3" />Add
                        </span>
                    }
                  </button>
                )
              })}
            </div>
          )}

          {search.trim() && searchResults.length === 0 && (
            <p className="text-sm text-neutral-400 text-center py-3">No employees found</p>
          )}
        </div>

        {/* Current team */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-3 flex items-center gap-2 sticky top-0 bg-white border-b border-neutral-50 z-10">
            <Users className="w-3.5 h-3.5 text-neutral-400" />
            <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
              Team ({reports.length})
            </p>
          </div>

          {reports.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-neutral-300 gap-3">
              <Users className="w-12 h-12" />
              <div className="text-center">
                <p className="text-sm font-medium">No direct reports yet</p>
                <p className="text-xs mt-1 text-neutral-400">Search above to add team members</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-neutral-50">
              {reports.map(emp => {
                const subReports = all.filter(e => e.direct_manager_id === emp.id)
                return (
                  <div key={emp.id} className="flex items-center gap-3 px-5 py-3 hover:bg-neutral-50 transition-colors group/row">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                      {initials(emp.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                      <p className="text-[11px] text-neutral-400 truncate">
                        {emp.position ?? '—'}
                        {subReports.length > 0 && (
                          <span className="ml-1.5 text-primary font-semibold">
                            · {subReports.length} report{subReports.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => removeReport(emp)}
                      disabled={saving === emp.id}
                      className="opacity-0 group-hover/row:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all shrink-0 disabled:opacity-50"
                      title="Remove from team"
                    >
                      {saving === emp.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <X className="w-4 h-4" />
                      }
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Manager Account Assignment panel ────────────────────────────────────────
function ManagerAssignPanel() {
  const [managers,   setManagers]   = useState([])
  const [selected,   setSelected]   = useState(null)
  const [assigned,   setAssigned]   = useState([])
  const [search,     setSearch]     = useState('')
  const [results,    setResults]    = useState([])
  const [searching,  setSearching]  = useState(false)
  const [loadingMgr, setLoadingMgr] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    api('/users/managers').then(setManagers).catch(() => setManagers([]))
  }, [])

  useEffect(() => {
    if (!selected) { setAssigned([]); return }
    setLoadingMgr(true)
    api(`/users/${selected.id}/assigned-employees`)
      .then(setAssigned).catch(() => setAssigned([]))
      .finally(() => setLoadingMgr(false))
  }, [selected])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!search.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      try {
        const data = await api(`/employees?search=${encodeURIComponent(search)}&limit=10`)
        setResults(Array.isArray(data) ? data : (data.data ?? []))
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 350)
  }, [search])

  const assign = async (emp) => {
    await api(`/users/${selected.id}/assign-employee`, { method: 'POST', body: JSON.stringify({ employee_id: emp.id, assign: true }) })
    setAssigned(prev => prev.find(e => e.id === emp.id) ? prev : [...prev, emp])
    setSearch(''); setResults([])
  }

  const unassign = async (empId) => {
    await api(`/users/${selected.id}/assign-employee`, { method: 'POST', body: JSON.stringify({ employee_id: empId, assign: false }) })
    setAssigned(prev => prev.filter(e => e.id !== empId))
  }

  const ROLE_COLOR = {
    admin:         'bg-red-50 text-red-700 border-red-200',
    depot_manager: 'bg-blue-50 text-blue-700 border-blue-200',
    manager:       'bg-amber-50 text-amber-700 border-amber-200',
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-bold text-secondary-700">Manager Account Assignments</h3>
        <span className="text-xs text-neutral-400 ml-1">Assign employees to each manager account</span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">Select Manager</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {managers.map(m => (
              <button key={m.id} onClick={() => setSelected(selected?.id === m.id ? null : m)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left
                  ${selected?.id === m.id ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white text-secondary-700 border-neutral-200 hover:border-primary/40'}`}>
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-black shrink-0">
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{m.name}</p>
                  <p className={`text-[10px] font-normal ${selected?.id === m.id ? 'text-white/70' : 'text-neutral-400'}`}>
                    {m.assigned_employees_count ?? 0} assigned
                  </p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0
                  ${selected?.id === m.id ? 'bg-white/20 text-white border-white/30' : (ROLE_COLOR[m.role] ?? 'bg-neutral-50 text-neutral-400 border-neutral-200')}`}>
                  {m.role?.replace('_', ' ')}
                </span>
              </button>
            ))}
            {managers.length === 0 && <p className="col-span-3 text-sm text-neutral-400 text-center py-4">No manager accounts found</p>}
          </div>
        </div>

        {selected && (
          <>
            <div className="relative">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">Add Employee to {selected.name}</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search employee by name or IBS code…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors" />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-neutral-300" />}
              </div>
              {results.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                  {results.map(emp => (
                    <button key={emp.id} onClick={() => assign(emp)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors text-left">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{emp.name?.[0]?.toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                        <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.department}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-primary font-semibold shrink-0"><Plus className="w-3 h-3" />Assign</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                Employees under {selected.name}
                {loadingMgr && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
                {!loadingMgr && <span className="ml-1 font-normal normal-case">({assigned.length})</span>}
              </p>
              {assigned.length === 0 && !loadingMgr ? (
                <p className="text-sm text-neutral-400 py-2">No employees assigned yet.</p>
              ) : (
                <div className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                  {assigned.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">{emp.name?.[0]?.toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                        <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.position}</p>
                      </div>
                      <button onClick={() => unassign(emp.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-colors" title="Remove">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function OrgChartTab() {
  const [employees,      setEmployees]      = useState([])
  const [loading,        setLoading]        = useState(false)
  const [search,         setSearch]         = useState('')
  const [selectedTeamMgr, setSelectedTeamMgr] = useState(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await api('/employees/org-chart')
      setEmployees(Array.isArray(data) ? data : (data.data ?? []))
    } catch { if (!silent) setEmployees([]) }
    finally { if (!silent) setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const ids       = new Set(employees.map(e => e.id))
  const allRoots  = employees.filter(e => !e.direct_manager_id || !ids.has(e.direct_manager_id))

  const ROLE_RANK = { depot_manager: 0, admin: 1, manager: 2 }
  const depotManager = employees.find(e => e.user_role === 'depot_manager')
  const treeRoots = depotManager
    ? [depotManager]
    : allRoots
        .filter(e => e.user_role in ROLE_RANK || employees.some(r => r.direct_manager_id === e.id))
        .sort((a, b) => (ROLE_RANK[a.user_role] ?? 9) - (ROLE_RANK[b.user_role] ?? 9))
  const unmanaged = allRoots.filter(e =>
    !(e.user_role in ROLE_RANK) && !employees.some(r => r.direct_manager_id === e.id)
  )

  const withManager    = employees.filter(e => e.direct_manager_id).length
  const uniqueManagers = new Set(employees.map(e => e.direct_manager_id).filter(Boolean)).size

  const filteredSearch = search.trim()
    ? employees.filter(e =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.position ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : []

  const silentRefresh = useCallback(() => load(true), [load])

  return (
    <div className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-secondary-700">Organization Chart</h2>
          <p className="text-sm text-neutral-400 mt-0.5">Click any card to manage their team</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Total Employees', employees.length,  'text-secondary-700'],
          ['With Manager',    withManager,        'text-green-600'],
          ['Unique Managers', uniqueManagers,     'text-primary'],
        ].map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 text-center">
            <p className={`text-2xl font-black ${c}`}>{v}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary/60" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-300 hover:text-neutral-500"><X className="w-3.5 h-3.5" /></button>}
        </div>

        {search.trim() && (
          <div className="mt-3 divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
            {filteredSearch.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">No results</p>
            ) : filteredSearch.map(emp => {
              const mgr = employees.find(e => e.id === emp.direct_manager_id)
              return (
                <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">{initials(emp.name)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-secondary-700 truncate">{emp.name}</p>
                    <p className="text-[11px] text-neutral-400">{emp.position}</p>
                  </div>
                  {mgr ? (
                    <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold shrink-0"><UserCheck className="w-3 h-3" />{mgr.name}</span>
                  ) : (
                    <span className="text-[11px] text-neutral-300 italic shrink-0">No manager</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Tree ── */}
      {!search.trim() && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-300">
              <Users className="w-14 h-14" />
              <p className="text-sm font-medium">No employees found</p>
            </div>
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-16 items-start min-w-max justify-center">
                {treeRoots.map((root, i) => (
                  <OrgNode
                    key={root.id}
                    emp={root}
                    all={employees}
                    onchange={silentRefresh}
                    onSelectMgr={setSelectedTeamMgr}
                    depth={0}
                    colorIdx={i}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Unmanaged employees ── */}
      {!search.trim() && unmanaged.length > 0 && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-bold text-secondary-700">No Manager Assigned</p>
            <span className="text-xs text-neutral-400">({unmanaged.length} employee{unmanaged.length > 1 ? 's' : ''})</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-4">
            {unmanaged.map(emp => (
              <div key={emp.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-neutral-100 bg-neutral-50">
                <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-[10px] font-black shrink-0">{initials(emp.name)}</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-secondary-700 truncate">{emp.name}</p>
                  <p className="text-[10px] text-neutral-400 truncate">{emp.position ?? '—'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Manager Account Assignments ── */}
      <ManagerAssignPanel />

      {/* ── Team Panel Drawer ── */}
      {selectedTeamMgr && (
        <TeamPanel
          manager={employees.find(e => e.id === selectedTeamMgr.id) ?? selectedTeamMgr}
          all={employees}
          onchange={silentRefresh}
          onClose={() => setSelectedTeamMgr(null)}
        />
      )}

    </div>
  )
}
