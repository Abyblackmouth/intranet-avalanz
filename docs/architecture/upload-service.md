# Upload Service — Guía de Referencia

Ubicación: `backend/upload-service/`

El `upload-service` es el servicio de almacenamiento de archivos de la plataforma Avalanz. Es un servicio utilitario puro — sube, elimina y genera URLs firmadas de descarga en MinIO. No guarda registros en base de datos. Cada módulo operativo es responsable de mantener sus propias tablas `files` y `file_audit_log` con la trazabilidad de sus archivos.

---

## Responsabilidades

- Validación de tipo MIME, extensión y tamaño de archivos
- Subida de archivos al bucket `dirdoc` en MinIO
- Organización de archivos por `company_slug/module_slug/submodule_slug/`
- Cálculo de checksum SHA256 para verificación de integridad
- Generación de URLs firmadas temporales para descarga segura
- Eliminación de archivos de MinIO
- Inicialización automática de buckets al arrancar

## Lo que NO hace

- Guardar registros en base de datos
- Gestionar auditoría de archivos
- Saber a qué entidad de negocio pertenece el archivo

Esa responsabilidad es de cada módulo operativo.

---

## Arquitectura de archivos

### Decisión de diseño

Los registros de archivos (`files`) y auditoría (`file_audit_log`) viven dentro de la base de datos de cada módulo operativo, no en el `upload-service`. Esto garantiza que cada módulo sea autónomo y que si el `upload-service` tiene un problema, los módulos puedan seguir consultando sus archivos existentes.

### Flujo de subida desde un módulo

```
Módulo Legal sube un contrato
        |
legal-service llama a upload-service
POST /api/v1/upload/
{ file, company_slug, module_slug, submodule_slug }
        |
upload-service valida el archivo
upload-service construye la ruta: avalanz/legal/contratos/uuid_contrato.pdf
upload-service sube a MinIO en bucket dirdoc
upload-service devuelve { object_key, bucket, checksum, ... }
        |
legal-service recibe el object_key y checksum
legal-service guarda en su propia BD:
  files → { object_key, bucket, checksum, uploaded_by, entity_id, ... }
  file_audit_log → { action: "uploaded", performed_by, ... }
```

### Flujo de descarga desde un módulo

```
Usuario solicita descargar un contrato
        |
legal-service verifica company_id del JWT vs company_id del registro en BD
Si no coincide → 403
Si coincide → llama a upload-service
        |
GET /api/v1/upload/signed-url?object_key=...&bucket=dirdoc
        |
upload-service genera URL firmada válida 15 minutos
        |
legal-service registra en file_audit_log → { action: "downloaded", ... }
legal-service devuelve la URL al frontend
        |
Frontend descarga directo de MinIO con la URL firmada
URL expira a los 15 minutos — no reutilizable
```

---

## Estructura de carpetas en MinIO

Todos los archivos viven en el bucket `dirdoc` con la siguiente estructura:

```
dirdoc/
├── {company_slug}/
│   └── {module_slug}/
│       └── {submodule_slug}/
│           └── {uuid8}_{nombre_original}.{ext}
```

Ejemplo real:
```
dirdoc/
├── dyce/
│   └── legal/
│       └── contratos/
│           └── a3f9b2c1_contrato_arrendamiento.pdf
├── agim/
│   └── legal/
│       └── expedientes/
│           └── 7e2d4f8a_demanda_civil.pdf
├── avalanz/
│   └── usuarios/
│       └── perfiles/
│           └── 9540cf2d_foto_perfil.png
```

El `object_key` que devuelve el servicio es la ruta relativa dentro del bucket, sin incluir el nombre del bucket:

```
avalanz/usuarios/perfiles/9540cf2d_foto_perfil.png
```

---

## Tablas requeridas en cada módulo

Cada módulo operativo que maneje archivos debe implementar estas dos tablas en su propia base de datos.

### files

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| company_id | UUID | Empresa a la que pertenece |
| module_slug | String(100) | Módulo que lo generó |
| submodule_slug | String(100) | Submódulo que lo generó |
| entity_type | String(100) | Entidad ligada (expediente, contrato, etc.) |
| entity_id | UUID | ID del registro al que pertenece |
| original_name | String(255) | Nombre original del archivo |
| stored_name | String(255) | Nombre único con UUID como prefijo |
| object_key | String(500) | Ruta relativa en MinIO |
| bucket | String(100) | Bucket de MinIO — siempre `dirdoc` |
| mime_type | String(100) | Tipo MIME del archivo |
| extension | String(20) | Extensión del archivo |
| size_bytes | BigInteger | Tamaño en bytes |
| checksum | String(64) | Hash SHA256 para verificar integridad |
| description | Text | Descripción opcional |
| is_deleted | Boolean | Soft delete |
| deleted_at | DateTime | Fecha de eliminación |
| deleted_by | UUID | Usuario que eliminó |
| deleted_reason | String(255) | Motivo de eliminación |
| uploaded_by | UUID | Usuario que subió el archivo |
| uploaded_at | DateTime | Fecha de subida |
| last_modified_by | UUID | Último usuario que lo modificó |
| last_modified_at | DateTime | Fecha de última modificación |

