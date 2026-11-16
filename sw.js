// Service worker di ChairShare Go: rende l'app installabile e apribile anche con rete debole.
// Cambia VERSIONE a ogni pubblicazione per aggiornare i file in cache.
const VERSIONE = 'go-v5';
const FILE = ['/', '/index.html', '/go.html', '/css/app.css', '/js/config.js', '/js/util.js', '/js/data.js',
  '/js/app.js', '/js/go.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Mai in cache i dati di Supabase: devono essere sempre aggiornati
  if (url.hostname.endsWith('supabase.co')) return;
  // Pagine: prima la rete, poi la copia salvata
  if (req.mode === 'navigate') {
    const pagina = url.pathname.startsWith('/go/') ? '/go.html' : '/index.html';
    e.respondWith(fetch(req).catch(() => caches.match(pagina)));
    return;
  }
  // File statici e librerie: copia salvata aggiornata in background
  if (url.origin === location.origin || /jsdelivr|fonts\.(googleapis|gstatic)/.test(url.hostname)) {
    e.respondWith(caches.open(VERSIONE).then(async c => {
      const salvato = await c.match(req);
      const rete = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => salvato);
      return salvato || rete;
    }));
  }
});
