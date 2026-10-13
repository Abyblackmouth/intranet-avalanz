#!/usr/bin/env bash
# Reporte diario de salud de la Intranet Avalanz (solo lectura). Lo programa cron a las 7:30.
# Revisa las ultimas 24 h: errores 5xx, 4xx que parecen bugs, errores internos, frontend,
# caidas y reinicios, disco y ultimo respaldo. Manda el resumen por el servicio de correos.
set -u
DESTINO="${REPORTE_SALUD_PARA:-abraham_covarrubias@avalanz.com}"
REPO="$HOME/intranet-avalanz"
PROM="http://localhost:9090/api/v1/query"
ESTADO="$HOME/.reporte_salud_estado"
T=$(mktemp -d)

# ---------- 1. nginx: codigos por ruta ----------
docker logs avalanz-nginx --since 24h 2>&1 | grep -E '" [45][0-9]{2} ' | grep -v "127.0.0.1" \
  | awk '{print $9, $7}' | sed -E 's#/[0-9a-f-]{36}#/<id>#g; s#\?.*##; s#/[0-9]+(/|$)#/<n>\1#g' \
  | sort | uniq -c | sort -rn > "$T/nginx.txt"

# ---------- 2. Errores internos por contenedor ----------
for c in $(docker ps --format '{{.Names}}' | grep '^avalanz-'); do
  n=$(docker logs "$c" --since 24h 2>&1 | grep -c "Traceback (most recent call last)")
  [ "$n" -gt 0 ] && echo "$n $c"
done | sort -rn > "$T/tracebacks.txt"

# ---------- 3. Frontend: errores nuevos desde el reporte anterior ----------
LOG=$HOME/.pm2/logs/intranet-frontend-error.log
: > "$T/frontend.txt"
if [ -f "$LOG" ]; then
  tam=$(stat -c %s "$LOG"); antes=$(cat "$ESTADO" 2>/dev/null || echo 0)
  [ "$antes" -gt "$tam" ] && antes=0
  tail -c +$((antes + 1)) "$LOG" | grep -E "Error|error" | grep -v "Failed to find Server Action\|Read more:" \
    | sed -E 's/^[0-9T:.-]+Z?:? *//; s/[0-9a-f-]{36}/<id>/g' | cut -c1-140 | sort | uniq -c | sort -rn > "$T/frontend.txt"
  echo "$tam" > "$ESTADO"
fi

# ---------- 4. Disco y respaldo ----------
df -P / | awk 'NR==2{gsub("%","",$5); print $5, $4}' > "$T/disco.txt"
BDIR=$(grep -oE 'BACKUP_DIR="?[^" ]+' "$REPO/infrastructure/cron/backup_postgres.sh" 2>/dev/null | head -1 | sed 's/BACKUP_DIR="\{0,1\}//')
eval BDIR="$BDIR" 2>/dev/null
ULT=$( [ -n "$BDIR" ] && [ -d "$BDIR" ] && find "$BDIR" -type f -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -1 )
echo "${ULT:-}" > "$T/respaldo.txt"

# ---------- 5. Armar y mandar el correo ----------
python3 - "$T" "$DESTINO" "$PROM" <<'PY'
import json, re, subprocess, sys, time, urllib.parse, urllib.request
T, DESTINO, PROM = sys.argv[1], sys.argv[2], sys.argv[3]
leer = lambda n: open(f"{T}/{n}").read().strip()

def prom(q):
    try:
        r = urllib.request.urlopen(PROM + "?" + urllib.parse.urlencode({"query": q}), timeout=15).read()
        return json.loads(r)["data"]["result"]
    except Exception:
        return None

hallazgos = {}   # seccion -> [texto]
def agrega(sec, txt): hallazgos.setdefault(sec, []).append(txt)

# 5xx desde Prometheus (por servicio y ruta)
r = prom('sort_desc(sum by (job, handler) (increase(http_requests_total{status=~"5.*"}[24h])) > 0.5)')
for x in (r or [])[:5]:
    m = x["metric"]; agrega("Errores 5xx", f"{round(float(x['value'][1]))} × {m.get('job','').replace('-service','')} {m.get('handler','')}")

