/* Service worker: caches only the static app shell. Never caches /d/ data or screen.jpg. */
const SHELL = "desk-shell-v16";
const FILES = ["./", "index.html", "app.css", "app.js", "chart.js", "manifest.json", "icons/apple-touch-icon.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(SHELL).then((c) => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== SHELL).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.includes("/d/") || u.pathname.endsWith(".jpg") || u.pathname.includes("/api/")) return; // network only
  if (e.request.method !== "GET" || u.origin !== self.location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(SHELL).then((cache) => cache.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification("Grok Bot · now", { body: d.text || "", data: { link: d.link || null } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const link = e.notification.data && e.notification.data.link;
  if (link) e.waitUntil(clients.openWindow(link));
});
