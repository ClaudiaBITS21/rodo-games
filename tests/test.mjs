import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp, getCountFromServer, writeBatch, deleteField, increment } from "firebase/firestore";
import fs from "fs";

const env = await initializeTestEnvironment({
  projectId: "demo-rodo",
  firestore: { rules: fs.readFileSync(process.argv[2], "utf8"), host: "127.0.0.1", port: 8080 },
});
let pass = 0, fail = 0;
async function t(name, p) { try { await p; pass++; console.log("ok  ", name); } catch (e) { fail++; console.log("FAIL", name, "-", e.message.split("\n")[0]); } }

// datos base: A creó la partida ahorcado-es-1 y tiene apodo; B tiene apodo
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, "names/A"), { name: "Ana" });
  await setDoc(doc(db, "names/B"), { name: "Beto" });
  await setDoc(doc(db, "puzzles/ahorcado-es-1"), { game: "ahorcado", lang: "es", n: 1, data: {}, by: "A", at: serverTimestamp() });
  await setDoc(doc(db, "puzzles/ahorcado-es-2"), { game: "ahorcado", lang: "es", n: 2, data: {}, by: "B", at: serverTimestamp() });
});
const A = env.authenticatedContext("A").firestore();
const B = env.authenticatedContext("B").firestore();
const C = env.authenticatedContext("C").firestore();
const anon = env.unauthenticatedContext().firestore();
const inv = (o = {}) => ({ to: "B", name: "Ana", g: "ahorcado", k: "ahorcado", lang: "es", n: 1, at: serverTimestamp(), st: "pending", ...o });
const on = (o = {}) => ({ at: serverTimestamp(), lang: "es", inv: true, busy: [], ...o });

// ---- conectados
await t("presencia propia", assertSucceeds(setDoc(doc(A, "online/A"), on())));
await t("presencia ajena no", assertFails(setDoc(doc(A, "online/B"), on())));
await t("presencia sin login no", assertFails(setDoc(doc(anon, "online/A"), on())));
await t("presencia con hora falsa no", assertFails(setDoc(doc(A, "online/A"), on({ at: Timestamp.fromMillis(Date.now() + 1e9) }))));
await t("presencia campo extra no", assertFails(setDoc(doc(A, "online/A"), on({ x: 1 }))));
await t("presencia busy largo no", assertFails(setDoc(doc(A, "online/A"), on({ busy: Array(9).fill("a") }))));
await t("presencia idioma raro no", assertFails(setDoc(doc(A, "online/A"), on({ lang: "fr" }))));
await t("B ve conectados", assertSucceeds(getDocs(query(collection(B, "online"), where("at", ">", Timestamp.fromMillis(Date.now() - 150000))))));
await t("conteo", assertSucceeds(getCountFromServer(query(collection(B, "online"), where("at", ">", Timestamp.fromMillis(Date.now() - 150000))))));
await t("sin login no ve conectados", assertFails(getDocs(collection(anon, "online"))));
await t("borrar presencia ajena no", assertFails(deleteDoc(doc(B, "online/A"))));
await t("borrar presencia propia", assertSucceeds(deleteDoc(doc(A, "online/A"))));

// ---- invitaciones
await t("invitar con apodo distinto no", assertFails(setDoc(doc(A, "invites/A"), inv({ name: "Otra" }))));
await t("invitar con partida ajena no", assertFails(setDoc(doc(A, "invites/A"), inv({ n: 2 }))));
await t("invitar con partida inexistente no", assertFails(setDoc(doc(A, "invites/A"), inv({ n: 9 }))));
await t("invitar a sí mismo no", assertFails(setDoc(doc(A, "invites/A"), inv({ to: "A" }))));
await t("invitar en nombre de otro no", assertFails(setDoc(doc(C, "invites/A"), inv())));
await t("invitar sin apodo no", assertFails(setDoc(doc(C, "invites/C"), inv({ name: "" }))));
await t("invitar ya aceptada no", assertFails(setDoc(doc(A, "invites/A"), inv({ st: "accepted" }))));
await t("invitar ok", assertSucceeds(setDoc(doc(A, "invites/A"), inv())));
await t("segunda invitación pendiente no", assertFails(setDoc(doc(A, "invites/A"), inv({ to: "C" }))));
await t("B la lee", assertSucceeds(getDoc(doc(B, "invites/A"))));
await t("B la consulta", assertSucceeds(getDocs(query(collection(B, "invites"), where("to", "==", "B"), where("st", "==", "pending")))));
await t("C no la lee", assertFails(getDoc(doc(C, "invites/A"))));
await t("C no consulta las de B", assertFails(getDocs(query(collection(C, "invites"), where("to", "==", "B")))));
await t("C no la responde", assertFails(updateDoc(doc(C, "invites/A"), { st: "accepted" })));
await t("B no cambia otros campos", assertFails(updateDoc(doc(B, "invites/A"), { st: "accepted", n: 2 })));
await t("B no la cancela como si invitara", assertFails(updateDoc(doc(B, "invites/A"), { st: "cancelled" })));
await t("A no la acepta por B", assertFails(updateDoc(doc(A, "invites/A"), { st: "accepted" })));
await t("aceptar con hora falsa no", assertFails(updateDoc(doc(B, "invites/A"), { st: "accepted", go: Timestamp.fromMillis(Date.now() + 60000) })));
await t("rechazar con hora no", assertFails(updateDoc(doc(B, "invites/A"), { st: "declined", go: serverTimestamp() })));
await t("B acepta con la hora del servidor", assertSucceeds(updateDoc(doc(B, "invites/A"), { st: "accepted", go: serverTimestamp() })));
await t("B no cambia la respuesta", assertFails(updateDoc(doc(B, "invites/A"), { st: "declined" })));
await t("A no la cancela ya respondida", assertFails(updateDoc(doc(A, "invites/A"), { st: "cancelled" })));
await t("A invita de nuevo tras respuesta", assertSucceeds(setDoc(doc(A, "invites/A"), inv({ to: "C" }))));
await t("A cancela", assertSucceeds(updateDoc(doc(A, "invites/A"), { st: "cancelled" })));
await t("C no responde una cancelada", assertFails(updateDoc(doc(C, "invites/A"), { st: "accepted" })));
await t("borrar invitación no", assertFails(deleteDoc(doc(A, "invites/A"))));
// vencida: la invitación tiene 2 minutos
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), "invites/A"), { ...inv(), at: Timestamp.fromMillis(Date.now() - 120000) });
});
await t("B no acepta una vencida", assertFails(updateDoc(doc(B, "invites/A"), { st: "accepted" })));
await t("A la da por vencida", assertSucceeds(updateDoc(doc(A, "invites/A"), { st: "expired" })));
await env.withSecurityRulesDisabled(async c => {
  await setDoc(doc(c.firestore(), "invites/A"), { ...inv(), at: Timestamp.fromMillis(Date.now() - 120000) });
});
await t("A reinvita sobre una vencida sin marcar", assertSucceeds(setDoc(doc(A, "invites/A"), inv())));


