// Avisos push del torneo: claves VAPID, textos y envío con web-push.
// index.js solo engancha los disparadores; las pruebas llaman a estas funciones directo.
"use strict";
const crypto = require("crypto");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");
const webpush = require("web-push");

if (!getApps().length) initializeApp(); // credenciales y proyecto los da el entorno
const db = getFirestore();

const SUBJECT = "https://games.rodo.es"; // contacto VAPID (Apple exige uno válido)
const URL_T = "/#torneo";
const SOON = 90 * 1000; // "arranca en 1 minuto": go dentro de los próximos 90 s
const MAX_SUBS = 5;
const TZ = "America/Argentina/Buenos_Aires";
// solo se manda a servicios de push conocidos (que nadie use la Function para pegarle a cualquier URL); en el emulador, a cualquiera
const PUSH_HOSTS = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/;

const ms = v => v && typeof v.toMillis === "function" ? v.toMillis() : typeof v === "number" ? v : null;
const langOf = (...l) => l.find(x => x === "es" || x === "en") || "es";

// ---- Claves VAPID: se crean solas la primera vez (transacción: dos instancias a la vez no generan claves distintas)
let vapid = null, vapidAt = 0;
async function ensureVapid() {
  if (vapid && Date.now() - vapidAt < 10 * 60 * 1000) return vapid;
  const pRef = db.doc("_private/vapid"), cRef = db.doc("config/push");
  vapid = await db.runTransaction(async tx => {
    const [p, c] = await tx.getAll(pRef, cRef);
    let k = p.exists && p.get("publicKey") && p.get("privateKey") ? { publicKey: p.get("publicKey"), privateKey: p.get("privateKey") } : null;
    if (!k) { k = webpush.generateVAPIDKeys(); tx.set(pRef, { ...k, at: FieldValue.serverTimestamp() }); }
    if (!c.exists || c.get("vapid") !== k.publicKey) tx.set(cRef, { vapid: k.publicKey }); // la pública, para los navegadores
    return k;
  });
  vapidAt = Date.now();
  return vapid;
}

