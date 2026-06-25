# Módulo Legal — Contexto Completo de Sesión

Este archivo contiene todo el contexto necesario para continuar el desarrollo del Módulo Legal de Intranet Avalanz en un nuevo chat. Léelo completo antes de escribir una sola línea de código.

---

## 1. Proyecto General — Intranet Avalanz

**Plataforma:** Intranet corporativa on-premise para Grupo Avalanz y Zignia (~78 empresas).
**Desarrollador único:** Abraham Covarrubias (Héctor Abraham Covarrubias Martínez en documentos formales).
**Stakeholders:** Edgar Horteales (PM), Andrés Hinojosa (sponsor).
**Repo:** `github.com/Abyblackmouth/intranet-avalanz`
**Rama activa:** `feature/legal-contract-requests`
**Gitflow:** `main` → `develop` → feature branches

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | Next.js 16 (App Router) + Tailwind CSS + shadcn/ui + Zustand |
| Backend | FastAPI microservicios |
| Base de datos | PostgreSQL 15 |
| ORM | SQLAlchemy 2.0 async + Alembic |
| Cache | Redis (256MB, allkeys-lru) |
| Mensajería | RabbitMQ |
| Almacenamiento | MinIO (S3-compatible) — bucket `dirdoc` |
| Gateway | Nginx (`avalanz-nginx` Docker container) |
| Monitoreo | Prometheus + Grafana |
| Contenedores | Docker Compose |
| PDF | WeasyPrint 57.2 + pydyf 0.6.0 |
| Firma electrónica | DocuSign eSignature (sandbox activo) |
| OS servidor | Ubuntu 24.04 |

### Entornos

| Ambiente | Host | Usuario SSH | Ruta |
|---|---|---|---|
| Desarrollo local | WSL2 `LAPTOP-4SPKNTJH` | `abyblackmouth` | `~/code/avalanz/intranet-avalanz` |
| Servidor provisional | `10.12.0.51` | `abcovarrubias` | `~/intranet-avalanz` |

**URLs activas:**
- Dominio: `https://intranet.avalanz.com` (SSL activo)
- IP pública: `200.23.37.225` (NAT Fortinet, puerto 443)

---

## 2. Reglas de trabajo (sin excepción)

- **Ediciones a archivos largos:** usar `python3 << 'PYEOF'` con `str.replace()` — NUNCA `sed` para bloques multilinea.
- **Lecturas:** `grep` o `sed -n`, nunca `cat` completo en chat.
- **Flujo normal:** cambios en servidor vía `docker cp` + restart → commit desde servidor → push.
- **Cuando se usa `docker compose up`:** el contenedor se recrea desde imagen vieja — siempre volver a copiar archivos modificados con `docker cp` después.
- **`docker restart` NO recarga `.env`** — usar `docker compose up -d` para recargar vars de entorno.
- **Después de `docker compose up -d legal-service`:** siempre volver a copiar con `docker cp` todos los archivos modificados que no estén en la imagen y reinstalar boto3:
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
- **Comentarios en código:** en **español**. Commits: en **inglés**.
- **Git:** una rama por feature. Push y merge a `develop` solo cuando el entregable está completo y funcionando.
- **Variables `NEXT_PUBLIC_*`** se hornean en build — rebuild requerido al cambiar.
- **`docker compose restart` NO recarga `.env`** — usar `--force-recreate`.
- **No emojis en código.** No comentarios que describan movimientos o refactorizaciones.
- **Zone.Identifier:** agregado a `.gitignore` — `*:Zone.Identifier`
- **Frontend deploy:** `cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend`

---

## 3. Convenciones UI (respetar en todo el frontend)

- **Azul corporativo:** `#1a4fa0`
- **Tipografía:** Plus Jakarta Sans
- **Cards:** `border border-slate-200 rounded-xl`
- **Inputs compactos:** `px-2.5 py-1.5 border rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-1 focus:ring-[#1a4fa0]/10 transition-all`
- **Sidebar:** `border-r-2 border-slate-300`, w-60 / w-16 colapsado
- **Botones primarios:** `bg-[#1a4fa0] hover:bg-blue-700`
- **Hover menús:** gris `slate-300` (normal), rojo `red-200` (destructivo)
- **Menús flotantes:** `border-2 border-slate-300 shadow-2xl`
- **Acción de 3 puntos:** `<MoreHorizontal size={20} />`
- **Avatar:** colores determinísticos por hash del nombre, 6 colores
- **Hydration:** todo lo que dependa de Zustand protegido con `mounted &&`
- **No usar banners de degradado azul** — fondo neutro `bg-slate-100` o sin fondo

