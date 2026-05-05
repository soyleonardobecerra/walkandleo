// sw.js — Service Worker mínimo para habilitar instalación PWA
const CACHE = 'radio-wt-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

// Instalar: cachear archivos estáticos
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activar: borrar caches viejos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: red primero, cache como fallback
self.addEventListener('fetch', e => {
  // No interceptar peticiones a Firebase (autenticación, Firestore, Storage)
  if (e.request.url.includes('firebase') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic')) {
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
