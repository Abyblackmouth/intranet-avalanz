# Legal Service — Guía de Referencia

Ubicación: `backend/modules/legal-service/`

El `legal-service` es el primer módulo operativo de la plataforma Avalanz. Centraliza la operación legal del grupo en una sola plataforma con acceso segmentado por unidad de negocio. Soporta múltiples razones sociales (AGIM, CNCI, DYCE, Superboletos, Zignia, etc.).

---

## Contexto de negocio

El módulo legal-corporativo tiene 5 submódulos planificados. El desarrollo sigue este orden:

| # | Submódulo | Complejidad | Estado |
|---|---|---|---|
| 1 | Archivo de Secretaría Corporativa | Baja | Pendiente |
| 2 | Solicitud de Contratos | Alta | **En desarrollo** |
| 3 | Inventario de Marcas (IMPI) | Media | Pendiente |
| 4 | Seguros y Fianzas | Media | Pendiente |
| 5 | Procesos Judiciales Activos | Media | Pendiente |

---

## Principios clave

- Cada unidad de negocio ve únicamente su información
- El equipo de auditoría puede visualizar todo pero sin operar
- El área legal tiene visibilidad y operación total
- Trazabilidad completa — quién subió, editó, borró y cuándo
- Nadie puede borrar ni editar sobres una vez en estado terminal

---

## Perfiles de usuario

| Perfil | Descripción | Acciones |
|---|---|---|
| `solicitante` | Usuario de una empresa del grupo. Crea sobres y da seguimiento | Solo sus propios sobres mientras estén abiertos |
| `abogado` | Equipo legal corporativo. Gestiona sobres asignados a él | Solo sobres asignados |
| `coordinador_legal` | Admin del módulo legal. Asigna abogados, reasigna sobres, ve todo | Gestión administrativa completa + KPIs |
| `director` | Personas de alto mando configurables. Solo consultan y descargan | Solo lectura + KPIs |
| `super_admin` | Equipo de sistemas. Si no existe Coordinador Legal, asume sus funciones | Acceso total |

### Roles de módulo en BD

Los roles `abogado` y `coordinador_legal` son roles de módulo en `avalanz_admin.module_roles`, asociados al módulo Legal (`slug: legal`). Viajan en el JWT con prefijo: `legal:abogado`, `legal:coordinador_legal`.

**Regla crítica:** El backend y frontend deben normalizar el prefijo antes de comparar:

```python
# Backend — helper en routes.py
def get_flat_roles(user: dict) -> list:
    """Normaliza roles de módulo quitando el prefijo {modulo}: para comparaciones."""
    return [r.split(":")[-1] for r in user.get("roles", [])]
```

```typescript
// Frontend — resolveLegalRole en page.tsx
const resolveLegalRole = (roles: string[]): LegalRole => {
  const flat = roles.map(r => r.includes(':') ? r.split(':')[1] : r)
  if (flat.includes('super_admin')) return 'super_admin'
  if (flat.includes('coordinador_legal')) return 'coordinador_legal'
  if (flat.includes('director')) return 'director'
  if (flat.includes('abogado')) return 'abogado'
  return 'solicitante'
}
```

---

## Arquitectura

### Estructura de archivos

```
backend/modules/legal-service/
├── app/
│   ├── main.py                     → FastAPI app — registra 3 routers
│   ├── config.py                   → Variables de entorno + FRONTEND_URL + EMAIL_SERVICE_URL
│   ├── database.py                 → Motor async SQLAlchemy, sesión
│   └── routes/
│       └── legal.py                → Router base del módulo
├── contract_requests/              → Submódulo: Solicitud de Contratos
│   ├── __init__.py
│   ├── models.py                   → 18+ tablas SQLAlchemy
│   ├── schemas.py                  → Modelos Pydantic request/response
│   ├── service.py                  → Lógica de negocio, SLA, balanceo, log_activity()
│   ├── routes.py                   → Endpoints FastAPI — prefijo /envelopes
│   ├── docusign_routes.py          → Webhook DocuSign Connect + polling interno ← SEPARADO
│   ├── signing_service.py          → Proveedores de firma (email_sim / docusign) + auto-signers
│   └── docusign_service.py         → Cliente DocuSign eSignature (JWT Grant)
├── templates/
│   ├── index.json                  → Catálogo de templates con contract_type_id
│   └── nda-mutuo/
│       ├── template.html           → HTML del contrato con variables {{CAMPO}} y anclas DocuSign
│       └── fields.json             → Campos del formulario + EMAIL_FIRMANTE_1/2 + signers_definition
├── shared/                         → Symlink a backend/shared/
├── migrations/
│   ├── alembic.ini
│   ├── env.py                      → Lee variables de entorno para conexión
│   └── versions/
│       ├── fd194ef42a01            → Initial schema
│       ├── a7d79d465637            → Rename to envelopes
│       ├── 2c4cbf7f7b31            → Add envelope_signers
│       ├── 425fe54b7106            → Add template slug/version, mime types, correction checklist
│       ├── a62f97aa714d            → Add signing tokens + provider config
│       ├── d3a02f07031f            → Add version tracking to envelope_attachments
│       └── e7f1a2b3c4d5            → Add DocuSign fields (docusign_envelope_id, anchors, etc.)
├── docusign_private.pem            → Clave privada RSA — NO versionar en git
├── Dockerfile
├── requirements.txt                → weasyprint==57.2, pydyf==0.6.0, boto3==1.43.36, httpx
└── .env
```

### Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | FastAPI |
| Base de datos | PostgreSQL 15 — BD: `avalanz_legal` |
| ORM | SQLAlchemy 2.0 async |
| Migraciones | Alembic |
| PDF | WeasyPrint 57.2 + pydyf 0.6.0 (versiones fijadas) |
| Firma electrónica | DocuSign eSignature (sandbox activo) |
| Almacenamiento | MinIO (boto3 S3 API directa) — bucket `dirdoc` |
| HTTP interno | httpx (llamadas a admin-service y email-service) |
| JWT | shared/middleware/jwt_validator.py |

---

## Configuración (.env)

```env
SERVICE_NAME=legal-service
SERVICE_VERSION=1.0.0
DEBUG=False
DATABASE_URL=postgresql+asyncpg://avalanz_user:<password>@postgres:5432/avalanz_legal
JWT_SECRET_KEY=e112f45074c295b1a82af7f4d9252120450b6dc3e83a55ec4b89ce0a5f84dbe8
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
FRONTEND_URL=https://intranet.avalanz.com
EMAIL_SERVICE_URL=http://email-service:8000
LOG_LEVEL=INFO
LOG_FORMAT=json

# DocuSign eSignature — Sandbox
DOCUSIGN_INTEGRATION_KEY=027e9aa0-c59d-4e73-a731-3de935f37317
DOCUSIGN_USER_ID=9e945c43-d63f-4064-9ddb-e8ea065a447c
DOCUSIGN_ACCOUNT_ID=5dcad3a2-d1e4-4f8b-aafe-36755860504e
DOCUSIGN_BASE_URI=https://demo.docusign.net
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY_PATH=/app/docusign_private.pem

# MinIO — acceso directo para descarga de PDF (sin pasar por upload-service)
MINIO_ENDPOINT=http://avalanz-minio:9000
MINIO_ACCESS_KEY=AvalanzMinIO2026
MINIO_SECRET_KEY=55520173966a34f64caa19e807985392b0e90dff
```

---

## Docker

```yaml
legal-service:
  build:
    context: ../../backend
    dockerfile: modules/legal-service/Dockerfile
  container_name: avalanz-legal
  restart: unless-stopped
  env_file:
    - ../../backend/modules/legal-service/.env
  environment:
    DB_HOST: postgres
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - avalanz-network
  logging: *default-logging
```

### Dockerfile

```dockerfile
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc curl libpango-1.0-0 libcairo2 libgdk-pixbuf-xlib-2.0-0 \
    fonts-liberation && rm -rf /var/lib/apt/lists/*
COPY modules/legal-service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY modules/legal-service/ .
COPY shared/ /app/shared
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **Crítico:** El contexto del build en `docker-compose.yml` debe ser `../../backend` para que el `COPY shared/` funcione. WeasyPrint requiere `libpango`, `libcairo`, `libgdk-pixbuf-xlib` y `fonts-liberation`.

### Después de `docker compose up -d legal-service` (contenedor recreado)

El contenedor se recrea desde imagen vieja — siempre volver a copiar archivos modificados:

```bash
cd ~/intranet-avalanz/backend/modules/legal-service
docker cp contract_requests/routes.py avalanz-legal:/app/contract_requests/routes.py
docker cp contract_requests/models.py avalanz-legal:/app/contract_requests/models.py
docker cp contract_requests/signing_service.py avalanz-legal:/app/contract_requests/signing_service.py
docker cp contract_requests/docusign_service.py avalanz-legal:/app/contract_requests/docusign_service.py
docker cp contract_requests/docusign_routes.py avalanz-legal:/app/contract_requests/docusign_routes.py
docker cp app/main.py avalanz-legal:/app/app/main.py
docker cp docusign_private.pem avalanz-legal:/app/docusign_private.pem
docker exec avalanz-legal pip install boto3==1.43.36 --break-system-packages --quiet
docker restart avalanz-legal
```

---

## Nginx

```nginx
upstream legal_service {
    server avalanz-legal:8000;
    keepalive 32;
}

location ^~ /api/v1/legal {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://legal_service;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;
}
```

> El `^~` es obligatorio para que Nginx prefiera este location sobre el `location /` del frontend.

---

## Autenticación

```python
from shared.middleware.jwt_validator import JWTValidator

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()

def require_roles(*roles: str):
    return _validator.require_roles(list(roles))