---

## 4. Arquitectura del legal-service

### Estructura de archivos

```
backend/modules/legal-service/
├── app/
│   ├── main.py               → FastAPI app — registra 3 routers: main_router, contract_requests_router, docusign_router
│   ├── config.py             → Variables de entorno con pydantic-settings
│   ├── database.py           → Motor SQLAlchemy async, get_db dependency
│   ├── models/               → Modelos base del módulo
│   ├── routes/
│   │   └── legal.py          → Router base del módulo
│   └── services/
│       └── legal_service.py  → Servicio base del módulo
├── contract_requests/
│   ├── __init__.py
│   ├── models.py             → 18+ tablas SQLAlchemy con trazabilidad completa
│   ├── schemas.py            → Pydantic schemas para request/response
│   ├── service.py            → SLA engine, balanceo de abogados, folio, trazabilidad, log_activity()
│   ├── routes.py             → Todos los endpoints generales — prefix /envelopes
│   ├── docusign_routes.py    → Webhook DocuSign Connect + polling interno ← SEPARADO
│   ├── signing_service.py    → Orquestador de firma (email_sim / docusign) + auto-signers desde form_data
│   └── docusign_service.py   → Cliente DocuSign eSignature (JWT Grant)
├── shared/                   → Symlink → backend/shared/
├── templates/
│   └── nda-mutuo/
│       ├── template.html     → HTML con {{VARIABLES}} y anclas DocuSign invisibles
│       └── fields.json       → Campos del formulario + EMAIL_FIRMANTE_1/2 + signers_definition con anclas
├── migrations/
│   ├── alembic.ini
│   ├── env.py                → Lee variables de entorno para conexión
│   └── versions/             → 7 migraciones aplicadas, HEAD: e7f1a2b3c4d5
├── docusign_private.pem      → Clave privada RSA — NO versionar en git
├── Dockerfile
├── requirements.txt          → weasyprint==57.2, pydyf==0.6.0, boto3==1.43.36
└── .env
```

### .env del legal-service (completo actual)

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
LOG_LEVEL=INFO
LOG_FORMAT=json

# DocuSign eSignature — Sandbox
DOCUSIGN_INTEGRATION_KEY=027e9aa0-c59d-4e73-a731-3de935f37317
DOCUSIGN_USER_ID=9e945c43-d63f-4064-9ddb-e8ea065a447c
DOCUSIGN_ACCOUNT_ID=5dcad3a2-d1e4-4f8b-aafe-36755860504e
DOCUSIGN_BASE_URI=https://demo.docusign.net
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY_PATH=/app/docusign_private.pem

# MinIO — descarga de PDF para DocuSign
MINIO_ENDPOINT=http://avalanz-minio:9000
MINIO_ACCESS_KEY=AvalanzMinIO2026
MINIO_SECRET_KEY=55520173966a34f64caa19e807985392b0e90dff
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

> **Crítico:** El contexto del build en `docker-compose.yml` debe ser `../../backend` para que el `COPY shared/` funcione.

### docker-compose.yml (bloque del legal-service)

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

### Nginx (bloque del legal-service)

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

> Sin el `^~`, Next.js intercepta las peticiones a `/api/v1/legal/...` y devuelve 404.

### main.py del legal-service (estado actual)

```python
from app.routes import router as main_router
from contract_requests.routes import router as contract_requests_router
from contract_requests.docusign_routes import router as docusign_router

app.include_router(main_router, prefix="/api/v1/legal")
app.include_router(contract_requests_router, prefix="/api/v1/legal")
app.include_router(docusign_router, prefix="/api/v1/legal")
```

---

## 5. Autenticación en el legal-service

`JWTValidator` del shared se usa como **dependencia FastAPI**, no como middleware Starlette. Usar `add_middleware(JWTValidator, ...)` causa `TypeError`.

### Patrón correcto en routes.py

```python
from shared.middleware.jwt_validator import JWTValidator
from app.config import config

_validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)
get_current_user = _validator.get_current_user()

def require_roles(*roles: str):
    """Dependencia que valida que el usuario tenga al menos uno de los roles indicados."""
    return _validator.require_roles(list(roles))
```

### Normalización de roles de módulo

Los roles `abogado` y `coordinador_legal` viajan en el JWT con prefijo: `legal:abogado`, `legal:coordinador_legal`. El backend los normaliza:

```python
def get_flat_roles(user: dict) -> list:
    return [r.split(":")[-1] for r in user.get("roles", [])]
```

