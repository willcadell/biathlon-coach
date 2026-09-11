// Cache the app shell so the range works without signal. Anything the build
// produces is hashed, so a stale cache is dropped whenever the version changes.
const CACHE = 'biathlon-coach-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/index.html', '/manifest.webmanifest', '/icon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  // Never cache API traffic, and never interfere with it.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ??
        fetch(event.request)
          .then((res) => {
            const copy = res.clone()
            void caches.open(CACHE).then((c) => c.put(event.request, copy))
            return res
          })
          .catch(() => caches.match('/index.html').then((f) => f ?? Response.error())),
    ),
  )
})
