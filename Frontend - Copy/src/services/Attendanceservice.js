// src/services/attendanceService.js
import axios from 'axios'
import { API_BASE_URL } from '../config/api'

const normalizeDateParam = (value) => {
  if (typeof value === 'string') return value || undefined
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }
  return undefined
}

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
  getCcpDaily: async (date) => {
    const response = await api.get('/ccp/attendance', { params: { date } })
    return response.data
  },
  saveCcpDaily: async (data) => {
    const response = await api.post('/ccp/attendance/manual', data)
    return response.data
  },
  saveCcpDailyBulk: async (data) => {
    const response = await api.post('/ccp/attendance/manual/bulk', data)
    return response.data
  },
  getInterventionShifts: async (weekStart) => {
    const response = await api.get('/intervention-shifts', { params: { week_start: weekStart } })
    return response.data
  },
  saveInterventionShifts: async (data) => {
    const response = await api.post('/intervention-shifts/bulk', data)
    return response.data
  },
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
    const params = {
      ...filters,
      date: normalizeDateParam(filters.date),
      start_date: normalizeDateParam(filters.start_date),
      end_date: normalizeDateParam(filters.end_date),
    }
    const response = await api.get('/attendance', { params })
    return response.data
  },
  getDashboardWeek: async (startDate, endDate) => {
    const response = await api.get('/attendance/dashboard-week', {
      params: { start_date: startDate, end_date: endDate },
    })
    return response.data
  },

  /**
   * Create manual attendance entry
   */
  createManual: async (data) => {
    const response = await api.post('/attendance/manual', data)
    return response.data
  },
  saveManualBulk: async (data) => {
    const response = await api.post('/attendance/manual/bulk', data)
    return response.data
  },
  getAbsenceDeductions: async (employeeId, startDate, endDate) => {
    const response = await api.get(`/attendance/absence-deductions/${employeeId}`, {
      params: { start_date: startDate, end_date: endDate },
    })
    return response.data
  },
  getLateDeductions: async (employeeId, startDate, endDate) => {
    const response = await api.get(`/attendance/late-deductions/${employeeId}`, {
      params: { start_date: startDate, end_date: endDate },
    })
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
   * Export attendance as a ZIP containing Ganz and Line 1 workbooks, with one
   * sheet per employee. Passing project keeps the single-workbook API available.
   */
  exportAllExcel: async (filters = {}) => {
    const response = await api.get('/attendance/export-all', {
      params: filters,
      responseType: 'blob',
    })
    return response.data
  },
}
