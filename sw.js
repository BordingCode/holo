// HOLO service worker: network-first (always fresh when online), cache fallback offline.
const CACHE = 'holo-v3';
const CORE = ['./', 'index.html', 'css/style.css?v=2', 'js/main.js?v=2', 'js/data.js', 'js/engine.js', 'js/run.js', 'js/rng.js', 'js/ui.js',
  'js/pack.js', 'js/battle.js', 'js/audio.js', 'js/fx.js', 'js/meta.js', 'js/icons.js', 'assets/fonts/lilita.woff2', 'assets/fonts/nunito.woff2',
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
