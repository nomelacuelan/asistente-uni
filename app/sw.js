// Permite abrir la app sin conexión. Cuando subas una versión nueva, cambia el número de VERSION.
const VERSION = 'asistente-uni-v7';
const ARCHIVOS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/estilos.css',
  './js/app.js',
  './js/almacen.js',
  './js/datos.js',
  './js/fechas.js',
  './js/herramientas.js',
  './js/ia.js',
  './js/calendario.js',
  './iconos/icono.svg',
  './iconos/icono-192.png',
  './iconos/icono-512.png',
  './iconos/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Archivos de la app: primero la red (para tener siempre la última versión) y, si no hay conexión, la copia guardada.
// Las llamadas a la IA (otro dominio) no se tocan.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copia));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
  );
});
