import api from './axios'

export const getPermissionMatrix = () =>
  api.get('/permissions/matrix').then(r => r.data)

export const togglePermission = (role, permission_key, allowed) =>
  api.post('/permissions/toggle', { role, permission_key, allowed }).then(r => r.data)

export const teamTransfer = (payload) =>
  api.post('/team-transfer', payload).then(r => r.data)
