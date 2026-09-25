#!/bin/sh
# Cierra automaticamente los tickets resueltos cuya ventana de 24h
# para reabrir ya vencio sin que nadie los reabriera. Llama al
# endpoint interno (sin JWT) via la red interna de docker.

set -e

RESPUESTA=$(curl -sf -X POST "http://it-service-desk-service:8000/api/v1/it-service-desk/mesa-de-soporte/internal/reportes/cierre-automatico")
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cierre automatico ejecutado: $RESPUESTA"
