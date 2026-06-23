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
│   ├── main.py                     → FastAPI app, middlewares, routers
│   ├── config.py                   → Variables de entorno + FRONTEND_URL + EMAIL_SERVICE_URL
│   ├── database.py                 → Motor async SQLAlchemy, sesión
│   └── ...
├── contract_requests/              → Submódulo: Solicitud de Contratos
│   ├── __init__.py
│   ├── models.py                   → 18+ tablas SQLAlchemy
│   ├── schemas.py                  → Modelos Pydantic request/response
│   ├── service.py                  → Lógica de negocio, SLA, balanceo
│   ├── routes.py                   → Endpoints FastAPI — prefijo /envelopes
│   └── signing_service.py         → Proveedores de firma (email_sim / docusign)
├── templates/
│   ├── index.json                  → Catálogo de templates con contract_type_id
│   └── nda-mutuo/
│       ├── template.html           → HTML del contrato con variables {{CAMPO}}
│       └── fields.json             → Campos del formulario (temporal — migrar a BD)
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
│       └── d3a02f07031f            → Add version tracking to envelope_attachments
├── Dockerfile
├── requirements.txt                → weasyprint==57.2, pydyf==0.6.0, asyncpg, httpx
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
| HTTP interno | httpx (llamadas a admin-service y email-service) |
| JWT | shared/middleware/jwt_validator.py |

---

## Configuración (.env)

