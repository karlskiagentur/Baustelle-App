/* Service Worker der Baustellen-App:
 *  - Offline-Start: die App selbst (HTML, JS, CSS, Icons) liegt im Speicher des Handys,
 *    sie öffnet also auch im Funkloch. Daten-Zwischenstand und Warteschlange macht die App selbst.
 *  - Push-Empfang + Klick öffnet die App.
 * DATEIEN und VERSION werden beim Build eingesetzt (vite.config.js → swDateien).
 */
const VERSION = "__SW_VERSION__";
const DATEIEN = "__SW_DATEIEN__";
const CACHE = "baustelle-app-" + VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const liste = Array.isArray(DATEIEN) ? DATEIEN : [];
    // einzeln laden: eine fehlende Datei darf die Installation nicht verhindern
    await Promise.all(["/", ...liste].map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("baustelle-app-") && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

const mitZeitlimit = (p, ms) => new Promise((ok, nein) => {
  const t = setTimeout(() => nein(new Error("Zeitlimit")), ms);
  p.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); nein(e); });
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return; // API und Karten-Kacheln nie aus dem Speicher

  if (req.mode === "navigate") {
    // Seite: Netz zuerst (damit Updates ankommen); ohne Netz oder nach 4 s Funkloch die gespeicherte App
    event.respondWith((async () => {
      const c = await caches.open(CACHE);
      try {
        const netz = await mitZeitlimit(fetch(req), 4000);
        if (netz.ok) c.put("/", netz.clone());
        return netz;
      } catch {
        return (await c.match("/")) || (await caches.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Dateien (JS, CSS, Icons): erst aus dem Speicher, sonst aus dem Netz (und merken)
  event.respondWith((async () => {
    const treffer = await caches.match(req);
    if (treffer) return treffer;
    try {
      const netz = await fetch(req);
      if (netz.ok && /^\/(assets|icons)\//.test(url.pathname)) (await caches.open(CACHE)).put(req, netz.clone());
      return netz;
    } catch {
      return Response.error();
    }
  })());
});

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