// ---- puntaje: campo e
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "puzzles/sopa-es-1"), { game: "sopa", lang: "es", n: 1, data: {}, by: "A", at: serverTimestamp() }); });
const res = (o = {}) => ({ g: "sopa", ok: true, s: 0, h: 1, e: 3, ms: 5000, at: serverTimestamp(), ...o });
await t("resultado con errores", assertSucceeds(setDoc(doc(A, "scores/sopa-es-1/players/A"), res())));
await t("resultado con errores negativos no", assertFails(setDoc(doc(B, "scores/sopa-es-1/players/B"), res({ e: -1 }))));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "puzzles/sopa-es-2"), { game: "sopa", lang: "es", n: 2, data: {}, by: "A", at: serverTimestamp() }); });
await t("resultado con comprobar y modo", assertSucceeds(setDoc(doc(A, "scores/sopa-es-2/players/A"), res({ c: 4, m: "c" }))));
await t("modo raro no", assertFails(setDoc(doc(B, "scores/sopa-es-2/players/B"), res({ m: "x" }))));
await t("comprobar negativo no", assertFails(setDoc(doc(B, "scores/sopa-es-2/players/B"), res({ c: -2 }))));
await t("resultado sin e (viejo) sigue andando", assertSucceeds(setDoc(doc(B, "scores/sopa-es-1/players/B"), (({ e, ...x }) => x)(res()))));

// ---- apodos únicos
const nick = (db, u, name, extra) => { const b = writeBatch(db); b.set(doc(db, "names/" + u), { name }); b.set(doc(db, "nicks/" + name.toLowerCase()), { uid: u }); if (extra) extra(b); return b.commit(); };
await t("C reserva Carla", assertSucceeds(nick(C, "C", "Carla")));
await t("D no puede tomar carla", assertFails(nick(env.authenticatedContext("D").firestore(), "D", "CARLA")));
await t("D no escribe nombre sin reserva", assertFails(setDoc(doc(env.authenticatedContext("D").firestore(), "names/D"), { name: "Dani" })));
await t("D no reserva para otro", assertFails(setDoc(doc(env.authenticatedContext("D").firestore(), "nicks/zeta"), { uid: "C" })));
await t("apodo con barra no", assertFails(setDoc(doc(env.authenticatedContext("D").firestore(), "names/D"), { name: "a/b" })));
await t("apodo con espacio al final no", assertFails(nick(env.authenticatedContext("D").firestore(), "D", "Dani ")));
await t("C cambia a Caro y libera Carla", assertSucceeds(nick(C, "C", "Caro", b => b.delete(doc(C, "nicks/carla")))));
await t("C no borra la reserva que usa", assertFails(deleteDoc(doc(C, "nicks/caro"))));
await t("D toma Carla liberada", assertSucceeds(nick(env.authenticatedContext("D").firestore(), "D", "Carla")));
await t("C no borra la de D", assertFails(deleteDoc(doc(C, "nicks/carla"))));
await t("C no pisa la de D", assertFails(setDoc(doc(C, "nicks/carla"), { uid: "C" })));

// ---- modo prueba
const ADM = env.authenticatedContext("adm", { email: "claudia@rodo.es", email_verified: true }).firestore();
await t("admin marca navegador de prueba", assertSucceeds(setDoc(doc(ADM, "testers/A"), { at: serverTimestamp() })));
await t("jugador no se marca solo", assertFails(setDoc(doc(B, "testers/B"), { at: serverTimestamp() })));
await t("cualquiera lee testers", assertSucceeds(getDoc(doc(anon, "testers/A"))));
await t("jugador no desmarca", assertFails(deleteDoc(doc(A, "testers/A"))));
await t("admin desmarca", assertSucceeds(deleteDoc(doc(ADM, "testers/A"))));
await t("fichas con inv", assertSucceeds(setDoc(doc(A, "fichas/A"), { first: 1, last: 1, seen: {}, plays: {}, inv: 2 })));
await t("fichas inv no numérico no", assertFails(setDoc(doc(A, "fichas/A"), { first: 1, last: 1, seen: {}, plays: {}, inv: "x" })));

