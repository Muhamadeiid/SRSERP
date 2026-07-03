import api from './axios'

let cache = null
let inFlight = null

export async function fetchLookups({ force = false } = {}) {
  if (cache && !force) return cache
  if (inFlight) return inFlight
  inFlight = api.get('/lookups')
    .then(res => { cache = res.data; return cache })
    .finally(() => { inFlight = null })
  return inFlight
}

export function invalidateLookups() { cache = null }

export function getLookupsByType(type) {
  return cache?.[type] ?? []
}

export function labelFor(type, key) {
  const items = cache?.[type] ?? []
  return items.find(i => i.key === key)?.label_en ?? key
}

export const listLookupsAll  = ()          => api.get('/lookups/all').then(r => r.data)
export const createLookup    = (data)      => api.post('/lookups', data).then(r => r.data)
export const updateLookup    = (id, data)  => api.put(`/lookups/${id}`, data).then(r => r.data)
export const deleteLookup    = (id)        => api.delete(`/lookups/${id}`).then(r => r.data)
