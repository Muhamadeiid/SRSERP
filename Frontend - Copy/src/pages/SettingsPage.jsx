import { useState, useEffect, useRef } from 'react'
import { Users, Settings, Search, X, Check, UserCheck, Loader2, Plus, Tag, Trash2, ShieldCheck, ArrowRight, GripVertical, Layers, GitBranch, Zap } from 'lucide-react'
import { getSettings, saveSetting, getManagers, getManagerEmps, assignEmployee } from '../services/settingsService'
import { getEmployees, searchEmployees } from '../services/employeeService'
import { listLookupsAll, createLookup, updateLookup, deleteLookup, invalidateLookups } from '../services/lookupService'
import { listPositionsAll, createPosition, updatePosition, deletePosition, mergePositions, searchPositions } from '../services/positionService'
import { getPermissionMatrix, togglePermission, teamTransfer } from '../services/permissionService'
import { listAssignmentRules, createAssignmentRule, updateAssignmentRule, deleteAssignmentRule, applyAssignmentRules } from '../services/assignmentRuleService'
import { listProjects, createProject, updateProject, deleteProject } from '../services/projectService'
import { listIssuingSources, createIssuingSource, updateIssuingSource, deleteIssuingSource } from '../services/issuingSourceService'
import { useLookups } from '../hooks/useLookups'

