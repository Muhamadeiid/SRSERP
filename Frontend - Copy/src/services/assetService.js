// src/services/assetService.js
import { API_BASE_URL as BASE } from '../config/api'

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
  stats:  ()           => req('/it-assets/stats'),
  create: (data)       => req('/it-assets',      { method: 'POST',   body: JSON.stringify(data) }),
  update: (id, data)   => req(`/it-assets/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
  remove: (id)         => req(`/it-assets/${id}`, { method: 'DELETE' }),

  async import(file) {
    const token = localStorage.getItem('srs_token')
    const body = new FormData()
    body.append('file', file)
    const res = await fetch(`${BASE}/it-assets/import`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.message || 'Import failed')
    return json
  },

  async export(params = {}) {
    const token = localStorage.getItem('srs_token')
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([,v]) => v !== '' && v != null))
    ).toString()
    const res = await fetch(`${BASE}/it-assets/export${qs ? '?' + qs : ''}`, {
      headers: { Accept: '*/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    triggerDownload(blob, `IT_Asset_List_${new Date().toISOString().slice(0,10)}.xlsx`)
  },

  async downloadTemplate() {
    const token = localStorage.getItem('srs_token')
    const res = await fetch(`${BASE}/it-assets/template`, {
      headers: { Accept: '*/*', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    })
    if (!res.ok) throw new Error('Template download failed')
    triggerDownload(await res.blob(), 'IT_Asset_List_Template.xlsx')
  },
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
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
