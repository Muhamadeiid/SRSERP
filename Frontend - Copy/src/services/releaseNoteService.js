import api from './axios'

/** Returns the notes plus whether this user is allowed to fill in the store side. */
export const getReleaseNotes = (params = {}) =>
  api.get('/release-notes', { params }).then(r => ({
    data: r.data?.data ?? [],
    canFulfil: Boolean(r.data?.can_fulfil),
  }))

export const getReleaseNote = id =>
  api.get(`/release-notes/${id}`).then(r => r.data?.data)

export const createReleaseNote = payload =>
  api.post('/release-notes', payload).then(r => r.data?.data)

export const updateReleaseNote = (id, payload) =>
  api.put(`/release-notes/${id}`, payload).then(r => r.data?.data)

export const deleteReleaseNote = id =>
  api.delete(`/release-notes/${id}`).then(r => r.data)

/** The "Inventory Responsibility" signatory — the same person on every note. */
export const getInventorySpecialist = () =>
  api.get('/release-notes/inventory-specialist').then(r => r.data?.data ?? null)
