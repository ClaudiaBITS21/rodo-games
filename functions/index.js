// Cloud Functions de RODO ₿ Games: avisos push del torneo.
// Todas en southamerica-east1 (la región de Firestore: los disparadores tienen que estar ahí).
// La lógica está en push.js; acá solo se enganchan los eventos.
"use strict";
const { setGlobalOptions } = require("firebase-functions/v2");
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const P = require("./push");

setGlobalOptions({ region: "southamerica-east1", memory: "256MiB", maxInstances: 5, timeoutSeconds: 120 });
const data = s => (s && s.exists ? s.data() : null);

// Ronda programada / reprogramada / cerrada
exports.pushRonda = onDocumentWritten("tourneys/{tid}/rounds/{i}", e =>
  P.onRound(e.params.tid, e.params.i, data(e.data && e.data.before), data(e.data && e.data.after)));

// El torneo abre el check-in o arranca
exports.pushTorneo = onDocumentUpdated("tourneys/{tid}", e =>
  P.onTourney(e.params.tid, data(e.data && e.data.before), data(e.data && e.data.after)));

// Cada minuto: crea las claves VAPID si faltan (así quedan listas al minuto del deploy) y avisa "¡Arranca en 1 minuto!"
exports.pushMinuto = onSchedule({ schedule: "* * * * *", timeZone: "America/Argentina/Buenos_Aires", retryCount: 0 }, async () => { await P.tick(); });