```typescript
// Frontend
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

## 6. Perfiles de usuario del módulo legal

| Perfil | Descripción | Puede operar | Ve KPIs |
|---|---|---|---|
| `solicitante` | Usuario de una empresa del grupo. Crea sobres y da seguimiento | Solo sus propios sobres mientras estén abiertos | No |
| `abogado` | Equipo legal corporativo. Gestiona sobres asignados | Solo sobres asignados a él | No |
| `coordinador_legal` | Admin del módulo legal. Asigna abogados, reasigna sobres | Gestión administrativa completa | Sí |
| `director` | Alto mando. Solo consulta y descarga | No — no interfiere en el flujo | Sí |
| `super_admin` | Sistemas. Si no existe Coordinador Legal, asume sus funciones | Total | Sí |

### Reglas de visibilidad en el listado

| Rol | Ve sobres de |
|---|---|
| `solicitante` | Solo su empresa (`companies[0]` del JWT) |
| `abogado` | Solo los asignados a él (`assigned_lawyer_id == user_id`) |
| `coordinador_legal` | Todos |
| `director` | Todos |
| `super_admin` | Todos |

### Visibilidad de datos por rol en el frontend

| Dato | solicitante | abogado | coordinador | director | super_admin |
|---|---|---|---|---|---|
| Sobres visibles | Solo su empresa | Solo asignados a él | Todos | Todos | Todos |
| Columna abogado | ❌ | ❌ | ✅ | ✅ | ✅ |
| Columna empresa/solicitante | ❌ | ❌ | ✅ | ✅ | ✅ |
| Comentarios internos | ❌ | ✅ | ✅ | ✅ | ✅ |
| Time tracking | ❌ | ❌ | ✅ | ❌ | ✅ |
| Activity log | ❌ | ❌ | ✅ | ❌ | ✅ |
| Form snapshots | ❌ | ✅ | ✅ | ❌ | ✅ |
| KPIs | ❌ | ❌ | ✅ | ✅ | ✅ |
| Botón nueva solicitud | ✅ | ❌ | ❌ | ❌ | ✅ |
| Botón aprobar | ❌ | ✅ | ✅ | ❌ | ✅ |
| Versiones anteriores de docs | ❌ | ✅ | ✅ | ✅ | ✅ |

---

## 7. Submódulo: Solicitud de Contratos

**Prefijo de rutas:** `/api/v1/legal/envelopes`
**Ruta frontend:** `/app/legal/solicitud-de-contratos`
**Folio:** `ENV-2026-XXXX` (antes era `CONT-`, ya migrado)

### Máquina de estados

```
borrador
  │
  ▼ [cliente envía — primer envío]  ← SLA INICIA AQUÍ
pendiente_legal
  │                │                │
  ▼ [aprobar]      ▼ [correcciones] ▼ [rechazar]
en_firmas    pendiente_cliente    rechazado ← INMUTABLE, SLA CIERRA
  │                │
  ▼               ▼ [cliente reenvía]
  │          en_revision_legal
  │                │                │
  ▼ [todos firman] ▼ [aprobar]      ▼ [rechazar]