```env
SERVICE_NAME=legal-service
SERVICE_VERSION=1.0.0
DEBUG=False
DATABASE_URL=postgresql+asyncpg://avalanz_user:<password>@postgres:5432/avalanz_legal
JWT_SECRET_KEY=<misma_clave_que_auth_service>
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
FRONTEND_URL=https://intranet.avalanz.com
EMAIL_SERVICE_URL=http://email-service:8000
LOG_LEVEL=INFO
LOG_FORMAT=json
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

> **Crítico:** El contexto del build en `docker-compose.yml` debe ser `../../backend` para que el `COPY shared/` funcione. WeasyPrint requiere las librerías `libpango`, `libcairo`, `libgdk-pixbuf-xlib` y `fonts-liberation`.

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
    """Valida roles normalizando prefijos de módulo (ej: legal:abogado → abogado)."""
    from fastapi import Depends
    from typing import Dict, Any
    def dependency(payload: Dict[str, Any] = Depends(_validator.get_current_user())) -> Dict[str, Any]:
        user_roles = [r.split(":")[-1] for r in payload.get("roles", [])]
        if not any(role in roles for role in user_roles):
            raise Exception(f"Se requiere uno de los siguientes roles: {', '.join(roles)}")
        return payload
    return dependency
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
Catálogo de tipos de contrato administrado por el equipo legal.

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
| id | UUID | Llave primaria |
| contract_type_id | UUID FK | Referencia a contract_types |
| label | VARCHAR(255) | Etiqueta del campo |
| field_key | VARCHAR(100) | Clave del campo en el JSON |
| field_type | VARCHAR(50) | text, textarea, date, select, number |
| options | JSON | Opciones para campos select |
| is_required | Boolean | Si es obligatorio |
| display_order | Integer | Orden de visualización |

#### contract_type_attachment_defs
Definición de anexos requeridos y opcionales por tipo de contrato.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_type_id | UUID FK | Referencia a contract_types |
| name | VARCHAR(255) | Nombre del anexo |
| description | Text | Descripción opcional |
| is_required | Boolean | Si es obligatorio |
| allowed_mime_types | JSON | Tipos MIME permitidos |
| display_order | Integer | Orden de visualización |

#### lawyer_assignments
Asignación de usuarios con rol abogado a tipos de contrato.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| lawyer_user_id | UUID | UUID del usuario en avalanz_admin |
| lawyer_name | VARCHAR(255) | Nombre desnormalizado |
| lawyer_email | VARCHAR(255) | Email desnormalizado |
| contract_type_id | UUID FK | Referencia a contract_types |
| is_active | Boolean | Si recibe nuevos sobres de este tipo |
| assigned_by | UUID | Coordinador que hizo la asignación |

#### envelopes
Sobre principal con máquina de estados y trazabilidad completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| folio | VARCHAR(20) | Folio autogenerado — ENV-2026-0001 |
| company_id | UUID | Empresa del solicitante |
| company_name | VARCHAR(255) | Slug de la empresa (desnormalizado desde admin-service) |
| requested_by_user_id | UUID | Usuario que creó el sobre |
| requested_by_name | VARCHAR(255) | Nombre desnormalizado |
| requested_by_email | VARCHAR(255) | Email desnormalizado |
| contract_type_id | UUID FK | Referencia a contract_types |
| contract_type_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_id | UUID | Abogado asignado |
| assigned_lawyer_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_email | VARCHAR(255) | Email desnormalizado |
| assigned_at | DateTime | Cuándo se asignó |
| status | Enum | Estado actual |
| form_data | JSON | Datos del formulario dinámico |
| counterparty_name | VARCHAR(255) | Nombre de la contraparte |
| counterparty_email | VARCHAR(255) | Email de la contraparte |
| is_open_request | Boolean | Si es solicitud abierta sin template |
| open_request_description | Text | Descripción de solicitud abierta |
| submitted_at | DateTime | Primer envío del cliente — inicia SLA |
| sla_due_at | DateTime | Fecha límite calculada |
| sla_closed_at | DateTime | Cuándo se cerró el SLA |
| is_sla_breached | Boolean | Si el SLA fue incumplido |
| is_intercompany | Boolean | Si es contrato entre empresas del grupo |
| counterparty_company_id | UUID | Empresa contraparte interna |
| created_at | DateTime | Fecha de creación |
| completed_at | DateTime | Fecha de cierre |
| is_deleted | Boolean | Soft delete |

#### envelope_signers
Firmantes del sobre.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| signer_type | VARCHAR(20) | internal o external |
| user_id | UUID | UUID en avalanz si es firmante interno |
| name | VARCHAR(255) | Nombre del firmante |
| email | VARCHAR(255) | Email del firmante |
| role_in_document | VARCHAR(100) | Representante Legal, Testigo, etc. |
| routing_order | Integer | Orden de firma en DocuSign |
| status | VARCHAR(30) | pending, sent, signed, declined |
| signed_at | DateTime | Cuándo firmó |
| declined_reason | Text | Motivo del rechazo |
| docs_requested | JSON | Docs a solicitar al firmante |
| docs_received | JSON | Docs recuperados de DocuSign |
| created_at | DateTime | Fecha de creación |
| updated_at | DateTime | Última actualización |

#### envelope_signing_tokens
Tokens únicos por firmante para simulación de firma por correo (email_sim).

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| signer_id | UUID FK | Referencia a envelope_signers (opcional) |
| signer_name | VARCHAR(255) | Nombre del firmante |
| signer_email | VARCHAR(255) | Email del firmante |
| token | VARCHAR(128) | Token único URL-safe (índice único) |
| status | VARCHAR(30) | pending, signed, expired |
| signed_at | DateTime | Cuándo firmó |
| expires_at | DateTime | Expiración del link (7 días) |
| created_at | DateTime | Fecha de creación |

#### signing_provider_config
Configuración del proveedor de firma — una sola fila con id=1.

| Columna | Tipo | Descripción |
|---|---|---|
| id | Integer | PK (siempre 1) |
| provider | VARCHAR(30) | email_sim o docusign |
| updated_by | UUID | Quién cambió el proveedor |
| updated_at | DateTime | Cuándo se cambió |

#### envelope_form_snapshots
Snapshot inmutable del formulario en cada envío del cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| version | Integer | Número de versión (1, 2, 3...) |
| form_data | JSON | Datos del formulario en ese momento |
| submitted_by_user_id | UUID | Quién envió |
| submitted_by_name | VARCHAR(255) | Nombre desnormalizado |
| submitted_at | DateTime | Fecha del envío |

#### envelope_status_logs
Bitácora inmutable de cada cambio de estado.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| from_status | VARCHAR(50) | Estado anterior (null en creación) |
| to_status | VARCHAR(50) | Estado nuevo |
| changed_by_user_id | UUID | Quién hizo el cambio |
| changed_by_name | VARCHAR(255) | Nombre desnormalizado |
| changed_by_role | VARCHAR(100) | Rol en el momento del cambio |
| reason | Text | Motivo (requerido en rechazos y correcciones) |
| changed_at | DateTime | Fecha exacta del cambio |
| ip_address | VARCHAR(45) | IP desde donde se hizo el cambio |

#### envelope_time_tracking
Tiempo transcurrido en cada estado por usuario — para medición de SLA por abogado.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| status | VARCHAR(50) | Estado medido (borrador, pendiente_legal, en_revision_legal, revision_abogado) |
| responsible_user_id | UUID | Usuario responsable en ese estado |
| responsible_user_name | VARCHAR(255) | Nombre desnormalizado |
| started_at | DateTime | Cuándo entró a este estado |
| ended_at | DateTime | Cuándo salió (null si es el estado actual) |
| duration_minutes | Integer | Minutos calculados al cerrar |

#### envelope_comments
Comentarios en el sobre — internos (solo legal) o públicos.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| author_user_id | UUID | Autor del comentario |
| author_name | VARCHAR(255) | Nombre desnormalizado |
| author_role | VARCHAR(100) | Rol en el momento del comentario |
| body | Text | Contenido del comentario |
| is_internal | Boolean | True = solo lo ve el equipo legal |
| created_at | DateTime | Fecha de creación |
| is_deleted | Boolean | Soft delete |

#### envelope_attachments
Archivos adjuntos al sobre con versionado y auditoría completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| attachment_def_id | UUID FK | Referencia a contract_type_attachment_defs (opcional) |
| original_name | VARCHAR(255) | Nombre original del archivo |
| stored_name | VARCHAR(255) | Nombre con UUID en MinIO |
| object_key | VARCHAR(500) | Ruta completa en MinIO |
| bucket | VARCHAR(100) | Bucket de MinIO (dirdoc) |
| mime_type | VARCHAR(100) | Tipo MIME |
| extension | VARCHAR(20) | Extensión del archivo |
| size_bytes | BigInteger | Tamaño en bytes |
| checksum | VARCHAR(64) | Hash SHA256 |
| description | Text | Descripción opcional |
| uploaded_by_user_id | UUID | Quién subió el archivo |
| uploaded_by_name | VARCHAR(255) | Nombre desnormalizado |
| uploaded_at | DateTime | Fecha de subida |
| version_number | Integer | Versión del archivo (1, 2, 3...) |
| is_current | Boolean | True solo en la versión activa |
| document_type | VARCHAR(50) | contrato, ine, pasaporte, etc. |
| replaced_at | DateTime | Cuándo fue reemplazado |
| replaced_by_user_id | UUID | Quién subió la nueva versión |
| replaced_by_name | VARCHAR(255) | Nombre desnormalizado |
| replaced_reason | Text | Motivo del reemplazo |
| is_deleted | Boolean | Soft delete |

#### envelope_attachment_logs
Auditoría de cada acción sobre archivos adjuntos.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| attachment_id | UUID FK | Referencia a envelope_attachments |
| envelope_id | UUID | Referencia al sobre |
| action | VARCHAR(50) | uploaded, downloaded, deleted |
| performed_by_user_id | UUID | Quién realizó la acción |
| performed_by_name | VARCHAR(255) | Nombre desnormalizado |
| performed_at | DateTime | Fecha exacta |
| ip_address | VARCHAR(45) | IP |
| detail | JSON | Datos extra |

#### envelope_activity_logs
Log general de toda actividad — vistas, descargas, ediciones, reasignaciones.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| action | VARCHAR(100) | created, submitted, viewed, lawyer_reassigned, lawyer_started_review, approved, rejected, corrections_requested, attachment_uploaded |
| performed_by_user_id | UUID | Quién realizó la acción |
| performed_by_name | VARCHAR(255) | Nombre desnormalizado |
| performed_by_role | VARCHAR(100) | Rol en el momento |
| performed_at | DateTime | Fecha exacta |
| ip_address | VARCHAR(45) | IP |
| detail | JSON | Datos extra |

#### folio_sequences
Contador autoincrementable por año para el folio ENV-YYYY-NNNN.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| year | Integer | Año (unique) |
| last_sequence | Integer | Último número usado |

---

### 2. Máquina de estados

```
[cliente crea + envía en un solo paso — borrador eliminado del flujo visible]
    │
    ▼ [POST /submit — SLA inicia aquí]
