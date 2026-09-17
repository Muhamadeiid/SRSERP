import { API_BASE_URL as BASE_URL } from '../config/api'

async function request(path, options = {}) {
  const token = localStorage.getItem('srs_token')
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    ...options,
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (payload.errors) throw new Error(Object.values(payload.errors).flat()[0])
    throw new Error(payload.message || 'Request failed')
  }
  return payload
}

export const getSuppliers = (params = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString()
  return request(`/procurement/suppliers${qs ? `?${qs}` : ''}`)
}
export const createSupplier = data => request('/procurement/suppliers', { method: 'POST', body: JSON.stringify(data) })
export const updateSupplier = (id, data) => request(`/procurement/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const evaluateSupplier = (id, data) => request(`/procurement/suppliers/${id}/evaluations`, { method: 'POST', body: JSON.stringify(data) })
export const getQuotations = prfId => request(`/procurement/prfs/${prfId}/quotations`)
export const createQuotation = (prfId, data) => request(`/procurement/prfs/${prfId}/quotations`, { method: 'POST', body: JSON.stringify(data) })
export const getBudgets = () => request('/procurement/budgets')
export const createBudget = data => request('/procurement/budgets', { method: 'POST', body: JSON.stringify(data) })
export const decideBudget = (id, data) => request(`/procurement/budgets/${id}/decision`, { method: 'POST', body: JSON.stringify(data) })
export const getRejectedGoods = () => request('/procurement/rejected-goods')
export const createRejectedGood = data => request('/procurement/rejected-goods', { method: 'POST', body: JSON.stringify(data) })
export const updateRejectedGood = (id, data) => request(`/procurement/rejected-goods/${id}`, { method: 'PUT', body: JSON.stringify(data) })
export const getControlLog = () => request('/procurement/control-log')
