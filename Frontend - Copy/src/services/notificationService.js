import api from './axios'

const POLL_INTERVAL_MS = 10_000
const SNAPSHOT_EVENT = 'srs:notifications'
const NEW_EVENT = 'srs:notification:new'

let timer = null
let started = false
let fetching = false
let initialized = false
let knownIds = new Set()
let channel = null
let pollController = null
let subscriptionGeneration = 0

const normalize = (response) => response?.data ?? response ?? {}

export async function fetchNotifications(params = {}, config = {}) {
  const response = await api.get('/notifications', { ...config, params })
  return normalize(response)
}

export async function markNotificationRead(id) {
  const response = await api.patch(`/notifications/${id}/read`)
  notifyOtherTabs('refresh')
  return normalize(response)
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/read-all')
  notifyOtherTabs('refresh')
  return normalize(response)
}

export async function dismissNotification(id) {
  const response = await api.delete(`/notifications/${id}`)
  notifyOtherTabs('refresh')
  return normalize(response)
}

export async function performNotificationAction(id, action, payload = {}) {
  const response = await api.patch(`/notifications/${id}/action`, { action, payload })
  notifyOtherTabs('refresh')
  return normalize(response)
}

export async function getNotificationPreferences() {
  const response = await api.get('/notifications/preferences')
  return normalize(response)
}

export async function updateNotificationPreferences(data) {
  const response = await api.put('/notifications/preferences', data)
  return normalize(response)
}

async function poll({ announce = true } = {}) {
  if (fetching || document.hidden || !navigator.onLine || !localStorage.getItem('srs_token')) return
  const generation = subscriptionGeneration
  const controller = new AbortController()
  pollController = controller
  fetching = true
  try {
    const snapshot = await fetchNotifications({ tab: 'all', limit: 50 }, { signal: controller.signal })
    if (generation !== subscriptionGeneration) return
    const items = snapshot.items ?? snapshot.data ?? []
    const nextIds = new Set(items.map((item) => String(item.id)))

    if (initialized && announce) {
      items
        .filter((item) => !knownIds.has(String(item.id)))
        .reverse()
        .forEach((item) => window.dispatchEvent(new CustomEvent(NEW_EVENT, { detail: item })))
    }

    initialized = true
    knownIds = nextIds
    window.dispatchEvent(new CustomEvent(SNAPSHOT_EVENT, { detail: snapshot }))
  } catch (error) {
    // A temporary network/server failure must not interrupt the rest of the ERP.
    if (error?.code !== 'ERR_CANCELED' && error?.response?.status !== 401) {
      console.warn('Notification refresh failed:', error)
    }
  } finally {
    if (generation === subscriptionGeneration) {
      fetching = false
      if (pollController === controller) pollController = null
    }
  }
}

function schedule() {
  clearInterval(timer)
  timer = window.setInterval(() => poll(), POLL_INTERVAL_MS)
}

function notifyOtherTabs(message) {
  channel?.postMessage(message)
  poll({ announce: false })
}

function handleVisibility() {
  if (!document.hidden) poll()
}

function handleServiceWorkerMessage(event) {
  if (event.data?.type === 'notification-received') poll()
}

export function startNotificationSubscription() {
  if (typeof window === 'undefined') return () => {}
  // Ensure clean state — if start is called again for a different user session
  // (login after logout, token swap), tear down first so knownIds and listeners
  // reset. Without this, a lingering `started=true` prevents re-init and
  // duplicate NEW_EVENT toasts fire for the next user's snapshot.
  if (started) stopNotificationSubscription()
  subscriptionGeneration += 1
  started = true

  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('srs-notifications')
    channel.addEventListener('message', () => poll({ announce: false }))
  }

  document.addEventListener('visibilitychange', handleVisibility)
  window.addEventListener('online', handleVisibility)
  navigator.serviceWorker?.addEventListener('message', handleServiceWorkerMessage)
  poll({ announce: false })
  schedule()

  return stopNotificationSubscription
}

export function stopNotificationSubscription() {
  subscriptionGeneration += 1
  pollController?.abort()
  pollController = null
  fetching = false
  initialized = false
  knownIds = new Set()
  if (!started) return
  started = false
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', handleVisibility)
  window.removeEventListener('online', handleVisibility)
  navigator.serviceWorker?.removeEventListener('message', handleServiceWorkerMessage)
  channel?.close()
  channel = null
}

export const notificationEvents = {
  snapshot: SNAPSHOT_EVENT,
  newItem: NEW_EVENT,
}

// Notification center + preferences routes are registered per-module (HR,
// Maintenance, Inventory, Procurement) plus a default at the root. Given the
// current pathname, return the two URLs that keep the user inside their
// current module layout when they navigate from the bell.
const MODULE_PREFIXES = [
  '/human-resources',
  '/maintenance',
  '/inventory',
  '/procurement',
]
export function notificationLinks(pathname = typeof window === 'undefined' ? '' : window.location.pathname) {
  const base = MODULE_PREFIXES.find((prefix) => pathname.startsWith(prefix)) ?? ''
  return {
    center: `${base}/notifications`,
    settings: `${base}/notification-settings`,
  }
}
