import api from './axios'

export const login = async (email, password) => {
  const { data } = await api.post('/auth/login', { email, password })
  return data
}

export const logoutApi = async () => {
  await api.post('/auth/logout')
}

export const getMe = async () => {
  const { data } = await api.get('/auth/me')
  return data
}

export const uploadProfilePhoto = async (photo) => {
  const form = new FormData()
  form.append('photo', photo)
  const { data } = await api.post('/auth/profile-photo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data
}

export const getProfilePhoto = async () => {
  const { data } = await api.get('/auth/profile-photo', { responseType: 'blob' })
  return data
}

export const removeProfilePhoto = async () => {
  const { data } = await api.delete('/auth/profile-photo')
  return data
}
