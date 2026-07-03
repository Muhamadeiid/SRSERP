import api from './axios'

export const searchPositions = (search = '', department = null) =>
  api.get('/positions', {
    params: { search: search || undefined, department: department || undefined, limit: 20 },
  }).then(r => r.data)

export const listPositionsAll = () =>
  api.get('/positions/all').then(r => r.data)

export const createPosition = (data) =>
  api.post('/positions', data).then(r => r.data)

export const updatePosition = (id, data) =>
  api.put(`/positions/${id}`, data).then(r => r.data)

export const deletePosition = (id) =>
  api.delete(`/positions/${id}`).then(r => r.data)

export const mergePositions = (fromId, toId) =>
  api.post('/positions/merge', { from_id: fromId, to_id: toId }).then(r => r.data)
