# MinIO — Guía de Referencia

Ubicación: `infrastructure/docker/docker-compose.yml` → servicio `minio`

MinIO es el servidor de almacenamiento de archivos on-premise de la plataforma Avalanz. Es compatible con la API de AWS S3, lo que permite migrar a nube sin cambios de código. Todos los archivos de la plataforma se almacenan en MinIO organizados bajo el bucket `dirdoc`.

---

## Acceso

| Entorno | URL | Usuario | Contraseña |
|---|---|---|---|
| Desarrollo — Consola web | http://localhost:9001 | minioadmin | Avalanz2026! |
| Desarrollo — API S3 | http://localhost:9000 | minioadmin | Avalanz2026! |
| Docker interno | http://avalanz-minio:9000 | minioadmin | Avalanz2026! |

> En producción el puerto 9001 (consola) no debe estar expuesto públicamente. Ver checklist de producción en `tech-debt.md`.

---

## Buckets

| Bucket | Uso |
|---|---|
| `dirdoc` | Bucket principal — todos los archivos de la plataforma |
| `avalanz-images` | Bucket legacy — vacío, no se usa |
| `avalanz-documents` | Bucket legacy — vacío, no se usa |

Los tres buckets se crean automáticamente al arrancar el `upload-service` si no existen.

---

## Estructura de dirdoc

El bucket `dirdoc` organiza los archivos con la siguiente estructura:

```
dirdoc/
├── admin/                          → Módulo administrativo
│   └── employees/
│       └── documents/
│           └── user_{matricula}_{company}_{folio}.{ext}
│
└── {company_slug}/                 → Módulos operativos por empresa
    └── {module_slug}/
        └── {submodule_slug}/
            └── {uuid8}_{nombre}.{ext}
```

### Ejemplos reales

```
dirdoc/admin/employees/documents/user_012185_avalanz_a3f9b2c1.pdf
dirdoc/dyce/legal/contratos/f88bc926_contrato_arrendamiento.pdf
dirdoc/agim/boveda/documentos/7e2d4f8a_acta_constitutiva.pdf
```

---

## Convención de nombres de archivos

### Módulo admin — documentos de empleados

```
user_{matricula}_{company_slug}_{folio}.{ext}
```

| Parte | Descripción |
|---|---|
| `user` | Prefijo fijo |
| `matricula` | Número de empleado — si no tiene, primeros 8 chars del UUID del usuario |
| `company_slug` | Slug de la empresa en minúsculas |
| `folio` | 8 caracteres UUID aleatorios — garantiza unicidad |
| `ext` | Extensión original del archivo |

### Módulos operativos

```
{uuid8}_{nombre_original}.{ext}
```

El `upload-service` genera el nombre automáticamente con un UUID de 8 caracteres como prefijo.

---

## Seguridad

MinIO no controla quién puede acceder a cada archivo. El control de acceso es responsabilidad del backend de cada módulo:

1. El backend verifica `company_id` del JWT contra `company_id` del registro en BD
2. Si coincide, solicita una URL firmada temporal al `upload-service`
3. El frontend descarga directamente de MinIO con esa URL
4. La URL expira en 15 minutos (`SIGNED_URL_EXPIRATION=900`) — no es reutilizable

MinIO no está expuesto públicamente en producción — Nginx no enruta tráfico externo al puerto 9000.

---

## URLs firmadas

Las URLs firmadas permiten al frontend descargar archivos directamente de MinIO sin pasar por el backend, con seguridad temporal.

Formato de una URL firmada:
```
http://localhost:9000/dirdoc/admin/employees/documents/user_012185_avalanz_a3f9b2c1.pdf
  ?AWSAccessKeyId=minioadmin
  &Signature=Q0fpt0PWF32qh...
  &Expires=1776571104
```

En producción `localhost:9000` se reemplaza por la IP o dominio real del servidor via la variable `SIGNED_URL_HOST` en el `.env` del `upload-service`.

---

## Operaciones desde consola de MinIO

### Ver archivos de un bucket
1. Abrir http://localhost:9001
2. Ir a Object Browser
3. Seleccionar el bucket `dirdoc`
4. Navegar por las carpetas

