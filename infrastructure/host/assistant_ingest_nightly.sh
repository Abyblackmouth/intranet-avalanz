#!/usr/bin/env bash
# ----------------------------------------------------------------------
# Ingesta nocturna del Asistente Avalanz
# Corre desde el crontab del servidor a las 02:30, despues del respaldo de
# la 01:00 y nunca en horario laboral. Lanza el contenedor temporal
# assistant-ingest y deja una bitacora diaria fuera del repositorio.
# ----------------------------------------------------------------------
set -u

REPO="$HOME/intranet-avalanz"
LOGS=/srv/avalanz/asistente/logs
LOCK=/tmp/assistant_ingest.lock
# Termina antes de las 06:30; lo pendiente continua la noche siguiente
LIMITE=4h

mkdir -p "$LOGS"
LOG="$LOGS/ingesta-$(date +%F).log"

# ----------------------------------------------------------------------
# Candado: una sola ingesta a la vez
# ----------------------------------------------------------------------
exec 9>"$LOCK"
if ! flock -n 9; then
    echo "$(date '+%F %T') otra ingesta sigue en curso, se omite esta ejecucion" >> "$LOG"
    exit 0
fi

# ----------------------------------------------------------------------
# Ingesta con limite de tiempo
# ----------------------------------------------------------------------
cd "$REPO/infrastructure/docker" || { echo "$(date '+%F %T') no existe $REPO" >> "$LOG"; exit 1; }
echo "$(date '+%F %T') inicio" >> "$LOG"
# -T y /dev/null: sin terminal. Con terminal, timeout congela a docker compose
# al intentar usarla desde un grupo de procesos en segundo plano.
timeout --signal=TERM "$LIMITE" docker compose run --rm -T assistant-ingest < /dev/null >> "$LOG" 2>&1
CODIGO=$?

# Si se alcanzo el limite, no se deja ningun contenedor de ingesta corriendo
if [ "$CODIGO" -eq 124 ]; then
    docker ps -q --filter "label=com.docker.compose.service=assistant-ingest" | xargs -r docker rm -f >/dev/null 2>&1
fi

case "$CODIGO" in
    0)   ESTADO=ok ;;
    1)   ESTADO=con_fallidos ;;
    124) ESTADO=limite_de_tiempo ;;
    *)   ESTADO="error_$CODIGO" ;;
esac
echo "$(date '+%F %T') fin estado=$ESTADO" >> "$LOG"

# ----------------------------------------------------------------------
# Retencion de bitacoras: 30 dias
# ----------------------------------------------------------------------
find "$LOGS" -name 'ingesta-*.log' -mtime +30 -delete
exit "$CODIGO"