```

---

## Submódulo: Solicitud de Contratos — El Sobre

### Concepto del Sobre (Envelope)

La unidad central del submódulo se denomina **Sobre**, consistente con la terminología de DocuSign. Un sobre contiene todo lo relacionado con una solicitud de contrato: formulario dinámico, contrato generado, anexos, firmantes, comentarios, historial de estados y trazabilidad completa.

### Prefijo de rutas

```
/api/v1/legal/envelopes
```

---

### 1. Modelo de datos — 18+ tablas en `avalanz_legal`

#### contract_types

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| name | VARCHAR(255) | Nombre del tipo |
| slug | VARCHAR(255) | Identificador URL único |
| description | Text | Descripción opcional |
| sla_business_days | Integer | Días hábiles del SLA (default: 3) |
| is_active | Boolean | Si está activo en el catálogo |
| template_slug | VARCHAR(255) | Slug del template HTML asociado |
| template_version | VARCHAR(20) | Versión del template |
| created_by | UUID | Usuario que lo creó |

#### contract_type_fields

Campos dinámicos del formulario por tipo de contrato.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| contract_type_id | UUID FK | → contract_types |
| label | VARCHAR(255) | Etiqueta del campo |
| field_key | VARCHAR(100) | Clave del campo en el JSON |
| field_type | VARCHAR(50) | text, textarea, date, select, number |
| options | JSON | Para campos select |
| is_required | Boolean | |
| display_order | Integer | |

#### contract_type_attachment_defs

Definición de anexos requeridos y opcionales por tipo de contrato.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| contract_type_id | UUID FK | → contract_types |
| name | VARCHAR(255) | Nombre del anexo (ej. "INE Vigente") |
| description | Text | |
| is_required | Boolean | |
| allowed_mime_types | JSON | Tipos MIME permitidos |
| display_order | Integer | |

#### lawyer_assignments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| lawyer_user_id | UUID | UUID del usuario en avalanz_admin |
| lawyer_name | VARCHAR(255) | Desnormalizado |
| lawyer_email | VARCHAR(255) | Desnormalizado |
| contract_type_id | UUID FK | → contract_types |
| is_active | Boolean | Si recibe nuevos sobres de este tipo |
| assigned_by | UUID | Coordinador que hizo la asignación |

#### envelopes

Sobre principal con máquina de estados y trazabilidad completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| folio | VARCHAR(20) UNIQUE | ENV-2026-0001 |
| company_id | UUID | Empresa del solicitante |
| company_name | VARCHAR(255) | Slug de la empresa (desnormalizado) |
| requested_by_user_id | UUID | |
| requested_by_name | VARCHAR(255) | Desnormalizado |
| requested_by_email | VARCHAR(255) | Desnormalizado |
| contract_type_id | UUID FK | → contract_types |
| contract_type_name | VARCHAR(255) | Desnormalizado |
| assigned_lawyer_id | UUID | |
| assigned_lawyer_name | VARCHAR(255) | Desnormalizado |
| assigned_lawyer_email | VARCHAR(255) | Desnormalizado |
| assigned_at | DateTime | |
| status | Enum | Ver máquina de estados |
| form_data | JSON | Datos del formulario dinámico |
| counterparty_name | VARCHAR(255) | |
| counterparty_email | VARCHAR(255) | |
| is_open_request | Boolean | Sin template |
| open_request_description | Text | |
| submitted_at | DateTime | **SLA inicia aquí** |
| sla_due_at | DateTime | Fecha límite calculada |
| sla_closed_at | DateTime | Cuándo se cerró el SLA |
| is_sla_breached | Boolean | |
| is_intercompany | Boolean | Contrato entre empresas del grupo |
| counterparty_company_id | UUID | Empresa contraparte interna |
| correction_checklist | JSON | |
| docusign_envelope_id | VARCHAR(100) | **ID del sobre en DocuSign** |
| completed_at | DateTime | |
| is_deleted | Boolean | Soft delete |
| deleted_at / deleted_by | | |

#### envelope_signers

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | → envelopes |
| signer_type | VARCHAR(20) | internal / external |
| user_id | UUID | UUID en avalanz si es firmante interno |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | |
| role_in_document | VARCHAR(100) | ej. "Representante Legal Parte A" |
| routing_order | Integer | Orden de firma en DocuSign |
| docusign_recipient_id | VARCHAR(100) | |
| sign_here_anchor | VARCHAR(50) | anchorString del signHereTabs — ej. `*FIRMA1*` |
| full_name_anchor | VARCHAR(50) | anchorString del fullNameTabs — ej. `*NOMBRE1*` |
| date_signed_anchor | VARCHAR(50) | anchorString del dateSignedTabs — ej. `*FECHA_FIRMA1*` |
| email_subject | VARCHAR(255) | Asunto personalizado por firmante |
| email_blurb | TEXT | Cuerpo personalizado por firmante |
| client_user_id | VARCHAR(100) | Para Embedded Signing futuro |
| status | VARCHAR(30) | pending / sent / signed / declined |
| signed_at | DateTime | |
| declined_at | DateTime | |
| declined_reason | Text | |
| docs_requested / docs_received | JSON | |

#### envelope_signing_tokens

Tokens únicos por firmante para simulación de firma por correo (email_sim).

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| signer_id | UUID FK | → envelope_signers (opcional) |
| signer_name | VARCHAR(255) | |
| signer_email | VARCHAR(255) | |
| token | VARCHAR(128) | Token único URL-safe |
| status | VARCHAR(30) | pending, signed, expired |
| signed_at | DateTime | |
| expires_at | DateTime | 7 días |

#### signing_provider_config

| Columna | Tipo | Descripción |
|---|---|---|
| id | Integer PK | Siempre 1 (registro único) |
| provider | VARCHAR(30) | `email_sim` o `docusign` (actualmente: `docusign`) |
| updated_by | UUID | |
| updated_at | DateTime | |

#### envelope_form_snapshots

Snapshot inmutable del formulario en cada envío del cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| version | Integer | 1, 2, 3... por cada reenvío |
| form_data | JSON | |
| submitted_by_user_id | UUID | |
| submitted_by_name | VARCHAR(255) | |
| submitted_at | DateTime | |

#### envelope_status_logs

Bitácora inmutable de cada cambio de estado.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| from_status | VARCHAR(50) | null en creación |
| to_status | VARCHAR(50) | |
| changed_by_user_id | UUID | |
| changed_by_name | VARCHAR(255) | Desnormalizado |
| changed_by_role | VARCHAR(100) | |
| reason | Text | Requerido en rechazos y correcciones |
| changed_at | DateTime | |
| ip_address | VARCHAR(45) | |

#### envelope_time_tracking

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| status | VARCHAR(50) | Estado medido |
| responsible_user_id | UUID | |
| responsible_user_name | VARCHAR(255) | |
| started_at | DateTime | |
| ended_at | DateTime | null si es estado actual |
| duration_minutes | Integer | |

#### envelope_comments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| author_user_id | UUID | |
| author_name | VARCHAR(255) | |
| author_role | VARCHAR(100) | |
| body | Text | |
| is_internal | Boolean | **True = solo lo ve el equipo legal** |
| created_at | DateTime | |
| is_deleted | Boolean | |

#### envelope_attachments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| attachment_def_id | UUID FK | → contract_type_attachment_defs (opcional) |
| original_name | VARCHAR(255) | Renombrado con nombre del def al subir |
| stored_name | VARCHAR(255) | Nombre con UUID en MinIO |
| object_key | VARCHAR(500) | Ruta completa en MinIO |
| bucket | VARCHAR(100) | `dirdoc` |
| mime_type | VARCHAR(100) | |
| extension | VARCHAR(20) | |
| size_bytes | BigInteger | |
| checksum | VARCHAR(64) | SHA256 |
| description | Text | |
| uploaded_by_user_id | UUID | |
| uploaded_by_name | VARCHAR(255) | |
| uploaded_at | DateTime | |
| version_number | Integer | 1, 2, 3... |
| is_current | Boolean | **True = versión activa** |
| document_type | VARCHAR(50) | contrato, ine, pasaporte, etc. |
| replaced_at / replaced_by_user_id / replaced_by_name / replaced_reason | | Auditoría de reemplazo |
| is_deleted | Boolean | |

> **Regla de versionado DocuSign:** cuando se archiva el PDF firmado, solo los adjuntos con `mime_type=application/pdf` se marcan `is_current=False`. Los anexos (INE, pasaporte, etc.) NO se afectan — no hubo nueva versión de ellos en DocuSign.
> **Visibilidad frontend:** versiones anteriores (`is_current=False`) solo las ven roles `!== 'solicitante'`.

#### envelope_attachment_logs

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| attachment_id | UUID FK | |
| envelope_id | UUID | |
| action | VARCHAR(50) | uploaded, downloaded, deleted |
| performed_by_user_id | UUID | |
| performed_by_name | VARCHAR(255) | |
| performed_at | DateTime | |
| ip_address | VARCHAR(45) | |
| detail | JSON | |

#### envelope_activity_logs

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | |
| envelope_id | UUID FK | |
| action | VARCHAR(100) | created, submitted, viewed, lawyer_reassigned, lawyer_started_review, approved, rejected, corrections_requested, attachment_uploaded, **docusign_signing_completed**, **signed_document_archived**, **envelope_completed** |
| performed_by_user_id | UUID | |
| performed_by_name | VARCHAR(255) | |
| performed_by_role | VARCHAR(100) | |
| performed_at | DateTime | |
| ip_address | VARCHAR(45) | |
| detail | JSON | |

#### folio_sequences

| Columna | Tipo | Descripción |
|---|---|---|
| year | Integer UNIQUE | 2026, 2027... |
| last_sequence | Integer | Último número usado |

---

### 2. Máquina de estados

```
borrador
  │
  ▼ [POST /submit — SLA inicia aquí]
