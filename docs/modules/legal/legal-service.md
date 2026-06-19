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
| `abogado` | Equipo legal corporativo. Gestiona sobres de los tipos asignados | Sobres asignados a su tipo de contrato |
| `coordinador_legal` | Admin del módulo legal. Asigna tipos de contrato a abogados, reasigna sobres | Gestión administrativa completa + KPIs |
| `director` | Personas de alto mando configurables. Solo consultan y descargan | Solo lectura + KPIs |
| `super_admin` | Equipo de sistemas. Si no existe Coordinador Legal, asume sus funciones | Acceso total |

---

## Arquitectura

### Estructura de archivos

```
backend/modules/legal-service/
├── app/
│   ├── main.py                     → FastAPI app, middlewares, routers
│   ├── config.py                   → Variables de entorno del servicio
│   ├── database.py                 → Motor async SQLAlchemy, sesión
│   ├── models/                     → Modelos base del módulo (vacío por ahora)
│   ├── routes/
│   │   └── legal.py                → Router base del módulo
│   └── services/
│       └── legal_service.py        → Servicio base del módulo
├── contract_requests/              → Submódulo: Solicitud de Contratos (carpeta conserva nombre original)
│   ├── __init__.py
│   ├── models.py                   → 14 tablas SQLAlchemy
│   ├── schemas.py                  → Modelos Pydantic request/response
│   ├── service.py                  → Lógica de negocio, SLA, balanceo
│   └── routes.py                   → Endpoints FastAPI — prefijo /envelopes
├── shared/                         → Symlink a backend/shared/
├── migrations/
│   ├── alembic.ini
│   ├── env.py                      → Lee variables de entorno para conexión
│   └── versions/
│       ├── fd194ef42a01_initial_schema_contract_requests.py
│       ├── a7d79d465637_rename_contract_requests_tables_to_.py
│       └── 2c4cbf7f7b31_add_envelope_signers_table.py
├── Dockerfile
├── requirements.txt
└── .env
```

### Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | FastAPI |
| Base de datos | PostgreSQL 15 — BD: `avalanz_legal` |
| ORM | SQLAlchemy 2.0 async |
| Migraciones | Alembic |
| JWT | shared/middleware/jwt_validator.py |
| Autenticación | JWTValidator como dependencia FastAPI |

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
LOG_LEVEL=INFO
LOG_FORMAT=json
```

---

## Docker

El legal-service se construye desde el contexto `../../backend` para que el `shared/` esté disponible.

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
RUN apt-get update && apt-get install -y --no-install-recommends gcc curl && rm -rf /var/lib/apt/lists/*
COPY modules/legal-service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY modules/legal-service/ .
COPY shared/ /app/shared
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

> **Crítico:** El contexto del build en `docker-compose.yml` debe ser `../../backend` para que el `COPY shared/` funcione.

---

## Nginx

Ruta configurada en `infrastructure/nginx/conf.d/intranet.conf`:

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

> **Nota:** El upstream apunta a `avalanz-legal:8000` (nombre del contenedor), no a `legal-service:8000`. El `^~` es obligatorio para que Nginx prefiera este location sobre el `location /` del frontend.

---

## Autenticación

El `legal-service` usa `JWTValidator` del shared como dependencia FastAPI, no como middleware Starlette.

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

### 1. Modelo de datos — 14 tablas en `avalanz_legal`

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
| company_name | VARCHAR(255) | Nombre desnormalizado |
| requested_by_user_id | UUID | Usuario que creó el sobre |
| requested_by_name | VARCHAR(255) | Nombre desnormalizado |
| requested_by_email | VARCHAR(255) | Email desnormalizado |
| contract_type_id | UUID FK | Referencia a contract_types |
| contract_type_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_id | UUID | Abogado asignado |
| assigned_lawyer_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_email | VARCHAR(255) | Email desnormalizado |
| assigned_at | DateTime | Cuándo se asignó |
| status | Enum (envelope_status_enum) | Estado actual |
| form_data | JSON | Datos del formulario dinámico |
| counterparty_name | VARCHAR(255) | Nombre de la contraparte |
| counterparty_email | VARCHAR(255) | Email de la contraparte |
| is_open_request | Boolean | Si es solicitud abierta sin template |
| open_request_description | Text | Descripción de solicitud abierta |
| submitted_at | DateTime | Primer envío del cliente — inicia SLA |
| sla_due_at | DateTime | Fecha límite calculada |
| sla_closed_at | DateTime | Cuándo se cerró el SLA |
| is_sla_breached | Boolean | Si el SLA fue incumplido |
| created_at | DateTime | Fecha de creación |
| completed_at | DateTime | Fecha de cierre |
| is_deleted | Boolean | Soft delete |

#### envelope_signers
Firmantes del sobre — un registro por firmante, soporta múltiples firmantes por sobre. El solicitante los define al crear el sobre.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| signer_type | VARCHAR(20) | `internal` o `external` |
| user_id | UUID | UUID en avalanz si es firmante interno |
| name | VARCHAR(255) | Nombre del firmante |
| email | VARCHAR(255) | Email del firmante |
| role_in_document | VARCHAR(100) | Representante Legal, Testigo, Contraparte |
| routing_order | Integer | Orden de firma en DocuSign (mismo número = paralelo) |
| docusign_recipient_id | VARCHAR(100) | ID asignado por DocuSign al enviar |
| status | VARCHAR(30) | `pending`, `sent`, `signed`, `declined` |
| signed_at | DateTime | Cuándo firmó |
| declined_at | DateTime | Cuándo rechazó |
| declined_reason | Text | Motivo del rechazo |
| docs_requested | JSON | Docs a solicitar: `[{"type": "INE"}, {"type": "poder_notarial"}]` |
| docs_received | JSON | Docs recuperados de DocuSign post-firma |
| created_at | DateTime | Fecha de creación |
| updated_at | DateTime | Última actualización |

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
Tiempo transcurrido en cada estado por usuario — para diagnóstico de SLA.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| status | VARCHAR(50) | Estado que se está midiendo |
| responsible_user_id | UUID | Usuario responsable en ese estado |
| responsible_user_name | VARCHAR(255) | Nombre desnormalizado |
| started_at | DateTime | Cuándo entró a este estado |
| ended_at | DateTime | Cuándo salió (null si es el estado actual) |
| duration_minutes | Integer | Minutos calculados al cerrar |

#### envelope_comments
Comentarios en el sobre — internos (solo legal) o públicos (cliente los ve).

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
Archivos adjuntos al sobre con auditoría completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| envelope_id | UUID FK | Referencia a envelopes |
| attachment_def_id | UUID FK | Referencia a contract_type_attachment_defs (opcional) |
| original_name | VARCHAR(255) | Nombre original del archivo |
| stored_name | VARCHAR(255) | Nombre con UUID en MinIO |
| object_key | VARCHAR(500) | Ruta en MinIO |
| bucket | VARCHAR(100) | Bucket de MinIO (legal-envelopes) |
| mime_type | VARCHAR(100) | Tipo MIME |
| size_bytes | BigInteger | Tamaño en bytes |
| checksum | VARCHAR(64) | Hash SHA256 |
| uploaded_by_user_id | UUID | Quién subió el archivo |
| uploaded_by_name | VARCHAR(255) | Nombre desnormalizado |
| uploaded_at | DateTime | Fecha de subida |
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
| action | VARCHAR(100) | viewed, form_edited, lawyer_assigned, submitted, approved, rejected, etc. |
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
borrador ──────────────────────────────────── (cliente crea, no envía aún)
    │
    ▼ [cliente envía]
pendiente_legal ────────────────────────────── (SLA inicia aquí)
    │               │               │
    ▼ [aprobar]     ▼ [pedir corr]  ▼ [rechazar]
en_firmas    pendiente_cliente   rechazado ← inmutable
    │               │
    ▼               ▼ [cliente reenvía]
firmado_parcial  en_revision_legal
    │               │               │
    ▼               ▼ [aprobar]     ▼ [rechazar]
completado ←  en_firmas       rechazado
```

#### Reglas del SLA

- El contador arranca cuando el cliente envía por primera vez (`submitted_at`)
- El plazo es 3 días hábiles (lunes a viernes, sin festivos México) — configurable por tipo
- El reloj **nunca se pausa ni reinicia** mientras el sobre esté abierto
- Se cierra únicamente cuando llega a `completado`, `rechazado` o `en_firmas`
- Si se reasigna entre abogados, el contador no se reinicia
- Semáforo: verde (+2 días), amarillo (≤1 día), rojo (vencido)

#### Transiciones válidas

| Desde | Hacia | Quién |
|---|---|---|
| borrador | pendiente_legal | cliente |
| pendiente_legal | pendiente_cliente | abogado |
| pendiente_legal | en_firmas | abogado |
| pendiente_legal | rechazado | abogado |
| pendiente_cliente | en_revision_legal | cliente |
| en_revision_legal | pendiente_cliente | abogado |
| en_revision_legal | en_firmas | abogado |
| en_revision_legal | rechazado | abogado |
| en_firmas | firmado_parcial | sistema/abogado |
| en_firmas | completado | sistema/abogado |
| firmado_parcial | completado | sistema/abogado |

