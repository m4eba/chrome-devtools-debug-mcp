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
    // control / fetch interception is racy in headless CI). Report the outcome
    // back to all windows so the test can tell "SW never fetched" apart from
    // "SW fetched but the request wasn't captured on the SW target".
    event.waitUntil((async () => {
      let outcome;
      try {
        const r = await fetch('/api/data', { cache: 'no-store' });
        outcome = 'status-' + r.status;
      } catch (e) {
        outcome = 'error-' + (e && e.message);
      }
      const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      for (const c of clients) c.postMessage({ swOutcome: outcome });
    })());
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
