import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { getEmployeeStats } from '../../services/employeeService'
import { getLeaveRequests } from '../../services/leaveService'
import { attendanceService } from '../../services/Attendanceservice'
import HRDashboardView from '../dashboard/HRDashboardView'

/**
 * HR-scoped detailed dashboard — the landing page inside the HR module.
 *
 * Fetches only what HRDashboardView needs (workforce stats, today's
 * attendance, leave/overtime requests). Birthdays and calendar events are
 * cross-department widgets so they live on the root Operations Dashboard;
 * maintenance tasks belong to the Maintenance module — neither shows up here.
 */
const todayISO = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const FULL_HR_ROLES = ['admin', 'depot_manager', 'hr']

export default function HrDashboardTab() {
  const { user } = useSelector(state => state.auth)
  const role = String(user?.role || '').toLowerCase()
  const isHRFull = FULL_HR_ROLES.includes(role)

  const [loading, setLoading] = useState(true)
  const [empStats, setEmpStats] = useState(null)
  const [todayAttendance, setTodayAttendance] = useState([])
  const [requests, setRequests] = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const tasks = [
      getLeaveRequests().then(r => setRequests(r?.data ?? [])).catch(() => setRequests([])),
    ]
    if (isHRFull) {
      tasks.push(
        getEmployeeStats().then(r => setEmpStats(r?.data ?? r)).catch(() => setEmpStats(null)),
        attendanceService.getAttendance({ date: todayISO() })
          .then(r => setTodayAttendance(Array.isArray(r?.data) ? r.data : []))
          .catch(() => setTodayAttendance([])),
      )
    }
    await Promise.allSettled(tasks)
    setLoading(false)
  }, [isHRFull])

  useEffect(() => { fetchAll() }, [fetchAll])

  return (
    <HRDashboardView
      user={user}
      loading={loading}
      empStats={empStats}
      employees={[]}
      requests={requests}
      notifications={[]}
      todayAttendance={todayAttendance}
      onRefresh={fetchAll}
      fullHrAccess={isHRFull}
    />
  )
}
