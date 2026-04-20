#!/bin/sh
# ── Backup completo de todas las bases de datos PostgreSQL ────────────────────
# Se ejecuta diario a las 1:00 AM
# Retención: 30 días

BACKUP_DIR="/backups/postgres"
DATE=$(date '+%Y-%m-%d_%H-%M-%S')
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
RETENTION_DAYS=30

echo "$LOG_PREFIX Iniciando backup de PostgreSQL..."
mkdir -p "$BACKUP_DIR"

# ── Lista de bases de datos a respaldar ───────────────────────────────────────
DATABASES="avalanz_auth avalanz_admin avalanz_notify"

TOTAL_OK=0
TOTAL_FAIL=0

for DB in $DATABASES; do
    echo "$LOG_PREFIX Respaldando $DB..."
    BACKUP_FILE="$BACKUP_DIR/${DB}_$DATE.sql.gz"

    pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB" \
        --no-password \
        --format=plain \
        --no-owner \
        --no-privileges \
        2>/tmp/pg_dump_error.txt | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
        SIZE=$(du -sh "$BACKUP_FILE" | cut -f1)
        echo "$LOG_PREFIX $DB: backup exitoso — $BACKUP_FILE ($SIZE)"
        TOTAL_OK=$((TOTAL_OK + 1))
    else
        ERROR=$(cat /tmp/pg_dump_error.txt)
        echo "$LOG_PREFIX $DB: ERROR en backup — $ERROR"
        rm -f "$BACKUP_FILE"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
done

# ── Eliminar backups con más de 30 días ───────────────────────────────────────
echo "$LOG_PREFIX Eliminando backups de más de $RETENTION_DAYS días..."
DELETED=$(find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -print)
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete

if [ -n "$DELETED" ]; then
    COUNT=$(echo "$DELETED" | wc -l)
    echo "$LOG_PREFIX $COUNT archivos eliminados por retención"
else
    echo "$LOG_PREFIX No hay archivos para eliminar por retención"
fi

# ── Resumen ───────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Backup completado — exitosos: $TOTAL_OK, fallidos: $TOTAL_FAIL"

if [ "$TOTAL_FAIL" -gt 0 ]; then
    exit 1
fi

exit 0