pendiente_legal
    │ [abogado asignado abre → en_revision_legal + time_tracking revision_abogado]
    │               │               │
    ▼ [aprobar]     ▼ [correcciones] ▼ [rechazar]
en_firmas    pendiente_cliente   rechazado ← inmutable
    │               │
    ▼               ▼ [cliente reenvía]
completado    en_revision_legal
                    │               │
                    ▼ [aprobar]     ▼ [rechazar]
               en_firmas       rechazado
```

#### Transiciones automáticas

| Evento | Transición | Notas |
|---|---|---|
| Abogado asignado abre sobre en `pendiente_legal` | → `en_revision_legal` | Solo el abogado asignado, no el coordinador |
| Coordinador abre sobre | Sin cambio de estado | Solo registra en `activity_log` |
| Todos los firmantes confirman | → `completado` | Automático al confirmar el último token |

#### Reglas del SLA

- El contador arranca cuando el cliente envía por primera vez (`submitted_at`)
- El plazo es 3 días hábiles (lunes a viernes, sin festivos México) — configurable por tipo
- El reloj **nunca se pausa ni reinicia** mientras el sobre esté abierto
- Se cierra únicamente cuando llega a `completado`, `rechazado` o `en_firmas`
- Si se reasigna entre abogados, el contador no se reinicia
- Semáforo: verde (+2 días hábiles restantes), amarillo (≤1 día), rojo (vencido)

#### Transiciones válidas

| Desde | Hacia | Quién |
|---|---|---|
| borrador | pendiente_legal | cliente (automático al submit) |
| pendiente_legal | en_revision_legal | abogado asignado (al abrir) |
| pendiente_legal | pendiente_cliente | abogado |
| pendiente_legal | en_firmas | abogado |
| pendiente_legal | rechazado | abogado |
| en_revision_legal | pendiente_cliente | abogado |
| en_revision_legal | en_firmas | abogado |
| en_revision_legal | rechazado | abogado |
| pendiente_cliente | en_revision_legal | cliente (al reenviar) |
| en_firmas | completado | sistema (al confirmar todos los tokens) |
| en_firmas | firmado_parcial | sistema |
| firmado_parcial | completado | sistema |

---

### 3. Proveedores de firma

#### email_sim (activo por defecto)
Manda correos con links únicos a cada firmante vía `email-service`. Cuando todos confirman, el sobre pasa automáticamente a `completado`.

#### docusign (placeholder)
Pendiente de implementar cuando se tengan credenciales de sandbox.

#### Cambiar proveedor
Solo `super_admin` o `admin_empresa` pueden cambiar:
```
POST /api/v1/legal/envelopes/signing/provider
{ "provider": "email_sim" | "docusign" }
```

---

### 4. Lógica de balanceo de abogados

Al primer envío de un sobre el sistema asigna automáticamente un abogado:

1. Obtiene lista de abogados activos asignados al tipo de contrato (`lawyer_assignments`)
2. Cuenta sobres pendientes **no atrasados** de cada abogado
3. Asigna al que tenga menos pendientes no atrasados
4. En empate: asigna al que lleva más tiempo sin recibir un sobre nuevo

> Los pendientes atrasados no cuentan en el balanceo.

**Nota:** El balanceo automático requiere que el abogado esté configurado en `lawyer_assignments` para el tipo de contrato. Si no hay abogados configurados, el sobre queda sin asignar (`assigned_lawyer_id = null`).

---

### 5. Estructura MinIO

```
dirdoc/
└── {company_slug}/              → slug de la empresa (ej: agim, sppel)
    └── legal/
        └── envelopes/
            └── {folio}/         → ej: ENV-2026-0039
                ├── {uuid}_{folio}_contrato.pdf       → PDF generado al enviar
                └── attachments/
                    └── {uuid}_{folio}_{nombre}.pdf   → anexos del cliente
