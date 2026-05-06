import { createSlice } from '@reduxjs/toolkit'

let _savedUser = null
try { _savedUser = JSON.parse(localStorage.getItem('srs_user')) } catch (_) { localStorage.removeItem('srs_user') }

const initialState = {
  user:            _savedUser,
  token:           localStorage.getItem('srs_token') || null,
  isAuthenticated: !!localStorage.getItem('srs_token'),
  loading:         false,
  error:           null,
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    loginStart(state) {
      state.loading = true
      state.error   = null
    },
    loginSuccess(state, action) {
      state.loading         = false
      state.user            = action.payload.user
      state.token           = action.payload.token
      state.isAuthenticated = true
      localStorage.setItem('srs_token', action.payload.token)
      localStorage.setItem('srs_user',  JSON.stringify(action.payload.user))
    },
    loginFailure(state, action) {
      state.loading = false
      state.error   = action.payload
    },
    logout(state) {
      state.user            = null
      state.token           = null
      state.isAuthenticated = false
      localStorage.removeItem('srs_token')
      localStorage.removeItem('srs_user')
    },
    clearError(state) {
      state.error = null
    },
  },
})

export const { loginStart, loginSuccess, loginFailure, logout, clearError } = authSlice.actions
export default authSlice.reducer