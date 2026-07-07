// src/services/attendanceService.js
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

// Create axios instance with auth token
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('srs_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export const attendanceService = {
  /**
   * Upload biometric file
   */
  uploadBiometric: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    
    const response = await api.post('/attendance/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    return response.data
  },

  /**
   * Get attendance records with filters
   */
  getAttendance: async (filters = {}) => {
    const response = await api.get('/attendance', { params: filters })
    return response.data
  },

  /**
   * Create manual attendance entry
   */
  createManual: async (data) => {
    const response = await api.post('/attendance/manual', data)
    return response.data
  },

  /**
   * Get employee attendance summary
   */
  getSummary: async (employeeId, startDate, endDate) => {
    const response = await api.get(`/attendance/summary/${employeeId}`, {
      params: { start_date: startDate, end_date: endDate },
    })
    return response.data
  },

  /**
   * Delete attendance record
   */
  deleteAttendance: async (id) => {
    const response = await api.delete(`/attendance/${id}`)
    return response.data
  },

  /**
   * Upload Excel attendance sheet
   */
  uploadExcel: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/attendance/upload-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  /**
   * Export attendance to Excel
   */
  exportExcel: async (filters = {}) => {
    const response = await api.get('/attendance/export', {
      params: filters,
      responseType: 'blob',
    })
    return response.data
  },

  /**
   * Export all employees attendance — one sheet per employee
   */
  exportAllExcel: async (filters = {}) => {
    const response = await api.get('/attendance/export-all', {
      params: filters,
      responseType: 'blob',
    })
    return response.data
  },
}
