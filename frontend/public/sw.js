/* ShivQuill service worker: makes the app installable and load instantly / offline.
 * - Hashed build files (/assets/*) are cache-first in their own cache (names change on every release);
 *   only the newest MAX_ASSETS are kept, so files from old releases are pruned over time.
 * - Pages use network-first, falling back to the cached copy when offline.
 * - API calls (/api/*) are never cached.
 */
const CACHE = 'shivquill-v3';
const ASSET_CACHE = 'shivquill-assets-v1';
const MAX_ASSETS = 80; // roughly two releases' worth of chunks
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/logo.jpg'];

// Cache keys keep insertion order, and a new release's files are always added after the old ones
async function pruneAssets() {
  const cache = await caches.open(ASSET_CACHE);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map(k => cache.delete(k)));
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== ASSET_CACHE).map(k => caches.delete(k))))
      .then(pruneAssets)
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        // Never cache an HTML fallback page under a script/style URL
        const type = res.headers.get('content-type') || '';
        if (res.ok && !type.includes('text/html')) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then(cache => cache.put(req, copy)).then(pruneAssets).catch(() => undefined);
        }
        return res;
      }))
    );
    return;
  }

  // Precached shell files (logo, icons, manifest): cache-first so they also work offline
  if (req.mode !== 'navigate' && SHELL.includes(url.pathname) && url.pathname !== '/') {
    event.respondWith(caches.match(url.pathname).then(hit => hit || fetch(req)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          // Never let a 404/500 page replace the cached app shell
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(cache => cache.put('/', copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => caches.match('/').then(hit => hit || Response.error()))
    );
  }
});