```

El upload-service construye la ruta como: `{company_slug}/{module_slug}/{submodule_slug}/{uuid}_{filename}`.

Parámetros enviados al upload-service:
- Contrato PDF: `module_slug=legal`, `submodule_slug=envelopes/{folio}`, `company_slug={slug}`
- Anexos: `module_slug=legal`, `submodule_slug=envelopes/{folio}/attachments`, `company_slug={slug}`

El `company_slug` se obtiene del admin-service al crear el sobre usando el `company_id`. Se guarda como `company_name` en el sobre.

---

### 6. Endpoints

#### Tipos de contrato
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/types | Todos | Listar tipos activos |
| GET | /envelopes/types/{id} | Todos | Detalle con campos y anexos |
| POST | /envelopes/types | coordinador_legal, super_admin | Crear tipo |
| PATCH | /envelopes/types/{id} | coordinador_legal, super_admin | Actualizar tipo |
| GET | /envelopes/types/{id}/attachments | Todos | Anexos del tipo |
| POST | /envelopes/types/{id}/lawyers | coordinador_legal, super_admin | Asignar abogado a tipo |
| DELETE | /envelopes/lawyers/assignments/{id} | coordinador_legal, super_admin | Desactivar asignación |

#### Templates
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/contract-templates | Todos | Catálogo de templates (index.json) |
| GET | /envelopes/contract-templates/{slug}/fields | Todos | Campos del formulario |
| POST | /envelopes/contract-templates/{slug}/preview | Todos | Preview HTML |
| POST | /envelopes/contract-templates/{slug}/preview-pdf | Todos | Preview PDF (WeasyPrint) |

#### Abogados disponibles
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/lawyers | coordinador_legal, super_admin | Lista abogados activos en módulo legal |

> Consulta `http://admin-service:8000/internal/users/by-module-role?module_slug=legal&role_slug=abogado` internamente.

