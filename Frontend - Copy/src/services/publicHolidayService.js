import api from './axios'

export const listPublicHolidays = (params = {}) =>
  api.get('/public-holidays', { params }).then(r => r.data)

export const createPublicHoliday = (data) =>
  api.post('/public-holidays', data).then(r => r.data)

export const updatePublicHoliday = (id, data) =>
  api.put(`/public-holidays/${id}`, data).then(r => r.data)

export const deletePublicHoliday = (id) =>
  api.delete(`/public-holidays/${id}`).then(r => r.data)