// ---- Textos (es/en)
const GAMES = {
  es: { acrostico: "Acróstico", ahorcado: "Ahorcado", sopa: "Sopa de letras", criptograma: "Criptograma", anagrama: "Anagrama", semilla: "Semilla perdida" },
  en: { acrostico: "Acrostic", ahorcado: "Hangman", sopa: "Word search", criptograma: "Cryptogram", anagrama: "Anagram", semilla: "Lost seed" },
};
const ord = n => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const hhmm = t => new Intl.DateTimeFormat("es-AR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(t));
const T = {
  es: {
    head: r => r.final ? "La final" : `Ronda ${r.no}`,
    sched: (h, g, t) => `${h} · ${g} arranca a las ${t}`,
    soon: (h, g) => `¡Arranca en 1 minuto! ${h} · ${g}`,
    champ: "¡Ganaste el torneo!",
    pass: n => `¡Pasaste a la siguiente ronda! Quedaste ${n}°`,
    out: (n, m) => `Quedaste ${n}° de ${m}. Podés seguir jugando las rondas sin competir.`,
    outFinal: (n, m) => `Quedaste ${n}° de ${m} en la final. ¡Gran torneo!`,
    checkin: t => `Abrió el check-in de ${t}: confirmá que estás`,
    live: t => `${t} está por arrancar`,
  },
  en: {
    head: r => r.final ? "The final" : `Round ${r.no}`,
    sched: (h, g, t) => `${h} · ${g} starts at ${t} (Argentina time)`,
    soon: (h, g) => `Starting in 1 minute! ${h} · ${g}`,
    champ: "You won the tournament!",
    pass: n => `You made it to the next round! You placed ${ord(n)}`,
    out: (n, m) => `You placed ${ord(n)} of ${m}. You can keep playing the rounds without competing.`,
    outFinal: (n, m) => `You placed ${ord(n)} of ${m} in the final. Great tournament!`,
    checkin: t => `Check-in for ${t} is open: confirm you're in`,
    live: t => `${t} is about to start`,
  },
};
const roundHead = (r, i, L) => T[L].head({ final: r.final === true, no: r.no || Number(i) + 1 });
const gameName = (g, L) => GAMES[L][g] || g || "";

// ---- Envío
function okSub(s) {
  if (!s || typeof s.endpoint !== "string" || !s.keys || typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return false;
  try {
    const u = new URL(s.endpoint);
    return u.protocol === "https:" && (process.env.FUNCTIONS_EMULATOR === "true" || PUSH_HOSTS.test(u.hostname));
  } catch (e) { return false; }
}
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
// saca del jugador las suscripciones que el servicio de push dio por muertas (404/410)
async function prune(uid, eps) {
  const ref = db.doc(`pushsubs/${uid}`);
  await db.runTransaction(async tx => {
    const s = await tx.get(ref); if (!s.exists) return;
    const subs = (s.get("subs") || []).filter(o => !o || !eps.includes(o.endpoint));
    if (subs.length) tx.update(ref, { subs }); else tx.delete(ref);
  });
}
// msg: {title, body, tag, ttl?} o una función uid → msg (o null para saltearlo)
async function send(uids, msg) {
  uids = [...new Set((Array.isArray(uids) ? uids : []).filter(u => typeof u === "string" && u && !u.includes("/")))];
  const r = { devices: 0, sent: 0, gone: 0, failed: 0 };
  if (!uids.length) return r;
  const v = await ensureVapid();
  const snaps = [];
  for (let i = 0; i < uids.length; i += 100) snaps.push(...await db.getAll(...uids.slice(i, i + 100).map(u => db.doc(`pushsubs/${u}`))));
  const jobs = [];
  for (const s of snaps) {
    if (!s.exists) continue;
    const m = typeof msg === "function" ? msg(s.id) : msg;
    if (!m) continue;
    for (const sub of (s.get("subs") || []).slice(0, MAX_SUBS)) {
      if (okSub(sub)) jobs.push({ uid: s.id, sub, m });
      else logger.warn("push: suscripción ignorada", { uid: s.id, endpoint: sub && String(sub.endpoint).slice(0, 60) });
    }
  }
  r.devices = jobs.length;
  const gone = {};
  await pool(jobs, 16, async ({ uid, sub, m }) => {
    const payload = JSON.stringify({ title: m.title, body: m.body, url: URL_T, tag: m.tag });
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, payload, {
        vapidDetails: { subject: SUBJECT, publicKey: v.publicKey, privateKey: v.privateKey },
        TTL: Math.max(30, Math.round(m.ttl || 300)), urgency: "high", timeout: 10000,
        // Topic: si el aviso todavía no llegó, el servicio de push reemplaza el pendiente del mismo evento
        topic: crypto.createHash("sha256").update(m.tag).digest("base64url").slice(0, 32),
      });
      r.sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { (gone[uid] = gone[uid] || []).push(sub.endpoint); r.gone++; }
      else { r.failed++; logger.warn("push: falló un envío", { uid, status: e.statusCode, err: String(e.body || e.message).slice(0, 200) }); }
    }
  });
  await Promise.all(Object.entries(gone).map(([u, eps]) => prune(u, eps).catch(e => logger.warn("push: no se pudo limpiar", { uid: u, err: e.message }))));
  return r;
}

// marca el aviso en el documento dentro de una transacción: si el disparador corre dos veces, el segundo no manda nada
async function claim(ref, cond, patch) {
  return db.runTransaction(async tx => {
    const s = await tx.get(ref);
    if (!s.exists || !cond(s.data())) return false;
    tx.update(ref, patch);
    return true;
  });
}
async function tourneyInfo(tid) {
  const s = await db.doc(`tourneys/${tid}`).get();
  return s.exists ? s.data() : {};
}
const ttlUntil = (goMs, min, max) => Math.min(max, Math.max(min, (goMs - Date.now()) / 1000));

