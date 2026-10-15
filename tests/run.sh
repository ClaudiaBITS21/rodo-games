#!/usr/bin/env bash
# Corre las pruebas contra los emuladores de Firebase (proyecto demo-rodo), sin tocar producción.
# Uso: tests/run.sh            → reglas + todas las pruebas de navegador
#      tests/run.sh duel link  → solo esas (nombre del archivo sin .cjs)
# Cada prueba de navegador va en su propia sesión de emulador (si comparten datos, la numeración de partidas choca).
set -u
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --legacy-peer-deps --silent
cp ../firestore.rules firestore.rules   # el emulador solo acepta reglas dentro de esta carpeta (copia, no se sube)
node serve.mjs > serve.log 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
suites=("$@"); [ ${#suites[@]} -eq 0 ] && suites=(rules $(ls *.cjs | sed 's/\.cjs$//'))
fail=0
for s in "${suites[@]}"; do
  if [ "$s" = rules ]; then cmd="node test.mjs firestore.rules"; else cmd="node $s.cjs"; fi
  out=$(timeout 600 npx firebase emulators:exec --only firestore,auth --project demo-rodo "$cmd" 2>&1)
  res=$(echo "$out" | grep -E '^FAIL|^ERROR|pageerror|TODO OK|ok, [0-9]+ fallas' )
  echo "== $s"; echo "$res"
  echo "$res" | grep -qE '^FAIL|^ERROR|pageerror|[1-9][0-9]* fallas' && fail=1
  echo "$res" | grep -qE 'TODO OK|ok, 0 fallas' || fail=1
done
exit $fail