// ---- duelos
await env.withSecurityRulesDisabled(async c => {
  const db = c.firestore();
  await setDoc(doc(db, "puzzles/ahorcado-es-5"), { game: "ahorcado", lang: "es", n: 5, data: {}, by: "A", at: serverTimestamp() });
  await setDoc(doc(db, "puzzles/sopa-es-6"), { game: "sopa", lang: "es", n: 6, data: {}, by: "B", at: serverTimestamp() });
  await setDoc(doc(db, "invites/A"), { to: "B", name: "Ana", g: "ahorcado", k: "ahorcado", lang: "es", n: 5, at: serverTimestamp(), st: "pending" });
});
const duel = (o = {}) => ({ p: ["A", "B"], games: ["ahorcado-es-5"], last: "A", at: serverTimestamp(), ...o });
const DID = "A_ahorcado-es-5";
await t("duelo sin aceptar no", assertFails(setDoc(doc(A, "duels/" + DID), duel())));
await updateDoc(doc(B, "invites/A"), { st: "accepted" });
await t("duelo con otro rival no", assertFails(setDoc(doc(A, "duels/" + DID), duel({ p: ["A", "C"] }))));
await t("duelo con otra partida no", assertFails(setDoc(doc(A, "duels/A_sopa-es-1"), duel({ games: ["sopa-es-1"] }))));
await t("duelo creado por B no", assertFails(setDoc(doc(B, "duels/" + DID), duel({ p: ["B", "A"], last: "B" }))));
await t("A crea el duelo", assertSucceeds(setDoc(doc(A, "duels/" + DID), duel())));
await t("B lo lee", assertSucceeds(getDoc(doc(B, "duels/" + DID))));
await t("C no lo lee", assertFails(getDoc(doc(C, "duels/" + DID))));
await t("admin lo lee", assertSucceeds(getDoc(doc(ADM, "duels/" + DID))));
// revancha: B invita a A con el duelo
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "invites/B"), { to: "A", name: "Beto", g: "sopa", k: "sopa", lang: "es", n: 6, at: serverTimestamp(), st: "pending", d: DID }); });
await t("revancha sin aceptar no", assertFails(updateDoc(doc(B, "duels/" + DID), { games: ["ahorcado-es-5", "sopa-es-6"], last: "B" })));
await updateDoc(doc(A, "invites/B"), { st: "accepted" });
await t("A no elige dos veces seguidas", assertFails(updateDoc(doc(A, "duels/" + DID), { games: ["ahorcado-es-5", "sopa-es-6"], last: "A" })));
await t("revancha reescribiendo la historia no", assertFails(updateDoc(doc(B, "duels/" + DID), { games: ["sopa-es-1", "sopa-es-6"], last: "B" })));
await t("revancha con otra partida no", assertFails(updateDoc(doc(B, "duels/" + DID), { games: ["ahorcado-es-5", "sopa-es-1"], last: "B" })));
await t("B suma la revancha", assertSucceeds(updateDoc(doc(B, "duels/" + DID), { games: ["ahorcado-es-5", "sopa-es-6"], last: "B" })));
await t("C no toca el duelo", assertFails(updateDoc(doc(C, "duels/" + DID), { last: "C" })));
await t("invitación con modo raro no", assertFails(setDoc(doc(A, "invites/A"), inv({ n: 5, m: "z" }))));
await t("invitación con duelo y modo", assertSucceeds(setDoc(doc(A, "invites/A"), inv({ n: 5, d: DID, m: "c" }))));

// ---- aprendizaje
const lrn = (u, o = {}) => ({ u, p: "ahorcado-es-1", g: "ahorcado", yes: true, duel: false, at: serverTimestamp(), ...o });
await t("A anota que aprendió", assertSucceeds(setDoc(doc(A, "learned/A_ahorcado-es-1"), lrn("A"))));
await t("A cambia de idea", assertSucceeds(setDoc(doc(A, "learned/A_ahorcado-es-1"), lrn("A", { yes: false }))));
await t("A anota 7 conceptos al rendirse", assertSucceeds(setDoc(doc(A, "learned/A_ahorcado-es-1"), lrn("A", { n: 7 }))));
await t("conceptos fuera de rango no", assertFails(setDoc(doc(A, "learned/A_ahorcado-es-1"), lrn("A", { n: 500 }))));
await t("conceptos no numéricos no", assertFails(setDoc(doc(A, "learned/A_ahorcado-es-1"), lrn("A", { n: "7" }))));
await t("A no anota por B", assertFails(setDoc(doc(A, "learned/B_ahorcado-es-1"), lrn("B"))));
await t("partida inexistente no", assertFails(setDoc(doc(A, "learned/A_ahorcado-es-99"), lrn("A", { p: "ahorcado-es-99" }))));
await t("jugador lee su aprendizaje", assertSucceeds(getDoc(doc(A, "learned/A_ahorcado-es-1"))));
await t("otro no lee ese aprendizaje", assertFails(getDoc(doc(B, "learned/A_ahorcado-es-1"))));
await t("admin lee aprendizajes", assertSucceeds(getDoc(doc(ADM, "learned/A_ahorcado-es-1"))));
await t("invitación con palabras de semilla", assertSucceeds(setDoc(doc(B, "invites/B"), { to: "A", name: "Beto", g: "sopa", k: "sopa", lang: "es", n: 6, at: serverTimestamp(), st: "pending", w: 24 })));
await t("invitación con palabras raras no", assertFails(setDoc(doc(C, "invites/C"), { to: "A", name: "Caro", g: "sopa", k: "sopa", lang: "es", n: 1, at: serverTimestamp(), st: "pending", w: 7 })));

