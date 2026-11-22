// Permite abrir la app sin conexión y la mantiene siempre actualizada.
// Cuando subas una versión nueva, cambia el número de VERSION (y VERSION_APP en js/app.js).
const VERSION = 'asistente-uni-v10';
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
  // cache: 'reload' → descarga los archivos del servidor, nunca de la caché del navegador
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(ARCHIVOS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== VERSION && k !== 'compartido').map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// "Compartir → Asistente Uni" desde otra app (Android): Chrome envía lo compartido aquí.
// Se guarda un momento y se abre la app en "Añadir información".
async function recibirCompartido(request) {
  const datos = await request.formData();
  const cache = await caches.open('compartido');
  for (const k of await cache.keys()) await cache.delete(k);
  const archivos = datos.getAll('archivos').filter((f) => f && typeof f !== 'string' && f.size > 0);
  await cache.put('meta', new Response(JSON.stringify({
    titulo: datos.get('titulo') || '',
    texto: datos.get('texto') || '',
    url: datos.get('url') || '',
    archivos: archivos.slice(0, 1).map((f) => ({ nombre: f.name, tipo: f.type })),
  })));
  if (archivos[0]) await cache.put('archivo-0', new Response(archivos[0]));
  return Response.redirect('./?compartido=1#anadir-compartido', 303);
}

// Archivos de la app: siempre se pregunta al servidor si hay versión nueva (cache: 'no-cache');
// si no hay conexión, se usa la copia guardada. Las llamadas a la IA (otro dominio) no se tocan.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method === 'POST' && url.pathname.endsWith('/compartir')) {
    e.respondWith(recibirCompartido(e.request));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
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