#### Sobres
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes | Todos (filtrado por rol) | Listar sobres paginados |
| POST | /envelopes | Todos | Crear sobre en borrador |
| GET | /envelopes/{id} | Todos (filtrado por rol) | Detalle completo con trazabilidad |
| POST | /envelopes/{id}/submit | solicitante, super_admin | Enviar al área legal |
| POST | /envelopes/{id}/approve | abogado, coordinador, super_admin | Aprobar → en_firmas |
| POST | /envelopes/{id}/request-corrections | abogado, coordinador, super_admin | Pedir correcciones |
| POST | /envelopes/{id}/reject | abogado, coordinador, super_admin | Rechazar |
| POST | /envelopes/{id}/complete | abogado, coordinador, super_admin | Marcar completado |
| POST | /envelopes/{id}/reassign | coordinador, super_admin | Reasignar abogado (Form multipart) |
| PATCH | /envelopes/{id}/assign-lawyer | coordinador, super_admin | Asignar abogado (JSON, solo lawyer_id) |

#### Attachments
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | /envelopes/{id}/attachments | Todos | Registrar metadatos de archivo (JSON) — el archivo ya subió al upload-service |
| GET | /envelopes/{id}/attachments | Todos | Listar archivos del sobre |

> El endpoint POST de attachments recibe JSON (no multipart). Si se sube un archivo del mismo `attachment_def_id`, la versión anterior se marca `is_current=false`.

#### Firma
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/signing/provider | Todos | Proveedor activo |
| POST | /envelopes/signing/provider | super_admin, admin_empresa | Cambiar proveedor |
| POST | /envelopes/{id}/send-for-signing | abogado, coordinador, super_admin | Enviar a firma |
| GET | /envelopes/signing/confirm/{token} | Sin auth | Confirmar firma desde link del correo |

---

### 7. Flujo de creación de un sobre (frontend)

```
1. Pantalla de selección de empresa (si super_admin o usuario con múltiples empresas)
   → Carga empresas activas: GET /api/v1/companies/?is_active=true&per_page=100

2. Stepper 5 pasos:
   Paso 1: Tipo de contrato → GET /envelopes/contract-templates
   Paso 2: Datos del formulario dinámico → GET /envelopes/contract-templates/{slug}/fields
   Paso 3: Anexos obligatorios → GET /envelopes/types/{contract_type_id}/attachments
   Paso 4: Preview del contrato → POST /envelopes/contract-templates/{slug}/preview (HTML)
   Paso 5: Confirmar y enviar

3. Al hacer submit:
   a. Ping al backend para refrescar token
   b. POST /envelopes → crear sobre → obtener envelope_id, folio, company_name
   c. POST /envelopes/contract-templates/{slug}/preview-pdf → generar PDF
      → uploadToStorage (upload-service) → subir PDF a MinIO
      → POST /envelopes/{id}/attachments → registrar metadatos (JSON)
   d. Para cada anexo:
      → uploadToStorage → subir a MinIO
      → POST /envelopes/{id}/attachments → registrar metadatos (JSON)
   e. POST /envelopes/{id}/submit → sobre pasa a pendiente_legal
   f. Redirigir a lista de sobres
```

