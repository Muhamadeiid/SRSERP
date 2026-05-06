// src/services/employeeService.js
// ─────────────────────────────────────────────
// All API calls to Laravel backend
// ─────────────────────────────────────────────

// src/services/employeeService.js

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('srs_token')

  // Destructure headers out so ...restOptions doesn't override the Authorization we build
  const { headers: optHeaders = {}, ...restOptions } = options

  // Don't force Content-Type for FormData — browser sets multipart/form-data + boundary automatically
  const isFormData = restOptions.body instanceof FormData

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...optHeaders,
    },
    ...restOptions,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }))
    // Laravel validation errors come as { errors: { field: [msg, ...] } }
    if (err.errors) {
      const firstMsg = Object.values(err.errors).flat()[0]
      throw new Error(firstMsg ?? 'Validation failed')
    }
    throw new Error(err.message ?? 'Request failed')
  }

  if (options._blob) return res.blob()
  return res.json()
}
// ── Employees ──────────────────────────────────────────────

/** @param {Object} params – department, location, status, search, page, per_page */
export function getEmployees(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined))
  ).toString()
  return request(`/employees${qs ? '?' + qs : ''}`)
}

export function getEmployeeStats() {
  return request('/employees/stats')
}

export function getEmployee(id) {
  return request(`/employees/${id}`)
}

// Convert empty strings to null so Laravel date/integer validation doesn't fail
function cleanPayload(data) {
  const DATE_FIELDS = ['hiring_date', 'birth_date', 'insurance_date', 'contract_start', 'contract_end']
  const INT_FIELDS  = ['education_year', 'military_serving_days', 'military_serving_months',
                       'military_serving_years', 'no_warning_letters']
  const out = { ...data }
  for (const k of DATE_FIELDS) {
    if (out[k] === '') out[k] = null
  }
  for (const k of INT_FIELDS) {
    if (out[k] === '' || out[k] === undefined) out[k] = null
    else if (out[k] !== null) out[k] = Number(out[k])
  }
  return out
}

export function createEmployee(data) {
  return request('/employees', { method: 'POST', body: JSON.stringify(cleanPayload(data)) })
}

export function updateEmployee(id, data) {
  return request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(cleanPayload(data)) })
}

export function deleteEmployee(id) {
  return request(`/employees/${id}`, { method: 'DELETE' })
}

/** Upload Excel file → returns { imported, errors } */
export function importEmployees(file) {
  const form = new FormData()
  form.append('file', file)
  return request('/employees/import', {
    method: 'POST',
    headers: { Accept: 'application/json' }, // no Content-Type – let browser set multipart boundary
    body: form,
  })
}

/** Download Excel – returns Blob */
export function exportEmployees(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v != null))
  ).toString()
  return request(`/employees/export${qs ? '?' + qs : ''}`, { _blob: true })
}

/** Helper: trigger browser download of a Blob */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href    = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
