/* Service Worker der Baustellen-App: Push-Empfang + Klick öffnet die App. */
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let daten = {};
  try { daten = event.data ? event.data.json() : {}; } catch { daten = { title: "Baustellen-App", body: event.data && event.data.text() }; }
  const titel = daten.title || "Baustellen-App";
  event.waitUntil(
    self.registration.showNotification(titel, {
      body: daten.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: daten.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
      for (const c of liste) {
        if ("focus" in c) { c.navigate(ziel); return c.focus(); }
      }
      return self.clients.openWindow(ziel);
    })
  );
});

/* Minimaler Fetch-Handler (macht die App installierbar); Netz zuerst, kein Caching von /api */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
