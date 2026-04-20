#!/bin/sh
# Loop que corre cada hora y verifica si es hora de ejecutar los scripts

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cron service iniciado"

while true; do
  HOUR=$(date '+%H')
  MIN=$(date '+%M')
  DOW=$(date '+%w')

  # Backup de PostgreSQL a la 1:00 AM
  if [ "$HOUR" = "01" ] && [ "$MIN" = "00" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ejecutando backup de PostgreSQL..."
    /scripts/backup_postgres.sh >> /var/log/cron/backup_postgres.log 2>&1
  fi

  # Limpieza diaria a las 2:00 AM
  if [ "$HOUR" = "02" ] && [ "$MIN" = "00" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ejecutando limpieza..."
    /scripts/cleanup.sh >> /var/log/cron/cleanup.log 2>&1
  fi

  # Rotacion de backups cada domingo a las 3:00 AM
  if [ "$HOUR" = "03" ] && [ "$MIN" = "00" ] && [ "$DOW" = "0" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Ejecutando rotacion de backups..."
    /scripts/rotate_backups.sh >> /var/log/cron/rotate_backups.log 2>&1
  fi

  sleep 60
done