completado ←   en_firmas         rechazado
SLA CIERRA
```

### Transiciones válidas

| Desde | Hacia | Quién puede hacerlo |
|---|---|---|
| borrador | pendiente_legal | solicitante |
| pendiente_legal | pendiente_cliente | abogado, coordinador_legal, super_admin |
| pendiente_legal | en_firmas | abogado, coordinador_legal, super_admin |
| pendiente_legal | rechazado | abogado, coordinador_legal, super_admin |
| pendiente_cliente | en_revision_legal | solicitante |
| en_revision_legal | pendiente_cliente | abogado, coordinador_legal, super_admin |
| en_revision_legal | en_firmas | abogado, coordinador_legal, super_admin |
| en_revision_legal | rechazado | abogado, coordinador_legal, super_admin |
| en_firmas | completado | sistema (DocuSign polling/webhook) |

### Reglas del SLA

- El contador arranca cuando el cliente envía por primera vez (`submitted_at`)
- Plazo: **3 días hábiles** (lunes a viernes, sin festivos México) — configurable por tipo de contrato
- El reloj **nunca se pausa ni reinicia** mientras la solicitud esté abierta
- Se cierra al llegar a `completado` o `rechazado` — `sla_closed_at` se guarda en BD
- Si se reasigna entre abogados, el contador **no se reinicia**
- **Semáforo:** verde (>1 día), amarillo (≤1 día), rojo (vencido)
- Los pendientes atrasados **no cuentan en el balanceo** de abogados
- **Frontend:** el tiempo del SLA se **congela** en `sla_closed_at` para sobres cerrados
- **Frontend:** el semáforo (círculo) aparece gris en sobres `completado` o `rechazado`
- **Frontend:** el color del texto del SLA aparece `text-slate-400` en sobres cerrados

### Lógica de balanceo de abogados

1. Obtener lista de abogados activos asignados al tipo de contrato
2. Contar solicitudes pendientes **no atrasadas** de cada uno
3. Asignar al que tenga **menos pendientes no atrasadas**
4. En empate: asignar al que lleva **más tiempo sin recibir** una nueva solicitud

### Folio autogenerado

Formato: `ENV-2026-XXXX`
Tabla: `folio_sequences` — contador por año, atómico en BD.

---

## 8. Modelo de datos — tablas en `avalanz_legal`

### envelopes (tabla principal)

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| folio | VARCHAR(20) UNIQUE | ENV-2026-0001 |
| company_id | UUID | Empresa del solicitante |
| company_name | VARCHAR(255) | Desnormalizado |
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
| completed_at | DateTime | |
| correction_checklist | JSON | |
| is_intercompany | Boolean | Contrato entre empresas del grupo |
| counterparty_company_id | UUID | Para intercompany |
| docusign_envelope_id | VARCHAR(100) | **ID del sobre en DocuSign** |
| is_deleted | Boolean | Soft delete |
| deleted_at / deleted_by | DateTime / UUID | |

### envelope_signers

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | → envelopes |
| signer_type | VARCHAR(20) | internal / external |
| user_id | UUID | Para firmantes internos |
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
| declined_reason | TEXT | |
| docs_requested / docs_received | JSON | |

### envelope_attachments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | → envelopes |
| attachment_def_id | UUID FK | → contract_type_attachment_defs (opcional) |
| original_name | VARCHAR(255) | Renombrado con nombre del def al subir |
| stored_name | VARCHAR(255) | Nombre con UUID en MinIO |
| object_key | VARCHAR(500) | Ruta en MinIO |
| bucket | VARCHAR(100) | `dirdoc` |
| mime_type | VARCHAR(100) | |
| extension | VARCHAR(20) | |
| size_bytes | BigInteger | |
| checksum | VARCHAR(64) | |
| uploaded_by_user_id | UUID | |
| uploaded_by_name | VARCHAR(255) | Desnormalizado |
| uploaded_at | DateTime | |
| version_number | Integer | Para versionado |
| is_current | Boolean | **True = versión activa** |
| document_type | VARCHAR(50) | |
| replaced_at / replaced_by_user_id / replaced_by_name / replaced_reason | | Auditoría de reemplazo |
| is_deleted | Boolean | Soft delete |
| description | TEXT | |

> **Regla de versionado:** cuando DocuSign archiva el PDF firmado, solo los adjuntos con `mime_type=application/pdf` se marcan `is_current=False`. Los anexos (INE, pasaporte, etc.) NO se afectan.
> **Visibilidad:** versiones anteriores (`is_current=False`) solo las ven roles `!== 'solicitante'`.

### contract_types

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | |
| slug | VARCHAR(255) UNIQUE | Identificador URL |
| description | Text | |
| sla_business_days | Integer | Default: 3 |
| is_active | Boolean | |
| template_slug | VARCHAR(100) | Slug del template HTML |
| template_version | VARCHAR(20) | |
| created_by | UUID | |

### contract_type_attachment_defs

Definición de anexos requeridos y opcionales por tipo de contrato.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| contract_type_id | UUID FK | → contract_types |
| name | VARCHAR(255) | Nombre del anexo (ej. "INE Vigente") |
| description | Text | |
| is_required | Boolean | |
| allowed_mime_types | JSON | |
| display_order | Integer | |

### lawyer_assignments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| lawyer_user_id | UUID | UUID del usuario en `avalanz_admin.users` |
| lawyer_name | VARCHAR(255) | Desnormalizado |
| lawyer_email | VARCHAR(255) | Desnormalizado |
| contract_type_id | UUID FK | → contract_types |
| is_active | Boolean | Si recibe nuevas solicitudes |
| assigned_by | UUID | Coordinador que hizo la asignación |

### envelope_status_logs

Bitácora **inmutable** de cada cambio de estado.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | |
| from_status | VARCHAR(50) | null en creación |
| to_status | VARCHAR(50) | |
| changed_by_user_id | UUID | |
| changed_by_name | VARCHAR(255) | Desnormalizado |
| changed_by_role | VARCHAR(100) | Rol en el momento del cambio |
| reason | Text | Requerido en rechazos y correcciones |
| changed_at | DateTime | |
| ip_address | VARCHAR(45) | |

### envelope_time_tracking

Tiempo en cada estado por usuario. Para diagnóstico de SLA.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | |
| status | VARCHAR(50) | Estado que se está midiendo |
| responsible_user_id | UUID | |
| responsible_user_name | VARCHAR(255) | |
| started_at | DateTime | |
| ended_at | DateTime | null si es el estado actual |
| duration_minutes | Integer | Calculado al cerrar |

### envelope_comments

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | |
| author_user_id | UUID | |
| author_name | VARCHAR(255) | Desnormalizado |
| author_role | VARCHAR(100) | |
| body | Text | |
| is_internal | Boolean | **True = solo lo ve el equipo legal** |
| created_at / edited_at | DateTime | |
| is_deleted | Boolean | |

### envelope_activity_logs

Log general de toda actividad.

| Columna | Tipo | Descripción |
|---|---|---|
| action | VARCHAR(100) | viewed, submitted, approved, rejected, corrections_requested, attachment_uploaded, lawyer_reassigned, lawyer_started_review, docusign_signing_completed, signed_document_archived, envelope_completed |
| performed_by_user_id | UUID | |
| performed_by_name | VARCHAR(255) | Desnormalizado |
| performed_by_role | VARCHAR(100) | |
| performed_at | DateTime | |
| ip_address | VARCHAR(45) | |
| detail | JSON | `{"field": "counterparty_name", "old": "A", "new": "B"}` |

### envelope_form_snapshots

Snapshot **inmutable** del formulario en cada envío del cliente.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID PK | |
| envelope_id | UUID FK | |
| version | Integer | 1, 2, 3... por cada reenvío |
| form_data | JSON | Estado del formulario en ese momento |
| submitted_by_user_id | UUID | |
| submitted_by_name | VARCHAR(255) | |
| submitted_at | DateTime | |

### signing_provider_config

| Columna | Tipo | Descripción |
|---|---|---|
| id | Integer PK | Siempre 1 (registro único) |
| provider | VARCHAR(50) | `email_sim` o `docusign` (actualmente: `docusign`) |
| updated_by | UUID | |
| updated_at | DateTime | |

### folio_sequences

| Columna | Tipo | Descripción |
|---|---|---|
| year | Integer UNIQUE | 2026, 2027... |
| last_sequence | Integer | Último número usado |

### Migraciones aplicadas (7, HEAD: e7f1a2b3c4d5)

| Revision | Descripción |
|---|---|
| `fd194ef42a01` | Initial schema |
| `a7d79d465637` | Rename to envelopes |
| `2c4cbf7f7b31` | Add envelope_signers |
| `425fe54b7106` | Add template slug/version, mime types, correction checklist |
| `a62f97aa714d` | Add signing tokens + provider config |
| `d3a02f07031f` | Add version tracking to attachments + intercompany fields |
| `e7f1a2b3c4d5` | Add DocuSign fields — docusign_envelope_id, sign_here_anchor, etc. |

---

## 9. DocuSign — estado actual COMPLETO ✅

### Completado

- ✅ Token JWT Grant funcionando contra sandbox
- ✅ `create_envelope()` — sobre creado y enviado a DocuSign
- ✅ PDF descargado de MinIO con boto3 (S3 API directa)
- ✅ Firmantes con anclas de posición (`*FIRMA1*`, `*NOMBRE1*`, `*FECHA_FIRMA1*`)
- ✅ Auto-construcción de firmantes desde `form_data` + `signers_definition` del `fields.json` cuando no hay firmantes en BD
- ✅ `EMAIL_FIRMANTE_1` y `EMAIL_FIRMANTE_2` en el formulario del NDA Mutuo
- ✅ Correos de DocuSign llegando correctamente
- ✅ Webhook DocuSign Connect funcionando — HTTP 200, IPs `20.xxx.xxx.xxx`
- ✅ Polling cada 5 minutos via cron con `docker exec`
- ✅ PDF firmado descargado de DocuSign y archivado en MinIO automáticamente
- ✅ Solo los PDFs del contrato se marcan `is_current=False` — los anexos no se afectan
- ✅ Logs de actividad: `docusign_signing_completed`, `signed_document_archived`, `envelope_completed`
- ✅ Approve + send-for-signing encadenados en el frontend

### Configuración DocuSign Connect

- Config ID: `22211442`
- URL: `https://intranet.avalanz.com/api/v1/legal/envelopes/docusign/webhook`
- Evento: `Envelope Signed/Completed`
- Data: `Recipients`
- Formato: REST v2.1
- IPs sandbox NA: `54.240.115.126-137`, `161.38.201.200/29` — pendiente apertura en firewall corporativo

