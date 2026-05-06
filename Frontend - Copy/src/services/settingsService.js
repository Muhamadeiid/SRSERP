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

export const getSettings      = ()              => request('/settings')
export const saveSetting      = (key, value)    => request('/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
export const getManagers      = ()              => request('/settings/managers')
export const getManagerEmps   = (userId)        => request(`/settings/manager/${userId}/employees`)
export const assignEmployee   = (employee_id, manager_id) =>
  request('/settings/assign', { method: 'POST', body: JSON.stringify({ employee_id, manager_id }) })
