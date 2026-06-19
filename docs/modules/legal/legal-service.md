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
- Nadie puede borrar ni editar solicitudes una vez en estado terminado

---

## Perfiles de usuario

| Perfil | Descripción | Acciones |
|---|---|---|
| `solicitante` | Usuario de una empresa del grupo. Crea solicitudes y da seguimiento | Solo sus propias solicitudes mientras estén abiertas |
| `abogado` | Equipo legal corporativo. Gestiona solicitudes de los tipos asignados | Solicitudes asignadas a su tipo de contrato |
| `coordinador_legal` | Admin del módulo legal. Asigna tipos de contrato a abogados, reasigna solicitudes | Gestión administrativa completa + KPIs |
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
├── contract_requests/              → Submódulo: Solicitud de Contratos
│   ├── __init__.py
│   ├── models.py                   → 13 tablas SQLAlchemy
│   ├── schemas.py                  → Modelos Pydantic request/response
│   ├── service.py                  → Lógica de negocio, SLA, balanceo
│   └── routes.py                   → Endpoints FastAPI
├── shared/                         → Symlink a backend/shared/
├── migrations/
│   ├── alembic.ini
│   ├── env.py                      → Lee variables de entorno para conexión
│   └── versions/
│       └── fd194ef42a01_initial_schema_contract_requests.py
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
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - avalanz-network
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

---

## Nginx

Ruta configurada en `infrastructure/nginx/conf.d/intranet.conf`:

```nginx
upstream legal_service {
    server legal-service:8000;
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

> **Nota:** El `^~` es obligatorio para que Nginx prefiera este location sobre el `location /` del frontend. Sin él, Next.js intercepta todas las peticiones a `/api/v1/legal/...`.

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

Uso en endpoints:

```python
@router.get("")
async def list_requests(user: dict = Depends(get_current_user)):
    ...

@router.post("/{id}/approve")
async def approve(user: dict = Depends(require_roles("abogado", "coordinador_legal", "super_admin"))):
    ...