### Crontabs configurados en servidor

```bash
crontab -l
0 11 * * * docker exec avalanz-legal curl -s -X POST http://localhost:8000/api/v1/legal/envelopes/internal/update-sla-flags > /dev/null 2>&1
*/5 * * * * docker exec avalanz-legal curl -s -X POST http://localhost:8000/api/v1/legal/envelopes/internal/docusign-poll > /dev/null 2>&1
```

### Funciones de docusign_service.py

| Función | Descripción |
|---|---|
| `get_access_token()` | JWT Grant → Bearer token. Cacheado con margen de 60s |
| `create_envelope(pdf_bytes, folio, contract_type_name, signers)` | Crea y envía el sobre. Retorna `docusign_envelope_id` |
| `get_envelope_status(docusign_envelope_id)` | Consulta estado del sobre |
| `download_signed_document(docusign_envelope_id)` | Descarga PDF firmado usando `documentId="1"` (no GUID — el GUID da 404) |
| `verify_webhook_payload(payload)` | Valida payload REST v2.1 — busca `envelopeId` en `data.envelopeId` o raíz |

### Flujo de firma completo (auto-documentado)

```
Abogado aprueba desde frontend
    → approve() + sendForSigning() encadenados automáticamente en handleApprove
    → signing_service._send_docusign()
        → descarga PDF de MinIO con boto3
        → construye firmantes desde BD o auto-construye desde form_data + fields.json
        → guarda nuevos firmantes en BD si no existían
        → docusign_service.create_envelope() → JWT Grant → POST /envelopes
        → guarda docusign_envelope_id en BD
    → DocuSign envía correos a firmantes con routing_order secuencial
    → cuando todos firman → webhook llega a POST /envelopes/docusign/webhook
    → _process_completed_envelope()
        → marca PDFs anteriores como is_current=False (solo mime_type=application/pdf)
        → descarga PDF firmado de DocuSign usando documentId="1"
        → sube a MinIO: {company_slug}/legal/envelopes/{folio}/firmado/{uuid}_{folio}_firmado.pdf
        → registra en envelope_attachments (is_current=True, extension="pdf")
        → actualiza firmantes a status="signed", signed_at=now
        → envelope.status = "completado", sla_closed_at=now, completed_at=now
        → 3 logs de actividad: docusign_signing_completed, signed_document_archived, envelope_completed
    → cron cada 5 min como respaldo si el webhook falla
```