pendiente_legal
  │               │               │
  ▼ [aprobar]     ▼ [correcciones] ▼ [rechazar]
en_firmas    pendiente_cliente   rechazado ← inmutable, SLA cierra
  │               │
  │               ▼ [cliente reenvía]
  │          en_revision_legal
  │               │               │
  │               ▼ [aprobar]     ▼ [rechazar]
  │          en_firmas         rechazado
  │
  ▼ [todos los firmantes firman en DocuSign]
completado ← SLA cierra, sla_closed_at = now
```

#### Transiciones válidas

| Desde | Hacia | Quién |
|---|---|---|
| borrador | pendiente_legal | solicitante (POST /submit) |
| pendiente_legal | en_revision_legal | abogado asignado (al abrir) |
| pendiente_legal | pendiente_cliente | abogado |
| pendiente_legal | en_firmas | abogado |
| pendiente_legal | rechazado | abogado |
| en_revision_legal | pendiente_cliente | abogado |
| en_revision_legal | en_firmas | abogado |
| en_revision_legal | rechazado | abogado |
| pendiente_cliente | en_revision_legal | solicitante (al reenviar) |
| en_firmas | completado | sistema (DocuSign webhook/polling) |

#### Reglas del SLA

- El contador arranca en `submitted_at` (primer envío)
- Plazo: 3 días hábiles (lunes a viernes, sin festivos México) — configurable por tipo
- **Nunca se pausa ni reinicia** mientras el sobre esté abierto
- Se cierra en `completado` o `rechazado` — `sla_closed_at` se guarda en BD
- Reasignación entre abogados no reinicia el contador
- **Semáforo frontend:** verde (+1 día), amarillo (≤1 día), rojo (vencido)
- **Sobres cerrados frontend:** semáforo gris (`bg-slate-300`), tiempo congelado en `sla_closed_at`, color texto `text-slate-400`

---

### 3. DocuSign — Integración completa ✅

#### Estado actual

| Funcionalidad | Estado |
|---|---|
| Token JWT Grant | ✅ Funcionando |
| Crear sobre y enviar correos | ✅ Funcionando |
| Auto-construcción de firmantes desde form_data | ✅ Funcionando |
| Webhook DocuSign Connect | ✅ Funcionando (HTTP 200) |
| Polling cada 5 min (cron) | ✅ Configurado |
| Descarga PDF firmado de DocuSign | ✅ Funcionando |
| Archivo en MinIO | ✅ Funcionando |
| Logs de actividad automáticos | ✅ Funcionando |
| IPs DocuSign en firewall corporativo | ⏳ Ticket con IT pendiente |

#### Configuración DocuSign Connect

- Config ID: `22211442`
- URL: `https://intranet.avalanz.com/api/v1/legal/envelopes/docusign/webhook`
- Evento: `Envelope Signed/Completed`
- Data incluida: `Recipients`
- Formato: REST v2.1
- IPs sandbox NA a abrir en firewall: `54.240.115.126-137`, `161.38.201.200/29`, puerto 443 entrante

