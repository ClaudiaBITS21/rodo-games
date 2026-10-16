import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where, serverTimestamp, Timestamp, getCountFromServer, writeBatch, deleteField } from "firebase/firestore";
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
await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { go: null, at: Timestamp.fromMillis(Date.now() - 70e3) }); });
await t("sala: pasado el minuto, uno de adentro arranca", assertSucceeds(updateDoc(doc(B, "salas/A"), { go: serverTimestamp() })));
await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "salas/A"), { go: null }); });
await t("sala: pasado el minuto, alguien de afuera no", assertFails(updateDoc(doc(C, "salas/A"), { go: serverTimestamp() })));
await t("sala: otra ronda (solo ella adentro)", assertSucceeds(setDoc(doc(A, "salas/A"), sala({ games: ["ahorcado-es-7", "ahorcado-es-7"] }))));
await env.cleanup();
console.log(`\n${pass} ok, ${fail} fallas`);
process.exit(fail ? 1 : 0);
