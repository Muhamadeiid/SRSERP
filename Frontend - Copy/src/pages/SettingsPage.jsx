import { useState, useEffect, useRef } from 'react'
import { Users, Settings, Search, X, Check, UserCheck, Loader2 } from 'lucide-react'
import { getSettings, saveSetting, getManagers, getManagerEmps, assignEmployee } from '../services/settingsService'
import { getEmployees } from '../services/employeeService'

export default function SettingsPage() {
  // ── Org Structure state ───────────────────────────────────────────
  const [managers,       setManagers]       = useState([])
  const [selectedMgr,   setSelectedMgr]    = useState(null)   // full manager object
  const [mgrEmployees,   setMgrEmployees]   = useState([])
  const [search,         setSearch]         = useState('')
  const [searchResults,  setSearchResults]  = useState([])
  const [searching,      setSearching]      = useState(false)
  const [loadingMgr,     setLoadingMgr]     = useState(false)
  const searchTimer = useRef(null)
  const abortRef    = useRef(null)

  // ── HR Settings state ─────────────────────────────────────────────
  const [hrName,     setHrName]     = useState('')
  const [hrSaved,    setHrSaved]    = useState(false)
  const [hrSaving,   setHrSaving]   = useState(false)

  // ── Leave Defaults state ──────────────────────────────────────────
  const [leaveDef,     setLeaveDef]     = useState({ default_annual_days: 21, default_casual_days: 7, default_sick_days: 90 })
  const [leaveDefSaved,  setLeaveDefSaved]  = useState(false)
  const [leaveDefSaving, setLeaveDefSaving] = useState(false)

  // ── Load managers + settings on mount ────────────────────────────
  useEffect(() => {
    getManagers().then(r => setManagers(r.data ?? []))
    getSettings().then(r => {
      setHrName(r.data?.hr_officer_name ?? '')
      setLeaveDef({
        default_annual_days: parseInt(r.data?.default_annual_days ?? 21),
        default_casual_days: parseInt(r.data?.default_casual_days ?? 7),
        default_sick_days:   parseInt(r.data?.default_sick_days   ?? 90),
      })
    })
  }, [])

  // ── Load employees for selected manager ──────────────────────────
  useEffect(() => {
    if (!selectedMgr) { setMgrEmployees([]); return }
    setLoadingMgr(true)
    getManagerEmps(selectedMgr.id)
      .then(r => setMgrEmployees(r.data ?? []))
      .finally(() => setLoadingMgr(false))
  }, [selectedMgr])

  // ── Employee search (debounced 350ms) ─────────────────────────────
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (abortRef.current)    abortRef.current.abort()
    if (!search.trim()) { setSearchResults([]); return }

    searchTimer.current = setTimeout(async () => {
      setSearching(true)
      abortRef.current = new AbortController()
      try {
        const res = await getEmployees({ search, limit: 10 })
        setSearchResults(res.data ?? [])
      } catch { /* ignore abort */ }
      finally  { setSearching(false) }
    }, 350)
  }, [search])

  const handleAssign = async (employee) => {
    if (!selectedMgr) return
    await assignEmployee(employee.id, selectedMgr.id)
    setMgrEmployees(prev => {
      if (prev.find(e => e.id === employee.id)) return prev
      return [...prev, employee]
    })
    setSearch('')
    setSearchResults([])
  }

  const handleRemove = async (employeeId) => {
    await assignEmployee(employeeId, null)
    setMgrEmployees(prev => prev.filter(e => e.id !== employeeId))
  }

  const handleSaveLeaveDefaults = async () => {
    setLeaveDefSaving(true)
    try {
      await Promise.all([
        saveSetting('default_annual_days', String(leaveDef.default_annual_days)),
        saveSetting('default_casual_days', String(leaveDef.default_casual_days)),
        saveSetting('default_sick_days',   String(leaveDef.default_sick_days)),
      ])
      setLeaveDefSaved(true)
      setTimeout(() => setLeaveDefSaved(false), 2500)
    } finally { setLeaveDefSaving(false) }
  }

  const handleSaveHR = async () => {
    setHrSaving(true)
    try {
      await saveSetting('hr_officer_name', hrName)
      setHrSaved(true)
      setTimeout(() => setHrSaved(false), 2500)
    } finally { setHrSaving(false) }
  }

  const roleLabel = (role) => {
    if (role === 'depot_manager') return 'Depot Manager'
    if (role === 'admin')         return 'Admin'
    return 'Staff'
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-xl font-extrabold text-secondary-700">Settings</h1>
        <p className="text-sm text-neutral-400 mt-0.5">Org structure &amp; system configuration</p>
      </div>

      {/* ── Section 1: Org Structure ── */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-secondary-700">Manager Account Assignments</h2>
          <p className="text-xs text-neutral-400 ml-2">Assign employees to their direct manager account</p>
        </div>
        <div className="p-6 space-y-4">

          {/* Manager selector */}
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              Select Manager
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {managers.map(m => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMgr(selectedMgr?.id === m.id ? null : m)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left ${
                    selectedMgr?.id === m.id
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-secondary-700 border-neutral-200 hover:border-primary/40'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{m.name}</span>
                  <span className={`text-[10px] ml-auto shrink-0 ${selectedMgr?.id === m.id ? 'text-white/70' : 'text-neutral-400'}`}>
                    {roleLabel(m.role)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedMgr && (
            <>
              {/* Search to add employee */}
              <div className="relative">
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                  Add Employee to {selectedMgr.name}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by name..."
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors"
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-neutral-300" />}
                </div>

                {/* Search results dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-lg overflow-hidden">
                    {searchResults.map(emp => (
                      <button
                        key={emp.id}
                        onClick={() => handleAssign(emp)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-primary/5 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {emp.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-secondary-700">{emp.name}</p>
                          <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.department}</p>
                        </div>
                        <span className="ml-auto text-xs text-primary font-semibold">+ Add</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Current employees list */}
              <div>
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                  Employees under {selectedMgr.name}
                  {loadingMgr && <Loader2 className="inline w-3 h-3 animate-spin ml-2" />}
                </p>
                {mgrEmployees.length === 0 && !loadingMgr ? (
                  <p className="text-sm text-neutral-400 py-3">No employees assigned yet.</p>
                ) : (
                  <div className="divide-y divide-neutral-50 border border-neutral-100 rounded-xl overflow-hidden">
                    {mgrEmployees.map(emp => (
                      <div key={emp.id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                          {emp.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-secondary-700 truncate">{emp.name}</p>
                          <p className="text-xs text-neutral-400">{emp.ibs_code} · {emp.department}</p>
                        </div>
                        <button
                          onClick={() => handleRemove(emp.id)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-colors"
                          title="Remove"
                        >
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

      {/* ── Section 2: Leave Defaults ── */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-secondary-700">Leave Defaults</h2>
          <p className="text-xs text-neutral-400 ml-2">Applied when a new employee's balance is created for the first time</p>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {[
              { key: 'default_annual_days', label: 'Annual Days',        sub: 'Total leave pool per employee' },
              { key: 'default_casual_days', label: 'Casual Sub-limit',   sub: 'Max casual from annual pool' },
              { key: 'default_sick_days',   label: 'Sick Days',          sub: 'Independent sick balance' },
            ].map(({ key, label, sub }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">{label}</label>
                <p className="text-[11px] text-neutral-400 mb-2">{sub}</p>
                <input
                  type="number" min={0} max={365}
                  value={leaveDef[key]}
                  onChange={e => { setLeaveDef(p => ({ ...p, [key]: parseInt(e.target.value) || 0 })); setLeaveDefSaved(false) }}
                  className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors text-center font-bold"
                />
              </div>
            ))}
          </div>
          <button
            onClick={handleSaveLeaveDefaults}
            disabled={leaveDefSaving}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
              leaveDefSaved ? 'bg-green-600 text-white' : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-40'
            }`}
          >
            {leaveDefSaved ? <><Check className="w-4 h-4" /> Saved</> : leaveDefSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Defaults'}
          </button>
        </div>
      </div>

      {/* ── Section 3: HR Settings ── */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-neutral-100 flex items-center gap-2">
          <Settings className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-secondary-700">HR Settings</h2>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
              HR Officer Name
              <span className="ml-2 font-normal normal-case text-neutral-400">
                (appears on printed Leave Request forms)
              </span>
            </label>
            <div className="flex gap-2">
              <input
                value={hrName}
                onChange={e => { setHrName(e.target.value); setHrSaved(false) }}
                placeholder="e.g. Hazem Khaled"
                className="flex-1 px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors"
              />
              <button
                onClick={handleSaveHR}
                disabled={hrSaving || !hrName.trim()}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold rounded-xl transition-all ${
                  hrSaved
                    ? 'bg-green-600 text-white'
                    : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-40'
                }`}
              >
                {hrSaved ? <><Check className="w-4 h-4" /> Saved</> : hrSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
