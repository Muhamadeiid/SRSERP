import { NavLink, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import { logout } from '../../store/slices/authSlice'
import {
  Users, Calendar, Clock, ShieldCheck,
  AlertTriangle, LayoutDashboard, ChevronLeft,
  LogOut, FileText, Settings, Package, GitBranch, UserMinus
} from 'lucide-react'

// HR Full access: Admin, Depot Manager (role) OR Human Resources dept
const isHRFull = (user) =>
  user && (
    ['admin', 'depot_manager'].includes(user.role) ||
    user.department === 'human_resources'
  )

// Dashboard access: Admin & Depot Manager only
const isDashAccess = (user) =>
  user && ['admin', 'depot_manager'].includes(user.role)

const ALL_NAV = [
  { label: 'Workforce',      path: '/human-resources',                    icon: Users,         end: true  },
  { label: 'Leave Requests', path: '/human-resources/leave',              icon: FileText,      end: false },
  { label: 'Resignations',   path: '/human-resources/resignations',       icon: UserMinus,     end: false },
  { label: 'Attendance',     path: '/human-resources/attendance',         icon: Clock,         end: false },
  { label: 'Certifications', path: '/human-resources/certifications',     icon: ShieldCheck,   end: false },
  { label: 'Disciplinary',   path: '/human-resources/disciplinary',       icon: AlertTriangle, end: false },
  { label: 'Assets',         path: '/human-resources/assets',             icon: Package,       end: false },
  { label: 'Org Chart',      path: '/human-resources/org-chart',          icon: GitBranch,     end: false },
  { label: 'Calendar',       path: '/human-resources/calendar',           icon: Calendar,      end: false },
  { label: 'Settings',       path: '/human-resources/settings',           icon: Settings,      end: false },
]

export default function HRSidebar() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const { user } = useSelector((s) => s.auth)

  const handleLogout = () => { dispatch(logout()); navigate('/login') }
  const initials = (name) => name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) ?? 'U'

  const ROLE_LABEL = {
    admin:          'Admin',
    depot_manager:  'Depot Manager',
    manager:        'Manager',
    staff:          'Staff',
  }
  const deptLabel = user?.department === 'human_resources' ? 'HR' : (user?.department ?? '')

  return (
    <aside className="fixed top-0 left-0 bottom-0 w-[230px] bg-white border-r border-neutral-100 flex flex-col z-50">

      {/* Logo */}
      <div className="px-4 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Rotem SRS Egypt" className="h-9 w-auto object-contain" />
        </div>
      </div>

      {/* Back to Dashboard — only for admin/depot_manager */}
      {isDashAccess(user) && (
        <div className="px-3 pt-3">
          <NavLink
            to="/"
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-secondary hover:bg-neutral-50 rounded-lg transition-all"
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
          <div className="border-t border-neutral-100 mt-2" />
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-neutral-300 uppercase tracking-widest px-3 py-2">
          HR Modules
        </p>
        {ALL_NAV.map(item => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              className={({ isActive }) => `
                flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-all no-underline
                ${isActive
                  ? 'bg-primary-50 text-primary font-semibold'
                  : 'text-secondary hover:bg-neutral-50'
                }
              `}
            >
              <Icon className="w-4 h-4 shrink-0 opacity-80" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* User info + Logout */}
      <div className="p-3 border-t border-neutral-100">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg mb-1">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
            {initials(user?.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-secondary-700 truncate">{user?.name}</p>
            <p className="text-[11px] text-neutral-400 truncate">
              {ROLE_LABEL[user?.role] ?? user?.role}
              {deptLabel ? ` · ${deptLabel}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-neutral-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </aside>
  )
}
