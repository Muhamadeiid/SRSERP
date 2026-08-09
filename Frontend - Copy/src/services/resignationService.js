import { API_BASE_URL as BASE_URL } from '../config/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('srs_token')
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  })
  const raw = await response.text()
  let payload = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    // Portable PHP may prepend startup warnings before Laravel's JSON response.
    const jsonStart = raw.indexOf('{')
    const jsonEnd = raw.lastIndexOf('}')
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      try { payload = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) } catch { payload = null }
    }
  }
  if (!response.ok) {
    const validation = payload?.errors ? Object.values(payload.errors).flat()[0] : null
    const plainText = raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    throw new Error(validation || payload?.message || plainText.slice(0, 300) || 'Request failed')
  }
  if (payload !== null) return payload
  throw new Error('The server returned an invalid response. Check the PHP error log.')
}

export const getResignationRequests = () => request('/resignation-requests')
export const createResignationRequest = (data) => request('/resignation-requests', {
  method: 'POST', body: JSON.stringify(data),
})
export const approveResignationRequest = (id) => request(`/resignation-requests/${id}/approve`, {
  method: 'POST', body: JSON.stringify({}),
})
export const rejectResignationRequest = (id, reason) => request(`/resignation-requests/${id}/reject`, {
  method: 'POST', body: JSON.stringify({ reason }),
})
