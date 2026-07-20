// src/services/employeeService.js
// ─────────────────────────────────────────────
// All API calls to Laravel backend
// ─────────────────────────────────────────────

// src/services/employeeService.js

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'
const readCache = new Map()
const inFlightReads = new Map()

function invalidateEmployeeReads() {
  readCache.clear()
  inFlightReads.clear()
}

function cachedRequest(path, ttlMs = 15000) {
  const cacheKey = `${localStorage.getItem('srs_token') || 'anonymous'}:${path}`
  const cached = readCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value)
  if (inFlightReads.has(cacheKey)) return inFlightReads.get(cacheKey)

  const promise = request(path)
    .then(value => {
      readCache.set(cacheKey, { value, expiresAt: Date.now() + ttlMs })
      return value
    })
    .finally(() => inFlightReads.delete(cacheKey))
  inFlightReads.set(cacheKey, promise)
  return promise
}

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
  return cachedRequest(`/employees${qs ? '?' + qs : ''}`, 15000)
}

/** Autocomplete search — accessible to all roles */
export function searchEmployees(search) {
  return cachedRequest(`/employees/autocomplete?search=${encodeURIComponent(search)}`, 10000)
}

export function getEmployeeStats(params = {}) {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined))
  ).toString()
  return cachedRequest(`/employees/stats${qs ? '?' + qs : ''}`, 30000)
}

export function getEmployee(id) {
  return cachedRequest(`/employees/${id}`, 30000)
}

// ── Depot Manager & HR (auto-fill on forms) ─────────────────
export function getDepotManager() {
  return request('/users/depot-manager')
}

export function getHrOfficer() {
  return request('/users/hr-officer')
}

// Convert empty strings to null so Laravel date/integer validation doesn't fail
function cleanPayload(data) {
  const DATE_FIELDS = ['hiring_date', 'birth_date', 'insurance_date', 'contract_start', 'contract_end']
  const INT_FIELDS  = ['education_year', 'military_serving_days', 'military_serving_months',
                       'military_serving_years', 'no_warning_letters', 'weekly_off_day']
  const out = { ...data }
  if (out.saturday_group === '') out.saturday_group = null
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
    .then(result => { invalidateEmployeeReads(); return result })
}

export function updateEmployee(id, data) {
  return request(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(cleanPayload(data)) })
    .then(result => { invalidateEmployeeReads(); return result })
}

export function bulkUpdateSaturdayGroup(employeeIds, saturdayGroup) {
  return request('/employees/bulk-saturday-group', {
    method: 'POST',
    body: JSON.stringify({ employee_ids: employeeIds, saturday_group: saturdayGroup }),
  }).then(result => { invalidateEmployeeReads(); return result })
}

export function bulkUpdateDirectManager(employeeIds, directManagerId) {
  return request('/employees/bulk-direct-manager', {
    method: 'POST',
    body: JSON.stringify({ employee_ids: employeeIds, direct_manager_id: directManagerId }),
  }).then(result => { invalidateEmployeeReads(); return result })
}

export function deleteEmployee(id) {
  return request(`/employees/${id}`, { method: 'DELETE' })
    .then(result => { invalidateEmployeeReads(); return result })
}

/** Upload Excel file → returns { imported, errors } */
export function importEmployees(file) {
  const form = new FormData()
  form.append('file', file)
  return request('/employees/import', {
    method: 'POST',
    headers: { Accept: 'application/json' }, // no Content-Type – let browser set multipart boundary
    body: form,
  }).then(result => { invalidateEmployeeReads(); return result })
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
