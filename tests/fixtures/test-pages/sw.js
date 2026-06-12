// Service worker that proxies /api/sw-data through fetch so the CDP Network
// domain on the SW target sees the outgoing request.
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data === 'claim') {
    self.clients.claim();
  } else if (event.data === 'fetch-now') {
    // Make an outgoing request straight from the SW so it is captured on the
    // SW target — independent of whether the SW controls any page (page
    // control / fetch interception is racy in headless CI).
    event.waitUntil(fetch('/api/data', { cache: 'no-store' }));
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === '/api/sw-data') {
    // Force the SW to make its own fetch — this is what we want to capture on
    // the service-worker target.
    event.respondWith(
      fetch('/api/data', { cache: 'no-store' }).then(
        (r) => new Response(r.body, { headers: { 'X-SW-Proxied': '1' }, status: r.status })
      )
    );
  }
});