const ATTENDANCE_POLICY_DEFAULTS = {
  attendance_regular_start_time: '08:00',
  attendance_regular_ot_start_time: '17:00',
  attendance_night_ot_start_time: '19:00',
  attendance_checkout_cutoff_time: '12:00',
  attendance_regular_expected_hours: 9,
  attendance_intervention_expected_hours: 9,
  attendance_late_grace_minutes: 15,
  attendance_single_punch_gap_minutes: 30,
  attendance_absent_deduction_minutes: 540,
  attendance_regular_weekly_off_day: 5,
  attendance_intervention_default_off_day: 5,
  attendance_saturday_rotation_enabled: '1',
  attendance_group_a_off_even_week: '1',
}

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

  const [attendancePolicy, setAttendancePolicy] = useState(ATTENDANCE_POLICY_DEFAULTS)
  const [attendancePolicySaved, setAttendancePolicySaved] = useState(false)
  const [attendancePolicySaving, setAttendancePolicySaving] = useState(false)

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
      setAttendancePolicy({
        ...ATTENDANCE_POLICY_DEFAULTS,
        ...Object.fromEntries(Object.keys(ATTENDANCE_POLICY_DEFAULTS).map(key => [
          key,
          r.data?.[key] ?? ATTENDANCE_POLICY_DEFAULTS[key],
        ])),
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

  const setPolicy = (key, value) => {
    setAttendancePolicy(p => ({ ...p, [key]: value }))
    setAttendancePolicySaved(false)
  }

  const handleSaveAttendancePolicy = async () => {
    setAttendancePolicySaving(true)
    try {
      await Promise.all(Object.entries(attendancePolicy).map(([key, value]) => saveSetting(key, String(value))))
      setAttendancePolicySaved(true)
      setTimeout(() => setAttendancePolicySaved(false), 2500)
    } finally { setAttendancePolicySaving(false) }
  }

  const roleLabel = (role) => {
    if (role === 'depot_manager') return 'Depot Manager'
    if (role === 'admin')         return 'Super Admin'
    if (role === 'manager')       return 'Manager'
    if (role === 'hr')            return 'HR'
    return 'Staff'
  }

  const [activeTab, setActiveTab] = useState('org')

  const TABS = [
    { key: 'org',      label: 'Org Structure', icon: Users,       desc: 'Managers, assignments & team transfer' },
    { key: 'hr',       label: 'HR & Leaves',   icon: Settings,    desc: 'Leave defaults, HR officer' },
    { key: 'master',   label: 'Master Data',   icon: Tag,         desc: 'Departments, locations, categories, roles' },
    { key: 'perms',    label: 'Permissions',   icon: ShieldCheck, desc: 'Role × permission matrix' },
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

      {/* ── Section 8: Assignment Rules ── */}
      <AssignmentRulesPanel />

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
          <h2 className="text-sm font-bold text-secondary-700">Attendance Policy</h2>
          <p className="text-xs text-neutral-400 ml-2">Shift timing, late rules, weekly off, and Saturday rotation</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              ['attendance_regular_start_time', 'Regular Start', 'time'],
              ['attendance_regular_ot_start_time', 'Regular OT Start', 'time'],
              ['attendance_night_ot_start_time', 'Night OT Starts', 'time'],
              ['attendance_checkout_cutoff_time', 'Single Punch Cutoff', 'time'],
            ].map(([key, label, type]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">{label}</label>
                <input
                  type={type}
                  value={attendancePolicy[key]}
                  onChange={e => setPolicy(key, e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors font-bold"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              ['attendance_regular_expected_hours', 'Regular Hours', 0, 24],
              ['attendance_intervention_expected_hours', 'Intervention Hours', 0, 24],
              ['attendance_late_grace_minutes', 'Late Grace Min', 0, 240],
              ['attendance_single_punch_gap_minutes', 'Full Day Gap Min', 1, 240],
              ['attendance_absent_deduction_minutes', 'Absent Deduction Min', 0, 1440],
            ].map(([key, label, min, max]) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">{label}</label>
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={attendancePolicy[key]}
                  onChange={e => setPolicy(key, e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary transition-colors text-center font-bold"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Regular Weekly Off</label>
              <select value={attendancePolicy.attendance_regular_weekly_off_day} onChange={e => setPolicy('attendance_regular_weekly_off_day', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white transition-colors">
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Intervention Default Off</label>
              <select value={attendancePolicy.attendance_intervention_default_off_day} onChange={e => setPolicy('attendance_intervention_default_off_day', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white transition-colors">
                {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day, i) => <option key={day} value={i}>{day}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Saturday Rotation</label>
              <select value={attendancePolicy.attendance_saturday_rotation_enabled} onChange={e => setPolicy('attendance_saturday_rotation_enabled', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white transition-colors">
                <option value="1">Enabled</option>
                <option value="0">Disabled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">Group A Off</label>
              <select value={attendancePolicy.attendance_group_a_off_even_week} onChange={e => setPolicy('attendance_group_a_off_even_week', e.target.value)} className="w-full px-3 py-2.5 text-sm border border-neutral-200 rounded-xl outline-none focus:border-primary bg-white transition-colors">
                <option value="1">Even ISO weeks</option>
                <option value="0">Odd ISO weeks</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSaveAttendancePolicy}
            disabled={attendancePolicySaving}
            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl transition-all ${
              attendancePolicySaved ? 'bg-green-600 text-white' : 'bg-primary text-white hover:bg-primary/90 disabled:opacity-40'
            }`}
          >
            {attendancePolicySaved ? <><Check className="w-4 h-4" /> Saved</> : attendancePolicySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Attendance Policy'}
          </button>
        </div>
      </div>

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
        <ProjectsPanel />
        <IssuingSourcesPanel />
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
// Manager picker — searchable employee dropdown
// ─────────────────────────────────────────────────────────────────────
function ManagerPicker({ value, valueName, onSelect, placeholder = 'Search manager…', direction = 'down' }) {
  const [q, setQ]       = useState(valueName || '')
  const [results, setR] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => { setQ(valueName || '') }, [valueName])

  const onChange = (v) => {
    setQ(v); setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    if (!v || v.length < 2) { setR([]); return }
    timer.current = setTimeout(async () => {
      setBusy(true)
      try { const d = await searchEmployees(v); setR(Array.isArray(d) ? d : (d.data ?? [])) }
      catch { setR([]) }
      finally { setBusy(false) }
    }, 250)
  }

  // Rules panel sits at the very bottom of the settings tab, so opening the
  // dropdown downward pushes suggestions off-screen. `direction="up"` flips
  // the popover to sit above the input instead.
  const popoverPos = direction === 'up'
    ? 'bottom-full mb-1'
    : 'top-full mt-1'

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => onChange(e.target.value)}
          onFocus={() => q.length >= 2 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-neutral-300" />}
      </div>
      {open && results.length > 0 && (
        <div className={`absolute z-40 left-0 right-0 ${popoverPos} bg-white border border-neutral-200 rounded-xl shadow-xl max-h-48 overflow-y-auto`}>
          {results.map(emp => (
            <button key={emp.id} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(emp); setQ(emp.name); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 text-left border-b border-neutral-50 last:border-0">
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-black shrink-0">
                {emp.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-secondary-700 truncate">{emp.name}</p>
                <p className="text-[10px] text-neutral-400 truncate">{emp.position}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Position autocomplete for the Auto-Assignment Rules form. Reads from the
// Positions master list so admins pick a real, canonical title instead of
// typing a substring that may or may not match anything.
function PositionSearchInput({ value, onChange, direction = 'down' }) {
  const [q, setQ]       = useState(value || '')
  const [results, setR] = useState([])
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)

  useEffect(() => { setQ(value || '') }, [value])

  const runSearch = (v) => {
    setQ(v); onChange(v); setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setBusy(true)
      try { const d = await searchPositions(v || ''); setR(Array.isArray(d) ? d : (d.data ?? [])) }
      catch { setR([]) }
      finally { setBusy(false) }
    }, 200)
  }

  const popoverPos = direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'

  return (
    <div className="relative">
      <div className="relative">
        <Layers className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
        <input
          value={q}
          onChange={e => runSearch(e.target.value)}
          onFocus={() => runSearch(q)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search position… e.g. Intervention"
          className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-neutral-300" />}
      </div>
      {open && results.length > 0 && (
        <div className={`absolute z-40 left-0 right-0 ${popoverPos} bg-white border border-neutral-200 rounded-xl shadow-xl max-h-48 overflow-y-auto`}>
          {results.map(p => (
            <button key={p.id} type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onChange(p.name_en); setQ(p.name_en); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-primary/5 text-left border-b border-neutral-50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-secondary-700 truncate">{p.name_en}</p>
                {p.name_ar && <p className="text-[10px] text-neutral-400 text-right truncate" dir="rtl">{p.name_ar}</p>}
              </div>
              <span className="text-[10px] font-mono text-neutral-400 shrink-0">{p.department_key ?? '—'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Assignment Rules — auto direct-manager by position / department
// ─────────────────────────────────────────────────────────────────────
function AssignmentRulesPanel() {
  const { departments, locations } = useLookups()
  const [rules, setRules]   = useState([])
  const [loading, setLoad]  = useState(true)
  const [saving, setSaving] = useState(null)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied]   = useState(null)
  const [showAdd, setShowAdd]   = useState(false)
  const [ruleMode, setRuleMode] = useState('position_location')
  const [draft, setDraft] = useState({ match_field: 'position', match_value: '', direct_manager_id: null, manager_name: '', department: '', work_location: '' })

  const load = () => listAssignmentRules().then(setRules).finally(() => setLoad(false))
  useEffect(() => { load() }, [])

  const deptLabel = (key) => departments.find(d => d.key === key)?.label_en ?? key
  const locationLabel = (key) => locations.find(l => l.key === key)?.label_en ?? key
  const isLocationRule = (rule) => rule.match_field === 'position' && rule.work_location && !rule.department && !rule.manager

  const handleAdd = async () => {
    if (!draft.match_value.trim()) return
    if (ruleMode === 'position_location' && !draft.work_location) return
    setSaving('new')
    try {
      await createAssignmentRule({
        match_field: draft.match_field,
        match_value: draft.match_value,
        direct_manager_id: ruleMode === 'position_location' ? null : draft.direct_manager_id || null,
        department: ruleMode === 'position_location' ? null : draft.department || null,
        work_location: draft.work_location || null,
      })
      setDraft({ match_field: 'position', match_value: '', direct_manager_id: null, manager_name: '', department: '', work_location: '' })
      setShowAdd(false)
      await load()
    } finally { setSaving(null) }
  }

  const handleToggle = async (rule) => {
    setSaving(rule.id)
    try { await updateAssignmentRule(rule.id, { is_active: !rule.is_active }); await load() }
    finally { setSaving(null) }
  }

  const handleDelete = async (rule) => {
    if (!confirm(`Delete this rule? Employees keep their current manager until rules are re-applied.`)) return
    setSaving(rule.id)
    try { await deleteAssignmentRule(rule.id); await load() }
    finally { setSaving(null) }
  }

  const handleApply = async () => {
    setApplying(true); setApplied(null)
    try {
      const r = await applyAssignmentRules()
      setApplied(`Updated ${r.changed} employee${r.changed !== 1 ? 's' : ''}.`)
    } finally { setApplying(false) }
  }

  return (
    <SectionShell
      icon={Zap}
      iconTint="amber"
      title="Auto-Assignment Rules"
      subtitle="Auto-assign department, location, and manager by position — manual picks are always kept"
      actions={
        <button
          onClick={handleApply}
          disabled={applying || rules.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm"
        >
          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          Apply now
        </button>
      }
    >
      {applied && (
        <div className="px-6 py-2 bg-green-50 border-b border-green-100 flex items-center gap-1.5 text-xs font-semibold text-green-700">
          <Check className="w-3.5 h-3.5" /> {applied}
        </div>
      )}

      <div className="p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : rules.length === 0 ? (
          <EmptyState icon={Zap} title="No rules yet" subtitle="Add one to auto-assign a manager by position or department." />
        ) : (
          <div className="space-y-2">
            {rules.map(rule => (
              <div key={rule.id} className={`group flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border transition-all ${
                rule.is_active ? 'border-neutral-100 bg-white hover:border-primary/30 hover:shadow-sm' : 'border-neutral-100 bg-neutral-50/60 opacity-70'
              }`}>
                <span className={`text-[10px] font-bold uppercase px-2 py-1 rounded-lg shrink-0 ${
                  isLocationRule(rule) ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}>
                  {isLocationRule(rule) ? 'Position -> Location' : rule.match_field === 'position' ? 'Position rule' : 'Dept rule'}
                </span>
                <span className="text-sm font-medium text-secondary-700 min-w-0 truncate">
                  {rule.match_field === 'department' ? deptLabel(rule.match_value) : rule.match_value}
                </span>
                <ArrowRight className="w-4 h-4 text-neutral-300 shrink-0" />
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  {rule.department && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 shrink-0">
                      {deptLabel(rule.department)}
                    </span>
                  )}
                  {rule.work_location && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-700 shrink-0">
                      {locationLabel(rule.work_location)}
                    </span>
                  )}
                  {rule.manager && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[8px] font-black shrink-0">
                        {rule.manager.name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <span className="text-xs font-semibold text-secondary-700 truncate">{rule.manager.name}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleToggle(rule)}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all shrink-0 ${
                    rule.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? 'bg-green-500' : 'bg-neutral-400'}`} />
                  {rule.is_active ? 'ACTIVE' : 'OFF'}
                </button>
                <button
                  onClick={() => handleDelete(rule)}
                  disabled={saving === rule.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all shrink-0"
                >
                  {saving === rule.id ? <Loader2 className="w-4 h-4 animate-spin opacity-100" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add rule */}
        {!showAdd ? (
          <button
            onClick={() => {
              setShowAdd(true)
              setRuleMode('position_location')
              setDraft({ match_field: 'position', match_value: '', direct_manager_id: null, manager_name: '', department: '', work_location: '' })
            }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary border border-dashed border-neutral-200 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all w-full justify-center"
          >
            <Plus className="w-4 h-4" /> Add rule
          </button>
        ) : (
          <div className="p-4 border border-primary/20 bg-primary/5 rounded-xl space-y-3">
            <div>
              <p className="text-xs font-bold text-secondary-700 mb-2">What do you want this rule to do?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRuleMode('position_location')
                    setDraft(d => ({ ...d, match_field: 'position', direct_manager_id: null, manager_name: '', department: '' }))
                  }}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    ruleMode === 'position_location'
                      ? 'border-green-300 bg-green-50 shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-green-200'
                  }`}
                >
                  <p className="text-sm font-black text-secondary-700">Set location by Position</p>
                  <p className="text-xs text-neutral-500 mt-1">Pick one position, then move everyone with it to one work location.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRuleMode('advanced')}
                  className={`text-left rounded-xl border p-3 transition-all ${
                    ruleMode === 'advanced'
                      ? 'border-primary/40 bg-white shadow-sm'
                      : 'border-neutral-200 bg-white hover:border-primary/30'
                  }`}
                >
                  <p className="text-sm font-black text-secondary-700">Advanced assignment rule</p>
                  <p className="text-xs text-neutral-500 mt-1">Match by position or department, then set department, location, or manager.</p>
                </button>
              </div>
            </div>
            <p className="text-xs font-bold text-secondary-700">When position/department matches…</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* field toggle */}
              <div className={`${ruleMode === 'position_location' ? 'hidden' : 'inline-flex'} rounded-lg border border-neutral-200 overflow-hidden bg-white w-fit`}>
                {['position', 'department'].map(f => (
                  <button key={f}
                    onClick={() => setDraft(d => ({ ...d, match_field: f, match_value: '' }))}
                    className={`px-3 py-2 text-xs font-semibold ${draft.match_field === f ? 'bg-primary text-white' : 'text-neutral-500'}`}
                  >
                    {f === 'position' ? 'Position' : 'Dept'}
                  </button>
                ))}
              </div>
              {/* value */}
              {draft.match_field === 'department' ? (
                <select
                  value={draft.match_value}
                  onChange={e => setDraft(d => ({ ...d, match_value: e.target.value }))}
                  className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
                >
                  <option value="">Select department…</option>
                  {departments.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
                </select>
              ) : (
                <PositionSearchInput
                  value={draft.match_value}
                  onChange={v => setDraft(d => ({ ...d, match_value: v }))}
                  direction="up"
                />
              )}
            </div>

            <p className="text-xs font-bold text-secondary-700">…assign these values:</p>
            <div className={`grid grid-cols-1 ${ruleMode === 'position_location' ? '' : 'sm:grid-cols-3'} gap-2`}>
              {/* department */}
              <select
                value={draft.department}
                onChange={e => setDraft(d => ({ ...d, department: e.target.value }))}
                className={`${ruleMode === 'position_location' ? 'hidden' : ''} px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary`}
              >
                <option value="">Department (optional)</option>
                {departments.map(d => <option key={d.key} value={d.key}>{d.label_en}</option>)}
              </select>
              {/* location */}
              <select
                value={draft.work_location}
                onChange={e => setDraft(d => ({ ...d, work_location: e.target.value }))}
                className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
              >
                <option value="">{ruleMode === 'position_location' ? 'Select location...' : 'Location (optional)'}</option>
                {locations.map(l => <option key={l.key} value={l.key}>{l.label_en}</option>)}
              </select>
              {/* manager */}
              {ruleMode !== 'position_location' && (
                <ManagerPicker
                  valueName={draft.manager_name}
                  onSelect={emp => setDraft(d => ({ ...d, direct_manager_id: emp.id, manager_name: emp.name }))}
                  direction="up"
                />
              )}
            </div>

            {/* actions */}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAdd(false)
                  setDraft({ match_field: 'position', match_value: '', direct_manager_id: null, manager_name: '', department: '', work_location: '' })
                }}
                className="px-3 py-2 text-xs text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={saving === 'new' || !draft.match_value.trim() || (ruleMode === 'position_location' && !draft.work_location)}
                className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm"
              >
                {saving === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : ruleMode === 'position_location' ? 'Add Location Rule' : 'Add Rule'}
              </button>
            </div>
          </div>
        )}
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

// ─────────────────────────────────────────────────────────────────────
// Projects — configurable list of projects (Ganz, CML1, CML3, …)
// ─────────────────────────────────────────────────────────────────────
function ProjectsPanel() {
  const [items, setItems]     = useState([])
  const [loading, setLoad]    = useState(true)
  const [saving, setSaving]   = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft]     = useState({ code: '', name: '', name_ar: '', match_prefix: '', match_locations: '' })

  const load = () => listProjects().then(setItems).finally(() => setLoad(false))
  useEffect(() => { load() }, [])

  const handleUpdate = async (id, patch) => {
    setSaving(id)
    try { await updateProject(id, patch); await load() }
    finally { setSaving(null) }
  }

  const handleSetDefault = async (id) => {
    setSaving(id)
    try { await updateProject(id, { is_default: true }); await load() }
    finally { setSaving(null) }
  }

  const handleAdd = async () => {
    if (!draft.code.trim() || !draft.name.trim()) return
    setSaving('new')
    try {
      await createProject({ ...draft })
      setDraft({ code: '', name: '', name_ar: '', match_prefix: '', match_locations: '' })
      setShowAdd(false)
      await load()
    } finally { setSaving(null) }
  }

  const handleDelete = async (item) => {
    if (item.employees_count > 0) {
      alert(`Can't delete — ${item.employees_count} employee(s) belong to this project. Deactivate it instead.`)
      return
    }
    if (!confirm(`Delete project "${item.name}"?`)) return
    setSaving(item.id)
    try { await deleteProject(item.id); await load() }
    catch (e) { alert(e.response?.data?.message ?? 'Delete failed') }
    finally { setSaving(null) }
  }

  const totalEmployees = items.reduce((s, p) => s + (p.employees_count ?? 0), 0)

  return (
    <SectionShell
      icon={GitBranch}
      iconTint="purple"
      title="Projects"
      subtitle="Match employees to a project by the start of their project_budget — the code appears on printed forms"
      actions={
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-neutral-400">
          <span className="bg-neutral-100 px-2 py-1 rounded-lg">{items.length} projects</span>
          <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">{totalEmployees} employees</span>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={GitBranch} title="No projects yet" subtitle="Add one to start routing employees by their project_budget." />
        ) : (
          <div className="space-y-2">
            {items.map(p => (
              <div key={p.id} className={`group flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border transition-all ${
                p.is_active ? 'border-neutral-100 bg-white hover:border-primary/30 hover:shadow-sm' : 'border-neutral-100 bg-neutral-50/60 opacity-70'
              }`}>
                <input
                  defaultValue={p.code}
                  onBlur={e => e.target.value !== p.code && handleUpdate(p.id, { code: e.target.value.toUpperCase() })}
                  className="w-16 px-2 py-1.5 text-xs font-mono font-bold uppercase text-purple-700 bg-purple-50 border border-transparent hover:border-purple-200 focus:border-primary rounded-lg outline-none text-center"
                />
                <div className="flex-1 min-w-0 grid grid-cols-2 gap-1">
                  <input
                    defaultValue={p.name}
                    onBlur={e => e.target.value !== p.name && handleUpdate(p.id, { name: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm font-medium text-secondary-700 bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                  />
                  <input
                    defaultValue={p.name_ar ?? ''}
                    onBlur={e => e.target.value !== (p.name_ar ?? '') && handleUpdate(p.id, { name_ar: e.target.value })}
                    className="w-full px-2 py-1.5 text-sm bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none text-right"
                    dir="rtl"
                    placeholder="—"
                  />
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-neutral-400">budget starts with</span>
                  <input
                    defaultValue={p.match_prefix ?? ''}
                    onBlur={e => e.target.value !== (p.match_prefix ?? '') && handleUpdate(p.id, { match_prefix: e.target.value || null })}
                    placeholder="e.g. CML3"
                    className="w-24 px-2 py-1.5 text-xs font-mono bg-white border border-neutral-200 hover:border-primary/40 focus:border-primary rounded-lg outline-none"
                  />
                  <span className="text-neutral-400">locations</span>
                  <input
                    defaultValue={p.match_locations ?? ''}
                    onBlur={e => e.target.value !== (p.match_locations ?? '') && handleUpdate(p.id, { match_locations: e.target.value || null })}
                    placeholder="Ramses, AbuGhates, Farz"
                    className="w-40 px-2 py-1.5 text-xs bg-white border border-neutral-200 hover:border-primary/40 focus:border-primary rounded-lg outline-none"
                  />
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${p.employees_count > 0 ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-400'}`}>
                  {p.employees_count} emp
                </span>
                <button
                  onClick={() => handleSetDefault(p.id)}
                  disabled={p.is_default || saving === p.id}
                  className={`text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                    p.is_default ? 'bg-amber-50 text-amber-700 cursor-default' : 'bg-neutral-50 text-neutral-400 hover:bg-amber-50 hover:text-amber-700'
                  }`}
                  title={p.is_default ? 'Fallback for unmatched budgets' : 'Set as default (fallback)'}
                >
                  {p.is_default ? '★ DEFAULT' : '☆ DEFAULT'}
                </button>
                <button
                  onClick={() => handleUpdate(p.id, { is_active: !p.is_active })}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                    p.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${p.is_active ? 'bg-green-500' : 'bg-neutral-400'}`} />
                  {p.is_active ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  disabled={saving === p.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all"
                >
                  {saving === p.id ? <Loader2 className="w-4 h-4 animate-spin opacity-100" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add */}
        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary border border-dashed border-neutral-200 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all w-full justify-center"
          >
            <Plus className="w-4 h-4" /> Add project
          </button>
        ) : (
          <div className="p-3 border border-primary/20 bg-primary/5 rounded-xl grid grid-cols-1 sm:grid-cols-[90px_1fr_1fr_120px_180px_auto] gap-2">
            <input
              value={draft.code}
              onChange={e => setDraft(d => ({ ...d, code: e.target.value.toUpperCase() }))}
              placeholder="CODE"
              autoFocus
              className="px-3 py-2 text-xs font-mono font-bold uppercase text-center bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
            />
            <input
              value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
              placeholder="Project name (e.g. Cairo Metro Line 3)"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
            />
            <input
              value={draft.name_ar}
              onChange={e => setDraft(d => ({ ...d, name_ar: e.target.value }))}
              placeholder="الاسم بالعربي"
              dir="rtl"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary text-right"
            />
            <input
              value={draft.match_prefix}
              onChange={e => setDraft(d => ({ ...d, match_prefix: e.target.value }))}
              placeholder="budget prefix"
              className="px-3 py-2 text-xs font-mono bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
            />
            <input
              value={draft.match_locations}
              onChange={e => setDraft(d => ({ ...d, match_locations: e.target.value }))}
              placeholder="locations"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary"
            />
            <div className="flex gap-1">
              <button
                onClick={handleAdd}
                disabled={saving === 'new' || !draft.code.trim() || !draft.name.trim()}
                className="px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm"
              >
                {saving === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-2 py-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-50">
          <span className="font-semibold text-neutral-500">How it works:</span> when an employee's <code className="font-mono bg-neutral-100 px-1 rounded">project_budget</code> starts with a project's prefix, that project's code shows on their forms. If none match, the ★ default project's code is used.
        </p>
      </div>
    </SectionShell>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Issuing Sources — where an asset originally came from (EHS, IT, …)
// ─────────────────────────────────────────────────────────────────────
function IssuingSourcesPanel() {
  const [items, setItems]   = useState([])
  const [loading, setLoad]  = useState(true)
  const [saving, setSaving] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft]   = useState({ key: '', label_en: '', label_ar: '', manager_name: '', manager_user_id: null })

  const load = () => listIssuingSources().then(setItems).finally(() => setLoad(false))
  useEffect(() => { load() }, [])

  const handleUpdate = async (id, patch) => {
    setSaving(id)
    try { await updateIssuingSource(id, patch); await load() }
    finally { setSaving(null) }
  }

  const handleAdd = async () => {
    if (!draft.key.trim() || !draft.label_en.trim()) return
    setSaving('new')
    try {
      await createIssuingSource(draft)
      setDraft({ key: '', label_en: '', label_ar: '', manager_name: '', manager_user_id: null })
      setShowAdd(false)
      await load()
    } finally { setSaving(null) }
  }

  const handleDelete = async (item) => {
    if (item.active_assets_count > 0) {
      alert(`Can't delete — ${item.active_assets_count} active asset(s) come from this source. Deactivate it instead.`)
      return
    }
    if (!confirm(`Delete source "${item.label_en}"?`)) return
    setSaving(item.id)
    try { await deleteIssuingSource(item.id); await load() }
    catch (e) { alert(e.response?.data?.message ?? 'Delete failed') }
    finally { setSaving(null) }
  }

  const total = items.reduce((s, x) => s + (x.active_assets_count ?? 0), 0)

  return (
    <SectionShell
      icon={Layers}
      iconTint="green"
      title="Issuing Sources"
      subtitle="Departments that issue assets — the Receiver name here signs the Clearance Form when the employee returns them"
      actions={
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-semibold text-neutral-400">
          <span className="bg-neutral-100 px-2 py-1 rounded-lg">{items.length} sources</span>
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-lg">{total} active assets</span>
        </div>
      }
    >
      <div className="p-6 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : items.length === 0 ? (
          <EmptyState icon={Layers} title="No sources yet" subtitle="Add the departments that hand out assets." />
        ) : (
          <div className="space-y-2">
            {items.map(s => (
              <div key={s.id} className={`group flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-xl border transition-all ${
                s.is_active ? 'border-neutral-100 bg-white hover:border-primary/30 hover:shadow-sm' : 'border-neutral-100 bg-neutral-50/60 opacity-70'
              }`}>
                <span className="text-[10px] font-mono uppercase text-neutral-400 w-16 truncate">{s.key}</span>
                <input
                  defaultValue={s.label_en}
                  onBlur={e => e.target.value !== s.label_en && handleUpdate(s.id, { label_en: e.target.value })}
                  className="flex-1 min-w-0 px-2 py-1.5 text-sm font-medium text-secondary-700 bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                />
                <input
                  defaultValue={s.label_ar ?? ''}
                  onBlur={e => e.target.value !== (s.label_ar ?? '') && handleUpdate(s.id, { label_ar: e.target.value })}
                  className="w-36 px-2 py-1.5 text-sm bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none text-right"
                  dir="rtl"
                  placeholder="—"
                />
                <input
                  defaultValue={s.manager_name ?? ''}
                  onBlur={e => e.target.value !== (s.manager_name ?? '') && handleUpdate(s.id, { manager_name: e.target.value })}
                  placeholder="Receiver name…"
                  className="w-44 px-2 py-1.5 text-xs bg-transparent border border-transparent hover:border-neutral-200 focus:border-primary rounded-lg outline-none"
                />
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${s.active_assets_count > 0 ? 'bg-primary/10 text-primary' : 'bg-neutral-100 text-neutral-400'}`}>
                  {s.active_assets_count}
                </span>
                <button
                  onClick={() => handleUpdate(s.id, { is_active: !s.is_active })}
                  className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full transition-all ${
                    s.is_active ? 'bg-green-50 text-green-700 hover:bg-green-100' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green-500' : 'bg-neutral-400'}`} />
                  {s.is_active ? 'ON' : 'OFF'}
                </button>
                <button
                  onClick={() => handleDelete(s)}
                  disabled={saving === s.id}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-50 text-neutral-300 hover:text-red-500 transition-all"
                >
                  {saving === s.id ? <Loader2 className="w-4 h-4 animate-spin opacity-100" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        )}

        {!showAdd ? (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-primary border border-dashed border-neutral-200 rounded-xl hover:border-primary/40 hover:bg-primary/5 transition-all w-full justify-center"
          >
            <Plus className="w-4 h-4" /> Add source
          </button>
        ) : (
          <div className="p-3 border border-primary/20 bg-primary/5 rounded-xl grid grid-cols-1 sm:grid-cols-[100px_1fr_140px_1fr_auto] gap-2">
            <input value={draft.key} onChange={e => setDraft(d => ({ ...d, key: e.target.value.toLowerCase() }))} placeholder="key" autoFocus
              className="px-3 py-2 text-xs font-mono bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary" />
            <input value={draft.label_en} onChange={e => setDraft(d => ({ ...d, label_en: e.target.value }))} placeholder="English label"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary" />
            <input value={draft.label_ar} onChange={e => setDraft(d => ({ ...d, label_ar: e.target.value }))} placeholder="التسمية العربية" dir="rtl"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary text-right" />
            <input value={draft.manager_name} onChange={e => setDraft(d => ({ ...d, manager_name: e.target.value }))} placeholder="Receiver name…"
              className="px-3 py-2 text-xs bg-white border border-neutral-200 rounded-lg outline-none focus:border-primary" />
            <div className="flex gap-1">
              <button onClick={handleAdd} disabled={saving === 'new' || !draft.key.trim() || !draft.label_en.trim()}
                className="px-3 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 disabled:opacity-40 shadow-sm">
                {saving === 'new' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
              </button>
              <button onClick={() => setShowAdd(false)} className="px-2 py-2 text-neutral-400 hover:text-neutral-600 rounded-lg hover:bg-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <p className="text-[11px] text-neutral-400 pt-2 border-t border-neutral-50">
          <span className="font-semibold text-neutral-500">Receiver name</span> shows up on the Clearance Form as the signatory when a resigned employee returns assets from this source — no code change needed to add a new department.
        </p>
      </div>
    </SectionShell>
  )
}
