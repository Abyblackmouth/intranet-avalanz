#!/usr/bin/env bash
# ----------------------------------------------------------------------
# Uso del Asistente Avalanz: preguntas, usuarios y confianza baja por dia
# (sin las pruebas tecnicas), y tickets por origen.
# Uso: bash infrastructure/host/assistant_uso.sh [dias]   (por omision 14)
# ----------------------------------------------------------------------
DIAS=${1:-14}
docker exec -i avalanz-postgres-vector sh -c 'psql -U "$POSTGRES_USER" -d avalanz_assistant -q' << SQL
\echo == USO DEL ASISTENTE (ultimos ${DIAS} dias, sin pruebas tecnicas) ==
SELECT asked_at::date AS dia, count(*) AS preguntas, count(DISTINCT user_id) AS usuarios,
       round(100.0 * count(*) FILTER (WHERE confidence = 'baja') / count(*)) || ' %' AS confianza_baja,
       round(avg(latency_ms)) || ' ms' AS tiempo
  FROM query_log
 WHERE asked_at > now() - interval '${DIAS} days' AND user_id NOT LIKE 'prueba-%'
 GROUP BY 1 ORDER BY 1;
SQL
docker exec -i avalanz-postgres sh -c 'psql -U "$POSTGRES_USER" -d avalanz_it_service_desk -tA' << 'SQL'
SELECT '== TICKETS POR ORIGEN: ' || coalesce(string_agg(origin || ' = ' || n, ' | '), 'sin tickets') FROM (SELECT origin, count(*) n FROM incidents GROUP BY origin) t;
SQL