#### Crontabs en servidor

```bash
# Ver crontabs activos
crontab -l

# SLA flags — cada día a las 11 AM
0 11 * * * docker exec avalanz-legal curl -s -X POST http://localhost:8000/api/v1/legal/envelopes/internal/update-sla-flags > /dev/null 2>&1

# DocuSign polling — cada 5 minutos (respaldo si el webhook falla)
*/5 * * * * docker exec avalanz-legal curl -s -X POST http://localhost:8000/api/v1/legal/envelopes/internal/docusign-poll > /dev/null 2>&1
```

#### Flujo de firma completo

```
1. Abogado hace clic en "Aprobar" en el frontend
   → handleApprove() encadena approve() + sendForSigning() automáticamente

2. signing_service._send_docusign():
   a. Descarga PDF del contrato de MinIO con boto3 (S3 API directa)
   b. Busca firmantes en BD (envelope_signers)
      - Si no hay firmantes → auto-construye desde form_data + signers_definition del fields.json
      - Guarda los firmantes auto-construidos en BD
   c. docusign_service.create_envelope() → JWT Grant → POST /envelopes
   d. Guarda docusign_envelope_id en BD
   e. DocuSign envía correos a firmantes con routing_order secuencial

3. Cuando todos firman → DocuSign hace POST /envelopes/docusign/webhook
   → _process_completed_envelope():
      a. Marca PDFs anteriores como is_current=False (solo mime_type=application/pdf)
      b. Descarga PDF firmado de DocuSign usando documentId="1" (no GUID — el GUID da 404)
      c. Sube PDF firmado a MinIO: {company_slug}/legal/envelopes/{folio}/firmado/{uuid}_{folio}_firmado.pdf
      d. Registra en envelope_attachments (is_current=True, extension="pdf")
      e. Actualiza firmantes a status="signed", signed_at=now
      f. envelope.status = "completado", sla_closed_at=now, completed_at=now
      g. 3 logs de actividad: docusign_signing_completed, signed_document_archived, envelope_completed

4. Si el webhook falla → el cron cada 5 min detecta el sobre completado y lo procesa igual
```

#### Funciones de docusign_service.py

| Función | Descripción |
|---|---|
| `get_access_token()` | JWT Grant → Bearer token. Cacheado con margen de 60s |
| `create_envelope(pdf_bytes, folio, contract_type_name, signers)` | Crea y envía el sobre. Retorna `docusign_envelope_id` |
| `get_envelope_status(docusign_envelope_id)` | Consulta estado del sobre |
| `download_signed_document(docusign_envelope_id)` | Descarga PDF firmado usando `documentId="1"` — **NO usar documentIdGuid (da 404)** |
| `verify_webhook_payload(payload)` | Valida payload REST v2.1 — busca `envelopeId` en `data.envelopeId` o raíz |

#### Auto-construcción de firmantes desde el formulario

Cuando no hay firmantes en BD, `signing_service._send_docusign()` los construye desde `form_data` + `signers_definition` del `fields.json`:

