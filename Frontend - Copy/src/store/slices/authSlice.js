import { createSlice } from '@reduxjs/toolkit'
import { logoutApi } from '../../services/authService'
import { terminateSession } from '../../utils/terminateSession'

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
    refreshUser(state, action) {
      state.user = action.payload
      localStorage.setItem('srs_user', JSON.stringify(action.payload))
    },
    loginFailure(state, action) {
      state.loading = false
      state.error   = action.payload
    },
    clearSession(state) {
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

export const { loginStart, loginSuccess, refreshUser, loginFailure, clearError } = authSlice.actions
export const logout = () => (dispatch, getState) => terminateSession(
  getState().auth.token || localStorage.getItem('srs_token'),
  {
    revoke: logoutApi,
    clear: () => dispatch(authSlice.actions.clearSession()),
    onUnconfirmed: () => window.alert('Signed out of this browser. Server logout could not be confirmed. Ask your administrator to revoke remaining sessions.'),
  },
)
export default authSlice.reducer
