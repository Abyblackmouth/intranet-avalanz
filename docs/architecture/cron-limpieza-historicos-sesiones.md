# Cron: Limpieza de Historicos y Sesiones

Ubicación: `infrastructure/cron/`
Contenedor: `avalanz-cron`

Este cron se encarga específicamente de mantener limpias las tablas de historial de login y sesiones del `auth-service`. Respalda los registros antes de eliminarlos y rota los archivos de respaldo para no consumir espacio indefinidamente.

---

## Archivos involucrados

```
infrastructure/cron/
├── Dockerfile           → Imagen Alpine con postgresql-client
├── entrypoint.sh        → Loop cada minuto que dispara los scripts en su horario
├── cleanup.sh           → Respalda a CSV y elimina registros antiguos
├── rotate_backups.sh    → Rota archivos CSV dejando solo los últimos 30
└── crontab              → Referencia de horarios (documentación)
```

---

## Tablas que administra

| Tabla | BD | Retención |
|---|---|---|
| login_history | avalanz_auth | 90 días |
| user_sessions (solo revocadas) | avalanz_auth | 30 días |

---

## Horarios

| Script | Horario | Frecuencia |
|---|---|---|
| cleanup.sh | 2:00 AM | Diario |
| rotate_backups.sh | 3:00 AM domingos | Semanal |

---

## Flujo de limpieza (cleanup.sh)

```
Diario 2:00 AM
      |
      ├── Respalda a CSV los registros a eliminar
      │     /backups/cleanup/login_history_YYYY-MM-DD_HH-MM-SS.csv
      │     /backups/cleanup/user_sessions_YYYY-MM-DD_HH-MM-SS.csv
      |
      ├── Ejecuta DELETE en la BD
      │     DELETE FROM login_history WHERE created_at < NOW() - INTERVAL '90 days'
      │     DELETE FROM user_sessions WHERE is_revoked = true
      │       AND revoked_at < NOW() - INTERVAL '30 days'
      |
      └── Registra resultado en /var/log/cron/cleanup.log
```

---

## Flujo de rotación (rotate_backups.sh)

```
Domingos 3:00 AM
      |
      ├── Cuenta archivos login_history_*.csv en /backups/cleanup/
      │     Si hay más de 30 → elimina los más antiguos
      |
      ├── Cuenta archivos user_sessions_*.csv en /backups/cleanup/
      │     Si hay más de 30 → elimina los más antiguos
      |
      └── Registra resultado en /var/log/cron/rotate_backups.log
```

---

## Retención de archivos CSV

| Tipo | Máximo archivos | Equivale a |
|---|---|---|
| login_history_*.csv | 30 | ~1 mes de respaldos diarios |
| user_sessions_*.csv | 30 | ~1 mes de respaldos diarios |

---

## Implementación técnica

El contenedor usa un loop con `sleep 60` en lugar de `dcron` porque `dcron` tiene problemas de permisos en WSL2 con Docker Desktop. En producción en Linux nativo `dcron` funciona sin problema.

```sh
# entrypoint.sh
while true; do
  HOUR=$(date '+%H')
  MIN=$(date '+%M')
  DOW=$(date '+%w')   # 0=domingo

  if [ "$HOUR" = "02" ] && [ "$MIN" = "00" ]; then
    /scripts/cleanup.sh >> /var/log/cron/cleanup.log 2>&1
  fi

  if [ "$HOUR" = "03" ] && [ "$MIN" = "00" ] && [ "$DOW" = "0" ]; then
    /scripts/rotate_backups.sh >> /var/log/cron/rotate_backups.log 2>&1
  fi

  sleep 60
done
```

---

## Variables de entorno requeridas

| Variable | Valor en desarrollo |
|---|---|
| DB_HOST | postgres |
| DB_USER | avalanz_user |
| DB_NAME | avalanz_auth |
| PGPASSWORD | Avalanz2026! |

---

## Volúmenes Docker

| Volumen | Ruta en contenedor | Contenido |
|---|---|---|
| cron-backups | /backups | Archivos CSV de respaldo |
| cron-logs | /var/log/cron | Logs de ejecución |

---

## Comandos útiles

```bash
# Ejecutar limpieza manualmente
docker exec avalanz-cron /scripts/cleanup.sh

# Ejecutar rotación manualmente
docker exec avalanz-cron /scripts/rotate_backups.sh

# Ver log de limpieza
docker exec avalanz-cron cat /var/log/cron/cleanup.log

# Ver log de rotación
docker exec avalanz-cron cat /var/log/cron/rotate_backups.log

# Listar archivos de respaldo generados
docker exec avalanz-cron ls -lh /backups/cleanup/

# Copiar respaldos al host
docker cp avalanz-cron:/backups/cleanup/ ~/backups/

# Reconstruir el contenedor si hay cambios en los scripts
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate cron -d
```

---

## Cambiar periodos de retención

Edita `infrastructure/cron/cleanup.sh`:

```sh
# login_history — cambiar 90 por los días que necesites
WHERE created_at < NOW() - INTERVAL '90 days'

# user_sessions — cambiar 30 por los días que necesites
WHERE is_revoked = true AND revoked_at < NOW() - INTERVAL '30 days'
```

Luego reconstruye el contenedor:
```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build cron -d
```

---

## Cambiar el número máximo de respaldos

Edita `infrastructure/cron/rotate_backups.sh`:

```sh
MAX_BACKUPS=30  # Cambia este valor
```

---

## Consideraciones futuras

Cuando se configure el servidor secundario de backups, los CSV de limpieza deberían sincronizarse también vía `rsync`. Ver guía de backups cuando esté disponible.

Si el volumen de registros crece a millones de filas, considerar particionamiento por mes en PostgreSQL para `login_history`. Esto permite hacer `DROP TABLE` de particiones enteras en lugar de `DELETE` fila por fila, lo cual es mucho más eficiente a gran escala.
