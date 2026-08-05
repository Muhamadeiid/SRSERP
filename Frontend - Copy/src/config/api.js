const configuredBase = import.meta.env.VITE_API_URL
  ?? import.meta.env.VITE_API_BASE
  ?? '/api'

// One canonical backend base for every frontend module.
export const API_BASE_URL = String(configuredBase).replace(/\/+$/, '')

