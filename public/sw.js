// Cache the app shell so the range works without signal.
//
// The shell (this list) is small and changes with every deploy, so it is
// always fetched fresh when online — a new version is seen the moment it is
// published, with the cache only as an offline fallback. Everything else is
// the hashed build output: its filename changes whenever its content does,
// so serving it straight from the cache once it is there is both correct
// and exactly what makes the range work with no signal.
const CACHE = 'biathlon-coach-v2'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
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

  if (SHELL.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(event.request, copy))
          return res
        })
        .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match('/index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(
      (hit) =>
        hit ??
        fetch(event.request).then((res) => {
          const copy = res.clone()
          void caches.open(CACHE).then((c) => c.put(event.request, copy))
          return res
        }),
    ),
  )
})
