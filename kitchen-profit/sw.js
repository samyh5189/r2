// Kitchen Profit service worker.
// Network-first for the page so updates always show when online;
// cache-first for static assets; offline fallback from cache.
const CACHE = 'kp-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;                 // never cache Supabase writes
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;               // let CDN / Supabase go to network

  const isPage = e.request.mode === 'navigate' ||
                 u.pathname === '/' || u.pathname.endsWith('/index.html');

  if (isPage) {
    // network-first: fresh page online, cached page offline
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
    return;
  }
  // assets: cache-first with background refresh
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => r))
  );
});