### Anclas de firma en NDA Mutuo

```html
<!-- template.html — texto invisible color blanco sobre fondo blanco -->
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA2*</span>
```

### fields.json — signers_definition actual (NDA Mutuo)

```json
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

---

## 10. Endpoints completos

Todos bajo `/api/v1/legal/envelopes`.

### Tipos de contrato (routes.py)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | /types | Todos | Listar tipos activos |
| GET | /types/{id} | Todos | Tipo con campos y defs de anexos |
| POST | /types | coordinador_legal, super_admin | Crear tipo |
| PATCH | /types/{id} | coordinador_legal, super_admin | Actualizar tipo |
| POST | /types/{id}/lawyers | coordinador_legal, super_admin | Asignar abogado |
| DELETE | /lawyers/assignments/{id} | coordinador_legal, super_admin | Desactivar asignación |
| GET | /lawyers | coordinador_legal, super_admin | Listar abogados disponibles |
| GET | /types/{id}/attachments | Todos | Definiciones de anexos requeridos |

### Sobres (routes.py)

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| GET | / | Todos (filtrado) | Listar paginados (8/página) |
| POST | / | Todos | Crear en borrador |
| GET | /{id} | Todos (filtrado) | Detalle completo con trazabilidad |
| PATCH | /{id} | solicitante | Editar borrador |
| POST | /{id}/submit | solicitante | Enviar al área legal |
| POST | /{id}/approve | abogado, coord, super | Aprobar → en_firmas |
| POST | /{id}/request-corrections | abogado, coord, super | Pedir correcciones |
| POST | /{id}/reject | abogado, coord, super | Rechazar |
| POST | /{id}/complete | abogado, coord, super | Marcar completado |
| POST | /{id}/reassign | coordinador_legal, super_admin | Reasignar abogado |

### Firmantes (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /{id}/signers | Listar firmantes del sobre |
| POST | /{id}/signers | Agregar firmante (solo borrador/pendiente_cliente) |
| PATCH | /{id}/signers/{sid} | Actualizar firmante |
| DELETE | /{id}/signers/{sid} | Eliminar firmante |

### Adjuntos (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| POST | /{id}/attachments | Registrar archivo subido a MinIO |
| GET | /{id}/attachments | Listar adjuntos |

### Trazabilidad (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /{id}/comments | Listar comentarios |
| POST | /{id}/comments | Agregar comentario |
| GET | /{id}/status-log | Historial de estados |
| GET | /{id}/time-tracking | Tiempo por estado |
| GET | /{id}/activity-log | Log completo de actividad |
| GET | /{id}/form-snapshots | Versiones del formulario |

### Firma (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /signing/provider | Ver proveedor activo |
| POST | /signing/provider | Cambiar proveedor (super_admin) |
| POST | /{id}/send-for-signing | Enviar a firma con proveedor activo |
| GET | /signing/confirm/{token} | Confirmar firma email_sim — sin auth |

### Templates (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /contract-templates | Listar templates disponibles |
| GET | /contract-templates/{slug}/fields | Campos del template |
| POST | /contract-templates/{slug}/preview | Preview HTML |
| POST | /contract-templates/{slug}/preview-pdf | Preview PDF (WeasyPrint) |

### Reportes e internos (routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| GET | /reports/sla | Reporte SLA actual |
| POST | /internal/update-sla-flags | Cron diario SLA — sin auth |

### DocuSign (docusign_routes.py)

| Método | Ruta | Descripción |
|---|---|---|
| POST | /docusign/webhook | Webhook DocuSign Connect — sin auth JWT |
| POST | /internal/docusign-poll | Polling cada 5 min — sin auth JWT |

---

## 11. Frontend — archivos principales

| Archivo | Ruta completa |
|---|---|
| Página principal legal | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Tabla de contratos | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Stepper nuevo contrato | `frontend/app/(private)/app/legal/solicitud-de-contratos/nuevo/page.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API legal | `frontend/services/legalService.ts` |

