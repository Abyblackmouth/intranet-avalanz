#!/usr/bin/env bash
# Compila el frontend y, SOLO si compila, reinicia PM2. Si la compilación
# falla, el frontend en línea no se toca y se muestran los errores.
set -uo pipefail
cd "$(dirname "$0")"
echo "▶ Compilando…"
if ! npm run build > /tmp/frontend-build.log 2>&1; then
  echo "✖ No compiló. El frontend en línea NO se tocó. Errores:"
  grep -iE "error|×|failed" -A 3 /tmp/frontend-build.log | head -40
  exit 1
fi
pm2 restart intranet-frontend --update-env > /dev/null
sleep 2
echo "✔ Compiló y quedó en línea · build $(stat -c %y .next/BUILD_ID | cut -d. -f1)"
