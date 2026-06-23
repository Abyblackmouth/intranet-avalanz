# MinIO — Guía de Referencia

Ubicación: `infrastructure/docker/docker-compose.yml` → servicio `minio`

MinIO es el servidor de almacenamiento de archivos on-premise de la plataforma Avalanz. Es compatible con la API de AWS S3, lo que permite migrar a nube sin cambios de código. Todos los archivos de la plataforma se almacenan en MinIO organizados bajo el bucket `dirdoc`.

---

## Acceso

| Entorno | URL | Usuario | Contraseña |
|---|---|---|---|
| Servidor — Consola web | http://10.12.0.51:9001 | AvalanzMinIO2026 | (ver KeePass) |
| Servidor — API S3 | http://10.12.0.51:9000 | AvalanzMinIO2026 | (ver KeePass) |
| Docker interno | http://avalanz-minio:9000 | AvalanzMinIO2026 | (ver KeePass) |

> El puerto 9001 (consola web) fue agregado al mapeo de docker-compose.yml en 2026-06-23. Si no abre, verificar con `docker ps | grep minio`.

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
├── admin/                          → Módulo administrativo (sin company_slug)
│   └── employees/
│       └── documents/
│           └── user_{matricula}_{company}_{folio}.{ext}
│
└── {company_slug}/                 → Módulos operativos por empresa
    └── {module_slug}/
        └── {submodule_slug}/       → Puede contener slashes para subcarpetas
            └── {uuid8}_{nombre}.{ext}
```

### Módulo Admin — documentos de empleados

```
dirdoc/
└── admin/
    └── employees/
        └── documents/
            └── user_012185_avalanz_a3f9b2c1.pdf
```

### Módulo Legal — Solicitud de Contratos

El módulo legal usa `submodule_slug` con slashes para crear subcarpetas por folio:

```
dirdoc/
├── agim/
│   └── legal/
│       └── envelopes/
│           └── ENV-2026-0039/               ← submodule_slug = "envelopes/ENV-2026-0039"
│               ├── uuid_contrato.pdf        ← PDF generado al enviar
│               └── attachments/             ← submodule_slug = "envelopes/ENV-2026-0039/attachments"
│                   └── uuid_ine.pdf         ← anexos del cliente
└── sppel/
    └── legal/
        └── envelopes/
            └── ENV-2026-0041/
                └── uuid_contrato.pdf
```

El `company_slug` se obtiene del admin-service usando el `company_id` del sobre y se guarda como `company_name` en la tabla `envelopes`.

### Módulos futuros

```
dirdoc/
└── {empresa}/
    └── boveda/
        └── expedientes/
            └── uuid_acta_constitutiva.pdf
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

El `upload-service` genera el nombre automáticamente. Para el módulo Legal, el frontend renombra el archivo antes de subirlo para incluir el folio:

```
ENV-2026-0039_contrato.pdf  →  uuid8_env-2026-0039_contrato.pdf
ENV-2026-0039_ine.pdf       →  uuid8_env-2026-0039_ine.pdf
```

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
http://10.12.0.51:9000/dirdoc/agim/legal/envelopes/ENV-2026-0039/uuid_contrato.pdf
  ?AWSAccessKeyId=AvalanzMinIO2026
  &Signature=Q0fpt0PWF32qh...
  &Expires=1776571104
```

En producción `SIGNED_URL_HOST` en el `.env` del `upload-service` debe apuntar a la IP real del servidor.

---

## Operaciones desde terminal (CLI mc)

```bash
# Configurar alias (credenciales reales en KeePass)
docker exec avalanz-minio mc alias set local http://localhost:9000 AvalanzMinIO2026 <SECRET_KEY>

# Ver contenido completo del bucket
docker exec avalanz-minio mc ls --recursive local/dirdoc/

# Ver archivos de una empresa/módulo específico
docker exec avalanz-minio mc ls --recursive local/dirdoc/agim/legal/

# Eliminar carpeta de un sobre específico (solo desarrollo)
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/agim/legal/envelopes/ENV-2026-XXXX/

# Eliminar todos los archivos de prueba del módulo legal
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/agim/
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/sppel/
```

---

## Operaciones desde consola web

1. Abrir `http://10.12.0.51:9001`
2. Iniciar sesión con credenciales de KeePass
3. Ir a Object Browser
4. Seleccionar el bucket `dirdoc`
5. Navegar por las carpetas: empresa → módulo → folio

---

## Limpieza de datos de prueba

Para eliminar archivos de prueba del módulo Legal en MinIO y sus registros en BD:

```bash
# Limpiar MinIO — módulo legal (ajustar slugs según empresas usadas en pruebas)
docker exec avalanz-minio mc alias set local http://localhost:9000 AvalanzMinIO2026 <SECRET_KEY>
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/agim/
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/sppel/

# Limpiar BD legal — attachments
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal -c "DELETE FROM envelope_attachments;"

# Limpiar BD admin — archivos de empleados
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "DELETE FROM user_file_audit_log;"
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "DELETE FROM user_files;"
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
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
```

Los archivos físicos viven en el volumen Docker `minio-data`. Para encontrar su ubicación en el servidor:

```bash
docker volume inspect minio-data
# Mountpoint: /var/lib/docker/volumes/minio-data/_data
```

---

## Variables de entorno relevantes

### `infrastructure/docker/.env`

| Variable | Descripción |
|---|---|
| `MINIO_ACCESS_KEY` | Usuario root de MinIO |
| `MINIO_SECRET_KEY` | Contraseña root de MinIO |

### `backend/upload-service/.env`

| Variable | Descripción | Default dev |
|---|---|---|
| `STORAGE_ENDPOINT` | URL interna Docker | http://avalanz-minio:9000 |
| `STORAGE_ACCESS_KEY` | Clave de acceso | igual que MINIO_ACCESS_KEY |
| `STORAGE_SECRET_KEY` | Clave secreta | igual que MINIO_SECRET_KEY |
| `STORAGE_USE_SSL` | Usar SSL | False |
| `BUCKET_DIRDOC` | Bucket principal | dirdoc |
| `SIGNED_URL_EXPIRATION` | Segundos de validez URL firmada | 900 |
| `SIGNED_URL_HOST` | Host público para URLs firmadas | http://10.12.0.51:9000 |

---

## Módulos que usan MinIO

| Módulo | Ruta en dirdoc | Descripción |
|---|---|---|
| admin-service | `admin/employees/documents/` | Archivos de expediente de empleados |
| legal-service | `{empresa}/legal/envelopes/{folio}/` | Contratos PDF generados al enviar |
| legal-service | `{empresa}/legal/envelopes/{folio}/attachments/` | Anexos del cliente (INE, pasaporte, etc.) |

> Al agregar un nuevo módulo que suba archivos, documentar aquí su estructura de rutas.

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