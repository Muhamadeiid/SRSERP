export async function terminateSession(token, { revoke, clear, onUnconfirmed }) {
  // The caller captures the token before clearing browser state.
  clear()
  if (!token) return true
  try {
    await revoke(token)
    return true
  } catch (error) {
    if (error?.response?.status === 401) return true
    onUnconfirmed?.()
    return false
  }
}