```json
// fields.json — signers_definition (NDA Mutuo)
"signers_definition": [
  {
    "routing_order": 1,
    "role_in_document": "Representante Legal Parte A",
    "signer_type": "internal",
    "sign_here_anchor": "*FIRMA1*",
    "full_name_anchor": "*NOMBRE1*",
    "date_signed_anchor": "*FECHA_FIRMA1*",
    "name_field": "NOMBRE_FIRMANTE_1",
    "email_field": "EMAIL_FIRMANTE_1",
    "role_field": "CARGO_FIRMANTE_1"
  },
  {
    "routing_order": 2,
    "role_in_document": "Representante Legal Parte B",
    "signer_type": "external",
    "sign_here_anchor": "*FIRMA2*",
    "full_name_anchor": "*NOMBRE2*",
    "date_signed_anchor": "*FECHA_FIRMA2*",
    "name_field": "NOMBRE_FIRMANTE_2",
    "email_field": "EMAIL_FIRMANTE_2",
    "role_field": "CARGO_FIRMANTE_2"
  }
]
```

#### Anclas de firma en template.html

```html
<!-- Texto invisible color blanco sobre fondo blanco — DocuSign lo detecta -->
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA2*</span>
```

---

### 4. Proveedores de firma

#### email_sim
Manda correos con links únicos a cada firmante vía `email-service`. Cuando todos confirman, el sobre pasa a `completado`.

#### docusign (activo actualmente)
Integración completa con DocuSign eSignature sandbox. Ver sección anterior.

#### Cambiar proveedor

```
GET /api/v1/legal/envelopes/signing/provider
POST /api/v1/legal/envelopes/signing/provider
{ "provider": "email_sim" | "docusign" }
```

---

### 5. Lógica de balanceo de abogados

Al primer envío del sobre:

1. Obtener lista de abogados activos asignados al tipo de contrato (`lawyer_assignments`)
2. Contar sobres pendientes **no atrasados** de cada abogado
3. Asignar al que tenga menos pendientes no atrasados
4. En empate: asignar al que lleva más tiempo sin recibir un sobre nuevo

> Los pendientes atrasados no cuentan en el balanceo.

---

### 6. Estructura MinIO

```
dirdoc/
└── {company_slug}/              → slug de la empresa (ej: agim, sppel, buro-regional)
    └── legal/
        └── envelopes/
            └── {folio}/         → ej: ENV-2026-0054
                ├── {uuid}_{folio}_contrato.pdf         → PDF generado al enviar
                ├── firmado/
                │   └── {uuid}_{folio}_firmado.pdf      → PDF firmado archivado por DocuSign
                └── attachments/
                    └── {uuid}_{folio}_{nombre}.{ext}   → anexos del cliente
```

El `company_slug` se obtiene del `object_key` del PDF original del sobre (primer segmento de la ruta) para garantizar consistencia.

---

### 7. Endpoints completos

#### Tipos de contrato (routes.py)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/types | Todos | Listar tipos activos |
| GET | /envelopes/types/{id} | Todos | Detalle con campos y anexos |
| POST | /envelopes/types | coordinador_legal, super_admin | Crear tipo |
| PATCH | /envelopes/types/{id} | coordinador_legal, super_admin | Actualizar tipo |
| GET | /envelopes/types/{id}/attachments | Todos | Anexos del tipo |
| POST | /envelopes/types/{id}/lawyers | coordinador_legal, super_admin | Asignar abogado |
| DELETE | /envelopes/lawyers/assignments/{id} | coordinador_legal, super_admin | Desactivar asignación |
| GET | /envelopes/lawyers | coordinador_legal, super_admin | Listar abogados disponibles |

#### Templates (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /envelopes/contract-templates | Catálogo de templates (index.json) |
| GET | /envelopes/contract-templates/{slug}/fields | Campos del formulario |
| POST | /envelopes/contract-templates/{slug}/preview | Preview HTML |
| POST | /envelopes/contract-templates/{slug}/preview-pdf | Preview PDF (WeasyPrint) |

#### Sobres (routes.py)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes | Todos (filtrado por rol) | Listar sobres paginados (8/página) |
| POST | /envelopes | Todos | Crear sobre en borrador |
| GET | /envelopes/{id} | Todos (filtrado por rol) | Detalle completo con trazabilidad |
| POST | /envelopes/{id}/submit | solicitante, super_admin | Enviar al área legal |
| POST | /envelopes/{id}/approve | abogado, coordinador, super_admin | Aprobar → en_firmas |
| POST | /envelopes/{id}/request-corrections | abogado, coordinador, super_admin | Pedir correcciones |
| POST | /envelopes/{id}/reject | abogado, coordinador, super_admin | Rechazar |
| POST | /envelopes/{id}/complete | abogado, coordinador, super_admin | Marcar completado |
| POST | /envelopes/{id}/reassign | coordinador, super_admin | Reasignar abogado |
| PATCH | /envelopes/{id}/assign-lawyer | coordinador, super_admin | Asignar abogado (JSON) |

#### Firmantes (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /envelopes/{id}/signers | Listar firmantes del sobre |
| POST | /envelopes/{id}/signers | Agregar firmante (solo borrador/pendiente_cliente) |
| PATCH | /envelopes/{id}/signers/{sid} | Actualizar firmante |
| DELETE | /envelopes/{id}/signers/{sid} | Eliminar firmante |

#### Adjuntos (routes.py)

El endpoint POST recibe JSON (no multipart). El archivo ya fue subido al upload-service previamente.

