// Self-destructing service worker.
// The old cache-everything SW was serving stale/404 HTML. This version
// unregisters itself and wipes all caches on first load.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clientList = await self.clients.matchAll({ type: 'window' });
    clientList.forEach((client) => client.navigate(client.url));
  })());
});
