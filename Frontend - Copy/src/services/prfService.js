// PRF (Purchase Request Form) — service module.
// Mirrors the auth + transport pattern from leaveService.js.

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

// ── PRF endpoints ────────────────────────────────────────────────────────────
export const getPrfs = (params = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)),
  ).toString()
  return request(`/procurement/prfs${qs ? '?' + qs : ''}`)
}

export const getPrf       = (id)            => request(`/procurement/prfs/${id}`)
export const createPrf    = (data)          => request('/procurement/prfs',                 { method: 'POST', body: JSON.stringify(data) })
export const approvePrf   = (id, comment)   => request(`/procurement/prfs/${id}/approve`,    { method: 'POST', body: JSON.stringify({ comment }) })
export const rejectPrf    = (id, comment)   => request(`/procurement/prfs/${id}/reject`,     { method: 'POST', body: JSON.stringify({ comment }) })

// Procurement-only — manually set PRF number before printing
export const updatePrfNumber = (id, prf_number) =>
  request(`/procurement/prfs/${id}/tracking-no`, { method: 'PUT', body: JSON.stringify({ prf_number }) })

// ── Display helpers (constants kept here so all PRF UIs share them) ─────────
export const PRF_STATUS_LABELS = {
  draft:                'Draft',
  pending_procurement:  'Pending Procurement',
  pending_ehs:          'Pending EHS',
  pending_depot:        'Pending Depot Manager',
  approved:             'Approved',
  rejected:             'Rejected',
  cancelled:            'Cancelled',
}

export const PRF_STATUS_STYLES = {
  draft:                'bg-neutral-100 text-neutral-600 border-neutral-200',
  pending_procurement:  'bg-amber-50    text-amber-700   border-amber-200',
  pending_ehs:          'bg-blue-50     text-blue-700    border-blue-200',
  pending_depot:        'bg-purple-50   text-purple-700  border-purple-200',
  approved:             'bg-green-50    text-green-700   border-green-200',
  rejected:             'bg-red-50      text-red-700     border-red-200',
  cancelled:            'bg-neutral-100 text-neutral-500 border-neutral-300',
}

// Strip the internal -VOID suffix before displaying a PRF number
export const cleanPrfNumber = (num) => (num ?? '').replace(/-VOID$/, '')

// 8 default categories — matches the official PRF.pdf layout exactly (2 columns × 4 rows)
export const MATERIAL_CATEGORIES = [
  'Components and Parts',
  'Safety Equipment',
  'Consumables',
  'Office Supply / Furniture',
  'Tools and Equipment',
  'IT Equipment',
  'Electronics',
  'Others',
]

// Map a current PRF status to the role allowed to act on it
export const STATUS_TO_ROLE = {
  pending_procurement: 'procurement',
  pending_ehs:         'ehs',
  pending_depot:       'depot_manager',
}

// Whether the given user can approve/reject the current stage
export function canActOnStage(user, status) {
  if (!user || !STATUS_TO_ROLE[status]) return false
  if (user.role === 'admin') return true
  return user.role === STATUS_TO_ROLE[status]
}
