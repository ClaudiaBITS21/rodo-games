# RODO ₿ Games — contexto para Claude

Sitio de juegos de palabras bitcoiners de Rodolfo (Bitcoin Argentina, LABITCONF).
Respondé en castellano rioplatense, directo, sin relleno, y marcá inconsistencias.

## Antes de tocar nada (paso 0)
- Verificá que estén `public/index.html` (con los juegos), `firebase.json`, `firestore.rules` y `.github/workflows/deploy.yml`.
- Si al repo le falta el sitio, frená y avisá: la última versión está en la Mac y la sube la dueña primero.
- El deploy se autentica con Workload Identity Federation, sin claves. Si el workflow pide el secreto `FIREBASE_SERVICE_ACCOUNT`, avisá.

## Infraestructura
- Sitio: https://games.rodo.es (también https://rodo-games.web.app). DNS en Namecheap: CNAME `games` → `rodo-games.web.app`.
- Firebase: proyecto `rodo-games`, Firestore en `southamerica-east1`, login anónimo para jugadores.
- Repo: `ClaudiaBITS21/rodo-games`, público, rama `main`. Cada push a `main` publica Hosting y reglas/índices de Firestore vía GitHub Actions (`.github/workflows/deploy.yml`, cuenta de servicio `github-deploy@rodo-games`).
- La web es una sola página: `public/index.html`, bilingüe ES/EN. La config de Firebase se lee de `/__/firebase/init.json` (la sirve Hosting), así que abriendo el archivo local no conecta.

## Juegos (8)
- Visibles: Acrósticos, Ahorcado, Sopa de letras, Semilla perdida (BIP39), Criptograma, Anagrama.
- Ocultos a propósito: "¿Está en la lista?" (`esbip`) y "Placa de acero" (`placa`), vía la constante `HIDDEN` y el atributo `hidden` en sus tarjetas. No mostrarlos sin pedido explícito.

