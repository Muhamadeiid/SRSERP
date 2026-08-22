// Rotem SRS Egypt — push service worker.
// Handles two events:
//   1. push  — display an OS notification when the backend delivers a message.
//   2. notificationclick — focus (or open) the app and jump to the linked request.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let payload = { title: 'Rotem SRS Egypt', body: '', data: {} }
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() }
    } catch (_) {
      payload.body = event.data.text() || ''
    }
  }
  const opts = {
    body: payload.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.data?.tag || undefined,
    data: payload.data || {},
  }
  event.waitUntil((async () => {
    await self.registration.showNotification(payload.title, opts)
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    windows.forEach((client) => client.postMessage({
      type: 'notification-received',
      notification: payload,
    }))
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const target = data.path || '/'
  event.waitUntil((async () => {
    const clientsArr = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsArr) {
      if ('focus' in client) {
        try {
          if (client.url.includes(target)) {
            return client.focus()
          }
        } catch (_) { /* fallthrough */ }
      }
    }
    if (clientsArr[0] && 'navigate' in clientsArr[0]) {
      try {
        await clientsArr[0].navigate(target)
        return clientsArr[0].focus()
      } catch (_) { /* fallthrough */ }
    }
    if (self.clients.openWindow) {
      return self.clients.openWindow(target)
    }
  })())
})
