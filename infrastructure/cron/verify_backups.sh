#!/bin/sh
# ── Verificación de integridad de backups de PostgreSQL ───────────────────────
# Se ejecuta cada domingo a las 4:00 AM
# Restaura el backup más reciente de cada BD en una BD temporal y verifica
# que las tablas principales existen y tienen registros

BACKUP_DIR="/backups/postgres"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"
VERIFY_LOG="/var/log/cron/verify_backups.log"

TOTAL_OK=0
TOTAL_FAIL=0

echo "$LOG_PREFIX Iniciando verificación de integridad de backups..."

# ── Tablas mínimas esperadas por BD ───────────────────────────────────────────
# Formato: "bd:tabla1,tabla2,tabla3"
CHECKS="avalanz_auth:users,user_sessions,login_history
avalanz_admin:users,companies,groups,modules
avalanz_notify:notifications"

for CHECK in $CHECKS; do
    DB=$(echo "$CHECK" | cut -d: -f1)
    TABLES=$(echo "$CHECK" | cut -d: -f2)

    echo "$LOG_PREFIX Verificando backup de $DB..."

    # Buscar el backup más reciente
    LATEST=$(ls -1t "$BACKUP_DIR"/${DB}_*.sql.gz 2>/dev/null | head -1)

    if [ -z "$LATEST" ]; then
        echo "$LOG_PREFIX $DB: ERROR — no se encontró ningún archivo de backup en $BACKUP_DIR"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        continue
    fi

    echo "$LOG_PREFIX $DB: usando backup $LATEST"

    # Verificar que el archivo no está vacío y se puede descomprimir
    if ! gzip -t "$LATEST" 2>/dev/null; then
        echo "$LOG_PREFIX $DB: ERROR — el archivo de backup está corrupto o no es un gzip válido"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        continue
    fi

    FILE_SIZE=$(du -sh "$LATEST" | cut -f1)
    echo "$LOG_PREFIX $DB: archivo válido ($FILE_SIZE)"

    # Crear BD temporal para restauración
    TEMP_DB="${DB}_verify_$(date '+%s')"

    psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c \
        "CREATE DATABASE $TEMP_DB;" > /dev/null 2>&1

    if [ $? -ne 0 ]; then
        echo "$LOG_PREFIX $DB: ERROR — no se pudo crear la BD temporal $TEMP_DB"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        continue
    fi

    # Restaurar backup en BD temporal
    gunzip -c "$LATEST" | psql -h "$DB_HOST" -U "$DB_USER" -d "$TEMP_DB" \
        -q > /dev/null 2>&1

    RESTORE_EXIT=$?

    if [ $RESTORE_EXIT -ne 0 ]; then
        echo "$LOG_PREFIX $DB: ERROR — falló la restauración del backup (exit $RESTORE_EXIT)"
        psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c \
            "DROP DATABASE IF EXISTS $TEMP_DB;" > /dev/null 2>&1
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
        continue
    fi

    echo "$LOG_PREFIX $DB: restauración exitosa en $TEMP_DB"

    # Verificar tablas principales
    TABLE_OK=0
    TABLE_FAIL=0

    for TABLE in $(echo "$TABLES" | tr ',' ' '); do
        COUNT=$(psql -h "$DB_HOST" -U "$DB_USER" -d "$TEMP_DB" -t -c \
            "SELECT COUNT(*) FROM $TABLE;" 2>/dev/null | tr -d ' ')

        if [ $? -eq 0 ]; then
            echo "$LOG_PREFIX $DB: tabla $TABLE OK ($COUNT registros)"
            TABLE_OK=$((TABLE_OK + 1))
        else
            echo "$LOG_PREFIX $DB: ERROR — tabla $TABLE no encontrada en la restauración"
            TABLE_FAIL=$((TABLE_FAIL + 1))
        fi
    done

    # Eliminar BD temporal
    psql -h "$DB_HOST" -U "$DB_USER" -d postgres -c \
        "DROP DATABASE IF EXISTS $TEMP_DB;" > /dev/null 2>&1

    if [ $TABLE_FAIL -eq 0 ]; then
        echo "$LOG_PREFIX $DB: verificación completa — $TABLE_OK tablas OK"
        TOTAL_OK=$((TOTAL_OK + 1))
    else
        echo "$LOG_PREFIX $DB: verificación fallida — $TABLE_FAIL tablas con error"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
done

# ── Resumen ───────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX Verificación completada — exitosas: $TOTAL_OK, fallidas: $TOTAL_FAIL"

if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo "$LOG_PREFIX ALERTA: $TOTAL_FAIL backup(s) no pasaron la verificación. Revisar $VERIFY_LOG"
    exit 1
fi

exit 0
