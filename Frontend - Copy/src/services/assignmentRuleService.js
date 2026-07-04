import api from './axios'

export const listAssignmentRules = () =>
  api.get('/assignment-rules').then(r => r.data)

export const createAssignmentRule = (data) =>
  api.post('/assignment-rules', data).then(r => r.data)

export const updateAssignmentRule = (id, data) =>
  api.put(`/assignment-rules/${id}`, data).then(r => r.data)

export const deleteAssignmentRule = (id) =>
  api.delete(`/assignment-rules/${id}`).then(r => r.data)

export const applyAssignmentRules = () =>
  api.post('/assignment-rules/apply').then(r => r.data)
