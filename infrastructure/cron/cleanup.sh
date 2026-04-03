#!/bin/sh
# ── Limpieza de registros antiguos con respaldo ───────────────────────────────
# Se ejecuta diario a las 2:00 AM
# Respalda a CSV antes de eliminar

BACKUP_DIR="/backups/cleanup"
DATE=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX Iniciando limpieza y respaldo..."

mkdir -p "$BACKUP_DIR"

# ── Respaldar login_history mayor a 90 dias ───────────────────────────────────
echo "$LOG_PREFIX Respaldando login_history..."

HISTORY_FILE="$BACKUP_DIR/login_history_$DATE.csv"

psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "\COPY (
    SELECT * FROM login_history
    WHERE created_at < NOW() - INTERVAL '90 days'
    ORDER BY created_at ASC
  ) TO '$HISTORY_FILE' WITH CSV HEADER"

HISTORY_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM login_history WHERE created_at < NOW() - INTERVAL '90 days'")

echo "$LOG_PREFIX login_history: $HISTORY_COUNT registros respaldados en $HISTORY_FILE"

# ── Respaldar user_sessions revocadas mayor a 30 dias ────────────────────────
echo "$LOG_PREFIX Respaldando user_sessions..."

SESSIONS_FILE="$BACKUP_DIR/user_sessions_$DATE.csv"

psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "\COPY (
    SELECT * FROM user_sessions
    WHERE is_revoked = true
    AND revoked_at < NOW() - INTERVAL '30 days'
    ORDER BY revoked_at ASC
  ) TO '$SESSIONS_FILE' WITH CSV HEADER"

SESSIONS_COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -t -c \
  "SELECT COUNT(*) FROM user_sessions WHERE is_revoked = true AND revoked_at < NOW() - INTERVAL '30 days'")

echo "$LOG_PREFIX user_sessions: $SESSIONS_COUNT registros respaldados en $SESSIONS_FILE"

# ── Eliminar registros respaldados ────────────────────────────────────────────
echo "$LOG_PREFIX Eliminando registros antiguos..."

psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "DELETE FROM login_history WHERE created_at < NOW() - INTERVAL '90 days';"

psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c \
  "DELETE FROM user_sessions WHERE is_revoked = true AND revoked_at < NOW() - INTERVAL '30 days';"

echo "$LOG_PREFIX Limpieza completada. login_history: $HISTORY_COUNT eliminados, user_sessions: $SESSIONS_COUNT eliminados"
echo "$LOG_PREFIX Archivos de respaldo: $HISTORY_FILE, $SESSIONS_FILE"
