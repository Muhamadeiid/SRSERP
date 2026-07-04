import api from './axios'

export const listProjects = () =>
  api.get('/projects').then(r => r.data)

export const createProject = (data) =>
  api.post('/projects', data).then(r => r.data)

export const updateProject = (id, data) =>
  api.put(`/projects/${id}`, data).then(r => r.data)

export const deleteProject = (id) =>
  api.delete(`/projects/${id}`).then(r => r.data)
