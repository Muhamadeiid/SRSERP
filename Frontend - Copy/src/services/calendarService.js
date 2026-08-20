import api from './axios'

export const getCalendarEvents = (from, to) =>
  api.get('/calendar/events', { params: { from, to } }).then(response => response.data)

export const getCalendarStats = month =>
  api.get('/calendar/stats', { params: { month } }).then(response => response.data)

export const getCalendarUsers = () =>
  api.get('/calendar/users').then(response => response.data)

export const createCalendarEvent = payload =>
  api.post('/calendar/events', payload).then(response => response.data)

export const updateCalendarEvent = (id, payload) =>
  api.patch(`/calendar/events/${id}`, payload).then(response => response.data)

export const deleteCalendarEvent = id =>
  api.delete(`/calendar/events/${id}`).then(response => response.data)

export const setCalendarTaskDone = (id, done) =>
  api.patch(`/calendar/events/${id}/done`, { done }).then(response => response.data)
