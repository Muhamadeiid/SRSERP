import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronDown, ChevronRight, UserCheck, X, Loader2, RefreshCw, Users, ShieldCheck, Plus } from 'lucide-react'

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

// ── position colour ──────────────────────────────────────────────────────────
const posColor = pos => {
  if (!pos) return 'bg-neutral-100 text-neutral-500'
  const p = pos.toLowerCase()
  if (p.includes('depot manager') || p.includes('head'))   return 'bg-purple-100 text-purple-700'
  if (p.includes('hr'))            return 'bg-pink-100 text-pink-700'
  if (p.includes('engineer'))      return 'bg-blue-100 text-blue-700'
  if (p.includes('supervisor'))    return 'bg-indigo-100 text-indigo-700'
  if (p.includes('technician'))    return 'bg-green-100 text-green-700'
  if (p.includes('admin'))         return 'bg-yellow-100 text-yellow-700'
  return 'bg-neutral-100 text-neutral-600'
}

const initials = name => name?.split(' ').slice(0,2).map(n=>n[0]).join('').toUpperCase() ?? '?'

// ── Employee card ────────────────────────────────────────────────────────────
function EmpCard({ emp, allEmployees, onManagerChange, level = 0 }) {
  const [open,     setOpen]     = useState(level < 2)
  const [editing,  setEditing]  = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [search,   setSearch]   = useState('')
  const [dropPos,  setDropPos]  = useState({ top: 0, left: 0 })
  const inputRef = useRef()

  const reports = allEmployees.filter(e => e.direct_manager_id === emp.id)

  const manager = allEmployees.find(e => e.id === emp.direct_manager_id)

  const filtered = allEmployees.filter(e =>
    e.id !== emp.id &&
    (!search.trim() || e.name.toLowerCase().includes(search.toLowerCase()) ||
     (e.position ?? '').toLowerCase().includes(search.toLowerCase()))
  )

  const setManager = async (mgr) => {
    setSaving(true)
    try {
      await api(`/employees/${emp.id}/manager`, {
        method: 'PUT',
        body: JSON.stringify({ direct_manager_id: mgr?.id ?? null }),
      })
      onManagerChange()
    } finally {
      setSaving(false)
      setEditing(false)
      setSearch('')
    }
  }

  return (
    <div className={`${level > 0 ? 'ml-6 border-l-2 border-neutral-200 pl-4' : ''}`}>
      <div className="group flex items-start gap-3 py-2">

        {/* expand toggle */}
        <button
          onClick={() => setOpen(o => !o)}
          className={`mt-1 w-5 h-5 flex items-center justify-center rounded text-neutral-400 hover:text-neutral-600 shrink-0 transition-colors ${reports.length === 0 ? 'invisible' : ''}`}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>

        {/* avatar */}
        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
          {initials(emp.name)}
        </div>

        {/* info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-sm text-secondary-700 truncate">{emp.name}</p>
            {reports.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                {reports.length} report{reports.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-0.5 ${posColor(emp.position)}`}>
            {emp.position ?? '—'}
          </span>

          {/* direct manager line */}
          <div className="flex items-center gap-1.5 mt-1">
            {!editing ? (
              <>
                <span className="text-[11px] text-neutral-400">
                  {manager ? `↑ ${manager.name}` : <span className="italic text-neutral-300">No direct manager</span>}
                </span>
                <button
                  onClick={() => setEditing(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-primary hover:underline font-semibold"
                >
                  {manager ? 'Change' : 'Assign'}
                </button>
                {manager && (
                  <button
                    onClick={() => setManager(null)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-red-400 hover:text-red-600"
                    title="Remove manager"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="relative">
                  <Search className="absolute left-2 top-1.5 w-3 h-3 text-neutral-400 pointer-events-none" />
                  <input
                    ref={inputRef}
                    autoFocus
                    value={search}
                    onChange={e => {
                      setSearch(e.target.value)
                      if (inputRef.current) {
                        const r = inputRef.current.getBoundingClientRect()
                        setDropPos({ top: r.bottom + 4, left: r.left })
                      }
                    }}
                    placeholder="Search manager…"
                    className="pl-6 pr-2 py-1 text-xs border border-neutral-200 rounded-lg outline-none focus:border-primary/60 w-44 bg-white"
                  />
                </div>
                <button onClick={() => { setEditing(false); setSearch('') }}
                  className="text-neutral-400 hover:text-neutral-600">
                  <X className="w-3.5 h-3.5" />
                </button>
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}

                {/* dropdown */}
                {search && (
                  <div className="fixed z-50 bg-white border border-neutral-200 rounded-xl shadow-xl max-h-48 overflow-y-auto w-56"
                    style={{ top: dropPos.top, left: dropPos.left }}>
                    {filtered.slice(0,10).map(e => (
                      <button key={e.id} onClick={() => setManager(e)}
                        className="w-full text-left px-3 py-2 hover:bg-primary/5 text-xs flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black shrink-0">
                          {initials(e.name)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-secondary-700 truncate">{e.name}</p>
                          <p className="text-neutral-400 truncate">{e.position}</p>
                        </div>
                      </button>
                    ))}
                    {filtered.length === 0 && <p className="text-xs text-neutral-400 px-3 py-3 text-center">No results</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* reports */}
      {open && reports.length > 0 && (
        <div>
          {reports.map(r => (
            <EmpCard key={r.id} emp={r} allEmployees={allEmployees} onManagerChange={onManagerChange} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Manager Account Assignment panel ────────────────────────────────────────
function ManagerAssignPanel() {
  const [managers,     setManagers]     = useState([])
  const [selected,     setSelected]     = useState(null)  // active manager user
  const [assigned,     setAssigned]     = useState([])    // employees under selected
  const [search,       setSearch]       = useState('')
  const [results,      setResults]      = useState([])
  const [searching,    setSearching]    = useState(false)
  const [loadingMgr,   setLoadingMgr]   = useState(false)
  const timer = useRef(null)

  // Load manager users on mount
  useEffect(() => {
    api('/users/managers').then(setManagers).catch(() => setManagers([]))
  }, [])

  // Load assigned employees when manager selected
  useEffect(() => {
    if (!selected) { setAssigned([]); return }
    setLoadingMgr(true)
    api(`/users/${selected.id}/assigned-employees`)
      .then(setAssigned)
      .catch(() => setAssigned([]))
      .finally(() => setLoadingMgr(false))
  }, [selected])

  // Debounced employee search
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
    await api(`/users/${selected.id}/assign-employee`, {
      method: 'POST',
      body: JSON.stringify({ employee_id: emp.id, assign: true }),
    })
    setAssigned(prev => prev.find(e => e.id === emp.id) ? prev : [...prev, emp])
    setManagers(prev => prev.map(m => m.id === selected.id ? { ...m, assigned_employees_count: (m.assigned_employees_count ?? 0) + 1 } : m))
    setSearch('')
    setResults([])
  }

  const unassign = async (empId) => {
    await api(`/users/${selected.id}/assign-employee`, {
      method: 'POST',
      body: JSON.stringify({ employee_id: empId, assign: false }),
    })
    setAssigned(prev => prev.filter(e => e.id !== empId))
    setManagers(prev => prev.map(m => m.id === selected.id ? { ...m, assigned_employees_count: Math.max(0, (m.assigned_employees_count ?? 1) - 1) } : m))
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
        {/* Manager selector */}
        <div>
          <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">Select Manager</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {managers.map(m => (
              <button
                key={m.id}
                onClick={() => setSelected(selected?.id === m.id ? null : m)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left ${
                  selected?.id === m.id
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-secondary-700 border-neutral-200 hover:border-primary/40'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-black shrink-0"
                  style={{ background: selected?.id === m.id ? 'rgba(255,255,255,0.2)' : undefined }}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate">{m.name}</p>
                  <p className={`text-[10px] font-normal ${selected?.id === m.id ? 'text-white/70' : 'text-neutral-400'}`}>
                    {m.assigned_employees_count ?? 0} assigned
                  </p>
                </div>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold shrink-0 ${
                  selected?.id === m.id ? 'bg-white/20 text-white border-white/30' : (ROLE_COLOR[m.role] ?? 'bg-neutral-50 text-neutral-400 border-neutral-200')
                }`}>
                  {m.role?.replace('_', ' ')}
                </span>
              </button>
            ))}
            {managers.length === 0 && (
              <p className="col-span-3 text-sm text-neutral-400 text-center py-4">No manager accounts found</p>
            )}
          </div>
        </div>

        {selected && (
          <>
            {/* Search to add employee */}
            <div className="relative">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">
                Add Employee to {selected.name}
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search employee by name or IBS code…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors"
                />
                {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-neutral-300" />}
              </div>
              {results.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                  {results.map(emp => (
                    <button key={emp.id} onClick={() => assign(emp)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-primary/5 transition-colors text-left">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {emp.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                        <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.department}</p>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-primary font-semibold shrink-0">
                        <Plus className="w-3 h-3" /> Assign
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned employees */}
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide mb-2">
                Employees under {selected.name}
                {loadingMgr && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
                {!loadingMgr && <span className="ml-1 font-normal normal-case">({assigned.length})</span>}
              </p>
              {assigned.length === 0 && !loadingMgr ? (
                <p className="text-sm text-neutral-400 py-2">No employees assigned yet. Search above to add.</p>
              ) : (
                <div className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                  {assigned.map(emp => (
                    <div key={emp.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors">
                      <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                        {emp.name?.[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                        <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.position}</p>
                      </div>
                      <button onClick={() => unassign(emp.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-colors"
                        title="Remove">
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

// ── Main OrgChartTab ─────────────────────────────────────────────────────────
export default function OrgChartTab() {
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [view,      setView]      = useState('tree') // 'tree' | 'list'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/employees/org-chart')
      setEmployees(Array.isArray(data) ? data : (data.data ?? []))
    } catch { setEmployees([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // roots = employees with no manager OR manager not in list
  const ids = new Set(employees.map(e => e.id))
  const roots = employees.filter(e => !e.direct_manager_id || !ids.has(e.direct_manager_id))

  // flat list filtered by search
  const filtered = employees.filter(e =>
    !search.trim() ||
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.position ?? '').toLowerCase().includes(search.toLowerCase())
  )

  // stats
  const withManager    = employees.filter(e => e.direct_manager_id).length
  const withoutManager = employees.length - withManager
  const managers       = new Set(employees.map(e => e.direct_manager_id).filter(Boolean)).size

  return (
    <div className="p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-secondary-700">Organization Chart</h2>
          <p className="text-sm text-neutral-400 mt-0.5">Define reporting lines — hover any employee to assign or change their direct manager</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-3 h-9 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ['Total Employees', employees.length, 'text-secondary-700'],
          ['With Manager',    withManager,       'text-green-600'],
          ['Unique Managers', managers,          'text-blue-600'],
        ].map(([l, v, c]) => (
          <div key={l} className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 text-center">
            <p className={`text-2xl font-black ${c}`}>{v}</p>
            <p className="text-xs text-neutral-400 mt-0.5">{l}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-xl outline-none focus:border-primary/60 w-56" />
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 ml-auto">
          {[['tree','Tree View'],['list','List View']].map(([k,l]) => (
            <button key={k} onClick={() => setView(k)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all
                ${view===k ? 'bg-white text-secondary-700 shadow-sm' : 'text-neutral-400 hover:text-neutral-600'}`}>
              {l}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-400">{withoutManager} without manager</p>
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-neutral-300">
            <Users className="w-14 h-14" />
            <p className="text-sm font-medium">No employees found</p>
          </div>
        ) : view === 'tree' ? (
          // ── Tree view ──
          <div className="space-y-1">
            {(search.trim()
              ? filtered
              : roots
            ).map(emp => (
              <EmpCard
                key={emp.id}
                emp={emp}
                allEmployees={employees}
                onManagerChange={load}
                level={0}
              />
            ))}
          </div>
        ) : (
          // ── List view ──
          <div className="space-y-1">
            {filtered.map(emp => {
              const mgr = employees.find(e => e.id === emp.direct_manager_id)
              return (
                <div key={emp.id} className="flex items-center gap-3 py-2 border-b border-neutral-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-black shrink-0">
                    {initials(emp.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-secondary-700 truncate">{emp.name}</p>
                    <p className="text-[11px] text-neutral-400">{emp.position}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {mgr ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-600 font-semibold">
                        <UserCheck className="w-3 h-3" />{mgr.name}
                      </span>
                    ) : (
                      <span className="text-[11px] text-neutral-300 italic">No manager</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Manager Account Assignments ── */}
      <ManagerAssignPanel />

    </div>
  )
}
