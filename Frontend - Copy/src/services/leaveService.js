import { API_BASE_URL as BASE_URL } from '../config/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('srs_token')
  const isFormData = options.body instanceof FormData
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    const error = new Error(err.errors ? Object.values(err.errors).flat()[0] : (err.message ?? 'Request failed'))
    error.status = res.status
    error.code = err.code
    error.details = err.errors
    throw error
  }
  return res.json()
}

export const getLeaveBalance   = (employeeId) => request(`/employees/${employeeId}/leave-balance`)
export const updateLeaveBalance = (employeeId, data) => request(`/employees/${employeeId}/leave-balance`, { method: 'PUT', body: JSON.stringify(data) })

export const getLeaveRequests  = (params = {}) => {
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v))).toString()
  return request(`/leave-requests${qs ? '?' + qs : ''}`)
}
export const getLeaveRequest   = (id) => request(`/leave-requests/${id}`)
export const getCalendarLeaves = () => request('/leave-requests/calendar')
export const createLeaveRequest = (data) => {
  if (!(data.medical_attachment instanceof File)) {
    return request('/leave-requests', { method: 'POST', body: JSON.stringify(data) })
  }
  const body = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return
    body.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)
  })
  return request('/leave-requests', { method: 'POST', body })
}
export const getLeaveMedicalAttachment = async (id) => {
  const token = localStorage.getItem('srs_token')
  const response = await fetch(`${BASE_URL}/leave-requests/${id}/medical-attachment`, {
    headers: { Accept: 'image/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  })
  if (!response.ok) throw new Error('Unable to load medical attachment')
  return response.blob()
}
export const managerApproveLeave = (id, data = {}) => request(`/leave-requests/${id}/manager-approve`, { method: 'POST', body: JSON.stringify(data) })
export const hrApproveLeave      = (id, data = {}) => request(`/leave-requests/${id}/hr-approve`,    { method: 'POST', body: JSON.stringify(data) })
export const approveLeave        = (id, data = {}) => request(`/leave-requests/${id}/approve`,       { method: 'POST', body: JSON.stringify(data) })
export const updateLeaveDetails  = (id, data = {}) => request(`/leave-requests/${id}/details`,       { method: 'PATCH', body: JSON.stringify(data) })
export const rejectLeave         = (id, reason)  => request(`/leave-requests/${id}/reject`,          { method: 'POST', body: JSON.stringify({ reason }) })
export const cancelLeave         = (id, reason)  => request(`/leave-requests/${id}/cancel`,          { method: 'POST', body: JSON.stringify({ reason }) })
export const approveLeaveCancellation = (id) => request(`/leave-requests/${id}/approve-cancellation`, { method: 'POST' })
export const rejectLeaveCancellation = (id, reason) => request(`/leave-requests/${id}/reject-cancellation`, { method: 'POST', body: JSON.stringify({ reason }) })
export const requestLeaveAmendment = (id, data) => request(`/leave-requests/${id}/request-amendment`, { method: 'POST', body: JSON.stringify(data) })
export const approveLeaveAmendment = (id) => request(`/leave-requests/${id}/approve-amendment`, { method: 'POST' })
export const rejectLeaveAmendment = (id, reason) => request(`/leave-requests/${id}/reject-amendment`, { method: 'POST', body: JSON.stringify({ reason }) })
export const rescheduleLeave     = (id, reason)  => request(`/leave-requests/${id}/reschedule`,      { method: 'POST', body: JSON.stringify({ reason }) })
export const archiveLeaveRequest = (id) => request(`/leave-requests/${id}/archive`, { method: 'POST' })
export const unarchiveLeaveRequest = (id) => request(`/leave-requests/${id}/archive`, { method: 'DELETE' })

// HR-only — manually set the tracking number before printing
export const updateLeaveTrackingNo = (id, tracking_no) =>
  request(`/leave-requests/${id}/tracking-no`, { method: 'PUT', body: JSON.stringify({ tracking_no }) })

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