```

---

## Submódulo: Solicitud de Contratos

### Prefijo de rutas

```
/api/v1/legal/contract-requests
```

### Modelo de datos — 13 tablas

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
Campos dinámicos del formulario por tipo de contrato (pendiente configuración por equipo legal).

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
| is_active | Boolean | Si recibe nuevas solicitudes de este tipo |
| assigned_by | UUID | Coordinador que hizo la asignación |

#### contract_requests
Solicitud principal con máquina de estados y trazabilidad completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| folio | VARCHAR(20) | Folio autogenerado — CONT-2026-0001 |
| company_id | UUID | Empresa del solicitante |
| company_name | VARCHAR(255) | Nombre desnormalizado |
| requested_by_user_id | UUID | Usuario que creó la solicitud |
| requested_by_name | VARCHAR(255) | Nombre desnormalizado |
| requested_by_email | VARCHAR(255) | Email desnormalizado |
| contract_type_id | UUID FK | Referencia a contract_types |
| contract_type_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_id | UUID | Abogado asignado |
| assigned_lawyer_name | VARCHAR(255) | Nombre desnormalizado |
| assigned_lawyer_email | VARCHAR(255) | Email desnormalizado |
| assigned_at | DateTime | Cuándo se asignó |
| status | Enum | Estado actual (ver máquina de estados) |
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

#### contract_form_snapshots
Snapshot inmutable del formulario en cada envío del cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| version | Integer | Número de versión (1, 2, 3...) |
| form_data | JSON | Datos del formulario en ese momento |
| submitted_by_user_id | UUID | Quién envió |
| submitted_by_name | VARCHAR(255) | Nombre desnormalizado |
| submitted_at | DateTime | Fecha del envío |

#### contract_status_logs
Bitácora inmutable de cada cambio de estado.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| from_status | VARCHAR(50) | Estado anterior (null en creación) |
| to_status | VARCHAR(50) | Estado nuevo |
| changed_by_user_id | UUID | Quién hizo el cambio |
| changed_by_name | VARCHAR(255) | Nombre desnormalizado |
| changed_by_role | VARCHAR(100) | Rol en el momento del cambio |
| reason | Text | Motivo del cambio (requerido en rechazos y correcciones) |
| changed_at | DateTime | Fecha exacta del cambio |
| ip_address | VARCHAR(45) | IP desde donde se hizo el cambio |

#### contract_time_tracking
Tiempo transcurrido en cada estado por usuario — para diagnóstico de SLA.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| status | VARCHAR(50) | Estado que se está midiendo |
| responsible_user_id | UUID | Usuario responsable en ese estado |
| responsible_user_name | VARCHAR(255) | Nombre desnormalizado |
| started_at | DateTime | Cuándo entró a este estado |
| ended_at | DateTime | Cuándo salió (null si es el estado actual) |
| duration_minutes | Integer | Minutos calculados al cerrar |

#### contract_comments
Comentarios en la solicitud — internos (solo legal) o públicos (cliente los ve).

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| author_user_id | UUID | Autor del comentario |
| author_name | VARCHAR(255) | Nombre desnormalizado |
| author_role | VARCHAR(100) | Rol en el momento del comentario |
| body | Text | Contenido del comentario |
| is_internal | Boolean | True = solo lo ve el equipo legal |
| created_at | DateTime | Fecha de creación |
| is_deleted | Boolean | Soft delete |

#### contract_attachments
Archivos adjuntos a la solicitud con auditoría completa.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| attachment_def_id | UUID FK | Referencia a contract_type_attachment_defs (opcional) |
| original_name | VARCHAR(255) | Nombre original del archivo |
| stored_name | VARCHAR(255) | Nombre con UUID en MinIO |
| object_key | VARCHAR(500) | Ruta en MinIO |
| bucket | VARCHAR(100) | Bucket de MinIO (legal-contracts) |
| mime_type | VARCHAR(100) | Tipo MIME |
| size_bytes | BigInteger | Tamaño en bytes |
| checksum | VARCHAR(64) | Hash SHA256 |
| uploaded_by_user_id | UUID | Quién subió el archivo |
| uploaded_by_name | VARCHAR(255) | Nombre desnormalizado |
| uploaded_at | DateTime | Fecha de subida |
| is_deleted | Boolean | Soft delete |

#### contract_attachment_logs
Auditoría de cada acción sobre archivos adjuntos.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| attachment_id | UUID FK | Referencia a contract_attachments |
| contract_request_id | UUID | Referencia a la solicitud |
| action | VARCHAR(50) | uploaded, downloaded, deleted |
| performed_by_user_id | UUID | Quién realizó la acción |
| performed_by_name | VARCHAR(255) | Nombre desnormalizado |
| performed_at | DateTime | Fecha exacta |
| ip_address | VARCHAR(45) | IP |
| detail | JSON | Datos extra |

#### contract_activity_logs
Log general de toda actividad — vistas, descargas, ediciones de campos, reasignaciones.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| contract_request_id | UUID FK | Referencia a contract_requests |
| action | VARCHAR(100) | viewed, form_edited, lawyer_assigned, etc. |
| performed_by_user_id | UUID | Quién realizó la acción |
| performed_by_name | VARCHAR(255) | Nombre desnormalizado |
| performed_by_role | VARCHAR(100) | Rol en el momento |
| performed_at | DateTime | Fecha exacta |
| ip_address | VARCHAR(45) | IP |
| detail | JSON | Datos extra (campo anterior/nuevo en ediciones) |

#### folio_sequences
Contador autoincrementable por año para el folio CONT-YYYY-NNNN.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| year | Integer | Año (unique) |
| last_sequence | Integer | Último número usado |

---

## Máquina de estados

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

### Reglas del SLA

- El contador arranca cuando el cliente envía por primera vez (`submitted_at`)
- El plazo es 3 días hábiles (lunes a viernes, sin festivos México) — configurable por tipo
- El reloj **nunca se pausa ni reinicia** mientras la solicitud esté abierta
- Se cierra únicamente cuando llega a `completado`, `rechazado` o `en_firmas`
- Si se reasigna entre abogados, el contador no se reinicia
- Semáforo: verde (+2 días), amarillo (≤1 día), rojo (vencido)

### Transiciones válidas

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

## Lógica de balanceo de abogados

Al primer envío de una solicitud el sistema asigna automáticamente un abogado:

1. Obtiene lista de abogados activos asignados al tipo de contrato
2. Cuenta solicitudes pendientes **no atrasadas** de cada abogado
3. Asigna al que tenga menos pendientes no atrasadas
4. En empate: asigna al que lleva más tiempo sin recibir una solicitud nueva

> Los pendientes atrasados no cuentan en el balanceo.

---

## Endpoints

### Tipos de contrato
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /types | Todos | Listar tipos de contrato |
| GET | /types/{id} | Todos | Obtener tipo con campos y anexos |
| POST | /types | coordinador_legal, super_admin | Crear tipo |
| PATCH | /types/{id} | coordinador_legal, super_admin | Actualizar tipo |
| POST | /types/{id}/lawyers | coordinador_legal, super_admin | Asignar abogado a tipo |
| DELETE | /lawyers/assignments/{id} | coordinador_legal, super_admin | Desactivar asignación |

### Solicitudes
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | / | Todos (filtrado por rol) | Listar solicitudes |
| POST | / | Todos | Crear solicitud en borrador |
| GET | /{id} | Todos (filtrado por rol) | Detalle completo con trazabilidad |
| PATCH | /{id} | solicitante | Editar borrador o correcciones |
| POST | /{id}/submit | solicitante | Enviar al área legal |
| POST | /{id}/approve | abogado, coordinador, super_admin | Aprobar → en_firmas |
| POST | /{id}/request-corrections | abogado, coordinador, super_admin | Pedir correcciones |
| POST | /{id}/reject | abogado, coordinador, super_admin | Rechazar |
| POST | /{id}/complete | abogado, coordinador, super_admin | Marcar completado |
| POST | /{id}/reassign | coordinador, super_admin | Reasignar abogado |

### Comentarios
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /{id}/comments | Todos (internos filtrados) | Listar comentarios |
| POST | /{id}/comments | Todos | Agregar comentario |

### Trazabilidad (solo equipo legal)
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /{id}/status-log | abogado, coordinador, director, super_admin | Historial de estados |
| GET | /{id}/time-tracking | coordinador, super_admin | Tiempo por estado |
| GET | /{id}/activity-log | coordinador, super_admin | Log de actividad |
| GET | /{id}/form-snapshots | abogado, coordinador, super_admin | Versiones del formulario |

### Reportes
| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /reports/sla | coordinador, director, super_admin | Reporte SLA actual |
| POST | /internal/update-sla-flags | Sin auth (red interna) | Cron diario — marca vencidas |

---

## Visibilidad por rol

| Dato | solicitante | abogado | coordinador | director | super_admin |
|---|---|---|---|---|---|
| Ver solicitudes | Solo su empresa | Solo asignadas a él | Todas | Todas | Todas |
| Columna abogado | No | No | Sí | Sí | Sí |
| Columna empresa | No | No | Sí | Sí | Sí |
| Comentarios internos | No | Sí | Sí | Sí | Sí |
| Time tracking | No | No | Sí | No | Sí |
| Activity log | No | No | Sí | No | Sí |
| Form snapshots | No | Sí | Sí | No | Sí |
| KPIs | No | No | Sí | Sí | Sí |

---

## Migraciones Alembic

```bash
# Generar migración desde el servidor (no desde dentro del contenedor)
export DB_HOST=$(docker inspect avalanz-postgres | grep '"IPAddress"' | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
export DB_PORT=5432 DB_USER=avalanz_user DB_PASSWORD=<password> DB_NAME=avalanz_legal
export PYTHONPATH=/home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
cd /home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
alembic revision --autogenerate -m "descripcion"
alembic upgrade head
```

> **Importante:** El `env.py` de Alembic lee las variables de entorno, no el `alembic.ini`. La contraseña de PostgreSQL del servidor provisional fue actualizada — ver KeePass.

---

## Frontend

### Archivos

| Archivo | Ubicación |
|---|---|
| Página principal | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Tabla de solicitudes | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API | `frontend/services/legalService.ts` |

### Resolución de rol legal

El frontend resuelve el rol legal del usuario desde el JWT:

```typescript
const resolveLegalRole = (roles: string[]): LegalRole => {
  if (roles.includes('super_admin')) return 'super_admin'
  if (roles.includes('coordinador_legal')) return 'coordinador_legal'
  if (roles.includes('director')) return 'director'
  if (roles.includes('abogado')) return 'abogado'
  return 'solicitante'
}
```

---

## Pendientes del submódulo

### Bloqueantes del equipo legal (esperando entrega)
- Templates en Word con campos variables resaltados en amarillo
- Listado de tipos de contrato disponibles
- Definición de anexos obligatorios y opcionales por tipo
- Tiempos SLA por tipo de contrato (solo NDA tiene 3d definidas)
- Firmantes por defecto en DocuSign

### Técnicos pendientes
- Integración con DocuSign para fase de firmas
- Formulario dinámico de nueva solicitud (`ContractRequestForm.tsx`)
- Vista de detalle de solicitud con trazabilidad completa
- Reporte SLA diario por correo (cron a las 11:00 AM)
- Submódulo de solicitud abierta (sin template)
- Paginación visual en la tabla de solicitudes
- Panel KPIs para coordinador y director

### Datos de prueba en servidor provisional
```sql
-- Tipo de contrato de prueba
SELECT * FROM contract_types;
-- id: 11111111-1111-1111-1111-111111111111, name: 'NDA Mutuo'

-- Solicitud de prueba
SELECT folio, status, company_name, requested_by_name FROM contract_requests;
-- CONT-2026-0001, pendiente_legal, AGIM, Ana García
```

---

## Comandos frecuentes

```bash
# Ver logs del legal-service
docker logs avalanz-legal --tail 30 -f

# Verificar que el servicio responde
curl -s http://172.18.0.17:8000/health

# Verificar BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal -c "\dt"

# Rebuild del contenedor
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build -d legal-service

# Aplicar migraciones
export DB_HOST=172.18.0.3 DB_PORT=5432 DB_USER=avalanz_user DB_PASSWORD=<pass> DB_NAME=avalanz_legal
export PYTHONPATH=/home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
cd /home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
alembic upgrade head
```
