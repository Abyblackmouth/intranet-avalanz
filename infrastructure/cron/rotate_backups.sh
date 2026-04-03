#!/bin/sh
# ── Rotacion de backups de limpieza ──────────────────────────────────────────
# Se ejecuta cada domingo a las 3:00 AM
# Mantiene solo los ultimos 30 archivos de cada tipo

BACKUP_DIR="/backups/cleanup"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
MAX_BACKUPS=30

echo "$LOG_PREFIX Iniciando rotacion de backups..."

if [ ! -d "$BACKUP_DIR" ]; then
  echo "$LOG_PREFIX Directorio $BACKUP_DIR no existe, nada que rotar."
  exit 0
fi

# ── Rotar login_history ───────────────────────────────────────────────────────
HISTORY_COUNT=$(ls -1 "$BACKUP_DIR"/login_history_*.csv 2>/dev/null | wc -l)
echo "$LOG_PREFIX login_history: $HISTORY_COUNT archivos encontrados"

if [ "$HISTORY_COUNT" -gt "$MAX_BACKUPS" ]; then
  TO_DELETE=$((HISTORY_COUNT - MAX_BACKUPS))
  echo "$LOG_PREFIX Eliminando $TO_DELETE archivos antiguos de login_history..."
  ls -1t "$BACKUP_DIR"/login_history_*.csv | tail -n "$TO_DELETE" | xargs rm -f
  echo "$LOG_PREFIX login_history: $TO_DELETE archivos eliminados"
else
  echo "$LOG_PREFIX login_history: no se requiere rotacion ($HISTORY_COUNT <= $MAX_BACKUPS)"
fi

# ── Rotar user_sessions ───────────────────────────────────────────────────────
SESSIONS_COUNT=$(ls -1 "$BACKUP_DIR"/user_sessions_*.csv 2>/dev/null | wc -l)
echo "$LOG_PREFIX user_sessions: $SESSIONS_COUNT archivos encontrados"

if [ "$SESSIONS_COUNT" -gt "$MAX_BACKUPS" ]; then
  TO_DELETE=$((SESSIONS_COUNT - MAX_BACKUPS))
  echo "$LOG_PREFIX Eliminando $TO_DELETE archivos antiguos de user_sessions..."
  ls -1t "$BACKUP_DIR"/user_sessions_*.csv | tail -n "$TO_DELETE" | xargs rm -f
  echo "$LOG_PREFIX user_sessions: $TO_DELETE archivos eliminados"
else
  echo "$LOG_PREFIX user_sessions: no se requiere rotacion ($SESSIONS_COUNT <= $MAX_BACKUPS)"
fi

echo "$LOG_PREFIX Rotacion completada."