// ---- usuario con PIN
const E = env.authenticatedContext("E").firestore(), F = env.authenticatedContext("F").firestore();
const nick2 = (db, u, name, extra = {}, more) => { const b = writeBatch(db); b.set(doc(db, "names/" + u), { name, ...extra }); b.set(doc(db, "nicks/" + name.toLowerCase()), { uid: u, v: "abc123" }); if (more) more(b); return b.commit(); };
await t("usuario con avatar y versión", assertSucceeds(nick2(E, "E", "Elena", { av: "🦊" })));
await t("avatar larguísimo no", assertFails(setDoc(doc(E, "names/E"), { name: "Elena", av: "x".repeat(20) })));
await t("dueño cambia versión del PIN", assertSucceeds(setDoc(doc(E, "nicks/elena"), { uid: "E", v: "zzz999" })));
await t("otro no cambia la versión", assertFails(setDoc(doc(F, "nicks/elena"), { uid: "F", v: "hack" })));
const pf = o => setDoc(doc(F, "pinlocks/elena"), o);
await t("intento 1", assertSucceeds(pf({ fails: 1, level: 0, at: null })));
await t("saltar intentos no", assertFails(pf({ fails: 3, level: 0, at: null })));
await t("bajar intentos no (no dueño)", assertFails(pf({ fails: 0, level: 0, at: null })));
await t("intento 2", assertSucceeds(pf({ fails: 2, level: 0, at: null })));
await t("bloqueo sin hora del servidor no", assertFails(pf({ fails: 0, level: 1, at: Timestamp.fromMillis(Date.now() - 9e7) })));
await t("tercer intento bloquea", assertSucceeds(pf({ fails: 0, level: 1, at: serverTimestamp() })));
await t("bloqueado: no suma más intentos", assertFails(pf({ fails: 1, level: 1, at: null })));
const AT = Timestamp.fromMillis(Date.now() - 25 * 3600e3);
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "pinlocks/elena"), { fails: 0, level: 1, at: AT }); });
await t("vencido el bloqueo vuelve a contar", assertSucceeds(pf({ fails: 1, level: 1, at: AT })));
await t("dueño entra y lo resetea", assertSucceeds(setDoc(doc(E, "pinlocks/elena"), { fails: 0, level: 0, at: null })));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "pinlocks/elena"), { fails: 0, level: 3, at: Timestamp.fromMillis(Date.now() - 900 * 3600e3) }); });
await t("nivel 3: bloqueado para siempre", assertFails(pf({ fails: 1, level: 3, at: Timestamp.fromMillis(Date.now() - 900 * 3600e3) })));
await t("admin destraba", assertSucceeds(setDoc(doc(ADM, "pinlocks/elena"), { fails: 0, level: 0, at: null })));
await t("bloqueo de usuario inexistente no", assertFails(setDoc(doc(F, "pinlocks/nadie"), { fails: 1, level: 0, at: null })));
await t("jugador no borra bloqueos", assertFails(deleteDoc(doc(F, "pinlocks/elena"))));
// ---- pistas
await t("fichas con pistas vistas", assertSucceeds(setDoc(doc(A, "fichas/A"), { first: 1, last: 1, seen: {}, plays: {}, cl: { es: ["1.2", "5.3"] } })));
await t("uso de pistas: suma", assertSucceeds(setDoc(doc(A, "clueuse/es"), { c1_2: 1, c5_3: 1 }, { merge: true })));
await t("uso de pistas: idioma raro no", assertFails(setDoc(doc(A, "clueuse/fr"), { c1_2: 1 })));
await t("uso de pistas: sin login no", assertFails(setDoc(doc(anon, "clueuse/es"), { c1_2: 9 }, { merge: true })));
await t("uso de pistas: lectura pública", assertSucceeds(getDoc(doc(anon, "clueuse/es"))));

// ---- conectados con nombre
await t("presencia con su nombre", assertSucceeds(setDoc(doc(E, "online/E"), on({ nm: "Elena", av: "🦊" }))));
await t("presencia con nombre ajeno no", assertFails(setDoc(doc(E, "online/E"), on({ nm: "Ana" }))));
await t("presencia con avatar falso no", assertFails(setDoc(doc(E, "online/E"), on({ nm: "Elena", av: "🐙" }))));

// ---- estadísticas propias
await t("jugador lee sus aprendizajes", assertSucceeds(getDocs(query(collection(A, "learned"), where("u", "==", "A")))));
await t("jugador no lee los de otro", assertFails(getDocs(query(collection(B, "learned"), where("u", "==", "A")))));
await t("jugador lista sus duelos", assertSucceeds(getDocs(query(collection(A, "duels"), where("p", "array-contains", "A")))));
await t("no lista duelos ajenos", assertFails(getDocs(query(collection(C, "duels"), where("p", "array-contains", "A")))));

// ---- lo existente sigue igual
await t("fichas ajenas siguen cerradas", assertFails(getDoc(doc(B, "fichas/A"))));
await t("nombres siguen públicos", assertSucceeds(getDoc(doc(anon, "names/A"))));

