import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import { ArrowRight, Search, X } from 'lucide-react'

const HR_FULL = ['admin', 'depot_manager', 'hr']
const PROC_FULL = ['admin', 'depot_manager', 'procurement', 'purchasing']
const DASH_FULL = ['admin', 'depot_manager']

const PAGES = [
  { label: 'Dashboard', group: 'General', path: '/', keywords: 'home overview الرئيسية' },
  { label: 'Work Calendar', group: 'General', path: '/work-calendar', keywords: 'calendar events tasks التقويم المهام' },
  { label: 'Notifications', group: 'General', path: '/notifications', keywords: 'alerts messages التنبيهات الاشعارات' },
  { label: 'Incident Reports', group: 'General', path: '/incident-reports', keywords: 'incident safety report الحوادث التقارير' },
  { label: 'Release Notes', group: 'General', path: '/release-notes', keywords: 'release train work order notes' },

  { label: 'Leave Requests', group: 'Human Resources', path: '/human-resources/leave', keywords: 'lrf leave vacation اجازات طلب اجازة' },
  { label: 'Overtime Requests', group: 'Human Resources', path: '/human-resources/overtime', keywords: 'otr overtime extra hours اضافي اوفر تايم' },
  { label: 'Workforce', group: 'Human Resources', path: '/human-resources', keywords: 'employees staff ibs punch الموظفين القوى العاملة', roles: HR_FULL },
  { label: 'Organization Chart', group: 'Human Resources', path: '/human-resources/org-chart', keywords: 'org managers hierarchy الهيكل التنظيمي', roles: HR_FULL },
  { label: 'Resignations', group: 'Human Resources', path: '/human-resources/resignations', keywords: 'ex employees resignation استقالات', roles: HR_FULL },
  { label: 'Leave Master List', group: 'Human Resources', path: '/human-resources/leave-master', keywords: 'leave history master سجل الاجازات', roles: HR_FULL },
  { label: 'Weekly Leave Report', group: 'Human Resources', path: '/human-resources/weekly-leave-report', keywords: 'weekly report تقرير اسبوعي', roles: HR_FULL },
  { label: 'Attendance', group: 'Human Resources', path: '/human-resources/attendance', keywords: 'attendance biometric punch حضور انصراف بصمة', roles: [...HR_FULL, 'ccp'] },
  { label: 'Intervention Shifts', group: 'Human Resources', path: '/human-resources/intervention-shifts', keywords: 'shift intervention mainline ورديات', roles: [...HR_FULL, 'ccp'] },
  { label: 'Saturday Rotation', group: 'Human Resources', path: '/human-resources/saturday-rotation', keywords: 'saturday groups rotation السبت', roles: HR_FULL },
  { label: 'Internal Salary', group: 'Human Resources', path: '/human-resources/internal-salary', keywords: 'salary payroll مرتبات رواتب', roles: HR_FULL },
  { label: 'Attendance Calendar', group: 'Human Resources', path: '/human-resources/calendar', keywords: 'attendance leave calendar تقويم الحضور', roles: HR_FULL },
  { label: 'Certifications', group: 'Human Resources', path: '/human-resources/certifications', keywords: 'certificate training شهادات', roles: HR_FULL },
  { label: 'Disciplinary Cases', group: 'Human Resources', path: '/human-resources/disciplinary', keywords: 'disciplinary violation جزاءات مخالفات', roles: HR_FULL },
  { label: 'Assets & Clearance', group: 'Human Resources', path: '/human-resources/assets', keywords: 'assets custody clearance عهدة اصول', roles: HR_FULL },
  { label: 'HR Settings', group: 'Human Resources', path: '/human-resources/settings', keywords: 'settings managers positions اعدادات', roles: HR_FULL },

  { label: 'New Purchase Request', group: 'Procurement', path: '/procurement/new', keywords: 'new prf purchase request طلب شراء' },
  { label: 'Procurement Dashboard', group: 'Procurement', path: '/procurement', keywords: 'procurement purchasing مشتريات', roles: PROC_FULL },
  { label: 'Procurement Management', group: 'Procurement', path: '/procurement/records', keywords: 'supplier vendor budget rejected goods quotation records مورد مشتريات', roles: PROC_FULL },
  { label: 'PRF Master List', group: 'Procurement', path: '/procurement/master', keywords: 'prf purchase master requests', roles: PROC_FULL },

  { label: 'Maintenance', group: 'Maintenance', path: '/maintenance', keywords: 'maintenance jobs صيانة', maintenance: true },
  { label: 'Corrective Maintenance', group: 'Maintenance', path: '/maintenance/cm', keywords: 'cm corrective intervention صيانة تصحيحية', maintenance: true },
  { label: 'Preventive Maintenance', group: 'Maintenance', path: '/maintenance/pm', keywords: 'pm preventive صيانة وقائية', maintenance: true },
  { label: 'Heavy Maintenance', group: 'Maintenance', path: '/maintenance/hm', keywords: 'hm heavy maintenance عمرة جسيمة', maintenance: true },
  { label: 'PM Schedule', group: 'Maintenance', path: '/maintenance/pm-schedule', keywords: 'schedule plan جدول خطة', maintenance: true },
  { label: 'Fleet Checks', group: 'Maintenance', path: '/maintenance/fleet-checks', keywords: 'fleet checks قطارات فحص', maintenance: true },
  { label: 'Withdrawals', group: 'Maintenance', path: '/maintenance/withdrawals', keywords: 'withdrawals سحب', maintenance: true },

  { label: 'Inventory Control', group: 'Inventory', path: '/inventory', keywords: 'stock products material مخزون اصناف', roles: DASH_FULL },
  { label: 'Control', group: 'Administration', path: '/control', keywords: 'control command تحكم', roles: DASH_FULL },
  { label: 'User Management', group: 'Administration', path: '/users', keywords: 'users accounts roles access مستخدمين صلاحيات', roles: ['admin'] },
]

