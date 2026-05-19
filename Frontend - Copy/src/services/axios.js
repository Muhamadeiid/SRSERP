import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://unbitten-quarterly-rewash.ngrok-free.dev/api',
  headers: {
    'Content-Type': 'application/json',
    Accept:         'application/json',
    'ngrok-skip-browser-warning': '1',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('srs_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('srs_token')
      localStorage.removeItem('srs_user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export default api