| Método | Ruta | Descripción |
|---|---|---|
| POST | /envelopes/{id}/attachments | Registrar metadatos de archivo |
| GET | /envelopes/{id}/attachments | Listar archivos del sobre |

> Si se sube un archivo del mismo `attachment_def_id`, la versión anterior se marca `is_current=False`.
> Renombrado: el frontend usa `${folio}_${def.name}.${ext}` usando el nombre del `attachmentDef`.

#### Trazabilidad (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /envelopes/{id}/comments | Listar comentarios |
| POST | /envelopes/{id}/comments | Agregar comentario |
| GET | /envelopes/{id}/status-log | Historial de estados |
| GET | /envelopes/{id}/time-tracking | Tiempo por estado |
| GET | /envelopes/{id}/activity-log | Log completo de actividad |
| GET | /envelopes/{id}/form-snapshots | Versiones del formulario |

#### Firma (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /envelopes/signing/provider | Ver proveedor activo |
| POST | /envelopes/signing/provider | Cambiar proveedor |
| POST | /envelopes/{id}/send-for-signing | Enviar a firma con proveedor activo |
| GET | /envelopes/signing/confirm/{token} | Confirmar firma email_sim — sin auth |

#### Reportes e internos (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /envelopes/reports/sla | Reporte SLA actual |
| POST | /envelopes/internal/update-sla-flags | Cron diario SLA — sin auth |

#### DocuSign (docusign_routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| POST | /envelopes/docusign/webhook | Webhook DocuSign Connect — sin auth JWT |
| POST | /envelopes/internal/docusign-poll | Polling cada 5 min — sin auth JWT |

---

### 8. Flujo de creación de un sobre (frontend)

```
1. Stepper 5 pasos:
   Paso 1: Tipo de contrato → GET /envelopes/contract-templates
   Paso 2: Datos del formulario (incluye EMAIL_FIRMANTE_1 y EMAIL_FIRMANTE_2)
   Paso 3: Anexos → GET /envelopes/types/{contract_type_id}/attachments
           → Renombra archivos: ${folio}_${def.name}.${ext}
   Paso 4: Preview del contrato → POST /envelopes/contract-templates/{slug}/preview
   Paso 5: Confirmar y enviar

2. Al hacer submit:
   a. POST /envelopes → crear sobre → obtener envelope_id, folio
   b. POST /envelopes/contract-templates/{slug}/preview-pdf → generar PDF
      → uploadToStorage (upload-service) → MinIO
      → POST /envelopes/{id}/attachments → registrar metadatos
   c. Para cada anexo:
      → uploadToStorage → MinIO
      → POST /envelopes/{id}/attachments → registrar metadatos
   d. POST /envelopes/{id}/submit → sobre pasa a pendiente_legal
   e. Redirigir a lista de sobres
```

---

### 9. Visibilidad por rol

| Dato | solicitante | abogado | coordinador | director | super_admin |
|---|---|---|---|---|---|
| Ver sobres | Solo su empresa | Solo asignados | Todos | Todos | Todos |
| Columna Empresa / Solicitante | ❌ | ❌ | ✅ | ✅ | ✅ |
| Columna Abogado | ❌ | ❌ | ✅ | ✅ | ✅ |
| Comentarios internos | ❌ | ✅ | ✅ | ✅ | ✅ |
| Time tracking | ❌ | ❌ | ✅ | ❌ | ✅ |
| Activity log | ❌ | ❌ | ✅ | ❌ | ✅ |
| Form snapshots | ❌ | ✅ | ✅ | ❌ | ✅ |
| KPIs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Botón nuevo sobre | ✅ | ❌ | ❌ | ❌ | ✅ |
| Asignar abogado | ❌ | ❌ | ✅ | ❌ | ✅ |
| Aprobar / Rechazar / Correcciones | ❌ | ✅ | ✅ | ❌ | ✅ |
| Ver documentos y descargar | ✅ | ✅ | ✅ | ✅ | ✅ |
| Versiones anteriores de documentos | ❌ | ✅ | ✅ | ✅ | ✅ |

---

### 10. Trazabilidad

#### activity_log — acciones registradas

| Acción | Quién | Descripción |
|---|---|---|
| created | solicitante | Sobre creado |
| submitted | solicitante | Enviado al área legal |
| viewed | cualquiera | Apertura del slide-over |
| lawyer_reassigned | coordinador | Asignación / reasignación de abogado |
| lawyer_started_review | abogado asignado | Abogado abrió el sobre |
| approved | abogado | Sobre aprobado |
| rejected | abogado | Sobre rechazado |
| corrections_requested | abogado | Correcciones solicitadas |
| attachment_uploaded | solicitante | Documento adjuntado |
| docusign_signing_completed | sistema | Todos los firmantes completaron |
| signed_document_archived | sistema | PDF firmado archivado en MinIO |
| envelope_completed | sistema | Sobre marcado como completado |

#### time_tracking — estados medidos

| Status | Responsable |
|---|---|
| borrador | solicitante |
| pendiente_legal | coordinador |
| en_revision_legal | coordinador |
| revision_abogado | abogado asignado |

---

### 11. Admin-service — Endpoint interno

```
GET http://admin-service:8000/internal/users/by-module-role
    ?module_slug=legal&role_slug=abogado
```