const er=(u,x={})=>({u,w:"nick",c:"permission-denied",n:"MrB",ua:"Safari",at:serverTimestamp(),...x});
await t("anota un error propio", assertSucceeds(setDoc(doc(collection(A,"errs")), er("A"))));
await t("no anota por otro", assertFails(setDoc(doc(collection(A,"errs")), er("B"))));
await t("campo extra no", assertFails(setDoc(doc(collection(A,"errs")), er("A",{x:1}))));
await t("jugador no lee errores", assertFails(getDocs(collection(A,"errs"))));
// invitación desde un link: quien lo abrió puede invitar sin apodo (lk), y solo así
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "puzzles/ahorcado-es-7"), { by: "C", at: serverTimestamp(), data: {} }); });
const linv = (o = {}) => { const x = inv({ to: "A", k: "ahorcado", n: 7, lk: true, ...o }); delete x.name; return x; };
await t("link: invitar sin apodo con lk", assertSucceeds(setDoc(doc(C, "invites/C"), linv())));
await env.withSecurityRulesDisabled(async c => { await deleteDoc(doc(c.firestore(), "invites/C")); });
await t("sin apodo y sin lk no", assertFails(setDoc(doc(C, "invites/C"), (() => { const x = linv(); delete x.lk; return x; })())));
await t("lk falso no", assertFails(setDoc(doc(C, "invites/C"), linv({ lk: false }))));
await t("lk con apodo ajeno no", assertFails(setDoc(doc(C, "invites/C"), { ...linv(), name: "Ana" })));
// sopa: palabras extra encontradas (b)
await t("resultado con b=2", assertSucceeds(setDoc(doc(C, "scores/ahorcado-es-7/players/C"), { g: "ahorcado", ok: true, s: 0, h: 0, e: 0, c: 0, b: 2, ms: 60000, at: serverTimestamp() })));
await t("b fuera de rango no", assertFails(setDoc(doc(B, "scores/ahorcado-es-7/players/B"), { g: "ahorcado", ok: true, s: 0, h: 0, e: 0, c: 0, b: 9, ms: 60000, at: serverTimestamp() })));
// salas: varias personas en la misma partida del link
await env.withSecurityRulesDisabled(async c => { const f = c.firestore(); await setDoc(doc(f, "names/A"), { name: "Ana" }); await deleteDoc(doc(f, "names/B")).catch(() => {}); });
const sala = (o = {}) => ({ h: "A", g: "ahorcado", k: "ahorcado", lang: "es", n: 7, games: ["ahorcado-es-7"], p: { A: { nm: "Ana", av: "" } }, at: serverTimestamp(), go: null, ...o });
await t("sala: quien la arma la abre", assertSucceeds(setDoc(doc(A, "salas/A"), sala())));
await t("sala: no abre la de otro", assertFails(setDoc(doc(B, "salas/A"), sala({ h: "A" }))));
await t("sala: no abre con otros adentro", assertFails(setDoc(doc(A, "salas/A"), sala({ p: { A: { nm: "Ana", av: "" }, B: { nm: "", av: "" } } }))));
await t("sala: no abre con nombre falso", assertFails(setDoc(doc(A, "salas/A"), sala({ p: { A: { nm: "Otra", av: "" } } }))));
await t("sala: no abre con partida que no existe", assertFails(setDoc(doc(A, "salas/A"), sala({ n: 99, games: ["ahorcado-es-99"] }))));
await t("sala: cualquiera la lee", assertSucceeds(getDoc(doc(B, "salas/A"))));
await t("sala: B (sin usuario) se suma", assertSucceeds(updateDoc(doc(B, "salas/A"), { "p.B": { nm: "", av: "" } })));
await t("sala: C se suma con su nombre", assertSucceeds(updateDoc(doc(C, "salas/A"), { "p.C": { nm: "Caro", av: "🦊" } })));
await t("sala: no se suma con nombre ajeno", assertFails(updateDoc(doc(B, "salas/A"), { "p.B": { nm: "Ana", av: "" } })));
await t("sala: no suma a otro", assertFails(updateDoc(doc(B, "salas/A"), { "p.Z": { nm: "", av: "" } })));
await t("sala: no saca a otro", assertFails(updateDoc(doc(B, "salas/A"), { "p.C": deleteField() })));
await t("sala: sale ella misma", assertSucceeds(updateDoc(doc(C, "salas/A"), { "p.C": deleteField() })));
await t("sala: un jugador no arranca antes del minuto", assertFails(updateDoc(doc(B, "salas/A"), { go: serverTimestamp() })));
await t("sala: quien la armó arranca", assertSucceeds(updateDoc(doc(A, "salas/A"), { go: serverTimestamp() })));
await t("sala: arrancada, nadie se suma", assertFails(updateDoc(doc(C, "salas/A"), { "p.C": { nm: "Caro", av: "" } })));
await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { go: null, at: Timestamp.fromMillis(Date.now() - 310e3) }); });
await t("sala: pasados los 5 minutos, uno de adentro arranca", assertSucceeds(updateDoc(doc(B, "salas/A"), { go: serverTimestamp() })));
await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { go: null }); });
await t("sala: pasados los 5 minutos, alguien de afuera no", assertFails(updateDoc(doc(C, "salas/A"), { go: serverTimestamp() })));
await t("sala: otra ronda (solo ella adentro)", assertSucceeds(setDoc(doc(A, "salas/A"), sala({ games: ["ahorcado-es-7", "ahorcado-es-7"] }))));
await t("sala: un jugador no la cierra", assertFails(updateDoc(doc(B, "salas/A"), { cl: true })));
await t("sala: quien la armó la cierra", assertSucceeds(updateDoc(doc(A, "salas/A"), { cl: true })));
await t("sala: cerrada, nadie se suma", assertFails(updateDoc(doc(B, "salas/A"), { "p.B": { nm: "", av: "" } })));
await t("sala: cerrada, no arranca", assertFails(updateDoc(doc(A, "salas/A"), { go: serverTimestamp() })));
await t("sala: no se abre ya cerrada", assertFails(setDoc(doc(A, "salas/A"), sala({ cl: true }))));
await t("sala: se reabre (otra invitación)", assertSucceeds(setDoc(doc(A, "salas/A"), sala())));
await t("sala: a los 4 minutos todavía se suma", assertSucceeds((async () => { await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { at: Timestamp.fromMillis(Date.now() - 240e3) }); }); return updateDoc(doc(B, "salas/A"), { "p.B": { nm: "", av: "" } }); })()));
await t("sala: a los 6 minutos ya no", assertFails((async () => { await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { at: Timestamp.fromMillis(Date.now() - 360e3) }); }); return updateDoc(doc(C, "salas/A"), { "p.C": { nm: "Caro", av: "" } }); })()));
// torneo
const tour = (o = {}) => ({ name: "PRUEBA", st: "open", cap: 64, orgs: ["org@x.com"], rounds: [], lang: "es", cur: 0, at: serverTimestamp(), ...o });
const ORG = env.authenticatedContext("org", { email: "org@x.com", email_verified: true }).firestore();
await t("torneo: lo crea la administración", assertSucceeds(setDoc(doc(ADM, "tourneys/T1"), tour())));
await t("torneo: un jugador no lo crea", assertFails(setDoc(doc(A, "tourneys/T2"), tour())));
await t("torneo: un organizador lo maneja", assertSucceeds(updateDoc(doc(ORG, "tourneys/T1"), { name: "PRUEBA 2" })));
await t("torneo: un organizador no cambia los organizadores", assertFails(updateDoc(doc(ORG, "tourneys/T1"), { orgs: ["org@x.com", "otro@x.com"] })));
await t("torneo: un jugador no lo cambia", assertFails(updateDoc(doc(A, "tourneys/T1"), { st: "live" })));
await t("torneo: el organizador pone dónde se juega", assertSucceeds(updateDoc(doc(ORG, "tourneys/T1"), { place: "LABITCONF" })));
await t("torneo: el lugar tiene un largo máximo", assertFails(updateDoc(doc(ORG, "tourneys/T1"), { place: "x".repeat(121) })));
await t("torneo: el organizador guarda las palabras propias", assertSucceeds(setDoc(doc(ORG, "tourneys/T1/secret/cw"), { x1: "HALVING" })));
await t("torneo: el organizador las lee", assertSucceeds(getDoc(doc(ORG, "tourneys/T1/secret/cw"))));
await t("torneo: un jugador no ve las palabras propias", assertFails(getDoc(doc(A, "tourneys/T1/secret/cw"))));
await t("torneo: un jugador no las escribe", assertFails(setDoc(doc(A, "tourneys/T1/secret/cw"), { x1: "X" })));
const ins = (nm, o = {}) => ({ nm, av: "", at: serverTimestamp(), ck: null, paid: false, out: false, ...o });
await t("torneo: Ana se inscribe con su apodo", assertSucceeds(setDoc(doc(A, "tourneys/T1/ins/A"), ins("Ana"))));
await t("torneo: sin usuario no se inscribe", assertFails(setDoc(doc(B, "tourneys/T1/ins/B"), ins(""))));
await t("torneo: no se inscribe con apodo ajeno", assertFails(setDoc(doc(C, "tourneys/T1/ins/C"), ins("Ana"))));
await t("torneo: no se inscribe ya pagado", assertFails(setDoc(doc(C, "tourneys/T1/ins/C"), ins("Caro", { paid: true }))));
await t("torneo: contacto privado propio", assertSucceeds(setDoc(doc(A, "tourneys/T1/priv/A"), { mail: "a@x.com", tel: "1155554444", ok: true, at: serverTimestamp() })));
await t("torneo: otro jugador no lee el contacto", assertFails(getDoc(doc(B, "tourneys/T1/priv/A"))));
await t("torneo: el organizador lee el contacto", assertSucceeds(getDoc(doc(ORG, "tourneys/T1/priv/A"))));
await t("torneo: check-in antes de tiempo no", assertFails(updateDoc(doc(A, "tourneys/T1/ins/A"), { ck: serverTimestamp() })));
await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "tourneys/T1"), { st: "checkin" }); });
await t("torneo: check-in", assertSucceeds(updateDoc(doc(A, "tourneys/T1/ins/A"), { ck: serverTimestamp() })));
await t("torneo: check-in dos veces no", assertFails(updateDoc(doc(A, "tourneys/T1/ins/A"), { ck: serverTimestamp() })));
await t("torneo: el jugador no se marca pagado", assertFails(updateDoc(doc(A, "tourneys/T1/ins/A"), { paid: true })));
await t("torneo: el organizador marca pagado", assertSucceeds(updateDoc(doc(ORG, "tourneys/T1/ins/A"), { paid: true })));
await env.withSecurityRulesDisabled(async c => { const f = c.firestore();
  await setDoc(doc(f, "tourneys/T1/rounds/1"), { no: 1, g: "sopa", st: "live", pl: ["A"], adv: 1, go: Timestamp.fromMillis(Date.now() - 1000), end: Timestamp.fromMillis(Date.now() + 600000) });
  await setDoc(doc(f, "tourneys/T1/rounds/1/data/p"), { d: { x: 1 } });
  await setDoc(doc(f, "tourneys/T1/rounds/2"), { no: 2, g: "sopa", st: "sched", pl: ["A"], adv: 1, go: Timestamp.fromMillis(Date.now() + 600000), end: null });
  await setDoc(doc(f, "tourneys/T1/rounds/2/data/p"), { d: { x: 2 } }); });