### legalService.ts — funciones relevantes

```typescript
export const sendForSigning = (envelopeId: string) =>
  api.post(`${BASE}/${envelopeId}/send-for-signing`)
export const getSigningProvider = () => api.get(`${BASE}/signing/provider`)
export const setSigningProvider = (provider: 'docusign' | 'email_sim') =>
  api.post(`${BASE}/signing/provider`, { provider })
export const getSigners    = (id: string) => api.get(`${BASE}/${id}/signers`)
export const createSigner  = (id: string, data: any) => api.post(`${BASE}/${id}/signers`, data)
export const updateSigner  = (id: string, sid: string, data: any) => api.patch(`${BASE}/${id}/signers/${sid}`, data)
export const deleteSigner  = (id: string, sid: string) => api.delete(`${BASE}/${id}/signers/${sid}`)
```

### ContractRequestsTable.tsx — comportamiento actual

- `handleApprove` en slide-over y ActionMenu encadenan `approve` + `sendForSigning` automáticamente
- `SLADot` (círculo de color): aparece gris `bg-slate-300 ring-slate-100` cuando `status === 'completado' || 'rechazado'`
- `SLAPill` (tiempo del SLA): congela el tiempo en `sla_closed_at` cuando el sobre está cerrado; color `text-slate-400` en sobres cerrados
- Versiones anteriores de documentos: visibles solo para roles `!== 'solicitante'`
- `STATUS_CFG` actual:
  - `borrador`: slate
  - `pendiente_legal`: amber
  - `pendiente_cliente`: orange
  - `en_revision_legal`: blue
  - `en_firmas`: violet
  - `completado`: green
  - `rechazado`: red

### Stepper de nuevo contrato (nuevo/page.tsx)

- Step 1: Selección de tipo de contrato
- Step 2: Datos del formulario (grid 2 columnas para campos cortos, full-width para textareas)
- Step 3: Anexos — renombra archivos con `${folio}_${def.name}.${ext}` usando el nombre del `attachmentDef`
- Step 4: Preview HTML + descarga PDF
- Step 5: Confirmación y envío

### contract.types.ts — tipos relevantes

```typescript
interface EnvelopeListItem {
  sla_due_at: string | null
  sla_closed_at: string | null  // ← agregado para congelar SLA
  is_sla_breached: boolean
  sla_color: SLAColor
}
```

---

## 12. MinIO — integración

- **Bucket:** `dirdoc`
- **URL interna Docker:** `http://avalanz-minio:9000`
- **Ruta contratos:** `dirdoc/{company_slug}/legal/envelopes/{folio}/`
- **Ruta firmados:** `dirdoc/{company_slug}/legal/envelopes/{folio}/firmado/`
- **Descarga desde legal-service:** boto3 directo (S3 API) — no usa el upload-service porque requiere JWT

