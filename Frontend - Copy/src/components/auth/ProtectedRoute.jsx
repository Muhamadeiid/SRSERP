import { useSelector } from 'react-redux'
import { Navigate }    from 'react-router-dom'

/**
 * ProtectedRoute
 * @param {string[]} [roles]   – if provided, only users with one of these roles can access
 * @param {string}   [redirect] – where to redirect unauthorized users (default: '/')
 */
/**
 * canAccess — checks role AND/OR department
 * @param {object} user
 * @param {string[]} [roles]       — allowed roles
 * @param {string[]} [departments] — allowed departments (checked in addition to roles)
 */
export function canAccess(user, roles, departments) {
  if (!user) return false
  const roleOk = !roles || roles.length === 0 || roles.includes(user.role)
  const deptOk = !departments || departments.length === 0 || departments.includes(user.department)
  // if both arrays provided → user must satisfy at least one
  if (roles?.length && departments?.length) return roleOk || deptOk
  return roleOk && deptOk
}

export default function ProtectedRoute({ children, roles, departments, redirect = '/', adminOnly = false }) {
  const { isAuthenticated, user } = useSelector((state) => state.auth)

  if (!isAuthenticated) return <Navigate to="/login" replace />

  if (adminOnly && user?.role !== 'admin') return <Navigate to={redirect} replace />

  if (!canAccess(user, roles, departments)) return <Navigate to={redirect} replace />

  return children
}
