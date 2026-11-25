// HealthPilot Service Worker – macht die App offline nutzbar.
// Bei jedem Update CACHE erhöhen. Gesundheitsdaten liegen in IndexedDB und sind davon nicht betroffen.
const CACHE = 'healthpilot-v2.0.0';
const FILES = [
  './', './index.html', './css/app.css', './js/app.js', './js/logic.js', './js/db.js', './js/demo.js', './js/food.js', './js/ai.js',
  './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