Devuelve: `[{"id": "uuid", "name": "Nombre completo", "email": "email@empresa.com"}]`

No requiere autenticación — solo accesible dentro de la red Docker.

---

### 12. Migraciones Alembic

```bash
export DB_HOST=$(docker inspect avalanz-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export DB_PORT=5432 DB_USER=avalanz_user DB_NAME=avalanz_legal
cd ~/intranet-avalanz/backend/modules/legal-service
alembic current
alembic upgrade head
alembic revision --autogenerate -m "descripcion"
```

> El `env.py` lee variables de entorno — nunca el `alembic.ini`.
> Para renombrar tablas usar `op.rename_table()` manual — NUNCA `--autogenerate`.

---

### 13. Datos de prueba en servidor

```sql
-- Conectar: docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal

-- Tipo de contrato
SELECT id, name, slug, sla_business_days FROM contract_types;
-- 11111111-1111-1111-1111-111111111111: NDA Mutuo, 3 días

-- Sobres recientes
SELECT folio, status, company_name, docusign_envelope_id, completed_at
FROM envelopes WHERE is_deleted=false ORDER BY created_at DESC LIMIT 10;
```

Usuarios con roles de módulo Legal:

| Usuario | Email | Rol |
|---|---|---|
| LOURDES RUIZ RAMOS | soporte@avalanz.com | coordinador_legal |
| FELIPE GONZALEZ MARTINEZ | abraham_covarrubias@cnci.com.mx | abogado |

Eliminar cuando inicie operación real:

```sql
DELETE FROM envelope_activity_logs;
DELETE FROM envelope_time_tracking;
DELETE FROM envelope_status_logs;
DELETE FROM envelope_form_snapshots;
DELETE FROM envelope_signing_tokens;
DELETE FROM envelope_signers;
DELETE FROM envelope_attachments;
DELETE FROM envelope_comments;
DELETE FROM envelopes;
DELETE FROM folio_sequences;
DELETE FROM contract_type_attachment_defs;
DELETE FROM lawyer_assignments;
DELETE FROM contract_type_fields;
DELETE FROM contract_types;
```

---

### 14. Comandos frecuentes

```bash
# Tokens de prueba
TOKEN=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

TOKEN_L=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"soporte@avalanz.com","password":"Avalanz01*"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Deploy backend legal (cambios puntuales)
cd ~/intranet-avalanz/backend/modules/legal-service
docker cp contract_requests/routes.py avalanz-legal:/app/contract_requests/routes.py
docker cp contract_requests/docusign_routes.py avalanz-legal:/app/contract_requests/docusign_routes.py
docker restart avalanz-legal && sleep 5 && docker logs avalanz-legal --tail 6

# Deploy frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Rebuild completo del contenedor legal
cd ~/intranet-avalanz/infrastructure/docker
docker compose build --no-cache legal-service
docker compose up -d legal-service

# Polling manual DocuSign
docker exec avalanz-legal curl -s -X POST \
  "http://localhost:8000/api/v1/legal/envelopes/internal/docusign-poll" | python3 -m json.tool

# Probar DocuSign token
docker exec avalanz-legal python3 -c "
import asyncio, sys; sys.path.insert(0, '/app')
from contract_requests.docusign_service import get_access_token
print('TOKEN OK:', asyncio.run(get_access_token())[:30])
"

# MinIO CLI
docker exec avalanz-minio mc alias set local http://localhost:9000 \
  AvalanzMinIO2026 55520173966a34f64caa19e807985392b0e90dff
docker exec avalanz-minio mc ls --recursive local/dirdoc/

# Recargar Nginx
docker exec avalanz-nginx nginx -s reload

# Ver logs
docker logs avalanz-legal --tail 30 2>&1 | grep -i "webhook\|docusign\|completado\|error"

# Ver estado general
docker ps --format "table {{.Names}}\t{{.Status}}"
pm2 status
```

---

### 15. Pendientes técnicos

Ver `docs/modules/legal/tech-debt-legal.md` para el listado completo.

#### Pendientes inmediatos
- Panel de firmantes en slide-over (sección debajo de Documentos con status badge)
- Notificaciones push (sobre en firmas, firma completada, asignación de abogado)
- Auto-refresh de tabla sin recargar página

#### Pendientes funcionales
- Versiones anteriores de documentos visibles en slide-over
- Página pública `/firmar/{token}` en el frontend para confirmación de firma (email_sim)
- Reporte SLA diario por correo (cron 11 AM)
- Panel KPIs para coordinador y director

#### Pendientes de infraestructura
- Rebuild imagen Docker con todos los cambios permanentes (boto3 ya en requirements.txt)
- Apertura de IPs DocuSign en firewall corporativo (ticket IT pendiente)
- Go-Live DocuSign a producción (cambiar BASE_URI y AUTH_SERVER en .env)

#### Pendientes de configuración
- Crear tipos de contrato reales (eliminar UUIDs hardcodeados `11111111...`)
- Migrar campos del formulario de `fields.json` a `contract_type_fields` en BD
- UI de administración de templates para coordinador

#### Pendientes futuros
- Integración NOM-151 con proveedor certificado
- Intercompany contracts (v2)
- Submódulo Archivo de Secretaría Corporativa