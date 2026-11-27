// Service worker : uniquement pour les notifications Web Push (pas de cache hors ligne).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let data = {}
  try {
    data = e.data ? e.data.json() : {}
  } catch {
    data = { body: e.data ? e.data.text() : '' }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'Vidy Sec', {
      body: data.body || '',
      icon: 'apple-touch-icon.png',
      data: { url: data.url || self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus()
      return self.clients.openWindow(url)
    }),
  )
})