---

### 3. Lógica de balanceo de abogados

Al primer envío de un sobre el sistema asigna automáticamente un abogado:

1. Obtiene lista de abogados activos asignados al tipo de contrato
2. Cuenta sobres pendientes **no atrasados** de cada abogado
3. Asigna al que tenga menos pendientes no atrasados
4. En empate: asigna al que lleva más tiempo sin recibir un sobre nuevo

> Los pendientes atrasados no cuentan en el balanceo.

---

### 4. Endpoints

#### Tipos de contrato
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/types | Todos | Listar tipos de contrato |
| GET | /envelopes/types/{id} | Todos | Obtener tipo con campos y anexos |
| POST | /envelopes/types | coordinador_legal, super_admin | Crear tipo |
| PATCH | /envelopes/types/{id} | coordinador_legal, super_admin | Actualizar tipo |
| POST | /envelopes/types/{id}/lawyers | coordinador_legal, super_admin | Asignar abogado a tipo |
| DELETE | /envelopes/lawyers/assignments/{id} | coordinador_legal, super_admin | Desactivar asignación |

#### Sobres
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes | Todos (filtrado por rol) | Listar sobres |
| POST | /envelopes | Todos | Crear sobre en borrador |
| GET | /envelopes/{id} | Todos (filtrado por rol) | Detalle completo con trazabilidad |
| PATCH | /envelopes/{id} | solicitante | Editar borrador o correcciones |
| POST | /envelopes/{id}/submit | solicitante | Enviar al área legal |
| POST | /envelopes/{id}/approve | abogado, coordinador, super_admin | Aprobar → en_firmas |
| POST | /envelopes/{id}/request-corrections | abogado, coordinador, super_admin | Pedir correcciones |
| POST | /envelopes/{id}/reject | abogado, coordinador, super_admin | Rechazar |
| POST | /envelopes/{id}/complete | abogado, coordinador, super_admin | Marcar completado |
| POST | /envelopes/{id}/reassign | coordinador, super_admin | Reasignar abogado |

#### Firmantes
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/{id}/signers | Todos (filtrado por rol) | Listar firmantes del sobre |
| POST | /envelopes/{id}/signers | solicitante, super_admin | Agregar firmante |
| PATCH | /envelopes/{id}/signers/{signer_id} | solicitante, super_admin | Editar firmante |
| DELETE | /envelopes/{id}/signers/{signer_id} | solicitante, super_admin | Eliminar firmante |

#### Comentarios
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/{id}/comments | Todos (internos filtrados) | Listar comentarios |
| POST | /envelopes/{id}/comments | Todos | Agregar comentario |

#### Trazabilidad
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/{id}/status-log | abogado, coordinador, director, super_admin | Historial de estados |
| GET | /envelopes/{id}/time-tracking | coordinador, super_admin | Tiempo por estado |
| GET | /envelopes/{id}/activity-log | coordinador, super_admin | Log de actividad |
| GET | /envelopes/{id}/form-snapshots | abogado, coordinador, super_admin | Versiones del formulario |

#### Reportes
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /envelopes/reports/sla | coordinador, director, super_admin | Reporte SLA actual |
| GET | /envelopes/reports/lawyer/{lawyer_id} | coordinador, super_admin | Trazabilidad por abogado |
| POST | /envelopes/internal/update-sla-flags | Sin auth (red interna) | Cron diario — marca vencidos |

---

### 5. Visibilidad por rol

| Dato | solicitante | abogado | coordinador | director | super_admin |
|---|---|---|---|---|---|
| Ver sobres | Solo su empresa | Solo asignados a él | Todos | Todos | Todos |
| Columna abogado | ❌ | ❌ | ✅ | ✅ | ✅ |
| Columna empresa | ❌ | ❌ | ✅ | ✅ | ✅ |
| Comentarios internos | ❌ | ✅ | ✅ | ✅ | ✅ |
| Time tracking | ❌ | ❌ | ✅ | ❌ | ✅ |
| Activity log | ❌ | ❌ | ✅ | ❌ | ✅ |
| Form snapshots | ❌ | ✅ | ✅ | ❌ | ✅ |
| KPIs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Botón nuevo sobre | ✅ | ❌ | ❌ | ❌ | ✅ |
| Ver firmantes | ✅ | ✅ | ✅ | ✅ | ✅ |
| Editar firmantes | ✅ (solo borrador) | ❌ | ❌ | ❌ | ✅ |

