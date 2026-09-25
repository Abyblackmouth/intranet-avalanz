#!/bin/sh
# Dispara el reporte diario de SLA (vencidos y por vencer) del modulo
# IT Service Desk. Llama al endpoint interno (sin JWT, pensado
# especificamente para este cron) via la red interna de docker.

set -e

RESPUESTA=$(curl -sf -X POST "http://it-service-desk-service:8000/api/v1/it-service-desk/mesa-de-soporte/internal/reportes/sla-diario")
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reporte SLA disparado: $RESPUESTA"