---

### 8. Visibilidad por rol

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
| Asignar abogado (menú ...) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Aprobar / Rechazar / Correcciones | ❌ | ✅ | ✅ | ❌ | ✅ |
| Ver documentos y descargar | ✅ | ✅ | ✅ | ✅ | ✅ |

---

### 9. Trazabilidad

#### activity_log — acciones registradas

| Acción | Quién | Descripción |
|---|---|---|
| created | solicitante | Sobre creado |
| submitted | solicitante | Enviado al área legal |
| viewed | cualquiera | Apertura del slide-over (se filtra del historial visible) |
| lawyer_reassigned | coordinador | Asignación / reasignación de abogado |
| lawyer_started_review | abogado asignado | Abogado abrió el sobre por primera vez |
| approved | abogado | Sobre aprobado |
| rejected | abogado | Sobre rechazado |
| corrections_requested | abogado | Correcciones solicitadas |

#### time_tracking — estados medidos

| Status | Responsable | Descripción |
|---|---|---|
| borrador | solicitante | Tiempo de llenado del formulario |
| pendiente_legal | — | Tiempo esperando asignación |
| en_revision_legal | coordinador | Tiempo que el coordinador tuvo el sobre |
| revision_abogado | abogado asignado | Tiempo real del abogado revisando (entrada única por abogado) |

---

### 10. Frontend

#### Archivos

| Archivo | Ubicación |
|---|---|
| Página principal (lista) | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Tabla de sobres + slide-over | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Nuevo contrato (stepper) | `frontend/app/(private)/app/legal/solicitud-de-contratos/nuevo/page.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API | `frontend/services/legalService.ts` |
| Upload service | `frontend/services/uploadService.ts` |

#### Notas de implementación

- La tabla es responsive: tabla en desktop (`hidden md:block`), tarjetas en móvil (`md:hidden`)
- El detalle del sobre abre en un slide-over lateral
- Paginación: 8 registros por página en desktop
- Filtros en móvil: grid 2 columnas
- El `resolveLegalRole` normaliza prefijos `legal:` antes de comparar
- La descarga de documentos usa `getSignedUrl(object_key, bucket)` del upload-service
- El historial en el slide-over combina `status_log` + `activity_log` (filtrando `viewed`) ordenados por fecha descendente con hora
- Al crear un sobre, el `company_slug` se obtiene de `res.data.company_name` (que el backend populate desde admin-service)
- El selector de empresa aparece cuando el usuario tiene más de una empresa O es `super_admin`

---

### 11. Admin-service — Endpoint interno

Agregado para que el legal-service consulte usuarios por rol de módulo:

```
GET http://admin-service:8000/internal/users/by-module-role
    ?module_slug=legal&role_slug=abogado