## Decisiones tomadas (no revertir)
- **Acróstico:** la columna naranja forma la frase escondida. En modo al azar solo se dice cuántas palabras y letras tiene. 5 letras de ayuda por partida. La pista de la fila activa aparece arriba de esa fila y se mueve con la selección. Se puede imprimir.
- **Ahorcado:** nunca regalar una letra inicial. La pista está oculta detrás de un botón que cuesta una vida. Lleva racha.
- **Sopa:** tamaño chica/mediana/grande, cada uno con su propia numeración (`sopachica`, `sopa`, `sopagrande`). Modo "ver pistas en vez de palabras", configurable antes de arrancar o al pedir juego nuevo.
- Partidas en orden secuencial, pero se puede saltar a la siguiente sin resolver la anterior.
- Cronómetro visible que cambia de color con el tiempo. La partida se precarga difuminada y el cronómetro arranca al tocar "Iniciar".
- Ranking: popup chico dentro del mensaje de victoria, junto a "Siguiente" y "Compartir imagen". Nada de paneles grandes.
- **Puntaje (función `scoreOf`):** el reloj suma +10 s por cada error y +60 s por cada ayuda, en vivo y con aviso "+10 s"; en los juegos de rondas, cada ronda fallada suma 900/rondas segundos. Puntos = 100 por resolverla + (900 − segundos ajustados, mínimo 0); sin resolver, 0. Gana quien tiene más puntos. Error = letra o elección equivocada (en acróstico y criptograma cuenta una vez por letra y valor, al comprobar); ayuda = letra regalada o pista (la del ahorcado además cuesta una vida). La sopa no cuenta errores. Los resultados guardan `ms` (tiempo real), `h` (ayudas) y `e` (errores); los viejos sin `e` se leen como antes.
- **Duelos:** una invitación aceptada abre un duelo (`duels/{uid que invitó}_{primera partida}`). En el cartel final: marcador "Vos 2 – 1 Ana" y botón "Revancha: elegí el juego", que se alterna (lo elige quien no eligió la última; las reglas lo exigen). Cada partida la gana quien saca más puntos; si uno no la termina en 16 minutos, gana el que sí. El marcador se calcula con los resultados de cada partida, no se guarda.
- **Al terminar una partida, si otra quedó congelada por una invitación**, el cartel pregunta "¿La retomás?".
- **Apodos únicos** (sin distinguir mayúsculas): `nicks/{apodo en minúsculas}` guarda de quién es y se escribe junto con `names/{uid}`. El apodo se carga del servidor al entrar. Obligatorio para invitar.
- **Modo prueba:** desde el panel de admin se marca "este navegador es de prueba" (`testers/{uid}`, solo lo escribe el admin). Se juega normal, con cartel PRUEBA, pero esos resultados no cuentan en rankings (salvo para uno mismo) ni en estadísticas.
- **Registro por jugador** (para un ranking general futuro): invitaciones mandadas (`fichas.inv`) y partidas de duelo jugadas y ganadas (se calculan en el panel de admin).
- Varias pistas por palabra, elegidas al azar en cada partida. Sin IA en tiempo real.
- Glosario de unos 120 términos con pistas en ES y EN (`G_ES`, `G_EN`). Las pistas nuevas se escriben en tandas para que la dueña revise el tono.
- **Conectados e invitaciones:** en la portada se ve cuántos hay conectados (cada pestaña visible avisa cada minuto en `online/{uid}`; cuenta quien avisó en los últimos 2,5 min). "Invitar a jugar": quien invita elige el juego, apodo obligatorio, se sortea a alguien conectado del mismo idioma que acepte invitaciones y no tenga una partida en curso de ese juego. La invitación (`invites/{uid de quien invita}`) siempre lleva una partida recién creada, así ninguno la jugó; una sola pendiente por persona; vence a los 60 s con cuenta regresiva visible en las dos puntas. Al invitado se le congela el cronómetro de lo que esté jugando (el tiempo congelado no cuenta). Opción "Recibir invitaciones" en la portada y "No quiero recibir invitaciones" en la ventanita. Sin aviso extra en la nota de privacidad (decisión de la dueña).
- Nota de privacidad breve al pie.
- Buzón de sugerencias (FormSubmit) y crédito a Bitcoin.AR al pie.
- Panel de admin: estadísticas de jugadores, actividad, rendimiento por juego (con puntos), invitaciones y duelos, exportación CSV (con puntos, errores y ayudas), botón "Ir a los juegos" y botón de modo prueba. Acceso exclusivo para `claudia@rodo.es` con login de Google, en una app de Firebase separada (`initializeApp(cfg, "admin")`) para no pisar la sesión anónima. Protegido por `firestore.rules` (`isAdmin()` exige email verificado).

## Reglas de trabajo
- No aflojar `firestore.rules` sin pedido explícito.
- El HTML publicado no puede usar `window.claude` ni nada de los artefactos de claude.ai. Hay una vista previa vieja en un artefacto: no se copia al repo.
- Antes de cada push, verificar que los scripts de `index.html` compilen (extraer cada `<script>` y correr `node --check`; el segundo es `type="module"`, usar extensión `.mjs`).
- Después de cada push, seguir el run de Actions hasta que termine y confirmar que games.rodo.es responda. Cerrar con una línea: commit, resultado del deploy y qué cambió.
- Si un push o el deploy falla por permisos, avisar. No reintentar a ciegas.
- Para probar reglas o funciones en tiempo real sin tocar producción: emulador de Firestore + Auth (`firebase emulators:exec`, proyecto `demo-rodo`) y Playwright con dos navegadores. La librería de Firebase se sirve desde el paquete npm `firebase` porque gstatic puede estar bloqueado.
- Nada de secretos en el repo.

## Pendientes
- Confirmar que `claudia@rodo.es` entra al panel de admin (que sea cuenta de Google válida).
- Probar el sitio publicado completo, incluido el admin.
- El glosario tiene una sola pista por término (el código ya soporta un array de pistas y elige una al azar): falta escribir las pistas extra, en tandas.
