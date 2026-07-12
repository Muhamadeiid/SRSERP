const BASE = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api')

async function request(path, opts = {}) {
  const token = localStorage.getItem('srs_token')
  const { headers: h = {}, ...rest } = opts
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...h },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || res.statusText)
  return res.json()
}

// ── Equipment ────────────────────────────────────────────────────
export const getEquipment     = (params) => request('/equipment?' + new URLSearchParams(params))
export const getEquipmentById = (id)     => request(`/equipment/${id}`)
export const createEquipment  = (data)   => request('/equipment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateEquipment  = (id, d)  => request(`/equipment/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
export const deleteEquipment  = (id)     => request(`/equipment/${id}`, { method: 'DELETE' })
export const getEquipmentStats = ()      => request('/equipment/stats')

// ── Job Cards ────────────────────────────────────────────────────
export const getJobCards      = (params) => request('/job-cards?' + new URLSearchParams(params))
export const getJobCardById   = (id)     => request(`/job-cards/${id}`)
export const createJobCard    = (data)   => request('/job-cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateJobCard    = (id, d)  => request(`/job-cards/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
export const deleteJobCard    = (id)     => request(`/job-cards/${id}`, { method: 'DELETE' })
export const getJobCardStats  = (params) => request('/job-cards/stats?' + new URLSearchParams(params || {}))

// ── Fleet Checks ────────────────────────────────────────────────
export const getFleetChecks     = (params) => request('/fleet-checks?' + new URLSearchParams(params))
export const getFleetCheckById  = (id)     => request(`/fleet-checks/${id}`)
export const createFleetCheck   = (data)   => request('/fleet-checks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateFleetCheck   = (id, d)  => request(`/fleet-checks/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
export const deleteFleetCheck   = (id)     => request(`/fleet-checks/${id}`, { method: 'DELETE' })
export const getFleetCheckStats = ()       => request('/fleet-checks/stats')

// ── Withdrawals ─────────────────────────────────────────────────
export const getWithdrawals     = (params) => request('/withdrawals?' + new URLSearchParams(params))
export const getWithdrawalById  = (id)     => request(`/withdrawals/${id}`)
export const createWithdrawal   = (data)   => request('/withdrawals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
export const updateWithdrawal   = (id, d)  => request(`/withdrawals/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
export const deleteWithdrawal   = (id)     => request(`/withdrawals/${id}`, { method: 'DELETE' })
export const getWithdrawalStats = ()       => request('/withdrawals/stats')
