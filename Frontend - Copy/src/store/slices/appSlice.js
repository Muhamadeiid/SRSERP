import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  activeNav: 'dashboard',
  modal: null,
}

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setActiveNav: (state, action) => { state.activeNav = action.payload },
    openModal: (state, action) => { state.modal = action.payload },
    closeModal: (state) => { state.modal = null },
  },
})

export const { setActiveNav, openModal, closeModal } = appSlice.actions
export default appSlice.reducer