#!/usr/bin/env bash
# ----------------------------------------------------------------------
# Quien ha usado el Asistente Avalanz: preguntas por persona, primera y
# ultima vez, confianza baja y sus ultimas preguntas (sin las pruebas
# tecnicas). Uso: bash infrastructure/host/assistant_usuarios.sh [dias]
# ----------------------------------------------------------------------
DIAS=${1:-30}
USO=$(docker exec -i avalanz-postgres-vector sh -c 'psql -U "$POSTGRES_USER" -d avalanz_assistant -tA -F "|"' << SQL
SELECT user_id, count(*), to_char(min(asked_at) AT TIME ZONE 'America/Monterrey', 'DD/MM HH24:MI'),
       to_char(max(asked_at) AT TIME ZONE 'America/Monterrey', 'DD/MM HH24:MI'),
       round(100.0 * count(*) FILTER (WHERE confidence = 'baja') / count(*)),
       (SELECT string_agg(left(q.question, 70), ' || ' ORDER BY q.asked_at DESC)
          FROM (SELECT question, asked_at FROM query_log q2 WHERE q2.user_id = l.user_id ORDER BY asked_at DESC LIMIT 3) q)
  FROM query_log l
 WHERE asked_at > now() - interval '${DIAS} days' AND user_id NOT LIKE 'prueba-%'
 GROUP BY user_id ORDER BY max(asked_at) DESC;
SQL
)
if [ -z "$USO" ]; then echo "Nadie ha usado el asistente en los ultimos ${DIAS} dias."; exit 0; fi
IDS=$(echo "$USO" | cut -d'|' -f1 | sed "s/.*/'&'/" | paste -sd,)
NOMBRES=$(docker exec -i avalanz-postgres sh -c 'psql -U "$POSTGRES_USER" -d avalanz_admin -tA -F "|"' << SQL
SELECT id::text, full_name, email FROM users WHERE id::text IN (${IDS});
SQL
)
python3 - "$USO" "$NOMBRES" "$DIAS" << 'PY'
import sys
uso, nombres, dias = sys.argv[1], sys.argv[2], sys.argv[3]
mapa = {l.split("|")[0]: l.split("|")[1:] for l in nombres.splitlines() if l.strip()}
filas = [l.split("|", 5) for l in uso.splitlines() if l.strip()]
print(f"== QUIEN HA USADO EL ASISTENTE (ultimos {dias} dias, sin pruebas tecnicas): {len(filas)} personas ==")
for uid, n, primera, ultima, baja, preguntas in filas:
    nombre, correo = mapa.get(uid, ["(usuario no encontrado)", uid])
    print(f"\n  {nombre.title()} <{correo}>")
    print(f"    preguntas={n} | primera={primera} | ultima={ultima} | confianza_baja={baja} %")
    for p in (preguntas or "").split(" || "):
        if p: print(f"      - {p}")
PY
