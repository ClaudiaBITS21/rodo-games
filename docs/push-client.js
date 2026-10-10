// Avisos push del torneo, del lado del navegador.
// Va dentro del <script> clásico de public/index.html, después de Reg (usa Reg.ready, Reg.fb() y Reg.uid()).
// Firestore: lee config/push (clave pública VAPID) y escribe pushsubs/{uid} = {subs:[{endpoint, keys:{p256dh, auth}}], at}.
// Uso:
//   Push.state()   → "on" | "off" | "denied" | "unsupported" | "ios-install" | "unavailable"
//   Push.enable()  → llamarla directo desde el toque del botón (sin await antes): pide permiso, suscribe y guarda
//   Push.disable() → da de baja este dispositivo
//   Push.sync()    → al cargar la página: si los avisos están activos y la suscripción no está guardada (o cambió), la guarda
//   Push.forget()  → antes de cerrar sesión o de entrar con otro usuario: saca este dispositivo de los avisos del usuario actual
// Al tocar un aviso con el sitio abierto, la página va sola a su # (por ejemplo #torneo) y dispara el evento "rodo-push".
const Push = (()=>{
  const MAX = 5;
  const ok = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const bytes = s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));
  const sameKey = (s, k) => { const a = s.options && s.options.applicationServerKey; return !a || b64(a) === k; };
  const fbx = async () => { await Reg.ready; return Reg.fb(); };
  const uidOf = f => (Reg.uid && Reg.uid()) || f.uid;
  let key = null; // clave pública VAPID (la crea la Function en config/push)

  async function vapid(){
    if (key) return key;
    const f = await fbx(); if (!f) return null;
    try { const s = await f.getDoc(f.doc(f.db, "config", "push")); key = (s.exists() && s.data().vapid) || null; } catch(e){ key = null; }
    return key;
  }
  async function current(){
    const r = await navigator.serviceWorker.getRegistration("/");
    return r && r.pushManager ? r.pushManager.getSubscription() : null;
  }
  const item = s => { const j = s.toJSON(); return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } }; };
  // guarda este dispositivo primero; si quedan más de 5, se va el más viejo
  async function save(s){
    const f = await fbx(); if (!f) throw new Error("sin servidor");
    const it = item(s), ref = f.doc(f.db, "pushsubs", uidOf(f));
    await f.runTransaction(f.db, async tx => {
      const d = await tx.get(ref), old = d.exists() ? (d.data().subs || []) : [];
      tx.set(ref, { subs: [it, ...old.filter(o => o && o.endpoint !== it.endpoint)].slice(0, MAX), at: f.serverTimestamp() });
    });
  }
  async function drop(ep){
    const f = await fbx(); if (!f || !ep) return;
    const ref = f.doc(f.db, "pushsubs", uidOf(f));
    await f.runTransaction(f.db, async tx => {
      const d = await tx.get(ref); if (!d.exists()) return;
      const old = d.data().subs || [], subs = old.filter(o => o && o.endpoint !== ep);
      if (subs.length === old.length) return;
      if (subs.length) tx.set(ref, { subs, at: f.serverTimestamp() }); else tx.delete(ref);
    });
  }

  async function state(){
    if (!ok()) return ios() && navigator.standalone !== true ? "ios-install" : "unsupported";
    if (Notification.permission === "denied") return "denied";
    if (!(await vapid())) return "unavailable";
    if (Notification.permission !== "granted") return "off";
    return (await current().catch(() => null)) ? "on" : "off";
  }

  // sin async a propósito: el permiso se pide antes de cualquier espera (Safari lo exige pegado al toque)
  function enable(){
    if (!ok()) return state();
    const perm = Notification.permission !== "default" ? Promise.resolve(Notification.permission)
      : new Promise(res => { const p = Notification.requestPermission(res); if (p && p.then) p.then(res, () => res("default")); });
    return (async () => {
      const p = await perm;
      if (p === "denied") return "denied";
      if (p !== "granted") return "off";
      const k = await vapid(); if (!k) return "unavailable";
      let s = null, made = false;
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        const r = await navigator.serviceWorker.ready;
        s = await r.pushManager.getSubscription();
        if (s && !sameKey(s, k)) { await s.unsubscribe().catch(() => {}); s = null; } // era de una clave vieja
        if (!s) { s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(k) }); made = true; }
        await save(s);
        return "on";
      } catch(e) {
        console.warn("Push:", e);
        if (s && made) await s.unsubscribe().catch(() => {}); // que no quede activo sin estar guardado
        return state();
      }
    })();
  }

  async function disable(){
    try {
      const s = await current();
      if (s) { const ep = s.endpoint; await s.unsubscribe().catch(() => {}); await drop(ep); }
    } catch(e) { console.warn("Push:", e); }
    return state();
  }

  async function sync(){
    try {
      if ((await state()) !== "on") return;
      const k = await vapid();
      let s = await current();
      if (!sameKey(s, k)) { // la clave cambió: se renueva sola (con el permiso ya dado no hace falta un toque)
        const r = await navigator.serviceWorker.ready;
        await s.unsubscribe().catch(() => {});
        s = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(k) });
      }
      const f = await fbx(), it = item(s);
      const d = await f.getDoc(f.doc(f.db, "pushsubs", uidOf(f)));
      const have = d.exists() && (d.data().subs || []).some(o => o && o.endpoint === it.endpoint && o.keys && o.keys.p256dh === it.keys.p256dh && o.keys.auth === it.keys.auth);
      if (!have) await save(s);
    } catch(e) { console.warn("Push:", e); }
  }

  async function forget(){
    try { const s = ok() ? await current() : null; if (s) await drop(s.endpoint); } catch(e) { console.warn("Push:", e); }
  }

  // aviso tocado con el sitio abierto (lo manda /sw.js): ir al # del aviso
  if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
    const d = e.data; if (!d || d.type !== "push-open") return;
    try { const u = new URL(d.url, location.href); if (u.origin === location.origin && u.hash && u.hash !== location.hash) location.hash = u.hash; } catch(_) {}
    window.dispatchEvent(new CustomEvent("rodo-push", { detail: d }));
  });

  return { state, enable, disable, sync, forget };
})();
