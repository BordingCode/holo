// HOLO service worker: network-first (always fresh when online), cache fallback offline.
const CACHE = 'holo-v11';
const CORE = ['./', 'index.html', 'css/style.css?v=11', 'js/main.js?v=11', 'js/data.js?v=11', 'js/engine.js?v=11', 'js/run.js?v=11', 'js/rng.js?v=11', 'js/ui.js?v=11',
  'js/pack.js?v=11', 'js/battle.js?v=11', 'js/audio.js?v=11', 'js/fx.js?v=11', 'js/meta.js?v=11', 'js/backroom.js?v=11', 'js/grade.js?v=11', 'js/customers.js?v=11', 'js/icons.js?v=11', 'assets/fonts/lilita.woff2', 'assets/fonts/nunito.woff2',
  'assets/icon-192.png', 'assets/icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => fetch(u, { cache: 'reload' }).then(r => r.ok && c.put(u, r)).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
