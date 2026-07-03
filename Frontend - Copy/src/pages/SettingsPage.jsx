import { useState, useEffect, useRef } from 'react'
import { Users, Settings, Search, X, Check, UserCheck, Loader2, Plus, Tag, Trash2, ShieldCheck, ArrowRight, GripVertical, Layers } from 'lucide-react'
import { getSettings, saveSetting, getManagers, getManagerEmps, assignEmployee } from '../services/settingsService'
import { getEmployees } from '../services/employeeService'
import { listLookupsAll, createLookup, updateLookup, deleteLookup, invalidateLookups } from '../services/lookupService'
import { listPositionsAll, createPosition, updatePosition, deletePosition, mergePositions } from '../services/positionService'
import { getPermissionMatrix, togglePermission, teamTransfer } from '../services/permissionService'
import { useLookups } from '../hooks/useLookups'

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
    if (role === 'manager')       return 'Manager'
    if (role === 'hr')            return 'HR'
    return 'Staff'
  }

  const [activeTab, setActiveTab] = useState('org')

  const TABS = [
    { key: 'org',    label: 'Org Structure', icon: Users,       desc: 'Managers, assignments & team transfer' },
    { key: 'hr',     label: 'HR & Leaves',   icon: Settings,    desc: 'Leave defaults, HR officer' },
    { key: 'master', label: 'Master Data',   icon: Tag,         desc: 'Departments, locations, categories, roles' },
    { key: 'perms',  label: 'Permissions',   icon: ShieldCheck, desc: 'Role × permission matrix' },
  ]
  const activeMeta = TABS.find(t => t.key === activeTab)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-extrabold text-secondary-700 tracking-tight">Settings</h1>
        <p className="text-sm text-neutral-400 mt-1">{activeMeta?.desc ?? 'Org structure & system configuration'}</p>
      </div>

      {/* Tabs */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-1.5 flex gap-1 shadow-sm">
        {TABS.map(t => {
          const Icon = t.icon
          const on   = activeTab === t.key
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                on ? 'bg-primary text-white shadow-sm' : 'text-neutral-500 hover:text-secondary-700 hover:bg-neutral-50'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Org Structure Tab ── */}
      {activeTab === 'org' && <>
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

      {/* ── Section 7: Team Transfer ── */}
      <TeamTransferPanel />

      </>}

      {/* ── HR & Leaves Tab ── */}
      {activeTab === 'hr' && <>

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

      </>}

      {/* ── Master Data Tab ── */}
      {activeTab === 'master' && <>
        <LookupsPanel />
        <PositionsPanel />
      </>}

      {/* ── Permissions Tab ── */}
      {activeTab === 'perms' && <>
        <PermissionMatrixPanel />
      </>}

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Permission Matrix — roles × permissions, checkbox grid
// ─────────────────────────────────────────────────────────────────────
function PermissionMatrixPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')  // "role|key"

  const load = () => getPermissionMatrix().then(setData).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const isGranted = (role, key) => data?.grants?.[role]?.includes(key)

  const toggle = async (role, key) => {
    const already = isGranted(role, key)
    setBusy(`${role}|${key}`)
    try {
      await togglePermission(role, key, !already)
      // optimistic update
      setData(d => {
        const grants = { ...d.grants }
        grants[role] = already
          ? (grants[role] ?? []).filter(k => k !== key)
          : [...(grants[role] ?? []), key]
        return { ...d, grants }
      })
    } finally { setBusy('') }
  }

  if (loading) return (
    <SectionShell icon={ShieldCheck} iconTint="purple" title="Permission Matrix" subtitle="Loading…">
      <div className="p-10 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    </SectionShell>
  )

  // Group permissions
  const groups = (data.permissions ?? []).reduce((acc, p) => {
    (acc[p.group || 'other'] ??= []).push(p)
    return acc
  }, {})

  const ROLE_STYLES = {
    admin:         { label: 'Admin',         bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
    depot_manager: { label: 'Depot Mgr',     bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
    manager:       { label: 'Manager',       bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
    hr:            { label: 'HR',            bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
    staff:         { label: 'Staff',         bg: 'bg-neutral-50',text: 'text-neutral-600',dot: 'bg-neutral-400' },
    procurement:   { label: 'Procurement',   bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-500' },
    ehs:           { label: 'EHS',           bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  }

  const grantsCount = Object.values(data.grants ?? {}).reduce((s, arr) => s + (arr?.length ?? 0), 0)

  return (
    <SectionShell
      icon={ShieldCheck}
      iconTint="purple"
      title="Permission Matrix"
      subtitle="Grant or revoke feature access per role — takes effect on next login"
      actions={
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-neutral-400">
          <span className="bg-neutral-100 px-2 py-1 rounded-lg">{data.permissions.length} permissions</span>
          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">{grantsCount} grants</span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-neutral-100 bg-neutral-50/80 backdrop-blur">
              <th className="text-left px-4 py-3 font-semibold text-neutral-500 sticky left-0 bg-neutral-50/95 backdrop-blur min-w-[240px]">
                Feature
              </th>
              {data.roles.map(r => {
                const rs = ROLE_STYLES[r] ?? { label: r, bg: 'bg-neutral-50', text: 'text-neutral-600', dot: 'bg-neutral-400' }
                return (
                  <th key={r} className="px-2 py-3 font-semibold text-center min-w-[86px]">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${rs.bg} ${rs.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${rs.dot}`} />
                      {rs.label}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {Object.entries(groups).map(([group, perms]) => (
              <>
                <tr key={group}>
                  <td colSpan={data.roles.length + 1} className="pl-4 pr-2 pt-5 pb-2 sticky left-0 bg-white">
                    <div className="flex items-center gap-2">
                      <div className="h-px flex-1 bg-neutral-100" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400 px-2">
                        {group}
                      </span>
                      <span className="text-[10px] font-semibold text-neutral-300 bg-neutral-50 px-1.5 py-0.5 rounded-full">
                        {perms.length}
                      </span>
                      <div className="h-px flex-1 bg-neutral-100" />
                    </div>
                  </td>
                </tr>
                {perms.map(p => (
                  <tr key={p.key} className="border-b border-neutral-50 hover:bg-primary/[0.02]">
                    <td className="pl-4 pr-3 py-2.5 sticky left-0 bg-white group-hover:bg-primary/[0.02]">
                      <p className="text-secondary-700 font-medium text-[12px]">{p.label_en}</p>
                      <p className="font-mono text-[9px] text-neutral-400">{p.key}</p>
                    </td>
                    {data.roles.map(r => {
                      const granted = isGranted(r, p.key)
                      const spin    = busy === `${r}|${p.key}`
                      return (
                        <td key={r} className="px-2 py-2 text-center">
                          <button
                            onClick={() => toggle(r, p.key)}
                            disabled={spin}
                            className={`w-7 h-7 rounded-lg border flex items-center justify-center mx-auto transition-all ${
                              granted
                                ? 'bg-primary border-primary text-white shadow-sm hover:shadow-md hover:scale-105'
                                : 'bg-white border-neutral-200 text-neutral-200 hover:border-primary/40 hover:bg-primary/5'
                            }`}
                          >
                            {spin ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : granted ? <Check className="w-4 h-4" /> : <span className="w-1 h-1 rounded-full bg-neutral-300" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </SectionShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Team Transfer — one-click bulk reassignment
// ─────────────────────────────────────────────────────────────────────
function TeamTransferPanel() {
  const [managers, setManagers]  = useState([])
  const [fromMgr,  setFromMgr]   = useState(null)
  const [toMgr,    setToMgr]     = useState(null)
  const [mode,     setMode]      = useState('user')  // 'direct' | 'user' | 'both'
  const [busy,     setBusy]      = useState(false)
  const [result,   setResult]    = useState(null)

  useEffect(() => { getManagers().then(r => setManagers(r.data ?? r ?? [])) }, [])

  const run = async () => {
    if (!fromMgr) return
    if (!confirm(`Move ALL employees from ${fromMgr.name} to ${toMgr ? toMgr.name : '(un-assigned)'}?\nMode: ${mode}`)) return
    setBusy(true); setResult(null)
    try {
      const r = await teamTransfer({
        mode,
        from_id: fromMgr.id,
        to_id:   toMgr?.id ?? null,
      })
      setResult(`Moved ${r.affected} employee${r.affected !== 1 ? 's' : ''}.`)
    } catch (e) {
      setResult('Transfer failed: ' + (e.response?.data?.message ?? e.message))
    } finally { setBusy(false) }
  }

  const initials = (n) => (n ?? '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '—'
  const fromCount = fromMgr?.assigned_employees_count ?? 0

  const MgrCard = ({ mgr, label, empty, colorClass }) => (
    <div>
      <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">{label}</label>
      <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed ${mgr ? colorClass : 'border-neutral-200 bg-neutral-50/40'}`}>
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-sm font-black shrink-0 ${mgr ? 'bg-white/70 text-secondary-700' : 'bg-neutral-100 text-neutral-300'}`}>
          {mgr ? initials(mgr.name) : '?'}
        </div>
        <div className="flex-1 min-w-0">
          {mgr ? (
            <>
              <p className="text-sm font-bold text-secondary-700 truncate">{mgr.name}</p>
              <p className="text-[11px] text-neutral-500 capitalize">{mgr.role?.replace('_', ' ')}
                {mgr.assigned_employees_count != null && (
                  <span className="ml-1 text-primary font-semibold">· {mgr.assigned_employees_count} assigned</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-xs text-neutral-400 italic">{empty}</p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <SectionShell
      icon={ArrowRight}
      iconTint="blue"
      title="Team Transfer"
      subtitle="Reassign a whole team in one action — for promotions, exits, or reorgs"
    >
      <div className="p-6 space-y-5">

        {/* From → To visual flow */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4">
          <MgrCard mgr={fromMgr} label="From" empty="Select a manager below" colorClass="border-primary/40 bg-primary/5" />
          <div className="hidden sm:flex items-center justify-center">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${fromMgr && (toMgr || fromMgr) ? 'bg-primary text-white shadow-md' : 'bg-neutral-100 text-neutral-300'}`}>
              <ArrowRight className="w-5 h-5" />
            </div>
          </div>
          <MgrCard mgr={toMgr} label="To" empty="Leave blank to un-assign" colorClass="border-green-300 bg-green-50/40" />
        </div>

        {/* Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <select
            value={fromMgr?.id ?? ''}
            onChange={e => setFromMgr(managers.find(m => String(m.id) === e.target.value) ?? null)}
            className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white"
          >
            <option value="">Pick source manager…</option>
            {managers.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.role} {m.assigned_employees_count != null ? `· ${m.assigned_employees_count} assigned` : ''}
              </option>
            ))}
          </select>
          <select
            value={toMgr?.id ?? ''}
            onChange={e => setToMgr(managers.find(m => String(m.id) === e.target.value) ?? null)}
            className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white"
          >
            <option value="">— Un-assign / no target —</option>
            {managers.filter(m => m.id !== fromMgr?.id).map(m => (
              <option key={m.id} value={m.id}>{m.name} · {m.role}</option>
            ))}
          </select>
        </div>

        {/* Which link */}
        <div>
          <label className="block text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2">Which link to move</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {[
              { key: 'user',   label: 'Manager Account',  sub: 'Access & visibility (user_manager_id)' },
              { key: 'direct', label: 'Direct Manager',   sub: 'Leaves & Org chart (direct_manager_id)' },
              { key: 'both',   label: 'Both',             sub: 'Complete handover' },
            ].map(o => {
              const on = mode === o.key
              return (
                <button
                  key={o.key}
                  onClick={() => setMode(o.key)}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    on ? 'bg-primary/5 text-secondary-700 border-primary shadow-sm' : 'bg-white text-secondary-700 border-neutral-100 hover:border-primary/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-primary bg-primary' : 'border-neutral-300'}`}>
                      {on && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <p className="text-sm font-bold">{o.label}</p>
                  </div>
                  <p className="text-[10px] text-neutral-400 mt-1 ml-6">{o.sub}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-3 pt-2 border-t border-neutral-50 flex-wrap">
          <button
            onClick={run}
            disabled={busy || !fromMgr}
            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-primary text-white rounded-xl hover:bg-primary/90 disabled:opacity-40 shadow-sm"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Transfer {fromCount > 0 ? `${fromCount} employee${fromCount !== 1 ? 's' : ''}` : 'team'}
          </button>
          {result && (
            <div className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-green-50 text-green-700 border border-green-100">
              <Check className="w-3.5 h-3.5" /> {result}
            </div>
          )}
        </div>
      </div>
    </SectionShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Reusable section shell — consistent header, spacing, empty state
// ─────────────────────────────────────────────────────────────────────
function SectionShell({ icon: Icon, iconTint = 'primary', title, subtitle, actions, children }) {
  const tints = {
    primary: 'bg-primary/10 text-primary',
    amber:   'bg-amber-100 text-amber-600',
    green:   'bg-green-100 text-green-600',
    purple:  'bg-purple-100 text-purple-600',
    blue:    'bg-blue-100 text-blue-600',
  }
  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-50 flex items-center gap-3">
        {Icon && (
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tints[iconTint]}`}>
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-secondary-700">{title}</h2>
          {subtitle && <p className="text-xs text-neutral-400 mt-0.5">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}

function EmptyState({ icon: Icon = Layers, title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-2 text-neutral-300">
      <Icon className="w-10 h-10" />
      <p className="text-sm font-semibold text-neutral-500">{title}</p>
      {subtitle && <p className="text-xs text-neutral-400">{subtitle}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Lookups (Master Data) management
// ─────────────────────────────────────────────────────────────────────
const LOOKUP_TABS = [
  { key: 'department', label: 'Departments', color: 'bg-primary/10 text-primary' },
  { key: 'location',   label: 'Locations',   color: 'bg-blue-100 text-blue-600' },
  { key: 'category',   label: 'Categories',  color: 'bg-amber-100 text-amber-600' },
  { key: 'role',       label: 'Roles',       color: 'bg-purple-100 text-purple-600' },
]

function LookupsPanel() {
  const [byType, setByType] = useState({})
  const [active, setActive] = useState('department')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null) // id being saved
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ key: '', label_en: '', label_ar: '', color: '' })

  const load = () =>
    listLookupsAll()
      .then(setByType)
      .finally(() => setLoading(false))

  useEffect(() => { load() }, [])

  const items = byType[active] ?? []

  const handleUpdate = async (item, patch) => {
    setSaving(item.id)
    try {
      await updateLookup(item.id, patch)
      invalidateLookups()
      await load()
    } finally { setSaving(null) }
  }

  const handleAdd = async () => {
    if (!draft.key.trim() || !draft.label_en.trim()) return
    setSaving('new')
    try {
      await createLookup({ ...draft, type: active })
      invalidateLookups()
      setDraft({ key: '', label_en: '', label_ar: '', color: '' })
      setShowAdd(false)
      await load()
    } finally { setSaving(null) }
  }

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.label_en}"? Existing records that use this value will keep it but won't be editable to this value again.`)) return
    setSaving(item.id)
    try {
      await deleteLookup(item.id)
      invalidateLookups()
      await load()
    } finally { setSaving(null) }
  }

  const activeMeta = LOOKUP_TABS.find(t => t.key === active)
  const singular   = activeMeta?.label.replace(/s$/, '') ?? 'item'

  return (
    <SectionShell
      icon={Tag}
      title="Master Data"
      subtitle="Departments, locations, categories & roles — no code changes required"
    >
      {/* Pill tabs */}
      <div className="px-6 py-4 border-b border-neutral-50 flex items-center gap-2 flex-wrap">
        {LOOKUP_TABS.map(t => {
          const on    = active === t.key
          const count = (byType[t.key] ?? []).length
          return (
            <button
              key={t.key}
              onClick={() => { setActive(t.key); setShowAdd(false) }}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                on
                  ? 'bg-primary text-white border-primary shadow-sm'
                  : 'bg-white text-secondary-700 border-neutral-200 hover:border-primary/40'
              }`}
            >
              <span>{t.label}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${on ? 'bg-white/25 text-white' : 'bg-neutral-100 text-neutral-500'}`}>
                {count}
              </span>
            </button>
          )
        })}
        <button
          onClick={() => setShowAdd(v => !v)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/5 rounded-full transition-all"
        >
          <Plus className="w-3.5 h-3.5" /> Add {singular}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-6 py-3 bg-neutral-50/60 border-b border-neutral-50 grid grid-cols-1 sm:grid-cols-5 gap-2">
          <input
            value={draft.key}
            onChange={e => setDraft(d => ({ ...d, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
            placeholder="key (e.g. safety)"
            autoFocus
            className="sm:col-span-1 px-3 py-2 text-xs font-mono border border-neutral-200 rounded-lg outline-none focus:border-primary bg-white"
          />
          <input
            value={draft.label_en}
            onChange={e => setDraft(d => ({ ...d, label_en: e.target.value }))}
            placeholder="English label"
            className="sm:col-span-2 px-3 py-2 text-xs border border-neutral-200 rounded-lg outline-none focus:border-primary bg-white"
          />
          <input
            value={draft.label_ar}
            onChange={e => setDraft(d => ({ ...d, label_ar: e.target.value }))}
            placeholder="التسمية العربية"
            dir="rtl"
            className="sm:col-span-1 px-3 py-2 text-xs border border-neutral-200 rounded-lg outline-none focus:border-primary text-right bg-white"
          />
          <div className="sm:col-span-1 flex gap-1">
            <button
              onClick={handleAdd}
              disabled={saving === 'new' || !draft.key.trim() || !draft.label_en.trim()}
              className="flex-1 px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm"
            >
              {saving === 'new' ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save'}
            </button>
            <button
              onClick={() => { setShowAdd(false); setDraft({ key: '', label_en: '', label_ar: '', color: '' }) }}
              className="px-2 py-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-neutral-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Items */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Tag} title={`No ${activeMeta?.label.toLowerCase()} yet`} subtitle="Click Add above to create the first one." />
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div
                key={item.id}
                className={`group flex items-center gap-3 pl-2 pr-3 py-2 rounded-xl border transition-all ${
                  item.is_active
                    ? 'border-neutral-100 bg-white hover:border-primary/30 hover:shadow-sm'
                    : 'border-neutral-100 bg-neutral-50/60'
                }`}
              >
                <div className={`w-2 h-9 rounded-full shrink-0 ${item.is_active ? 'bg-primary' : 'bg-neutral-300'}`} />
                <span className="text-[10px] font-mono text-neutral-400 w-24 truncate" title={item.key}>{item.key}</span>
                <input
                  defaultValue={item.label_en}
                  onBlur={e => e.target.value !== item.label_en && handleUpdate(item, { label_en: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1.5 text-sm font-medium text-secondary-700 bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                  placeholder="English label"
                />
                <input
                  defaultValue={item.label_ar ?? ''}
                  onBlur={e => e.target.value !== (item.label_ar ?? '') && handleUpdate(item, { label_ar: e.target.value })}
                  className="w-36 px-2 py-1.5 text-sm bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none text-right"
                  dir="rtl"
                  placeholder="—"
                />
                <button
                  onClick={() => handleUpdate(item, { is_active: !item.is_active })}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                    item.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-green-500' : 'bg-neutral-400'}`} />
                  {item.is_active ? 'ACTIVE' : 'HIDDEN'}
                </button>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={saving === item.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all"
                  title="Delete"
                >
                  {saving === item.id ? <Loader2 className="w-4 h-4 animate-spin opacity-100" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Positions master list — add, edit, merge duplicates, deactivate
// ─────────────────────────────────────────────────────────────────────
function PositionsPanel() {
  const { departments } = useLookups()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(null)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ name_en: '', name_ar: '', department_key: '', category: 'Blue Collar' })
  const [mergeMode, setMergeMode] = useState(null) // { from: position }

  const load = () => listPositionsAll().then(setItems).finally(() => setLoading(false))
  useEffect(() => { load() }, [])

  const filtered = items.filter(p => {
    if (deptFilter && p.department_key !== deptFilter) return false
    if (search.trim()) {
      const s = search.toLowerCase()
      if (!(p.name_en?.toLowerCase().includes(s) || p.name_ar?.toLowerCase().includes(s))) return false
    }
    return true
  })

  const handleUpdate = async (id, patch) => {
    setSaving(id)
    try { await updatePosition(id, patch); await load() }
    finally { setSaving(null) }
  }

  const handleAdd = async () => {
    if (!draft.name_en.trim()) return
    setSaving('new')
    try {
      await createPosition(draft)
      setDraft({ name_en: '', name_ar: '', department_key: '', category: 'Blue Collar' })
      setShowAdd(false)
      await load()
    } finally { setSaving(null) }
  }

  const handleDelete = async (item) => {
    if (item.employees_count > 0) {
      alert(`Can't delete — ${item.employees_count} employee(s) still use this position. Merge it into another position, or deactivate.`)
      return
    }
    if (!confirm(`Delete "${item.name_en}"?`)) return
    setSaving(item.id)
    try { await deletePosition(item.id); await load() }
    finally { setSaving(null) }
  }

  const handleMerge = async (toId) => {
    if (!mergeMode) return
    if (!confirm(`Move all ${mergeMode.from.employees_count} employees from "${mergeMode.from.name_en}" into the target position and delete the source?`)) return
    setSaving(mergeMode.from.id)
    try {
      await mergePositions(mergeMode.from.id, toId)
      setMergeMode(null)
      await load()
    } finally { setSaving(null) }
  }

  const totalEmployees = items.reduce((sum, p) => sum + (p.employees_count ?? 0), 0)

  return (
    <SectionShell
      icon={Layers}
      iconTint="amber"
      title="Positions Master List"
      subtitle="Canonical job titles — merge duplicates, deactivate obsolete ones"
      actions={
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-neutral-400">
          <span className="bg-neutral-100 px-2 py-1 rounded-lg">{items.length} positions</span>
          <span className="bg-primary/10 text-primary px-2 py-1 rounded-lg">{totalEmployees} employees</span>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="px-6 py-3.5 border-b border-neutral-50 flex items-center gap-2 flex-wrap bg-neutral-50/40">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search positions…"
            className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
          />
        </div>
        <select
          value={deptFilter}
          onChange={e => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
        >
          <option value="">All departments</option>
          {departments.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
        </select>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" /> Add position
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="px-6 py-3 bg-primary/5 border-b border-primary/10 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input
            value={draft.name_en}
            onChange={e => setDraft(d => ({ ...d, name_en: e.target.value }))}
            placeholder="Position (English)"
            autoFocus
            className="col-span-2 px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
          />
          <input
            value={draft.name_ar}
            onChange={e => setDraft(d => ({ ...d, name_ar: e.target.value }))}
            placeholder="المسمى الوظيفي"
            dir="rtl"
            className="col-span-1 px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary text-right"
          />
          <select
            value={draft.department_key}
            onChange={e => setDraft(d => ({ ...d, department_key: e.target.value }))}
            className="col-span-1 px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
          >
            <option value="">Department</option>
            {departments.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
          </select>
          <div className="col-span-1 flex gap-1">
            <button
              onClick={handleAdd}
              disabled={saving === 'new' || !draft.name_en.trim()}
              className="flex-1 px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm"
            >
              {saving === 'new' ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save'}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-2 py-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Merge banner */}
      {mergeMode && (
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
          <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
          <span>Pick the target position for <strong>"{mergeMode.from.name_en}"</strong> — the {mergeMode.from.employees_count} employees will move to it.</span>
          <button onClick={() => setMergeMode(null)} className="ml-auto p-1 rounded-lg hover:bg-amber-100 text-amber-700">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* List */}
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Layers} title="No positions match" subtitle={search ? `Nothing matches "${search}"` : "Add one from the button above."} />
        ) : (
          <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
            {filtered.map(p => {
              const isMergeTarget = mergeMode && mergeMode.from.id !== p.id
              return (
                <div
                  key={p.id}
                  onClick={() => isMergeTarget && handleMerge(p.id)}
                  className={`group flex items-center gap-3 pl-3 pr-3 py-2 rounded-xl border transition-all ${
                    isMergeTarget
                      ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-100 cursor-pointer'
                      : p.is_active
                      ? 'border-neutral-100 hover:border-primary/30 hover:shadow-sm bg-white'
                      : 'border-neutral-100 bg-neutral-50/60 opacity-70'
                  }`}
                >
                  <div className={`w-2 h-9 rounded-full shrink-0 ${p.employees_count > 0 ? 'bg-primary' : 'bg-neutral-200'}`} />
                  <div className="flex-1 min-w-0">
                    <input
                      defaultValue={p.name_en}
                      onClick={e => e.stopPropagation()}
                      onBlur={e => e.target.value !== p.name_en && handleUpdate(p.id, { name_en: e.target.value })}
                      className="w-full px-2 py-1 text-sm font-medium text-secondary-700 bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                    />
                  </div>
                  <input
                    defaultValue={p.name_ar ?? ''}
                    onClick={e => e.stopPropagation()}
                    onBlur={e => e.target.value !== (p.name_ar ?? '') && handleUpdate(p.id, { name_ar: e.target.value })}
                    className="w-36 px-2 py-1 text-sm bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none text-right"
                    dir="rtl"
                    placeholder="—"
                  />
                  <select
                    defaultValue={p.department_key ?? ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => handleUpdate(p.id, { department_key: e.target.value || null })}
                    className="w-24 px-2 py-1 text-[11px] font-semibold uppercase text-neutral-500 bg-neutral-50 border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                  >
                    <option value="">—</option>
                    {departments.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
                  </select>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.employees_count > 0 ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-400'}`}>
                    {p.employees_count}
                  </span>
                  <button
                    onClick={e => { e.stopPropagation(); handleUpdate(p.id, { is_active: !p.is_active }) }}
                    className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all flex items-center gap-1 ${
                      p.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-neutral-400'}`} />
                    {p.is_active ? 'ON' : 'OFF'}
                  </button>
                  {p.employees_count > 0 && !mergeMode && (
                    <button
                      onClick={e => { e.stopPropagation(); setMergeMode({ from: p }) }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-amber-600 hover:bg-amber-100 px-2 py-1 rounded-lg transition-all"
                      title="Merge into another position"
                    >
                      Merge
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(p) }}
                    disabled={saving === p.id}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all"
                  >
                    {saving === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin opacity-100" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </SectionShell>
  )
}
