const BASE_URL = import.meta.env.VITE_API_URL ?? 'https://srs-backend.onrender.com/api'

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

export const getPos    = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)),
  ).toString()
  return request(`/procurement/pos${qs ? '?' + qs : ''}`)
}

export const getPo     = (id)     => request(`/procurement/pos/${id}`)
export const createPo  = (data)   => request('/procurement/pos',        { method: 'POST', body: JSON.stringify(data) })
export const updatePo  = (id, data) => request(`/procurement/pos/${id}`, { method: 'PUT',  body: JSON.stringify(data) })

export const PO_STATUS_LABELS = {
  draft:     'Draft',
  issued:    'Issued',
  received:  'Received',
  cancelled: 'Cancelled',
}

export const PO_STATUS_STYLES = {
  draft:     'bg-neutral-100 text-neutral-600 border-neutral-200',
  issued:    'bg-blue-50    text-blue-700    border-blue-200',
  received:  'bg-green-50   text-green-700   border-green-200',
  cancelled: 'bg-red-50     text-red-600     border-red-200',
}