---

### 6. Frontend

#### Archivos

| Archivo | Ubicación |
|---|---|
| Página principal | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Tabla de sobres | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API | `frontend/services/legalService.ts` |
| Layout Legal | `frontend/app/(private)/app/legal/layout.tsx` |

#### Notas de implementación
- El layout de Legal usa navegación horizontal (tabs) en lugar de sidebar vertical
- La tabla de sobres es responsive: tabla en desktop (`hidden md:block`), tarjetas en móvil (`md:hidden`)
- El detalle del sobre abre en un slide-over lateral
- Paginación: 10 registros por página
- La API devuelve `{ data: [...], total, page, per_page, total_pages }` — sin wrapper `success/message`

#### Resolución de rol legal

```typescript
type LegalRole = 'solicitante' | 'abogado' | 'coordinador_legal' | 'director' | 'super_admin'

const resolveLegalRole = (roles: string[]): LegalRole => {
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('coordinador_legal')) return 'coordinador_legal'
  if (roles.includes('director')) return 'director'
  if (roles.includes('abogado')) return 'abogado'
  return 'solicitante'
}
```

---

### 7. Migraciones Alembic

Las migraciones se corren **desde el servidor directamente**, no desde dentro del contenedor. El `env.py` lee variables de entorno — nunca el `alembic.ini`.

> **Regla crítica:** Para renombrar tablas usar `op.rename_table()` manual — NUNCA `--autogenerate` porque lo interpreta como drop + create y borra los datos. Para ediciones multilínea en servidor usar Python (`python3 << 'EOF'`) en lugar de `sed`.

```bash
export DB_HOST=$(docker inspect avalanz-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export DB_PORT=5432 DB_USER=avalanz_user DB_NAME=avalanz_legal
export DB_PASSWORD=<password_en_keepass>
export PYTHONPATH=/home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
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

---

### 8. Datos de prueba en servidor provisional

15 sobres de prueba con todos los estados, 2 tipos de empresa y 2 abogados. Eliminar cuando inicie operación real:

```sql
-- Conectar
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal

-- Ver sobres
SELECT folio, status, company_name, requested_by_name FROM envelopes ORDER BY created_at DESC;

-- Limpiar datos de prueba (cuando sea momento)
DELETE FROM envelope_activity_logs;
DELETE FROM envelope_time_tracking;
DELETE FROM envelope_status_logs;
DELETE FROM envelope_form_snapshots;
DELETE FROM envelope_signers;
DELETE FROM envelopes;
DELETE FROM folio_sequences;
```

> Los folios de prueba mezclan `CONT-` (creados antes del renombramiento) y `ENV-` (creados después). En operación real todos serán `ENV-YYYY-NNNN`.

---

### 9. Comandos frecuentes

```bash
# Token de prueba
TOKEN=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Probar API
curl -k -s https://localhost/api/v1/legal/envelopes \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Ver logs
docker logs avalanz-legal --tail 30 -f

# Rebuild legal-service
cd ~/intranet-avalanz/infrastructure/docker
docker compose -f docker-compose.yml build legal-service
docker compose -f docker-compose.yml up -d legal-service

# Rebuild frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Ver BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal -c "\dt"

# Recargar Nginx
docker exec avalanz-nginx nginx -s reload
```

---

### 10. Pendientes

#### Bloqueantes del equipo legal
- Templates Word con campos variables resaltados en amarillo
- Listado definitivo de tipos de contrato
- Anexos obligatorios y opcionales por tipo de contrato
- Documentos a solicitar a firmantes (INE, pasaporte, poder notarial, etc.)
- Tiempos SLA por tipo (solo NDA: 3 días definidos)
- Firmantes por defecto en DocuSign
- Nombre del remitente en DocuSign: Legal Corporativo vs empresa del cliente

#### Técnicos pendientes
- Endpoints CRUD para `envelope_signers` (modelo y migración ya listos)
- Formulario de nuevo sobre — flujo con template (campos dinámicos + preview PDF)
- Formulario de contrato abierto — subir PDF/Word + asignar firmantes
- Vista de detalle completa del sobre con trazabilidad
- Vista de trazabilidad por abogado
- Integración DocuSign: envío, webhook, recuperación de archivos a MinIO
- Reporte SLA diario por correo (cron 11 AM)
- Panel KPIs para coordinador y director
- Filtro por empresa en la tabla de sobres
- Sincronizar al repo: `ContractRequestsTable.tsx` y `layout.tsx` con todos los fixes de UI