import api from './axios'

/**
 * Returns the notes plus flags on what this user can do:
 *  - canFulfil:  approve, sign, edit any note (admin / depot manager / Material Controller)
 *  - canPrepare: edit items and mark ready for approval (store staff + fulfillers)
 *  - canView:    see every note (canPrepare covers it)
 */
export const getReleaseNotes = (params = {}) =>
  api.get('/release-notes', { params }).then(r => ({
    data:       r.data?.data ?? [],
    canFulfil:  Boolean(r.data?.can_fulfil),
    canPrepare: Boolean(r.data?.can_prepare),
    canView:    Boolean(r.data?.can_view),
  }))

export const getReleaseNote = id =>
  api.get(`/release-notes/${id}`).then(r => ({
    note:       r.data?.data,
    canFulfil:  Boolean(r.data?.can_fulfil),
    canPrepare: Boolean(r.data?.can_prepare),
    canView:    Boolean(r.data?.can_view),
  }))

export const createReleaseNote = payload =>
  api.post('/release-notes', payload).then(r => r.data?.data)

export const updateReleaseNote = (id, payload) =>
  api.put(`/release-notes/${id}`, payload).then(r => r.data?.data)

export const deleteReleaseNote = id =>
  api.delete(`/release-notes/${id}`).then(r => r.data)

/** The "Inventory Responsibility" signatory — the same person on every note. */
export const getInventorySpecialist = () =>
  api.get('/release-notes/inventory-specialist').then(r => r.data?.data ?? null)
