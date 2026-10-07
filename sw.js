// Cache para funcionar sin internet. Subí la versión al publicar cambios.
const V = "gymlog-v8";
const FILES = ["./", "index.html", "app.js", "manifest.json", "icon.png", "silbato.mp3"];

self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
// Red primero (para recibir actualizaciones), cache si no hay conexión
self.addEventListener("fetch", e => {
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(V).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request)));
});
