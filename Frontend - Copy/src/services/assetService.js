// src/services/assetService.js
const BASE = import.meta.env.VITE_API_URL ?? 'https://srs-backend.onrender.com/api'

function authHeaders() {
  const token = localStorage.getItem('srs_token')
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders(), ...options })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    throw new Error(err.message ?? 'Request failed')
  }
  return res.json()
}

export const itAssetService = {
  list:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))
    ).toString()
    return req(`/it-assets${qs ? '?' + qs : ''}`)
  },
  create: (data)       => req('/it-assets',      { method: 'POST',   body: JSON.stringify(data) }),
  update: (id, data)   => req(`/it-assets/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
  remove: (id)         => req(`/it-assets/${id}`, { method: 'DELETE' }),
}

export const assetService = {
  list:        (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))
    ).toString()
    return req(`/assets${qs ? '?' + qs : ''}`)
  },
  stats:       ()           => req('/assets/stats'),
  clearance:   (empId)      => req(`/assets/clearance/${empId}`),
  downloadReport: async (empId) => {
    const token = localStorage.getItem('srs_token')
    const res = await fetch(`${BASE}/assets/clearance/${empId}/report`, {
      headers: { Accept: '*/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) throw new Error('Report generation failed')
    const blob = await res.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `Reports_${empId}.zip`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  },
  create:      (data)       => req('/assets', { method: 'POST', body: JSON.stringify(data) }),
  update:      (id, data)   => req(`/assets/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove:      (id)         => req(`/assets/${id}`, { method: 'DELETE' }),
  markReturned:(id, data)   => req(`/assets/${id}/return`, { method: 'POST', body: JSON.stringify(data) }),
}
