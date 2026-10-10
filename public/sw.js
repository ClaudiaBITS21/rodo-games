// Service worker de RODO ₿ Games: solo muestra los avisos push del torneo.
// No cachea nada ni intercepta pedidos (no hay evento fetch): cada deploy se ve al instante, como sin service worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : "" }; }
  const o = { body: d.body || "", icon: "/img/icon-192.png", badge: "/img/badge-96.png", data: { url: d.url || "/" } };
  if (d.tag) { o.tag = d.tag; o.renotify = true; } // mismo tag = reemplaza al aviso anterior del mismo evento, y vuelve a sonar
  // siempre se muestra un aviso: iOS y Chrome dan de baja la suscripción si un push llega sin aviso visible
  e.waitUntil(self.registration.showNotification(d.title || "RODO ₿ Games", o));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = list.find(w => w.focused) || list.find(w => w.visibilityState === "visible") || list[0];
    if (!c) return self.clients.openWindow(url);
    // con el sitio abierto: se enfoca esa pestaña y la página cambia sola el # (Push escucha este mensaje).
    // No se usa navigate(): podría recargar la página y cortar una partida en curso.
    const f = c.focus().catch(() => {});
    c.postMessage({ type: "push-open", url });
    await f;
  })());
});

// si el navegador renueva la suscripción, se pide otra con la misma clave; la página la guarda con Push.sync()
self.addEventListener("pushsubscriptionchange", e => {
  const key = e.oldSubscription && e.oldSubscription.options && e.oldSubscription.options.applicationServerKey;
  if (key) e.waitUntil(self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).catch(() => {}));
});
