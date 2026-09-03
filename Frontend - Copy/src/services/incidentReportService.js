import api from './axios'

export const getIncidentReports = (params = {}) => api.get('/incident-reports', { params }).then(r => r.data)
export const getIncidentReport = id => api.get(`/incident-reports/${id}`).then(r => r.data?.data)

export const saveIncidentReport = (values, id = null) => {
  const form = new FormData()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      form.append(key, typeof value === 'boolean' ? (value ? '1' : '0') : value)
    }
  })
  return api.post(id ? `/incident-reports/${id}` : '/incident-reports', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data?.data)
}

export const getIncidentPicture = (id, slot) => api
  .get(`/incident-reports/${id}/pictures/${slot}`, { responseType: 'blob' })
  .then(r => r.data)