### file_audit_log

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| file_id | UUID FK | Referencia a files |
| action | String(50) | uploaded, downloaded, replaced, deleted, restored |
| performed_by | UUID | Usuario que realizó la acción |
| performed_by_name | String(255) | Nombre del usuario en el momento del evento |
| performed_by_role | String(100) | Rol del usuario en el momento del evento |
| performed_at | DateTime | Fecha y hora exacta del evento |
| ip_address | String(45) | IP desde donde se realizó la acción |
| user_agent | String(255) | Navegador o cliente |
| company_id | UUID | Empresa del usuario que realizó la acción |
| module_slug | String(100) | Módulo donde ocurrió el evento |
| detail | JSONB | Datos extra según la acción |

El campo `detail` guarda contexto específico por acción:

```json
// uploaded
{ "size_bytes": 204800, "mime_type": "application/pdf" }

// replaced
{ "old_object_key": "dyce/legal/.../v_old.pdf", "new_object_key": "dyce/legal/.../v_new.pdf" }

// deleted
{ "reason": "Documento duplicado", "object_key": "dyce/legal/.../archivo.pdf" }

// downloaded
{ "url_type": "signed_url", "expires_in": 900 }
```

> Los campos `performed_by_name` y `performed_by_role` se guardan directamente en la auditoría para preservar el estado exacto del usuario en el momento del evento, independientemente de cambios posteriores en su perfil o rol.

---

## Estructura del proyecto

```
upload-service/
├── app/
│   ├── main.py                  → Punto de entrada, inicialización de buckets
│   ├── config.py                → Configuración del servicio
│   ├── routes/
│   │   └── upload.py            → Endpoints de subida, descarga y eliminación
│   ├── services/
│   │   ├── upload_service.py    → Lógica de validación, organización y checksum
│   │   └── storage_service.py  → Abstracción S3 / MinIO, URLs firmadas
│   ├── models/
│   │   └── upload_models.py
│   └── middleware/
├── tests/
├── Dockerfile
├── requirements.txt
└── .env
```

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | FastAPI |
| Almacenamiento | MinIO (on-premise) / AWS S3 (nube) |
| Cliente S3 | aioboto3 |
| JWT | python-jose |

---

## Tipos de archivo soportados

### Imágenes
| Tipo MIME | Extensión |
|---|---|
| image/jpeg | .jpg, .jpeg |
| image/png | .png |
| image/gif | .gif |
| image/webp | .webp |

### Documentos
| Tipo MIME | Extensión |
|---|---|
| application/pdf | .pdf |
| application/msword | .doc |
| application/vnd.openxmlformats-officedocument.wordprocessingml.document | .docx |
| application/vnd.ms-excel | .xls |
| application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | .xlsx |

**Tamaño máximo:** 50 MB por archivo

---

## Buckets en MinIO

| Bucket | Contenido |
|---|---|
| dirdoc | Todos los archivos de la plataforma organizados por empresa/módulo/submódulo |
| avalanz-images | Bucket legacy — vacío, no se usa |
| avalanz-documents | Bucket legacy — vacío, no se usa |

Los tres buckets se crean automáticamente al arrancar el servicio si no existen.

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | /api/v1/upload/ | Si | Subir un archivo |
| POST | /api/v1/upload/multiple | Si | Subir múltiples archivos |
| GET | /api/v1/upload/signed-url | Si | Generar URL firmada para descarga |
| DELETE | /api/v1/upload/ | Si | Eliminar un archivo |

### POST /api/v1/upload/

Recibe `multipart/form-data`:

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| file | File | Si | Archivo a subir |
| company_slug | string | Si | Slug de la empresa |
| module_slug | string | Si | Slug del módulo |
| submodule_slug | string | Si | Slug del submódulo |

Respuesta exitosa:
```json
{
  "success": true,
  "message": "Archivo subido exitosamente",
  "data": {
    "object_key": "dyce/legal/contratos/a3f9b2c1_contrato.pdf",
    "bucket": "dirdoc",
    "original_name": "contrato.pdf",
    "stored_name": "a3f9b2c1_contrato.pdf",
    "content_type": "application/pdf",
    "extension": ".pdf",
    "size_bytes": 204800,
    "size_mb": 0.2,
    "checksum": "4c413baa5077fb8da875ce0da74321c6c69aa6f473707d044ac8a2159085e50e",
    "is_image": false,
    "uploaded_by": "uuid-usuario",
    "company_id": "uuid-dyce",
    "company_slug": "dyce",
    "module_slug": "legal",
    "submodule_slug": "contratos",
    "uploaded_at": "2026-04-19T03:09:37+00:00"
  }
}
```

### GET /api/v1/upload/signed-url

Query parameters:

| Parámetro | Requerido | Descripción |
|---|---|---|
| object_key | Si | Ruta relativa del archivo en el bucket |
| bucket | Si | Nombre del bucket — normalmente `dirdoc` |
| expiration_seconds | No | Segundos de validez — default 900 (15 min) |

Respuesta exitosa:
```json
{
  "success": true,
  "message": "URL generada exitosamente",
  "data": {
    "url": "http://localhost:9000/dirdoc/dyce/legal/contratos/a3f9b2c1_contrato.pdf?AWSAccessKeyId=...&Expires=...",
    "object_key": "dyce/legal/contratos/a3f9b2c1_contrato.pdf",
    "bucket": "dirdoc",
    "expires_in_seconds": 900
  }
}
```

### DELETE /api/v1/upload/

Query parameters:

| Parámetro | Descripción |
|---|---|
| object_key | Ruta relativa del archivo en el bucket |
| bucket | Nombre del bucket |

---

## Validaciones

El servicio valida tres cosas antes de subir cualquier archivo:

1. **Tipo MIME** — debe estar en la lista de tipos permitidos
2. **Extensión** — debe coincidir con las extensiones permitidas
3. **Tamaño** — no debe superar 50 MB

---

## Seguridad de archivos

El `upload-service` no controla quién puede acceder a qué archivo — esa responsabilidad es del módulo que llama. El módulo debe verificar `company_id` del JWT contra `company_id` del registro en su BD antes de generar la URL firmada.

Las URLs firmadas expiran en 15 minutos por defecto. Una vez expiradas no pueden ser reutilizadas ni compartidas. MinIO no está expuesto públicamente en producción — Nginx no enruta tráfico externo al puerto 9000.

---

## Preparación para nube

El `storage_service.py` es la única pieza que abstrae la diferencia entre MinIO y S3. La migración se realiza cambiando únicamente variables de entorno sin tocar código.

### On-premise (MinIO)
```bash
STORAGE_ENDPOINT=http://avalanz-minio:9000
STORAGE_ACCESS_KEY=tu_access_key
STORAGE_SECRET_KEY=tu_secret_key
STORAGE_USE_SSL=False
SIGNED_URL_HOST=http://{IP_SERVIDOR}:9000
```

### AWS S3
```bash
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_ACCESS_KEY=tu_aws_access_key
STORAGE_SECRET_KEY=tu_aws_secret_key
STORAGE_USE_SSL=True
SIGNED_URL_HOST=https://s3.amazonaws.com
```

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| STORAGE_ENDPOINT | URL interna de MinIO (Docker) | http://avalanz-minio:9000 |
| STORAGE_ACCESS_KEY | Clave de acceso MinIO | minioadmin |
| STORAGE_SECRET_KEY | Clave secreta MinIO | — |
| STORAGE_USE_SSL | Usar SSL | False |
| BUCKET_DIRDOC | Bucket principal de archivos | dirdoc |
| BUCKET_IMAGES | Bucket legacy | avalanz-images |
| BUCKET_DOCUMENTS | Bucket legacy | avalanz-documents |
| MAX_FILE_SIZE_MB | Tamaño máximo en MB | 50 |
| SIGNED_URL_EXPIRATION | Segundos de validez de URLs firmadas | 900 |
| SIGNED_URL_HOST | Host público para URLs firmadas | http://localhost:9000 |
| JWT_SECRET_KEY | Clave JWT — misma que auth-service | — |

---

## Cómo consumir desde otros servicios

```python
import httpx

async def subir_archivo(file_data: bytes, filename: str, company_slug: str,
                         module_slug: str, submodule_slug: str, token: str) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "http://upload-service:8000/api/v1/upload/",
            headers={"Authorization": f"Bearer {token}"},
            files={"file": (filename, file_data, "application/pdf")},
            data={
                "company_slug": company_slug,
                "module_slug": module_slug,
                "submodule_slug": submodule_slug,
            },
        )
        return response.json()


async def obtener_url_descarga(object_key: str, token: str) -> str:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            "http://upload-service:8000/api/v1/upload/signed-url",
            headers={"Authorization": f"Bearer {token}"},
            params={"object_key": object_key, "bucket": "dirdoc"},
        )
        return response.json()["data"]["url"]
```

---

## Instalación y arranque local

El servicio corre dentro del stack Docker. No se levanta de forma aislada en desarrollo normal.

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d upload-service
```

Después de modificar archivos localmente copiar al contenedor y reiniciar:

```bash
docker cp backend/upload-service/app/services/storage_service.py avalanz-upload:/app/app/services/storage_service.py
docker cp backend/upload-service/app/services/upload_service.py avalanz-upload:/app/app/services/upload_service.py
docker cp backend/upload-service/app/routes/upload.py avalanz-upload:/app/app/routes/upload.py
docker cp backend/upload-service/app/main.py avalanz-upload:/app/app/main.py
docker cp backend/upload-service/app/config.py avalanz-upload:/app/app/config.py
docker restart avalanz-upload
```