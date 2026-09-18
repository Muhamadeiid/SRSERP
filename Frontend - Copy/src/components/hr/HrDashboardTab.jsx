import { useCallback, useEffect, useState } from 'react'
import { useSelector } from 'react-redux'
import { getEmployeeStats, getUpcomingBirthdays } from '../../services/employeeService'
import { getLeaveRequests } from '../../services/leaveService'
import { attendanceService } from '../../services/Attendanceservice'
import { getMaintenanceTasks } from '../../services/maintenanceService'
import HRDashboardView from '../dashboard/HRDashboardView'

/**
 * HR-scoped detailed dashboard, mounted at /human-resources/dashboard.
 *
 * The Operations Dashboard at / only carries a summary card for each module,
 * so this tab is where HR leadership actually reads their day: attendance
 * chart, leave applications board, birthdays, recognition, and the
 * maintenance tasks visible to them.
 *
 * Data comes from the same services the root dashboard used to call;
 * moving the fetch here means an HR user landing directly on this tab does
 * not have to wait for the root fetch to finish first.
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
  const canSeeMaintenance = ['admin', 'depot_manager', 'manager'].includes(role) || user?.is_team_manager

  const [loading, setLoading] = useState(true)
  const [empStats, setEmpStats] = useState(null)
  const [todayAttendance, setTodayAttendance] = useState([])
  const [requests, setRequests] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [maintenanceTasks, setMaintenanceTasks] = useState([])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const tasks = [
      getLeaveRequests().then(r => setRequests(r?.data ?? [])).catch(() => setRequests([])),
      getUpcomingBirthdays()
        .then(r => setBirthdays(Array.isArray(r) ? r : r?.data ?? []))
        .catch(() => setBirthdays([])),
    ]
    if (isHRFull) {
      tasks.push(
        getEmployeeStats().then(r => setEmpStats(r?.data ?? r)).catch(() => setEmpStats(null)),
        attendanceService.getAttendance({ date: todayISO() })
          .then(r => setTodayAttendance(Array.isArray(r?.data) ? r.data : []))
          .catch(() => setTodayAttendance([])),
      )
    }
    if (canSeeMaintenance) {
      tasks.push(
        getMaintenanceTasks().then(r => setMaintenanceTasks(r?.data ?? []))
          .catch(() => setMaintenanceTasks([])),
      )
    }
    await Promise.allSettled(tasks)
    setLoading(false)
  }, [isHRFull, canSeeMaintenance])

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
      maintenanceTasks={maintenanceTasks}
      onRefresh={fetchAll}
      fullHrAccess={isHRFull}
      birthdayEmployees={birthdays}
    />
  )
}
