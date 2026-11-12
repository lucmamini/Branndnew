// Service Worker für das BranndNew-Dashboard
// Zeigt Push-Mitteilungen an. Speichert bewusst nichts zwischen,
// damit jedes Update der Seite sofort ankommt.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "BranndNew", {
    body: d.body || "",
    tag: d.tag || undefined,
    icon: "/app/icon-192.png",
    badge: "/app/icon-192.png",
    data: { url: d.url || "/dashboard.html" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/dashboard.html", self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const t of tabs) {
      if (t.url.includes("/dashboard.html")) {
        await t.focus();
        t.postMessage({ typ: "oeffnen", url });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