await t("torneo: la partida en juego se lee", assertSucceeds(getDoc(doc(B, "tourneys/T1/rounds/1/data/p"))));
await t("torneo: la partida programada es secreta", assertFails(getDoc(doc(A, "tourneys/T1/rounds/2/data/p"))));
const tres = (o = {}) => ({ p: 0.5, s: 0, e: 2, h: 0, c: 0, f: 0, ok: false, done: false, at: serverTimestamp(), x: false, ...o });
await t("torneo: guarda su avance", assertSucceeds(setDoc(doc(A, "tourneys/T1/rounds/1/res/A"), tres())));
await t("torneo: los errores no bajan", assertFails(setDoc(doc(A, "tourneys/T1/rounds/1/res/A"), tres({ e: 1 }))));
await t("torneo: termina", assertSucceeds(setDoc(doc(A, "tourneys/T1/rounds/1/res/A"), tres({ p: 1, ok: true, done: true }))));
await t("torneo: terminado no se toca", assertFails(setDoc(doc(A, "tourneys/T1/rounds/1/res/A"), tres({ p: 1, ok: true, done: true, e: 3 }))));
await t("torneo: quien no compite juega marcado x", assertSucceeds(setDoc(doc(B, "tourneys/T1/rounds/1/res/B"), tres({ x: true }))));
await t("torneo: quien no compite no se hace pasar", assertFails(setDoc(doc(C, "tourneys/T1/rounds/1/res/C"), tres({ x: false }))));
await t("torneo: no escribe el resultado de otro", assertFails(setDoc(doc(B, "tourneys/T1/rounds/1/res/A"), tres())));
// ---- palabras sugeridas
const sug = (o = {}) => ({ w: "STACKEAR", L: "es", d: "Juntar sats de a poco", u: "A", at: serverTimestamp(), ...o });
await t("sugerencia: cualquiera con sesión", assertSucceeds(setDoc(doc(A, "sugs/s1"), sug())));
await t("sugerencia: sin descripción", assertSucceeds(setDoc(doc(A, "sugs/s2"), (({ d, ...r }) => r)(sug()))));
await t("sugerencia: sin login no", assertFails(setDoc(doc(anon, "sugs/s3"), sug())));
await t("sugerencia: a nombre de otro no", assertFails(setDoc(doc(B, "sugs/s3"), sug())));
await t("sugerencia: minúsculas o signos no", assertFails(setDoc(doc(A, "sugs/s3"), sug({ w: "stack<b>" }))));
await t("sugerencia: muy larga no", assertFails(setDoc(doc(A, "sugs/s3"), sug({ w: "A".repeat(31) }))));
await t("sugerencia: con estado o análisis no", assertFails(setDoc(doc(A, "sugs/s3"), sug({ st: "aprobada" }))));
await t("sugerencia: no la lee quien la mandó", assertFails(getDoc(doc(A, "sugs/s1"))));
await t("sugerencia: no la cambia quien la mandó", assertFails(updateDoc(doc(A, "sugs/s1"), { w: "OTRA" })));
await t("sugerencia: admin la lee", assertSucceeds(getDocs(collection(ADM, "sugs"))));
await t("sugerencia: admin guarda análisis y estado", assertSucceeds(setDoc(doc(ADM, "sugs/s1"), { st: "aprobada", ai: { es: "STACKEAR", en: "STACKING", p: { es: ["a", "b", "c"], en: ["a", "b", "c"] }, r: 7, why: "x" } }, { merge: true })));
await t("sugerencia: admin no cambia la palabra", assertFails(updateDoc(doc(ADM, "sugs/s1"), { w: "OTRA" })));
await t("sugerencia: estado raro no", assertFails(updateDoc(doc(ADM, "sugs/s1"), { st: "x" })));
await t("sugerencia: admin la borra", assertSucceeds(deleteDoc(doc(ADM, "sugs/s2"))));
// rompecabezas: pedidos y códigos de descuento
const cpn = (o = {}) => ({ type: "pct", value: 10, max: 2, used: 0, from: 0, until: 0, prods: ["bip39"], pays: ["btc", "ars"], on: true, note: "", at: serverTimestamp(), ...o });
const ord = (o = {}) => ({ items: { bip39: 1 }, name: "Ana Pérez", email: "ana@example.com", phone: "1155554444", place: "CABA", ship: "correo", pay: "btc", note: "", total: 90000, lang: "es", u: "A", st: "nuevo", at: serverTimestamp(), ...o });
const withCup = (db, code, cup, o = {}) => { const b = writeBatch(db); b.set(doc(db, "orders/" + code), ord({ sub: 90000, disc: 9000, total: 81000, cup, ...o })); b.update(doc(db, "coupons/" + cup), { used: increment(1), last: code }); return b.commit(); };
await t("cupón: lo crea la administración", assertSucceeds(setDoc(doc(ADM, "coupons/HODL10"), cpn())));
await t("cupón: un jugador no lo crea", assertFails(setDoc(doc(A, "coupons/GRATIS"), cpn({ value: 100 }))));
await t("cupón: porcentaje mayor a 100 no", assertFails(setDoc(doc(ADM, "coupons/MAL"), cpn({ value: 150 }))));
await t("cupón: cualquiera lo consulta por su código", assertSucceeds(getDoc(doc(anon, "coupons/HODL10"))));
await t("cupón: nadie los lista", assertFails(getDocs(collection(A, "coupons"))));
await t("pedido sin código", assertSucceeds(setDoc(doc(A, "orders/R2345AB"), ord())));
await t("entrega vieja (envio) no", assertFails(setDoc(doc(A, "orders/R2345AZ"), ord({ ship: "envio" }))));
await t("retiro en LABITCONF", assertSucceeds(setDoc(doc(A, "orders/R2345AY"), ord({ ship: "labitconf" }))));
await t("pedido con código y su uso, juntos", assertSucceeds(withCup(A, "R2345AC", "HODL10")));
await t("pedido con código sin sumar el uso no", assertFails(setDoc(doc(A, "orders/R2345AD"), ord({ sub: 90000, disc: 9000, total: 81000, cup: "HODL10" }))));
await t("sumar un uso sin pedido no", assertFails(updateDoc(doc(A, "coupons/HODL10"), { used: increment(1), last: "R2345AE" })));
await t("total que no cierra no", assertFails(withCup(A, "R2345AF", "HODL10", { total: 1000 })));
await t("código para otro rompecabezas no", assertFails(withCup(A, "R2345AG", "HODL10", { items: { times: 1 } })));
await t("segundo uso (máximo 2)", assertSucceeds(withCup(B, "R2345AH", "HODL10", { u: "B" })));
await t("código agotado no", assertFails(withCup(C, "R2345AJ", "HODL10", { u: "C" })));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "coupons/FIJO"), cpn({ type: "fix", value: 5000, max: 0, pays: ["ars"] })); });
await t("código solo pesos pagando en bitcoin no", assertFails(withCup(C, "R2345AK", "FIJO", { u: "C", disc: 5000, total: 85000 })));
await t("fijo por más de su valor no", assertFails(withCup(C, "R2345AL", "FIJO", { u: "C", pay: "ars", disc: 6000, total: 84000 })));
await t("fijo en pesos", assertSucceeds(withCup(C, "R2345AM", "FIJO", { u: "C", pay: "ars", disc: 5000, total: 85000 })));
await env.withSecurityRulesDisabled(async c => { await setDoc(doc(c.firestore(), "coupons/VIEJO"), cpn({ until: Date.now() - 1000 })); });
await t("código vencido no", assertFails(withCup(C, "R2345AN", "VIEJO", { u: "C" })));
await t("el admin no toca los usos", assertFails(setDoc(doc(ADM, "coupons/FIJO"), cpn({ type: "fix", value: 5000, max: 0, pays: ["ars"], used: 0 }))));
// rompecabezas: pago on-chain con direcciones de una xpub
await t("on-chain: el admin guarda la clave", assertSucceeds(setDoc(doc(ADM, "btcpay/cfg"), { key: "zpub…", kind: "wpkh", base: 0, cnt: 2 })));
await t("on-chain: un jugador no ve la clave", assertFails(getDoc(doc(A, "btcpay/cfg"))));
await t("on-chain: el admin escribe direcciones", assertSucceeds((async () => { await setDoc(doc(ADM, "payaddr/0"), { a: "bc1qaaa" }); await setDoc(doc(ADM, "payaddr/1"), { a: "bc1qbbb" }); return setDoc(doc(ADM, "btcidx/main"), { n: 0, last: "" }); })()));
await t("on-chain: un jugador no escribe direcciones", assertFails(setDoc(doc(A, "payaddr/2"), { a: "bc1qmia" })));
await t("on-chain: un jugador no lista direcciones", assertFails(getDocs(collection(A, "payaddr"))));
await t("on-chain: lee la próxima", assertSucceeds(getDoc(doc(A, "payaddr/0"))));
const btcOrd = (db, code, ai, addr, o = {}) => { const b = writeBatch(db); b.set(doc(db, "orders/" + code), ord({ ai, addr, sats: 90000, rate: 100000000, ...o })); b.update(doc(db, "btcidx/main"), { n: increment(1), last: code }); return b.commit(); };
await t("on-chain: pedido con su dirección y el contador", assertSucceeds(btcOrd(A, "R3456AB", 0, "bc1qaaa")));
await t("on-chain: misma dirección otra vez no", assertFails(btcOrd(B, "R3456AC", 0, "bc1qaaa", { u: "B" })));
await t("on-chain: otra dirección que no es la suya no", assertFails(btcOrd(B, "R3456AD", 1, "bc1qtrucha", { u: "B" })));
await t("on-chain: pagando en pesos no", assertFails(btcOrd(B, "R3456AE", 1, "bc1qbbb", { u: "B", pay: "ars" })));
await t("on-chain: con dirección pero sin subir el contador no", assertFails(setDoc(doc(B, "orders/R3456AF"), ord({ u: "B", ai: 1, addr: "bc1qbbb", sats: 1, rate: 1 }))));
await t("on-chain: subir el contador sin pedido no", assertFails(updateDoc(doc(B, "btcidx/main"), { n: increment(1), last: "R3456AG" })));
await t("on-chain: la siguiente", assertSucceeds(btcOrd(B, "R3456AH", 1, "bc1qbbb", { u: "B" })));
await t("on-chain: sin direcciones libres no", assertFails(btcOrd(C, "R3456AJ", 2, "bc1qccc", { u: "C" })));
await t("on-chain: pedido en bitcoin sin dirección sigue andando", assertSucceeds(setDoc(doc(C, "orders/R3456AK"), ord({ u: "C" }))));
// segunda administradora
const ADM2 = env.authenticatedContext("adm2", { email: "ce.andragnes@gmail.com", email_verified: true }).firestore();
const ADM2X = env.authenticatedContext("adm3", { email: "ce.andragnes@gmail.com", email_verified: false }).firestore();
await t("admin 2: lee las fichas", assertSucceeds(getDoc(doc(ADM2, "fichas/A"))));
await t("admin 2 sin verificar no", assertFails(getDoc(doc(ADM2X, "fichas/A"))));
await t("otro mail no es admin", assertFails(getDoc(doc(env.authenticatedContext("x", { email: "otro@gmail.com", email_verified: true }).firestore(), "fichas/A"))));
await env.cleanup();
console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
