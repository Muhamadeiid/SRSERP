import api from './axios'

export const listIssuingSources   = () => api.get('/issuing-sources').then(r => r.data)
export const createIssuingSource  = (data) => api.post('/issuing-sources', data).then(r => r.data)
export const updateIssuingSource  = (id, data) => api.put(`/issuing-sources/${id}`, data).then(r => r.data)
export const deleteIssuingSource  = (id) => api.delete(`/issuing-sources/${id}`).then(r => r.data)

// IT asset assignment helper
export const assignItAssetToEmployee = (itAssetId, payload) =>
  api.post(`/it-assets/${itAssetId}/assign`, payload).then(r => r.data)
