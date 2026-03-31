# Upload Service — Guía de Referencia

Ubicación: `backend/upload-service/`

El `upload-service` es el servicio de almacenamiento de archivos de la plataforma Avalanz. Gestiona la subida, organización y eliminación de imágenes y documentos usando una arquitectura S3-compatible que permite operar on-premise con MinIO y migrar a nube pública sin cambios de código.

---

## Responsabilidades

- Validación de tipo y tamaño de archivos
- Subida de archivos a MinIO o S3
- Organización de archivos por empresa y módulo
- Eliminación de archivos
- Inicialización automática de buckets al arrancar

---

## Estructura

```
upload-service/
├── app/
│   ├── main.py                  → Punto de entrada, inicialización de buckets
│   ├── config.py                → Configuración del servicio
│   ├── routes/
│   │   └── upload.py            → Endpoints de subida y eliminación
│   ├── services/
│   │   ├── upload_service.py    → Lógica de validación y organización
│   │   └── storage_service.py  → Abstracción S3 / MinIO
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

## Buckets

| Bucket | Contenido |
|---|---|
| avalanz-images | Imágenes (jpg, png, gif, webp) |
| avalanz-documents | Documentos (pdf, doc, docx, xls, xlsx) |

Los buckets se crean automáticamente al arrancar el servicio si no existen.

---

## Estructura de carpetas en MinIO / S3

Los archivos se organizan con la siguiente estructura de object key:

```
{company_id}/{module_slug}/{folder}/{unique_id}_{nombre_archivo}.{ext}
```

**Ejemplo:**
```
uuid-dyce/legal/expedientes/a3f9b2c1_contrato_arrendamiento.pdf
uuid-corporativo/boveda/documentos/7e2d4f8a_acta_constitutiva.pdf
```

Esto garantiza:
- Aislamiento de archivos por empresa desde el nivel del sistema de archivos
- Organización por módulo y carpeta
- Nombres únicos sin colisiones

---

## Preparación para nube

El `storage_service.py` es la única pieza que abstrae la diferencia entre MinIO y S3. La migración se realiza cambiando únicamente variables de entorno:

### On-premise (MinIO)
```bash
STORAGE_ENDPOINT=http://192.168.1.100:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=minioadmin
STORAGE_USE_SSL=False
```

### Nube privada (VPC / datacenter externo)
```bash
STORAGE_ENDPOINT=http://10.0.0.50:9000
STORAGE_ACCESS_KEY=tu_access_key
STORAGE_SECRET_KEY=tu_secret_key
STORAGE_USE_SSL=True
```

### AWS S3
```bash
STORAGE_ENDPOINT=https://s3.amazonaws.com
STORAGE_ACCESS_KEY=tu_aws_access_key
STORAGE_SECRET_KEY=tu_aws_secret_key
STORAGE_USE_SSL=True
```

---

## Endpoints

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | /api/v1/upload/ | Si | Subir un archivo |
| POST | /api/v1/upload/multiple | Si | Subir múltiples archivos |
| DELETE | /api/v1/upload/ | Si | Eliminar un archivo |

### POST /api/v1/upload/

Recibe `multipart/form-data` con los siguientes campos:

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| file | File | Si | Archivo a subir |
| folder | string | Si | Carpeta destino dentro del módulo |
| module_slug | string | No | Slug del módulo al que pertenece el archivo |

### Respuesta exitosa
```json
{
  "success": true,
  "message": "Archivo subido exitosamente",
  "data": {
    "url": "http://localhost:9000/avalanz-documents/uuid-dyce/legal/expedientes/a3f9b2_contrato.pdf",
    "object_key": "uuid-dyce/legal/expedientes/a3f9b2_contrato.pdf",
    "bucket": "avalanz-documents",
    "original_name": "contrato.pdf",
    "content_type": "application/pdf",
    "size_bytes": 204800,
    "size_mb": 0.2,
    "is_image": false,
    "uploaded_by": "uuid-usuario",
    "company_id": "uuid-dyce",
    "module_slug": "legal",
    "uploaded_at": "2026-03-30T10:00:00+00:00"
  }
}
```

### DELETE /api/v1/upload/

Query parameters:

| Parámetro | Descripción |
|---|---|
| object_key | Ruta del archivo en el bucket |
| bucket | Nombre del bucket |

---

## Validaciones

El servicio valida tres cosas antes de subir cualquier archivo:

1. **Tipo MIME** — debe estar en la lista de tipos permitidos
2. **Extensión** — debe coincidir con las extensiones permitidas
3. **Tamaño** — no debe superar 50 MB

Si alguna validación falla se retorna el error correspondiente antes de intentar subir.

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| STORAGE_ENDPOINT | URL de MinIO o S3 | http://localhost:9000 |
| STORAGE_ACCESS_KEY | Clave de acceso | minioadmin |
| STORAGE_SECRET_KEY | Clave secreta | minioadmin |
| STORAGE_USE_SSL | Usar SSL | False |
| BUCKET_IMAGES | Bucket para imágenes | avalanz-images |
| BUCKET_DOCUMENTS | Bucket para documentos | avalanz-documents |
| MAX_FILE_SIZE_MB | Tamaño máximo en MB | 50 |

---

## Instalación y arranque local

```bash
cd backend/upload-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8003
```

El servicio queda disponible en `http://localhost:8003`