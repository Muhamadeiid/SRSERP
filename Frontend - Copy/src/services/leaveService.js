const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('srs_token')
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    if (err.errors) throw new Error(Object.values(err.errors).flat()[0])
    throw new Error(err.message ?? 'Request failed')
  }
  return res.json()
}

export const getLeaveBalance   = (employeeId) => request(`/employees/${employeeId}/leave-balance`)
export const updateLeaveBalance = (employeeId, data) => request(`/employees/${employeeId}/leave-balance`, { method: 'PUT', body: JSON.stringify(data) })

export const getLeaveRequests  = (params = {}) => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString()
  return request(`/leave-requests${qs ? '?' + qs : ''}`)
}
export const getCalendarLeaves = () => request('/leave-requests/calendar')
export const createLeaveRequest = (data)     => request('/leave-requests', { method: 'POST', body: JSON.stringify(data) })
export const managerApproveLeave = (id)          => request(`/leave-requests/${id}/manager-approve`, { method: 'POST' })
export const approveLeave        = (id)          => request(`/leave-requests/${id}/approve`,         { method: 'POST' })
export const rejectLeave         = (id, reason)  => request(`/leave-requests/${id}/reject`,          { method: 'POST', body: JSON.stringify({ reason }) })
export const cancelLeave         = (id, reason)  => request(`/leave-requests/${id}/cancel`,          { method: 'POST', body: JSON.stringify({ reason }) })
export const rescheduleLeave     = (id, reason)  => request(`/leave-requests/${id}/reschedule`,      { method: 'POST', body: JSON.stringify({ reason }) })

export const getNotifications  = ()  => request('/notifications')
export const markAllRead       = ()  => request('/notifications/read-all', { method: 'POST' })
export const markOneRead       = (id) => request(`/notifications/${id}/read`, { method: 'POST' })

export const saveEmployeeSignature = (employeeId, e_signature) =>
  request(`/employees/${employeeId}/signature`, {
    method: 'POST',
    body: JSON.stringify({ e_signature }),
  })

export const saveMySignature = (e_signature) =>
  request('/user/signature', {
    method: 'POST',
    body: JSON.stringify({ e_signature }),
  })

// Admin: save signature for any user by ID
export const saveUserSignature = (userId, e_signature) =>
  request(`/users/${userId}/signature`, {
    method: 'POST',
    body: JSON.stringify({ e_signature }),
  })

export const getMe = () => request('/user/me')
