const BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

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
    if (err.errors) {
      const first = Object.values(err.errors).flat()[0]
      throw new Error(first ?? 'Validation failed')
    }
    throw new Error(err.message ?? 'Request failed')
  }
  return res.json()
}

const qs = (params = {}) => {
  const query = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined))
  ).toString()
  return query ? `?${query}` : ''
}

export const disciplinaryService = {
  list: (params = {}) => req(`/disciplinary-cases${qs(params)}`),
  stats: () => req('/disciplinary-cases/stats'),
  create: (data) => req('/disciplinary-cases', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => req(`/disciplinary-cases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id) => req(`/disciplinary-cases/${id}`, { method: 'DELETE' }),
}