```

Devuelve: `[{"id": "uuid", "name": "Nombre completo", "email": "email@empresa.com"}]`

No requiere autenticación — solo accesible dentro de la red Docker (no expuesto en Nginx).

---

### 12. Migraciones Alembic

> **Regla crítica:** Para ediciones multilínea en servidor usar `python3 << 'EOF'` en lugar de `sed`. Para renombrar tablas usar `op.rename_table()` manual — NUNCA `--autogenerate`.

```bash
export DB_HOST=$(docker inspect avalanz-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export DB_PORT=5432 DB_USER=avalanz_user DB_NAME=avalanz_legal
export DB_PASSWORD=$(grep -o 'avalanz_user:[^@]*' ~/intranet-avalanz/backend/modules/legal-service/.env | cut -d: -f2)
cd ~/intranet-avalanz/backend/modules/legal-service
alembic current
alembic upgrade head
```

#### Historial de migraciones

| Revisión | Descripción |
|---|---|
| `fd194ef42a01` | Initial schema — tablas contract_requests |
| `a7d79d465637` | Rename contract_requests tables to envelopes |
| `2c4cbf7f7b31` | Add envelope_signers table |
| `425fe54b7106` | Add template slug/version, allowed mime types, correction checklist |
| `a62f97aa714d` | Add signing tokens + provider config |
| `d3a02f07031f` | Add version tracking to envelope_attachments |

---

### 13. Datos de prueba en servidor provisional

25+ sobres con todos los estados. 2 usuarios con roles de módulo Legal:

| Usuario | Email | Rol |
|---|---|---|
| LOURDES RUIZ RAMOS | soporte@avalanz.com | coordinador_legal |
| FELIPE GONZALEZ MARTINEZ | abraham_covarrubias@cnci.com.mx | abogado |

1 tipo de contrato activo: **NDA Mutuo** (`contract_type_id: 11111111-1111-1111-1111-111111111111`)

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
# Token admin
TOKEN=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Token Lourdes (coordinadora)
TOKEN_L=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"soporte@avalanz.com","password":"Avalanz01*"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Rebuild legal-service (con caché)
cd ~/intranet-avalanz/infrastructure/docker
docker compose -f docker-compose.yml build legal-service
docker compose -f docker-compose.yml up -d legal-service

# Rebuild legal-service (sin caché — cuando el build ignora cambios)
docker compose -f docker-compose.yml build --no-cache legal-service

# Copiar archivo al contenedor sin rebuild (más rápido para pruebas)
docker cp ~/intranet-avalanz/backend/modules/legal-service/contract_requests/routes.py \
  avalanz-legal:/app/contract_requests/routes.py && docker restart avalanz-legal

# Rebuild admin-service
docker compose -f docker-compose.yml build admin-service
docker compose -f docker-compose.yml up -d admin-service

# Rebuild frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Ver logs
docker logs avalanz-legal --tail 30
docker logs avalanz-admin --tail 20

# MinIO CLI
docker exec avalanz-minio mc alias set local http://localhost:9000 \
  AvalanzMinIO2026 55520173966a34f64caa19e807985392b0e90dff
docker exec avalanz-minio mc ls --recursive local/dirdoc/
docker exec avalanz-minio mc rm --recursive --force local/dirdoc/{carpeta}/

# Ver BD legal
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal \
  -c "SELECT folio, status, company_name, assigned_lawyer_name FROM envelopes ORDER BY created_at DESC LIMIT 10;"

# Ver BD admin (roles)
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin \
  -c "SELECT u.full_name, mr.slug FROM user_module_accesses uma JOIN users u ON u.id=uma.user_id JOIN module_roles mr ON mr.id=uma.role_id WHERE uma.is_active=true;"

# Probar endpoint de abogados
curl -k -s "https://localhost/api/v1/legal/envelopes/lawyers" \
  -H "Authorization: Bearer $TOKEN_L" | python3 -m json.tool

# Endpoint interno admin (solo red Docker)
docker exec avalanz-admin curl -s \
  "http://localhost:8000/internal/users/by-module-role?module_slug=legal&role_slug=abogado"
```

---

### 15. Pendientes técnicos

Ver `docs/modules/legal/tech-debt-legal.md` para el listado completo.

#### Bloqueantes inmediatos
- Configurar `lawyer_assignments` con Felipe para tipo NDA Mutuo (prueba de balanceo automático)
- Notificación por correo al abogado cuando se le asigna un sobre
- Notificación al solicitante cuando el sobre pasa a `completado`
- Página pública `/firmar/{token}` en el frontend para confirmación de firma

#### Pendientes funcionales
- CRUD endpoints para `envelope_signers`
- Paso de firmantes en el stepper de nuevo contrato
- Select de proveedor de firma en panel de admin
- Márgenes PDF páginas 2+ (WeasyPrint)

#### Pendientes de configuración
- Crear tipos de contrato reales (eliminar UUIDs hardcodeados `11111111...`)
- Migrar campos del formulario de `fields.json` a `contract_type_fields` en BD
- UI de administración de templates para coordinador

#### Pendientes de reportes
- Reporte SLA diario por correo (cron 11 AM)
- Panel KPIs para coordinador y director
- Vista de trazabilidad por abogado