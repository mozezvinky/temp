const CACHE_NAME = "pic-pwa-v2";
const OFFLINE_URL = "/offline";
const ASSETS = ["/", OFFLINE_URL, "/manifest.webmanifest", "/icons/pic-icon.png", "/icons/icon.svg", "/download.webp"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isStaticAsset = ASSETS.includes(url.pathname) || url.pathname.startsWith("/icons/");
  if (!isStaticAsset) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? caches.match(OFFLINE_URL) : Response.error()))
  );
});

self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(self.registration.showNotification(data.title || "Copic", {
    body: data.body || "You have a new Copic update.",
    icon: "/icons/pic-icon.png",
    badge: "/icons/maskable.svg",
    data: { url: data.url || "/notifications" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