```python
s3 = boto3.client("s3",
    endpoint_url="http://avalanz-minio:9000",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)
pdf_bytes = s3.get_object(Bucket="dirdoc", Key=object_key)["Body"].read()
```

---

## 13. Migraciones Alembic

```bash
# Correr desde el servidor
export DB_HOST=$(docker inspect avalanz-postgres | grep '"IPAddress"' | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
export DB_USER=avalanz_user
export DB_NAME=avalanz_legal

cd ~/intranet-avalanz/backend/modules/legal-service

# Generar migración
alembic revision --autogenerate -m "descripcion"

# Aplicar
alembic upgrade head

# Ver estado actual
alembic current
```

> El `env.py` de Alembic lee las variables de entorno — nunca el `alembic.ini`.

---

## 14. Datos de prueba en servidor

```bash
# Conectar
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal

# Tipos de contrato
SELECT id, name, slug FROM contract_types;
-- 11111111-1111-1111-1111-111111111111: NDA Mutuo (nda-mutuo)

# Sobres recientes
SELECT folio, status, docusign_envelope_id, completed_at
FROM envelopes WHERE is_deleted=false ORDER BY created_at DESC LIMIT 10;

# Firmantes con anclas
SELECT es.name, es.email, es.sign_here_anchor, es.status
FROM envelope_signers es
JOIN envelopes e ON e.id = es.envelope_id
WHERE e.folio = 'ENV-2026-0054';

# Usuarios de prueba
-- admin@avalanz.com / Admin@2026!  (super_admin)
-- soporte@avalanz.com              (coordinador_legal — Lourdes Ruiz)
-- abraham_covarrubias@cnci.com.mx  (abogado — Felipe González)
```

---

## 15. Comandos frecuentes en el servidor

```bash
# Deploy backend legal
cd ~/intranet-avalanz/backend/modules/legal-service
docker cp contract_requests/routes.py avalanz-legal:/app/contract_requests/routes.py
docker cp contract_requests/docusign_routes.py avalanz-legal:/app/contract_requests/docusign_routes.py
docker cp contract_requests/signing_service.py avalanz-legal:/app/contract_requests/signing_service.py
docker cp contract_requests/docusign_service.py avalanz-legal:/app/contract_requests/docusign_service.py
docker restart avalanz-legal && sleep 5 && docker logs avalanz-legal --tail 6

# Deploy frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Polling manual DocuSign
docker exec avalanz-legal curl -s -X POST \
  "http://localhost:8000/api/v1/legal/envelopes/internal/docusign-poll" | python3 -m json.tool

# Ver logs webhook
docker logs avalanz-legal --tail 30 2>&1 | grep -i "webhook\|docusign\|completado"

# Rebuild contenedor (pierde archivos copiados manualmente — ver sección 2)
cd ~/intranet-avalanz/infrastructure/docker
docker compose up -d legal-service

# Recargar Nginx
docker exec avalanz-nginx nginx -s reload

# Ver estado general
docker ps --format "table {{.Names}}\t{{.Status}}"
pm2 status

# Probar DocuSign token
docker exec avalanz-legal python3 -c "
import asyncio, sys; sys.path.insert(0, '/app')
from contract_requests.docusign_service import get_access_token
print('TOKEN OK:', asyncio.run(get_access_token())[:30])
"
```

---

## 16. Pendientes para próximas sesiones

| # | Tarea | Prioridad |
|---|---|---|
| 1 | Panel de firmantes en slide-over (sección debajo de Documentos con status badge) | 🔴 Alta |
| 2 | Notificaciones push (sobre en firmas, firma completada, asignación) | 🔴 Alta |
| 3 | Auto-refresh de tabla sin recargar página | 🟡 Media |
| 4 | Versiones anteriores de documentos visibles en slide-over | 🟡 Media |
| 5 | Rebuild imagen Docker con todos los cambios permanentes | 🟡 Media |
| 6 | Apertura de IPs DocuSign en firewall corporativo (IT ticket pendiente) | 🟡 Media |
| 7 | Reporte SLA diario por correo (cron 11 AM) | 🟡 Media |
| 8 | Panel KPIs para coordinador y director | 🟡 Media |
| 9 | Go-Live DocuSign a producción | ⬜ Futuro |
| 10 | Integración NOM-151 con proveedor certificado | ⬜ Futuro |
| 11 | Intercompany contracts (v2) | ⬜ Futuro |
| 12 | Submódulo Archivo de Secretaría Corporativa | ⬜ Futuro |
| 13 | Formulario de nueva solicitud para tipos de contrato sin template | ⬜ Futuro |