function canOpen(page, user) {
  const role = String(user?.role || 'staff').trim().toLowerCase()
  if (page.maintenance) return ['admin', 'depot_manager', 'manager'].includes(role) || Boolean(user?.is_team_manager)
  return !page.roles || page.roles.includes(role)
}

export default function CommandCenterSearch({ className = '' }) {
  const user = useSelector(state => state.auth.user)
  const navigate = useNavigate()
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const allowedPages = useMemo(() => PAGES.filter(page => canOpen(page, user)), [user])
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const source = words.length ? allowedPages.filter(page => {
      const haystack = `${page.label} ${page.group} ${page.keywords}`.toLowerCase()
      return words.every(word => haystack.includes(word))
    }) : allowedPages
    return source.slice(0, 9)
  }, [allowedPages, query])

  useEffect(() => {
    const onKey = event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        window.setTimeout(() => inputRef.current?.focus(), 0)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [])

  useEffect(() => setActive(0), [query, open])

  const go = page => {
    if (!page) return
    setOpen(false)
    setQuery('')
    navigate(page.path)
  }

  const onKeyDown = event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(value => Math.min(value + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(value => Math.max(value - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(results[active])
    }
  }

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <div className={`flex h-9 items-center gap-2 rounded-lg border px-3 transition-colors ${open ? 'border-primary bg-white shadow-sm' : 'border-transparent bg-neutral-50'}`}>
        <Search className="h-4 w-4 shrink-0 text-neutral-400" />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={event => { setQuery(event.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          placeholder="Search Command Center..."
          aria-label="Search Command Center"
          aria-expanded={open}
          className="min-w-0 flex-1 bg-transparent text-sm text-secondary-700 outline-none placeholder:text-neutral-400"
        />
        {query ? (
          <button type="button" onClick={() => { setQuery(''); inputRef.current?.focus() }} aria-label="Clear search" className="text-neutral-300 hover:text-secondary">
            <X className="h-4 w-4" />
          </button>
        ) : <kbd className="hidden rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-neutral-400 md:inline">Ctrl K</kbd>}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-11 z-[80] overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-xl">
          <div className="border-b border-neutral-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
            Accessible destinations
          </div>
          <div className="max-h-[360px] overflow-y-auto p-1.5">
            {results.map((page, index) => (
              <button
                type="button"
                key={page.path}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(page)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${active === index ? 'bg-primary-50 text-primary' : 'text-secondary-700 hover:bg-neutral-50'}`}
              >
                <Search className="h-4 w-4 shrink-0 opacity-60" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{page.label}</span>
                  <span className="block truncate text-[10px] text-neutral-400">{page.group}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-40" />
              </button>
            ))}
            {!results.length && (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-secondary-700">No accessible result found</p>
                <p className="mt-1 text-xs text-neutral-400">Try a page name or another keyword.</p>
              </div>
            )}
          </div>
          <div className="border-t border-neutral-100 px-3 py-2 text-[10px] text-neutral-400">
            Results are filtered using your current role and access.
          </div>
        </div>
      )}
    </div>
  )
}
