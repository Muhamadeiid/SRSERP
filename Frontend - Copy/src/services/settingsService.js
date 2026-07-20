const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'
let settingsCache = null
let settingsExpiresAt = 0
let settingsInFlight = null

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

export const getSettings = () => {
  if (settingsCache && settingsExpiresAt > Date.now()) return Promise.resolve(settingsCache)
  if (settingsInFlight) return settingsInFlight
  settingsInFlight = request('/settings')
    .then(result => {
      settingsCache = result
      settingsExpiresAt = Date.now() + 60000
      return result
    })
    .finally(() => { settingsInFlight = null })
  return settingsInFlight
}
export const saveSetting = (key, value) => request('/settings', { method: 'POST', body: JSON.stringify({ key, value }) })
  .then(result => {
    settingsCache = null
    settingsExpiresAt = 0
    return result
  })
export const getManagers      = ()              => request('/settings/managers')
export const getManagerEmps   = (userId)        => request(`/settings/manager/${userId}/employees`)
export const assignEmployee   = (employee_id, manager_id) =>
  request('/settings/assign', { method: 'POST', body: JSON.stringify({ employee_id, manager_id }) })