# 4xx que parecen bugs (nginx), separando el ruido
bots = re.compile(r"\.(env|php|git|aspx?|jsp|cgi|sql|bak)\b|wp-|phpmyadmin|/cgi-bin|/\.well-known|/actuator|/vendor/", re.I)
ruido_bots = ruido_sesion = 0
for linea in leer("nginx.txt").splitlines():
    p = linea.split()
    if len(p) < 3: continue
    n, cod, ruta = int(p[0]), p[1], p[2]
    if cod.startswith("5"):
        # 502/503/504 los responde nginx (servicio caido o limite de peticiones): Prometheus no los ve
        if cod in ("502", "503", "504") or not ruta.startswith("/api"): agrega("Errores 5xx", f"{n} × {cod} {ruta} (nginx)")
        continue
    if bots.search(ruta) or (not ruta.startswith(("/api", "/ws", "/_next", "/app", "/admin")) and cod in ("400", "404", "405")):
        ruido_bots += n; continue
    if cod == "401" and ("unread-count" in ruta or "comunicados/activos" in ruta or ruta.startswith("/ws")):
        ruido_sesion += n; continue
    if cod == "403" and ruta.startswith("/ws"):
        ruido_sesion += n; continue
    if cod == "499": continue
    if n >= 5: agrega("Errores 4xx a revisar", f"{n} × {cod} {ruta}")
hallazgos["Errores 4xx a revisar"] = hallazgos.get("Errores 4xx a revisar", [])[:5]
if not hallazgos["Errores 4xx a revisar"]: hallazgos.pop("Errores 4xx a revisar")

# Errores internos por servicio
for l in leer("tracebacks.txt").splitlines()[:5]:
    n, c = l.split(maxsplit=1); agrega("Errores internos", f"{n} × {c.replace('avalanz-', '')}")

# Frontend
for l in leer("frontend.txt").splitlines()[:5]:
    n, msg = l.strip().split(maxsplit=1); agrega("Frontend", f"{n} × {msg}")

# Caidas y reinicios
r = prom('(1 - avg_over_time(up{job=~".+-service"}[24h])) * 1440 > 1')
for x in r or []:
    agrega("Caídas y reinicios", f"{x['metric'].get('job','').replace('-service','')}: {round(float(x['value'][1]))} min caído")
r = prom('changes(process_start_time_seconds{job=~".+-service"}[24h]) > 0')
for x in r or []:
    agrega("Caídas y reinicios", f"{x['metric'].get('job','').replace('-service','')}: {int(float(x['value'][1]))} reinicio(s)")
if r is None: agrega("Caídas y reinicios", "No se pudo consultar Prometheus")

# Disco
uso, libre_kb = (leer("disco.txt").split() + ["0", "0"])[:2]
disco = f"{uso}% usado, {int(libre_kb) / 1048576:.1f} GB libres"
if int(uso) >= 80: agrega("Disco y respaldo", f"Disco al {disco}")

# Respaldo
resp = leer("respaldo.txt")
if resp:
    ts, ruta = resp.split(maxsplit=1); horas = (time.time() - float(ts)) / 3600
    respaldo = f"hace {horas:.0f} h ({ruta.rsplit('/', 1)[-1]})"
    if horas > 26: agrega("Disco y respaldo", f"Último respaldo {respaldo}")
else:
    respaldo = "no encontrado"
    agrega("Disco y respaldo", "No encontré respaldos de la base de datos")

total = sum(len(v) for v in hallazgos.values())
estado = "Todo en orden" if total == 0 else f"{total} cosa{'s' if total != 1 else ''} por revisar"
campos = [{"label": "Estado", "value": estado, "mono": False},
          {"label": "Disco", "value": disco, "mono": False},
          {"label": "Último respaldo", "value": respaldo, "mono": False},
          {"label": "Ruido normal (no requiere acción)", "value": f"{ruido_bots} de bots · {ruido_sesion} de sesión", "mono": False}]
for sec, items in hallazgos.items():
    for i, txt in enumerate(items):
        campos.append({"label": sec if i == 0 else " ", "value": txt, "mono": True})

cuerpo = {"to_email": DESTINO, "full_name": "Abraham",
          "subject": f"Salud de la intranet · {estado}",
          "message": "Resumen de las últimas 24 horas de la Intranet Avalanz:",
          "alert_type": "success" if total == 0 else "warning", "fields": campos}
datos = json.dumps(cuerpo)
p = subprocess.run(["docker", "exec", "-i", "avalanz-it-service-desk", "python", "-c",
    "import sys, httpx; r = httpx.post('http://email-service:8000/api/v1/email/system-notification', content=sys.stdin.read(), "
    "headers={'Content-Type': 'application/json'}, timeout=20); print(r.status_code)"],
    input=datos, capture_output=True, text=True)
print(time.strftime("%Y-%m-%d %H:%M"), estado, "| correo:", (p.stdout or p.stderr).strip()[-80:])
PY
rm -rf "$T"
