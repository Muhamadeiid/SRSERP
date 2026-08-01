import axios from './axios'

const b64ToU8 = (b64) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const base64 = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

const subToPayload = (sub) => {
  const json = sub.toJSON()
  return {
    endpoint:   json.endpoint,
    p256dh_key: json.keys.p256dh,
    auth_key:   json.keys.auth,
    user_agent: navigator.userAgent.slice(0, 300),
  }
}

// Web push is only available in secure contexts with the required APIs.
export const pushSupported = () =>
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager'   in window
  && 'Notification'  in window

export const currentPermission = () =>
  pushSupported() ? Notification.permission : 'denied'

// Register the service worker at /sw.js. Safe to call multiple times.
export async function ensureServiceWorker() {
  if (!pushSupported()) return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch (e) {
    console.warn('Push SW registration failed:', e)
    return null
  }
}

// Enable push notifications end-to-end:
//   1. Request permission
//   2. Fetch the server's VAPID public key
//   3. Subscribe with PushManager
//   4. Send the subscription to the backend
export async function enablePushNotifications() {
  if (!pushSupported()) throw new Error('Push notifications are not supported by this browser.')

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')

  const reg = await ensureServiceWorker()
  if (!reg) throw new Error('Service worker unavailable.')

  const { data } = await axios.get('/push/public-key')
  const publicKey = data?.public_key
  if (!publicKey) throw new Error('Server has no VAPID public key configured.')

  let subscription = await reg.pushManager.getSubscription()
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64ToU8(publicKey),
    })
  }

  await axios.post('/push/subscribe', subToPayload(subscription))
  return subscription
}

// Turn off web push on this device and tell the backend to forget the endpoint.
export async function disablePushNotifications() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  try {
    await axios.post('/push/unsubscribe', { endpoint: sub.endpoint })
  } catch (_) { /* backend cleanup is best-effort */ }
  await sub.unsubscribe()
}

// Report whether this device is currently subscribed.
export async function pushSubscriptionActive() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const reg = await navigator.serviceWorker.getRegistration('/')
  const sub = await reg?.pushManager.getSubscription()
  return !!sub
}