### Eliminar archivos manualmente
Seleccionar el archivo → botón Delete en el panel de acciones de la derecha.

### Eliminar carpetas completas (solo desarrollo)
```bash
docker exec avalanz-minio sh -c "mc alias set local http://localhost:9000 minioadmin Avalanz2026! && mc rm --recursive --force local/dirdoc/carpeta"
```

### Ver contenido del bucket desde terminal
```bash
docker exec avalanz-minio sh -c "mc alias set local http://localhost:9000 minioadmin Avalanz2026! && mc ls --recursive local/dirdoc"
```

---

## Limpieza de datos de prueba

Para eliminar todo el contenido del bucket `dirdoc` y los registros de BD:

```bash
# Limpiar BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "DELETE FROM user_file_audit_log;"
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "DELETE FROM user_files;"

# Limpiar MinIO
docker exec avalanz-minio sh -c "mc alias set local http://localhost:9000 minioadmin Avalanz2026! && mc rm --recursive --force local/dirdoc"
```

---

## Backup de archivos

### Backup manual del volumen de MinIO

```bash
docker run --rm \
  -v minio-data:/data \
  -v /tmp:/backup \
  alpine tar czf /backup/minio-backup-$(date +%Y%m%d).tar.gz /data
```

### Restaurar backup

```bash
docker run --rm \
  -v minio-data:/data \
  -v /tmp:/backup \
  alpine tar xzf /backup/minio-backup-20260419.tar.gz -C /
```

---

## Configuración Docker

El servicio MinIO está definido en `infrastructure/docker/docker-compose.yml`:

```yaml
minio:
  image: minio/minio:latest
  container_name: avalanz-minio
  restart: unless-stopped
  command: server /data --console-address ":9001"
  environment:
    MINIO_ROOT_USER: ${MINIO_ACCESS_KEY}
    MINIO_ROOT_PASSWORD: ${MINIO_SECRET_KEY}
  ports:
    - "9000:9000"
    - "9001:9001"
  volumes:
    - minio-data:/data
  networks:
    - avalanz-network
```

Los archivos físicos viven en el volumen Docker `minio-data`. Para encontrar su ubicación en el servidor:

```bash
docker volume inspect minio-data
# Mountpoint: /var/lib/docker/volumes/minio-data/_data
```

---

## Variables de entorno relevantes

### `infrastructure/docker/.env`

| Variable | Descripción | Default |
|---|---|---|
| `MINIO_ACCESS_KEY` | Usuario root de MinIO | minioadmin |
| `MINIO_SECRET_KEY` | Contraseña root de MinIO | Avalanz2026! |

### `backend/upload-service/.env`

| Variable | Descripción | Default dev |
|---|---|---|
| `STORAGE_ENDPOINT` | URL interna Docker | http://avalanz-minio:9000 |
| `STORAGE_ACCESS_KEY` | Clave de acceso | minioadmin |
| `STORAGE_SECRET_KEY` | Clave secreta | Avalanz2026! |
| `STORAGE_USE_SSL` | Usar SSL | False |
| `BUCKET_DIRDOC` | Bucket principal | dirdoc |
| `SIGNED_URL_EXPIRATION` | Segundos de validez URL firmada | 900 |
| `SIGNED_URL_HOST` | Host público para URLs firmadas | http://localhost:9000 |

---

## Migración a producción

Para producción on-premise solo cambiar estas variables — sin tocar código:

```bash
# En upload-service/.env
STORAGE_ENDPOINT=http://avalanz-minio:9000      # igual, es interno Docker
STORAGE_ACCESS_KEY=credencial_segura
STORAGE_SECRET_KEY=password_seguro
SIGNED_URL_HOST=http://{IP_SERVIDOR}:9000       # IP real del servidor

# En infrastructure/docker/.env
MINIO_ACCESS_KEY=credencial_segura
MINIO_SECRET_KEY=password_seguro
```

Para migrar a AWS S3 en el futuro:

```bash
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_ACCESS_KEY=aws_access_key
STORAGE_SECRET_KEY=aws_secret_key
STORAGE_USE_SSL=True
SIGNED_URL_HOST=https://s3.amazonaws.com
```