// ---- tourneys/{tid}/rounds/{i}: ronda programada (o reprogramada) y ronda cerrada
// Marcas que escribe la Function en la ronda: n0 = go (ms) ya avisado, n1 = aviso de "1 minuto" hecho, nc = cierre avisado
async function onRound(tid, i, before, after) {
  if (!after) return null;
  const b = before || {}, ref = db.doc(`tourneys/${tid}/rounds/${i}`);
  // vuelve a "ready" o se reabre una cerrada: se borran las marcas para que el próximo aviso salga
  if (b.st && after.st !== b.st) {
    const del = {};
    if (after.st === "ready") ["n0", "n1", "nc"].forEach(k => { if (after[k] != null) del[k] = FieldValue.delete(); });
    if (b.st === "closed" && after.nc != null) del.nc = FieldValue.delete();
    if (Object.keys(del).length) await claim(ref, d => d.st === after.st, del);
  }
  const goMs = ms(after.go);
  if (after.st === "sched" && goMs && (b.st !== "sched" || ms(b.go) !== goMs)) {
    const soon = goMs - Date.now() <= SOON; // si ya falta poco, este aviso reemplaza al de "1 minuto"
    if (!await claim(ref, d => d.st === "sched" && ms(d.go) === goMs && d.n0 !== goMs, { n0: goMs, n1: soon })) return null;
    const t = await tourneyInfo(tid), L = langOf(after.lang, t.lang);
    const r = await send(after.pl, {
      title: t.name || "RODO ₿ Games", tag: `${tid}-r${i}-go`, ttl: ttlUntil(goMs, 60, 3600),
      body: T[L].sched(roundHead(after, i, L), gameName(after.g, L), hhmm(goMs)),
    });
    logger.info("push: ronda programada", { tid, i, ...r });
    return r;
  }
  if (after.st === "closed" && b.st !== "closed") {
    if (!await claim(ref, d => d.st === "closed" && d.nc !== true, { nc: true })) return null;
    const t = await tourneyInfo(tid), L = langOf(after.lang, t.lang);
    const pos = after.pos || {}, q = after.q || [], pl = after.pl || [], fin = after.final === true;
    const r = await send(pl.filter(u => pos[u] != null), u => {
      const n = Number(pos[u]);
      const body = q.includes(u) ? (fin ? T[L].champ : T[L].pass(n)) : (fin ? T[L].outFinal(n, pl.length) : T[L].out(n, pl.length));
      return { title: t.name || "RODO ₿ Games", tag: `${tid}-r${i}-end`, ttl: 600, body };
    });
    logger.info("push: ronda cerrada", { tid, i, ...r });
    return r;
  }
  return null;
}

// ---- tourneys/{tid}: abre el check-in o arranca (marcas nck / nlv en el torneo)
async function onTourney(tid, before, after) {
  if (!before || !after || before.st === after.st) return null;
  const mark = { checkin: "nck", live: "nlv" }[after.st];
  if (!mark) return null;
  const ref = db.doc(`tourneys/${tid}`);
  if (!await claim(ref, d => d.st === after.st && d[mark] !== true, { [mark]: true })) return null;
  const ins = await ref.collection("ins").get();
  const L = langOf(after.lang), name = after.name || "RODO ₿ Games";
  const r = await send(ins.docs.filter(d => d.get("out") !== true).map(d => d.id), {
    title: name, tag: `${tid}-${after.st}`, ttl: after.st === "checkin" ? 1800 : 300, body: T[L][after.st](name),
  });
  logger.info("push: torneo", { tid, st: after.st, ...r });
  return r;
}

// ---- Cada minuto: asegura VAPID y avisa "¡Arranca en 1 minuto!" a las rondas que arrancan en los próximos 90 s
async function tick(now = Date.now()) {
  await ensureVapid();
  const qs = await db.collectionGroup("rounds").where("st", "==", "sched").get();
  let n = 0;
  for (const d of qs.docs) {
    const tref = d.ref.parent.parent;
    if (!tref || tref.parent.id !== "tourneys") continue;
    const x = d.data(), goMs = ms(x.go);
    if (!goMs || x.n1 === true || goMs <= now || goMs - now > SOON) continue;
    if (!await claim(d.ref, y => y.st === "sched" && ms(y.go) === goMs && y.n1 !== true, { n1: true })) continue;
    const t = await tourneyInfo(tref.id), L = langOf(x.lang, t.lang);
    const r = await send(x.pl, {
      title: t.name || "RODO ₿ Games", tag: `${tref.id}-r${d.id}-go`, ttl: ttlUntil(goMs, 30, 120),
      body: T[L].soon(roundHead(x, d.id, L), gameName(x.g, L)),
    });
    logger.info("push: arranca en 1 minuto", { tid: tref.id, i: d.id, ...r });
    n++;
  }
  return n;
}

module.exports = { ensureVapid, send, onRound, onTourney, tick, _t: { okSub, hhmm, ord, T } };
