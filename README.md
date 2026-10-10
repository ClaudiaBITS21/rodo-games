# RODO ₿ Games

Juegos de palabras bitcoiners: acróstico, ahorcado, sopa de letras, criptograma, anagrama y Semilla perdida (lista BIP39). Castellano e inglés.

Es una sola página (`public/index.html`) servida por **Firebase Hosting**, con **Firestore** para las partidas numeradas y el ranking, y **autenticación anónima** para identificar a cada jugador sin pedirle registro.

```
rodo-games/
├── public/
│   └── index.html           ← los juegos (la configuración de Firebase la sirve Hosting en /__/firebase/init.json)
├── firebase.json            ← configuración de Hosting y Firestore
├── .firebaserc              ← ID del proyecto
├── firestore.rules          ← reglas de seguridad
└── firestore.indexes.json
```

## 1. Subir el código a GitHub

1. En github.com, creá un repositorio nuevo vacío (por ejemplo `rodo-games`), sin README.
2. En la carpeta del proyecto:

```bash
git init
git add .
git commit -m "RODO ₿ Games: primera versión"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/rodo-games.git
git push -u origin main
```

## 2. Proyecto en Firebase (ya creado)

- Proyecto: `rodo-games`, dentro de la organización rodo.es.
- Firestore: `southamerica-east1` (São Paulo), modo producción.
- Authentication: acceso **anónimo** activado; dominio autorizado `games.rodo.es`.
- No hay archivo de configuración: la página la lee de `/__/firebase/init.json`, que Firebase Hosting publica solo. Por eso los juegos solo se conectan cuando están publicados en Hosting (no abriendo el archivo local).

## 3. Publicar

Necesitás Node.js instalado.

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

Eso publica la web **y** las reglas de Firestore. Al terminar te da una dirección tipo `https://rodo-games-1a2b3.web.app` para probar.

## 4. Dominio games.rodo.es

- DNS en Namecheap: `CNAME games → rodo-games.web.app.` (ya cargado).
- En Firebase Hosting → Agregar dominio personalizado → `games.rodo.es`, y seguir la verificación. El certificado HTTPS puede tardar hasta 24 horas.

## 5. Publicación automática desde GitHub

El flujo `.github/workflows/deploy.yml` publica Hosting y las reglas de Firestore en cada push a `main` (o a mano desde la pestaña Actions).

No usa claves ni secretos: se autentica con **Workload Identity Federation**. En Google Cloud existe el grupo de identidades `github` (proveedor `github`, solo acepta repositorios de `ClaudiaBITS21`) y el repositorio `ClaudiaBITS21/rodo-games` tiene permiso para actuar como la cuenta de servicio `github-deploy@rodo-games.iam.gserviceaccount.com` (roles: Administrador de Firebase y Consumidor de Service Usage). Si se renombra el repositorio, hay que actualizar ese permiso en IAM → Federación de identidades para cargas de trabajo → github → Otorgar acceso.

## Cómo funciona el ranking

**Por partida.** Cada juego tiene numeración propia por idioma (`acrostico-es-12`, `sopa-en-3`). La partida guarda su contenido exacto, así que el #12 es idéntico para todos. Cada jugador guarda **un solo resultado por partida** (el primero); las reglas impiden modificarlo o borrarlo.

Cada error suma 10 segundos al reloj (20 en el ahorcado), cada ayuda 60 y cada "Comprobar" 5; en los juegos de rondas, cada ronda fallada suma su parte de los 15 minutos. En la Semilla el reloj corre desde que se empieza a armar la frase. En la sopa, cada modo (palabras o pistas) tiene su propio ranking. En los duelos, las ayudas se habilitan a los 7 minutos. Los puntos son `100 por resolverla + (900 − segundos ajustados)`, con mínimo 0, y gana quien tiene más. Si no se resuelve, son 0.

**Duelos.** Cuando alguien acepta una invitación se abre un duelo entre los dos. Cada partida la gana quien saca más puntos y la revancha la elige, por turno, quien no eligió la anterior.

**General, por juego.** En cada partida con al menos 2 jugadores se calcula qué porcentaje del resto superó cada uno (los empates cuentan medio). El ranking general promedia esos percentiles y solo muestra a quien tiene **10 partidas comparables** del mismo juego, sumando castellano e inglés. Se calcula en el navegador leyendo todos los resultados del juego; con mucho volumen conviene precalcularlo con una Cloud Function.

**Limitación conocida:** el tiempo se mide en el navegador, así que alguien con conocimientos técnicos podría falsear su marca. Para premios con valor real, la validación tiene que hacerse en el servidor (Cloud Functions), que requiere el plan Blaze.

## Colecciones de Firestore

`puzzles`, `counters`, `scores/{partida}/players` (resultados), `fichas` (actividad de cada navegador, privada), `names` y `nicks` (apodos únicos), `online` (conectados), `invites` (invitaciones), `duels` (duelos), `learned` (respuestas a "¿Aprendiste alguna palabra nueva?") y `testers` (navegadores de prueba, los marca la administración).

## Juegos ocultos

"¿Está en la lista?" y "Placa de acero" están programados pero ocultos. Para mostrarlos, en `index.html` borrá el atributo `hidden` de sus tarjetas y sacalos de `HIDDEN`.
