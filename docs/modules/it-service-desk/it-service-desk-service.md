# IT Service Desk Service — Guía de Referencia

Ubicación: `backend/modules/it-service-desk-service/`

Servicio de mesa de ayuda de la plataforma Avalanz. Nació como "Mesa de Soporte" (gestión de Incidentes) y se está expandiendo hacia un orquestador de flujos de trabajo más amplio: hoy cubre **Incidentes** y **Control de Cambios (CDC)**, con **Solicitud de Accesos (ACC)** planeada. El nombre visible al usuario ("IT Service Desk") ya es lo bastante general para esta ampliación; el nombre interno del código conserva referencias a "mesa de soporte" e "incidencias" por herencia histórica, y se va renombrando gradualmente conforme se toca cada archivo — no de golpe, por decisión explícita del dueño del proyecto.

---

## Índice

1. Contexto de negocio y alcance
2. Arquitectura general
3. Estructura de archivos del backend
4. Stack tecnológico
5. Configuración (.env)
6. Docker del servicio
7. Base de datos — estructura y esquemas
8. Motor de asignación — fórmulas y lógica
9. Endpoints — todos los routers
10. Estructura de MinIO
11. Nginx
12. WebSocket / tiempo real
13. RabbitMQ
14. Trazabilidad y logs
15. Perfiles de usuario y roles (resumen — detalle en documento propio)
16. Frontend
17. Brechas conocidas y pendientes

---

## 1. Contexto de negocio y alcance

### 1.1 Qué resuelve

El proceso documentado como **"Verus"** (`Verus_Proceso_Gestion_Incidencias_V2.docx`, `Verus_Proceso_Controles_de_Cambio_V1.docx`, `Verus_Proceso_ABC_Roles_y_Perfiles_V1.docx`) define la gestión formal de incidencias, control de cambios y accesos para el ERP TOTVS y sus sistemas periféricos (Portal de Proveedores, CRM Odoo DYCE, CRM Odoo Vanta Media, TOTVS V25), usado por las empresas del grupo (Corporativo/AGIM, DYCE, SPPEL, Vanta Media). Este servicio es la implementación de ese proceso dentro de la Intranet Avalanz, sección "Mesa de Servicios".

La plataforma compite directamente contra una cotización de software comercial equivalente — es una justificación de negocio activa de todo el proyecto, no solo de este módulo.

### 1.2 Los 3 tipos de ticket (columna `ticket_type`)

| Tipo | `ticket_type` | Sigla de folio | Qué es | Estado de construcción |
|---|---|---|---|---|
| Incidente | `incidente` | `INC` | Falla, error, duda de uso o caída de servicio sobre un sistema ya existente | Completo — Kanban, tabla, tiempo real, SLA, correos, cierre automático |
| Control de Cambios | `control_cambio` | `CDC` | Solicitud de una funcionalidad nueva o mejora a algo existente — en esencia, gestión de proyectos | En construcción — etapa "Registrado" completa (formulario, PDF, MinIO, motor); resto de etapas pendiente |
| Solicitud de Accesos | `solicitud_acceso` | `ACC` | Alta, baja o modificación de acceso a un sistema — requiere un PDF firmado por el usuario | No iniciado — placeholder deshabilitado en el modal de creación |

Los 3 tipos se ofrecen desde un mismo punto de entrada ("Nuevo ticket" → modal de selección de tipo), decisión explícita del dueño del proyecto para no fragmentar la experiencia en módulos separados, aun cuando CDC tiene un ciclo de vida y roles distintos a Incidente. Los tres **comparten la misma tabla `incidents`** (folio, estatus, solicitante, fechas) — ver sección 7 para el razonamiento completo de este diseño.

### 1.3 Roles del proceso — Incidente

| Rol | Responsabilidad principal | Interactúa con |
|---|---|---|
| Usuario solicitante | Detecta y reporta la incidencia; valida la solución antes del cierre | Incident Manager |
| Incident Manager | Punto único de contacto — recibe, clasifica severidad, canaliza, da seguimiento a SLA, cierra formalmente | Solicitante, Project Manager, equipos |
| Project Manager | Seguimiento del estatus general, evalúa escalamiento a Dirección, reporta al comité directivo | Incident Manager, Dirección |
| Equipo funcional | Configuración, parametrización, procesos de negocio del ERP y CRMs | Incident Manager |
| Equipo técnico | Infraestructura, bases de datos, integraciones, desempeño | Incident Manager, soporte TOTVS |
| Administrador del sistema | Roles y accesos — hoy vive en `admin-service`, no en este servicio | Incident Manager, técnico, auditoría |
| Auditoría | Controles internos, segregación de funciones, cumplimiento | Incident Manager, Dirección |
| Soporte TOTVS / Nivel 3 | Parches del fabricante o desarrollo a la medida | Equipos, Incident Manager |

### 1.4 Roles del proceso — Control de Cambios (decisión propia del proyecto, distinta del documento fuente)

El documento Verus original para CDC define un rol "Champion" por empresa/sistema que dictamina factibilidad. **Esa decisión fue revertida explícitamente durante la construcción**: no se creó ningún rol nuevo. CDC lo manejan los mismos **Incident Manager** y **Project Manager** ya existentes, con el mismo alcance entre ambos sobre estos tickets. La etiqueta visible al usuario durante "En revisión" debe leerse como *"En revisión por Gerencia de Proyectos"*, sin implicar un rol técnico nuevo en el sistema de permisos.

### 1.5 Severidad y SLA — Incidente

La severidad la propone el solicitante al reportar; el Incident Manager la valida/ajusta durante el triage. Horario hábil del proyecto: lunes a viernes, 8:00–18:00 hrs CDMX, salvo S1 que aplica 24/7 durante estabilización post-liberación.

| Severidad | Criterio | Respuesta | Resolución |
|---|---|---|---|
| S1 — Crítica | Interrupción total de un proceso crítico, sin workaround, afecta a una o más empresas | ≤ 15 min | ≤ 4 horas |
| S2 — Alta | Funcionalidad relevante no disponible o degradada; workaround limitado | ≤ 30 min | ≤ 8 horas hábiles |
| S3 — Media | Afecta a grupo reducido o proceso no crítico; workaround razonable | ≤ 2 horas hábiles | ≤ 24 horas hábiles (3 días) |
| S4 — Baja | Duda de uso, error cosmético, mejora menor, un solo usuario | ≤ 4 horas hábiles | ≤ 5 días hábiles |

Los tiempos de resolución son objetivos de servicio, no garantías absolutas. Actualizaciones periódicas al solicitante: cada 30 min (S1), cada 2 horas (S2), diario (S3), al resolverse (S4).

Control de Cambios **no usa severidad ni SLA automático** — usa en su lugar "Impacto si no se realiza" (alto/medio/bajo) y "Urgencia solicitada" (alta/media/baja) como campos propuestos por el solicitante, y su SLA se define manualmente por quien revisa, según la naturaleza del proyecto.

### 1.6 Formato de folio

```
{PREFIJO_TIPO}-{CLAVE_FAMILIA}-{CONSECUTIVO 6 DÍGITOS}
```

Ejemplos reales: `INC-AVAL-000058`, `CDC-AVAL-000010`. El consecutivo es atómico por combinación (prefijo, clave de familia) — nunca se reutiliza, ni si el ticket se cancela o rechaza, para conservar trazabilidad histórica. Ver sección 7.3 (`folio_counters`) para la implementación.

> **Nota de brecha entre documento fuente y código:** el documento Verus original define el prefijo por *empresa* (`COR`, `DYC`, `SPP`, `VAN`) con 4 dígitos. La implementación real usa `family_clave` (clave de la familia de empresas, ej. `AVAL` para Grupo Avalanz) con 6 dígitos, y el prefijo identifica el *tipo de ticket* (`INC`/`CDC`/`ACC`), no la empresa — la empresa queda reflejada en la clave de familia y en `company_id`. Este documento describe lo implementado; para la intención de negocio original ver los `.docx` de Verus en el proyecto.

### 1.7 RCA (Root Cause Analysis) — pendiente de construir

Para toda incidencia S1, y S2 cuando el Incident Manager lo considere relevante, se documenta un análisis de causa raíz dentro de los 5 días hábiles posteriores al cierre (descripción y línea de tiempo, causa raíz, solución aplicada, acciones preventivas y responsables). El modelo `Incident` ya tiene columnas `rca_text` y `rca_due_date` — **el flujo de captura y recordatorio del RCA no está construido todavía** (columnas presentes, lógica pendiente).

---

## 2. Arquitectura general

```
Frontend (Next.js)
      │
      ▼
   nginx (proxy inverso, puerto 80/443)
      │  /api/v1/it-service-desk/*
      ▼
┌─────────────────────────────────────────────┐
│         it-service-desk-service              │
│         (FastAPI, puerto 8000 interno)        │
│                                                │
│  ┌──────────────┐  ┌────────────────────┐    │
│  │ mesa_de_soporte│  │ control_cambios    │    │
│  │ (Incidente)   │  │ (CDC)              │    │
│  └──────────────┘  └────────────────────┘    │
│  ┌──────────────┐  ┌────────────────────┐    │
│  │ actualizaciones│  │ it_service_desk    │    │
│  │ (catálogos)   │  │ (stub, sin uso)    │    │
│  └──────────────┘  └────────────────────┘    │
│                                                │
│  Consumidor RabbitMQ en background (asyncio)  │
│  → motor de asignación                        │
└───────┬────────┬────────┬────────┬───────────┘
        │        │        │        │
        ▼        ▼        ▼        ▼
   PostgreSQL  admin-  upload-  email-/notify-
   (BD propia) service service  service
   avalanz_it_          (MinIO)
   service_desk

Además:
- websocket-service ← recibe eventos para tiempo real (tabla + Kanban)
- RabbitMQ ← cola "incidencias.motor.asignacion"
- cron container ← dispara reportes SLA diario y cierre automático 24h
```

### 2.1 Comunicación con otros servicios

| Servicio | Dirección | Para qué |
|---|---|---|
| admin-service | it-service-desk → admin | Perfil del solicitante (`/internal/users/{id}/profile`), catálogo de departamentos (`/internal/departamentos`), usuarios por rol de módulo (`/internal/users/by-module-role`) |
| upload-service | it-service-desk → upload | Subir evidencia, PDFs de solicitud CDC, generar URLs firmadas de descarga |
| email-service | it-service-desk → email | Correos de notificación (creación, asignación, resolución) y el reporte diario de SLA con gráfica embebida |
| notify-service | it-service-desk → notify | Notificaciones in-app |
| websocket-service | it-service-desk → websocket | Broadcast de eventos `it_service_desk.ticket_created` / `ticket_updated` para tiempo real |
| RabbitMQ | it-service-desk ↔ RabbitMQ | Publica al crear un ticket; el propio servicio consume en background para correr el motor de asignación |

Todas las URLs internas usan el nombre del contenedor Docker: `http://admin-service:8000/...`, `http://upload-service:8000/...`, etc.

---

## 3. Estructura de archivos del backend

```
backend/modules/it-service-desk-service/
├── alembic.ini
├── Dockerfile
├── requirements.txt
├── .env / .env.example
├── app/
│   ├── main.py                          → Entry point, arranca el consumidor RabbitMQ en background
│   ├── config.py                        → Configuración (pydantic-settings)
│   ├── database.py                      → Motor async, sesión de BD
│   ├── motor.py                         → Motor de asignación — "función cerrada" (ver sección 8)
│   ├── rabbitmq.py                      → Publicador y consumidor de la cola de asignación
│   ├── assignment.py                    → finalize_assignment — aplica una asignación ya resuelta
│   ├── models/
│   │   └── mesa_de_soporte.py           → TODOS los modelos SQLAlchemy del servicio (catálogos, Incident, CDC, logs)
│   ├── routes/
│   │   ├── __init__.py                 → Router agregador — registra todos los sub-routers
│   │   ├── it_service_desk.py           → Stub generado por scaffold, sin uso real
│   │   ├── mesa_de_soporte/
│   │   │   └── mesa_de_soporte.py       → Incidente completo: CRUD, asignación, resolución, SLA, reportes (~1600 líneas)
│   │   ├── control_cambios/
│   │   │   └── control_cambios.py       → CDC: creación (etapa Registrado), PDF, evidencia, catálogos puente
│   │   └── actualizaciones/
│   │       └── actualizaciones.py       → Catálogos: sistemas, módulos, especialistas
│   ├── services/
│   │   ├── mesa_de_soporte/mesa_de_soporte_service.py
│   │   ├── actualizaciones/actualizaciones_service.py
│   │   └── it_service_desk_service.py   → Stub, sin uso real
│   ├── cron/
│   │   ├── chart_generator.py           → Genera el PNG de barras (matplotlib/Agg) para el correo de SLA
│   │   └── templates/sla_report_template.py → HTML del correo diario de SLA
│   └── static/
│       └── logo_avalanz.png             → Logo usado en el PDF de solicitud de CDC (reportlab)
└── migrations/
    ├── env.py / script.py.mako
    └── versions/                        → Ver sección 7.5 para el listado
```

### 3.1 Por qué existen 3 routers separados para negocio (no uno solo)

`mesa_de_soporte.py`, `control_cambios.py` y `actualizaciones.py` son archivos separados a propósito — decisión explícita para no mezclar la lógica de Incidente (ya de por sí ~1600 líneas) con la de CDC, que apenas empieza. Comparten tabla, folio, broadcast de tiempo real y notificaciones (importados desde `mesa_de_soporte.py` hacia `control_cambios.py`), pero cada quien mantiene su propia lógica de negocio en su propio archivo.

---

## 4. Stack tecnológico

### Backend

| Componente | Tecnología / versión |
|---|---|
| Framework | FastAPI 0.111.0 |
| Servidor ASGI | Uvicorn 0.29.0 (`uvicorn[standard]`) |
| Base de datos | PostgreSQL — SQLAlchemy 2.0.30 async, driver `asyncpg` 0.29.0 |
| Migraciones | Alembic 1.13.1 |
| JWT | `python-jose[cryptography]` 3.3.0 |
| HTTP cliente (a otros servicios) | httpx 0.27.0 |
| Mensajería | `aio-pika` 9.4.1 (RabbitMQ) |
| Excel | `openpyxl` 3.1.2 |
| Gráficas (correo SLA) | `matplotlib` 3.9.0 (backend `Agg`, sin display) |
| PDF (solicitud CDC) | `reportlab` 4.2.2 — agregado 2026-09-25 |
| Métricas | `prometheus-fastapi-instrumentator` 7.0.0 |
| Config | `pydantic-settings` 2.2.1 |

> `reportlab` se eligió tras confirmar que Legal genera sus PDFs de contrato del lado del **frontend** con jsPDF (no hay librería de PDF en ningún backend de la plataforma antes de esto). Se decidió backend para CDC porque la "solicitud" es un documento formal de registro, no algo que el usuario edite o previsualice interactivamente — conviene que salga idéntico siempre y se pueda regenerar sin depender del navegador.

### Frontend (piezas específicas de este módulo — ver `frontend.md` para el stack general)

| Pieza | Ubicación |
|---|---|
| Tabla + Kanban de Incidente | `frontend/app/(private)/app/it-service-desk/mesa-de-soporte/page.tsx` |
| Componentes de Incidente | `frontend/components/app/it-service-desk/mesa-de-soporte/` |
| Modal selector de tipo de ticket | `NewTicketTypeModal.tsx` |
| Modal de creación de CDC (pasarela 5 pasos) | `CreateControlCambioModal.tsx` |
| Servicios (llamadas API) | `frontend/services/itServiceDeskService.ts` |

---

## 5. Configuración (.env)

```env
SERVICE_NAME=it-service-desk-service
DATABASE_URL=postgresql+asyncpg://avalanz_user:Avalanz2026!@postgres:5432/avalanz_it_service_desk
JWT_SECRET_KEY=cambia-esta-clave-por-una-segura-en-produccion
JWT_ALGORITHM=HS256
RABBITMQ_URL=amqp://avalanz:Avalanz2026!@rabbitmq:5672/
FRONTEND_URL=https://intranet.avalanz.com
```

| Variable | Descripción | Default |
|---|---|---|
| SERVICE_NAME | Nombre del servicio (usado en logs/health) | it-service-desk-service |
| DATABASE_URL | Cadena de conexión async a PostgreSQL | — |
| JWT_SECRET_KEY | Misma clave que el resto de la plataforma — debe coincidir con auth-service | — |
| JWT_ALGORITHM | Algoritmo de firma del JWT | HS256 |
| RABBITMQ_URL | Cadena de conexión a RabbitMQ (usuario/contraseña/vhost) | — |
| FRONTEND_URL | Usado por el consumidor de correo si necesita construir links | http://localhost:3000 |

`config.py` usa `pydantic-settings`, carga `.env` automáticamente y expone una instancia única `config` importable desde cualquier módulo (`from app.config import config`).

---

## 6. Docker del servicio

### 6.1 Dockerfile

```dockerfile
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app
WORKDIR /app
COPY modules/it-service-desk-service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt
COPY modules/it-service-desk-service/ .
COPY shared/ /app/shared
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

El `context` de build es `../../backend` (no la carpeta del servicio directamente), porque también copia `shared/` — el middleware de validación de JWT (`JWTValidator`, `get_token_from_request`) es compartido entre todos los microservicios de la plataforma.

### 6.2 docker-compose.yml

```yaml
it-service-desk-service:
  build:
    context: ../../backend
    dockerfile: modules/it-service-desk-service/Dockerfile
  container_name: avalanz-it-service-desk
  restart: unless-stopped
  env_file:
    - ../../backend/modules/it-service-desk-service/.env
  environment:
    DB_HOST: postgres
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - avalanz-network
  logging: *default-logging
```

### 6.3 Comandos frecuentes

```bash
# Reconstruir tras cambios de código o dependencias nuevas
docker compose -f infrastructure/docker/docker-compose.yml up -d --build it-service-desk-service

# Reload de nginx (necesario tras rebuild -- IP interna cambia)
docker exec avalanz-nginx nginx -s reload

# Ver logs
docker logs avalanz-it-service-desk --tail 50

# Copiar un archivo sin rebuild completo + reiniciar (cambios rápidos de un solo archivo)
docker cp backend/modules/it-service-desk-service/app/routes/mesa_de_soporte/mesa_de_soporte.py avalanz-it-service-desk:/app/app/routes/mesa_de_soporte/mesa_de_soporte.py
docker restart avalanz-it-service-desk
```

> El consumidor de RabbitMQ corre como una tarea de `asyncio` **dentro del mismo proceso** de Uvicorn (arrancada en el evento `startup` de FastAPI) — no es un contenedor ni un worker separado. Si el consumidor truena, `main.py` lo reintenta automáticamente cada 5 segundos indefinidamente (`_run_consumer_forever`).

---

## 7. Base de datos — estructura y esquemas

Base de datos propia: `avalanz_it_service_desk`. Todas las tablas viven en el mismo modelo `models/mesa_de_soporte.py` (nombre heredado, aunque ya contiene tablas de CDC también).

### 7.1 Catálogos

#### ticket_severities
Catálogo de severidades S1–S4, configurable por el Incident Manager.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| code | String(4) | Único — "S1".."S4" |
| name | String(50) | Nombre visible |
| response_sla_minutes | Integer | Minutos de SLA de respuesta |
| resolution_sla_hours | Integer | Horas de SLA de resolución |
| is_24_7 | Boolean | Si aplica 24/7 (solo S1 en estabilización) |
| rca_mandatory | Boolean | Si requiere RCA obligatorio |
| is_active | Boolean | — |

#### ticket_systems
Catálogo abierto de sistemas (ERP TOTVS, Portal de Proveedores, CRM Odoo DYCE/Vanta, TOTVS V25...). Crece según se necesite, sin cambios de código.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| name | String(150) | Único |
| is_active | Boolean | — |

#### ticket_modules
Módulos dentro de cada sistema (ej. "Contabilidad" dentro de ERP TOTVS).

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| system_id | UUID FK → ticket_systems | Cascade delete |
| name | String(150) | Único junto con system_id |
| is_active | Boolean | — |

#### system_specialists
Catálogo central que consume el **motor de asignación** — a quién le toca cada sistema/módulo.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| system_id | UUID FK, nullable | NULL = aplica a cualquier sistema |
| module_id | UUID FK, nullable | NULL = aplica a cualquier módulo |
| team_type | String(30) | `especialista-funcional` / `especialista-tecnico` |
| specialist_user_id | UUID | Usuario asignado |
| is_active | Boolean | — |

**Las combinaciones NULL/NULL son especialistas "generales" (catch-all)** — el respaldo final cuando no hay especialista específico por sistema o módulo. Ver sección 8.2 para cómo se usa esto en la búsqueda de 3 pasos.

#### folio_counters
Consecutivo atómico por familia.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| prefix | String(3) | `INC` / `CDC` / `ACC` |
| family_clave | String(4) | Clave de la familia de empresas (ej. `AVAL`) |
| last_number | Integer | Último consecutivo usado |

Único por `(prefix, family_clave)`. Se incrementa con `SELECT ... FOR UPDATE` dentro de la misma transacción de creación del ticket — ver sección 8.3.

#### incidencias_settings
Configuración clave/valor genérica del submódulo (ej. frecuencia del digest de backlog).

| Columna | Tipo |
|---|---|
| key | String(100), único |
| value | String(255) |

### 7.2 Entidad principal — `incidents`

Tabla compartida por los 3 tipos de ticket. Folio único, `ticket_type` clasifica qué es.

| Columna | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| folio | String(15) | Único — ver sección 1.6 |
| ticket_type | String(20) | `incidente` / `control_cambio` / `solicitud_acceso` — default `incidente` |
| title | String(150) | |
| company_id | UUID | Sin FK explícita (viene de admin-service) |
| requester_id / requester_name / requester_phone / requester_puesto / requester_area / requester_company_name | — | Snapshot del solicitante al momento de crear — no se actualiza si el usuario cambia su perfil después |
| system_id | UUID FK, **nullable** | Requerido a nivel de negocio para Incidente; NULL para CDC/ACC (no tienen un solo sistema — CDC usa `sistemas_afectados`, un arreglo, en su tabla propia) |
| module_id | UUID FK, nullable | |
| reported_type | String(20), nullable | `funcional` / `tecnico` — alimenta el motor |
| description | Text | |
| severity_reported_id / severity_validated_id | UUID FK, **nullable** | NULL para CDC/ACC — no usan severidad |
| assigned_team / assigned_to_user_id / assigned_at | — | Resultado de la asignación (manual o del motor) |
| attention_level | String(5) | N1/N2/N3 |
| first_response_at | DateTime | |
| sla_response_limit / sla_resolution_limit / is_sla_breached | — | Solo aplican a Incidente |
| resolved_at / resolution_type | — | |
| reopen_window_expires_at / reopened_at / reopen_count | — | Ventana de reapertura tras resolución |
| related_incident_id | UUID FK → incidents.id | Autoreferencia — incidencias relacionadas |
| escalated_to | String(30), default `no_aplica` | |
| rca_text / rca_due_date | — | Ver sección 1.7 — columnas presentes, flujo pendiente |
| closed_at | DateTime | |
| status | Enum `incident_status_enum` | Ver detalle abajo |
| created_at / updated_at | — | |

**Valores del enum `incident_status_enum`** (15 en total — 6 originales de Incidente + 9 agregados para CDC el 2026-09-25):

```
en_backlog, asignado, en_atencion, escalado, resuelto, cerrado,        -- Incidente
registrado, en_revision, aprobado, rechazado, priorizado,              -- CDC
en_desarrollo, en_pruebas, terminado, cancelado                        -- CDC
```

> **Decisión de diseño clave:** aunque CDC tiene su propia cadena de estatus (`registrado` → `en_revision` → ...), el estatus **inicial real** de un ticket CDC recién creado es `en_backlog` (el mismo que usa Incidente), no `registrado`. Razón explícita del dueño del proyecto: *"backlog es la cubeta concentradora universal de todo lo que no cumple regla de asignación, sin importar el tipo — el motor solo tiene reglas de asignación, no de recepción"*. La lógica que mueve un CDC de `en_backlog` hacia su propia cadena de estatus (`en_revision` en adelante) es trabajo pendiente (ver sección 17).

**Por qué `system_id` y `severity_reported_id` son nullable:** originalmente `NOT NULL` (Incidente siempre los requiere a nivel de UI). Se relajaron a nivel de base de datos el 2026-09-25 para permitir que CDC/ACC dejen estos campos vacíos sin romper el esquema compartido — Incidente sigue requiriéndolos operativamente (el frontend no permite crear un Incidente sin ellos), solo la restricción de BD se relajó.

### 7.3 Tabla de detalle — `control_cambios_detalle`

Un renglón por ticket `control_cambio`, ligado 1:1 por `incident_id`. Existe para no llenar `incidents` de columnas que Incidente nunca usa — decisión explícita del dueño del proyecto tras descartar tanto "agregar columnas sueltas a incidents" como "una columna JSON genérica", a favor de una tabla de detalle propia con tipos concretos por campo.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| incident_id | UUID FK → incidents.id, único | Cascade delete |
| sistemas_afectados | ARRAY(String) | Multi-selección — ej. `["ERP TOTVS", "Portal de Proveedores"]` |
| sistema_otro_detalle | String(255), nullable | Texto libre si se eligió "Otro" |
| area_departamento | String(150) | Viene del catálogo real de departamentos (ver sección 9.3) |
| tipo_solicitud | String(30) | `nueva_funcionalidad` / `mejora_existente` |
| justificacion | Text | Beneficio de negocio que sustenta la solicitud |
| impacto_si_no_se_realiza | String(10) | `alto` / `medio` / `bajo` |
| urgencia_solicitada | String(10) | `alta` / `media` / `baja` |
| fecha_requerida | Date, nullable | Fecha deseada, opcional |
| comentarios_adicionales | Text, nullable | |
| solicitud_pdf_object_key | String(500), nullable | Ruta del PDF "SOLICITUD" generado, en MinIO |
| created_at | DateTime | |

### 7.4 Tablas de apoyo

#### incident_attachments
Evidencia adjunta — mismo patrón que `envelope_attachments` de Legal.

| Columna | Tipo | Descripción |
|---|---|---|
| attachment_type | Enum | `evidencia_reporte` / `evidencia_resolucion` |
| reopen_cycle | Integer | Para distinguir evidencia de reaperturas sucesivas |
| object_key / bucket / mime_type / size_bytes | — | Metadata de MinIO |
| uploaded_by / uploaded_at | — | |

#### incident_activity_log
Bitácora completa del ciclo de vida — mismo patrón que `user_file_audit_log` de admin-service.

| Columna | Tipo | Descripción |
|---|---|---|
| action | String(50) | Ej. `motor_asigno`, `motor_sin_especialista`, `creado`, `resuelto` |
| performed_by / performed_by_name / performed_by_role | — | Snapshot del actor al momento del evento — se preserva aunque el usuario cambie de rol después |
| performed_at | DateTime | ⚠️ No es `created_at` — nombre de columna real |
| detail | JSON, nullable | Datos extra según la acción |

#### incident_resolution_tokens
Enlace seguro de un solo uso para resolver un Incidente desde correo (sin necesitar login).

| Columna | Tipo |
|---|---|
| token | String(128), único |
| created_for_user_id | UUID |
| expires_at / used_at | DateTime |

### 7.5 Migraciones relevantes (orden cronológico, más recientes)

```
e31e3edfb865_init_incidencias_tables.py
1ae5444f3133_add_assigned_at_to_incidents.py
7c2a91f4d8b3_add_ticket_type_to_incidents.py            -- clasificador de tipo
fcd35a61ecfe_add_control_cambios_detalle_table_.py       -- tabla de detalle CDC + nullable system/severity
a91f3d2e7c48_add_cdc_statuses_to_enum.py                 -- 9 estatus nuevos al enum
```

> `ALTER TYPE ... ADD VALUE` de Postgres no puede correr dentro de una transacción abierta. La migración de estatus hace `op.execute("COMMIT")` explícito antes de cada `ADD VALUE IF NOT EXISTS` — ver el archivo para el patrón exacto si se necesita agregar más valores al enum en el futuro.

---

## 8. Motor de asignación — fórmulas y lógica

Vive en `app/motor.py`, descrito en su propio docstring como **"función cerrada"**: entrada/salida fijas, lógica interna reemplazable por un modelo de predicción más sofisticado en el futuro sin cambiar el contrato. Esta es una decisión de arquitectura deliberada, no accidental.

### 8.1 Cuándo corre

No corre síncronamente dentro del endpoint de creación. El flujo es:

```
1. POST /incidencias  o  POST /control-cambios
        │
        ▼
2. Se crea el ticket con status = en_backlog
   Se hace commit
        │
        ▼
3. publish_incident_created(incident_id) → cola RabbitMQ "incidencias.motor.asignacion"
   (el usuario ya recibió su folio -- esto pasa en segundo plano)
        │
        ▼
4. El consumidor (corriendo en background dentro del mismo proceso) recibe el mensaje
   Si el ticket ya no está en_backlog (alguien lo asignó manualmente mientras tanto) → no hace nada
        │
        ▼
5. Si ticket_type == "incidente" → corre resolve_assignment()
   Si ticket_type != "incidente" (CDC/ACC) → se salta la busqueda, va directo a "sin especialista"
        │
        ▼
6a. Encontrado → finalize_assignment() → status pasa a "asignado", notifica
6b. No encontrado → log "motor_sin_especialista", se queda en backlog, notifica a Incident Managers
```

### 8.2 `resolve_assignment` — búsqueda en 3 pasos

```python
async def resolve_assignment(db, system_id, module_id, reported_type) -> dict:
    team_type = TEAM_BY_REPORTED_TYPE.get(reported_type)  # "funcional"→"especialista-funcional", "tecnico"→"especialista-tecnico"

    # Paso 1 -- por módulo exacto (el más específico)
    if module_id:
        specialist = buscar(system_id, module_id, team_type)
        if specialist: return {"encontrado": True, ...}

    # Paso 2 -- por sistema completo (module_id NULL)
    specialist = buscar(system_id, None, team_type)
    if specialist: return {"encontrado": True, ...}

    # Paso 3 -- especialista general del equipo (system_id y module_id ambos NULL)
    specialist = buscar(None, None, team_type)
    if specialist: return {"encontrado": True, ...}

    return {"encontrado": False}
```

Se detiene en el primer resultado. Cada paso es estrictamente más genérico que el anterior.

### 8.3 Fórmula del folio (atómica, sin condición de carrera)

```sql
SELECT id, last_number FROM folio_counters
WHERE prefix = :prefix AND family_clave = :family_clave
FOR UPDATE                                    -- bloquea el renglón hasta el commit

-- Si existe: UPDATE last_number = last_number + 1
-- Si no existe: INSERT con last_number = 1

folio = f"{prefix}-{family_clave}-{next_number:06d}"
```

El `FOR UPDATE` es lo que garantiza que dos creaciones simultáneas del mismo prefijo/familia no generen el mismo consecutivo — la segunda transacción espera a que la primera libere el renglón.

### 8.4 Bug real encontrado y corregido — CDC no debe buscar especialista

Al conectar CDC al motor por primera vez, `resolve_assignment` con `system_id=None, reported_type=None` coincidía accidentalmente con los especialistas "generales" (NULL/NULL) de **Incidente** — asignando tickets de CDC a personas sin ninguna relación real con Control de Cambios. La corrección **no tocó `motor.py`** (se mantiene como función cerrada) — se hizo en el punto de llamada, dentro del consumidor:

```python
if incident.ticket_type == "incidente":
    assignment = await resolve_assignment(db, incident.system_id, incident.module_id, incident.reported_type)
else:
    assignment = {"encontrado": False}   # CDC/ACC nunca buscan especialista de Incidente
```

### 8.5 Regla de asignación pendiente para CDC (próxima sesión)

Planeada, no construida todavía: una regla nueva y propia del motor (no la búsqueda de especialista funcional/técnico) que, al procesar un CDC en backlog, lo asigne automáticamente al **Project Manager** y cambie su estatus a `en_revision`. El **Incident Manager** participaría en esa misma regla solo si tiene activado un botón "Activarme como: Project Manager" (paralelo a los botones ya existentes de Especialista Funcional/Técnico) — también pendiente de construir.

---

## 9. Endpoints — todos los routers

Prefijo raíz de todo el servicio: `/api/v1/it-service-desk` (definido en `main.py`).

### 9.1 `/mesa-de-soporte` — Incidente

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health del router |
| GET | `/severidades` | Catálogo de severidades |
| GET | `/incidencias` | Listado paginado — **sin filtrar por ticket_type** (alimenta Tabla y Kanban de ambos tipos) |
| GET | `/incidencias/{id}` | Detalle |
| PATCH | `/incidencias/{id}/asignar` | Asignación manual |
| GET | `/atender/{token}` | Vista pública vía token de correo |
| POST | `/atender/{token}/redirigir` | Redirigir vía token |
| POST | `/atender/{token}/resolver` | Resolver vía token, sin login |
| POST | `/incidencias` | Crear Incidente |
| POST | `/incidencias/{id}/resolver` | Resolver (autenticado) |
| POST | `/incidencias/{id}/reabrir` | Reabrir dentro de la ventana permitida |
| POST | `/incidencias/{id}/cerrar` | Cierre formal |
| POST | `/incidencias/{id}/escalar` | Escalamiento |
| PATCH | `/incidencias/{id}/severidad` | Validar/ajustar severidad |
| GET | `/estadisticas` | Dashboard — **filtrado a ticket_type=incidente** |
| GET | `/reportes/incidencias-excel` | Exportar Excel — **filtrado a ticket_type=incidente** |
| POST | `/internal/reportes/sla-diario` | Sin JWT — disparado por cron, **filtrado a incidente** |
| POST | `/internal/reportes/cierre-automatico` | Sin JWT — cierre automático 24h, **filtrado a incidente** |

### 9.2 `/control-cambios` — CDC

| Método | Ruta | Descripción |
|---|---|---|
| POST | `` (raíz del prefijo) | Crear CDC — etapa Registrado completa: folio, PDF, MinIO, broadcast, motor |
| POST | `/{id}/evidencia` | Subir evidencia a `evidencias_registro/` — para la etapa "En revisión" (endpoint listo, flujo de etapa aún no conectado) |
| GET | `/departamentos` | Puente hacia `admin-service` — catálogo real de departamentos |
| GET | `/mi-perfil` | Puente hacia `admin-service` — puesto/departamento/empresa del solicitante actual |

### 9.3 `/actualizaciones` — catálogos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health del router |
| GET | `/usuarios-por-rol` | Usuarios filtrables por rol de módulo |
| GET / POST / PATCH | `/sistemas` | CRUD de `ticket_systems` |
| GET / POST / PATCH | `/modulos` | CRUD de `ticket_modules` |
| GET / POST / PATCH | `/especialistas` | CRUD de `system_specialists` — aquí se configuran las reglas que consume el motor |

> **Pendiente para la próxima sesión:** el catálogo de "Sistema(s) / módulo afectado" del formulario de CDC hoy usa una lista fija hardcodeada en el frontend (`SISTEMAS_CDC` en `CreateControlCambioModal.tsx`). Se planea reemplazarlo por el catálogo real de este router (`/actualizaciones/sistemas` y `/modulos`), agregando la opción "Otro" y trasladando el valor elegido al campo de sistema correspondiente.

---

## 10. Estructura de MinIO

Sigue la misma convención documentada en `minio.md` / `upload-service.md` — bucket `dirdoc`, rutas `{company_slug}/{module_slug}/{submodule_slug}/`.

```
dirdoc/
└── {company_slug}/
    └── it-service-desk/
        └── control-de-cambios/
            └── {folio}/
                ├── {uuid8}_solicitud_{folio}_{fecha}.pdf   ← generado al crear (reportlab)
                └── evidencias_registro/                     ← para la etapa "En revisión"
                    └── {uuid8}_{archivo_evidencia}
```

El nombre de archivo se normaliza a minúsculas y espacios→guión bajo por el propio `upload-service` (comportamiento estándar de la plataforma, no específico de este módulo).

---

## 11. Nginx

```nginx
upstream it_service_desk_service {
    server avalanz-it-service-desk:8000;
    keepalive 32;
}

location ^~ /api/v1/it-service-desk {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://it_service_desk_service;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
}
```

> El comentario que precede a este bloque en `intranet.conf` dice `# ── Legal Service ──` — un error de copy/paste al crear el bloque, cosmético (no afecta funcionamiento), pendiente de corregir cuando se vuelva a tocar ese archivo.

Los endpoints `/internal/reportes/...` (SLA diario, cierre automático) **no están expuestos públicamente** — se llaman desde dentro de la red Docker (el script de cron) directo al nombre del contenedor.

---

## 12. WebSocket / tiempo real

El servicio no aloja su propio WebSocket — transmite eventos al `websocket-service` central, que reenvía a los clientes conectados.

### 12.1 Función `_broadcast_ticket_update`

Vive en `mesa_de_soporte.py`, se importa desde `control_cambios.py` para reutilizarla:

```python
async def _broadcast_ticket_update(incident, event_type="it_service_desk.ticket_updated"):
    # Resuelve el nombre del asignado si aplica
    # Consulta admin-service por Incident Managers y Project Managers
    # Envía al websocket-service para reenviar a los clientes conectados
```

Se llama con `event_type="it_service_desk.ticket_created"` en la creación (Incidente y CDC), y con el default `ticket_updated` en el resto de mutaciones (resolver, reabrir, cerrar, escalar, cambio de severidad, asignación del motor).

### 12.2 Consumo en frontend — `KanbanBoard.tsx` y la tabla

Dos suscripciones vía `useWSEvent`:
- `it_service_desk.ticket_created` → prepend en la columna correcta + resaltado 4s
- `it_service_desk.ticket_updated` → si es la misma columna, actualiza in-place; si cambió de columna, anima salida (fade + scale) y entra en la columna destino

**Bug de carrera conocido y ya resuelto (documentado para no repetirlo):** el evento `ticket_updated` puede llegar antes que `ticket_created` (la asignación automática puede terminar antes del broadcast de creación). La solución: `ticket_updated` agrega el ticket al arreglo local si no existe todavía, en vez de asumir que ya está ahí.

**Layout del Kanban:** las columnas usan una sola regla CSS universal (`grid-cols-[repeat(auto-fit,minmax(170px,1fr))]`) que calcula cuántas tarjetas caben por fila según el ancho real de cada columna — reemplazó una serie de casos especiales por columna (`flexGrow >= 1.5 ? 3 : 2`, más un caso aparte para Backlog) que requerían ajuste manual cada vez que cambiaba el ancho de una columna. La columna Backlog usa `pageSize: 4` (vs. 8-12 de las demás) para no crecer más alto que sus columnas vecinas y desbordar el layout general de la página.

---

## 13. RabbitMQ

| Detalle | Valor |
|---|---|
| Cola | `incidencias.motor.asignacion` |
| Durable | Sí |
| Publicador | `publish_incident_created(incident_id)` en `rabbitmq.py` |
| Consumidor | `start_consumer()` — corre indefinidamente vía `queue_iter`, `prefetch_count=1` (un mensaje a la vez) |
| Arranque | Tarea de `asyncio` lanzada en el evento `startup` de FastAPI (`main.py`), no un proceso separado |
| Resiliencia | Si el consumidor truena por cualquier excepción, `main.py` lo relanza tras 5 segundos, indefinidamente |
| Tolerancia a fallos de publicación | Si RabbitMQ no está disponible al crear un ticket, la creación **no falla** — el ticket ya se guardó bien, solo se queda en backlog para asignación manual (try/except silencioso alrededor de `publish_incident_created`) |

---

## 14. Trazabilidad y logs

### 14.1 `incident_activity_log`

Registra cada evento del ciclo de vida con snapshot del actor (nombre y rol en el momento del evento, no una referencia viva al usuario). Acciones observadas en el código: `creado`, `motor_asigno`, `motor_sin_especialista`, `asignado`, `reasignado`, `resuelto`, `reabierto`, `cerrado`, `escalado`, `severidad_validada`.

El actor "sistema" (motor de asignación, cierre automático) usa un UUID fijo y reservado:

```python
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"
```

Este UUID **nunca representa a una persona real** — es la convención de la plataforma para que la bitácora distinga acciones automáticas de acciones humanas sin necesitar una columna booleana aparte.

### 14.2 Logs de aplicación

`docker logs avalanz-it-service-desk` — incluye tracebacks completos de SQLAlchemy en caso de error de base de datos (útil para depurar problemas de tipo de dato, como el enum de estatus documentado en la sección 7.2), y las líneas `INFO Motor de asignacion: consumidor conectado...` al arrancar.

---

## 15. Perfiles de usuario y roles (resumen)

Este servicio **no gestiona roles ni permisos** — esa es responsabilidad exclusiva de `admin-service` (roles de módulo con prefijo `it-service-desk:{rol}` en el JWT). Lo que sí vive aquí es la lógica de negocio que *usa* esos roles:

| Rol de módulo | Uso dentro de este servicio |
|---|---|
| `it-service-desk:incident-manager` | Recibe notificaciones cuando el motor no encuentra especialista; puede activarse como Especialista Funcional/Técnico |
| `it-service-desk:project-manager` | Recibe notificaciones de creación; futuro destinatario automático de CDC en revisión |
| Especialista Funcional / Técnico | Botones "Activarme como..." — alimentan `system_specialists` como especialistas "generales" (NULL/NULL) |

Ver el documento propio de "Roles y Perfiles" (pendiente de crear) para el detalle completo de scope, botones de activación y su relación exacta con el motor.

---

## 16. Frontend

Ver `frontend.md` para convenciones generales de UI de toda la plataforma. Específico de este módulo:

- **Vista dual Tabla/Tablero** en la misma página (`mesa-de-soporte/page.tsx`) — un toggle simple, no rutas separadas.
- **Modal selector de tipo** (`NewTicketTypeModal.tsx`): al dar clic en "Nuevo ticket", aparece un modal con 3 opciones (Incidente, Control de Cambios, Solicitud de Accesos) antes de abrir el formulario correspondiente. Entrada animada tipo resorte (`cubic-bezier(0.34, 1.56, 0.64, 1)`, origen en la esquina superior derecha, cerca del botón que lo abre) con las tarjetas apareciendo en cascada. Solicitud de Accesos permanece deshabilitada ("Próximamente") hasta que se resuelva su necesidad de PDF firmado.
- **Modal de creación de CDC** (`CreateControlCambioModal.tsx`): pasarela de 5 pasos (Datos / Alcance / Solicitud / Prioridad / Confirmar), con validación de avance por paso, conectado a `POST /control-cambios`. El paso 1 muestra datos reales de sesión (nombre, correo) más datos que **no** vienen en el JWT (puesto, departamento, empresa) obtenidos vía `GET /control-cambios/mi-perfil`.
- **Tipografía:** el cuerpo general de toda la plataforma cambió de Geist Sans a una pila de fuentes de sistema (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) el 2026-09-25, decisión que se originó comparando este módulo contra un mockup de referencia — ver `frontend.md` sección Fuentes para el detalle completo y los pendientes derivados (auditar componentes con fuente propia hardcodeada; buscar tipografía distinta para títulos/subtítulos).

---

## 17. Brechas conocidas y pendientes

Lista viva — actualizar conforme se resuelva cada punto.

1. **Hecho — CDC Alcance:** "Sistema"/"Módulo" ahora usan el catálogo real de `/actualizaciones` (selección única en cascada, igual que Incidente), con "Otro" agregado como renglón real del catálogo (no texto libre) -- incluyendo un módulo "Otro" por cada uno de los 17 sistemas existentes.
2. **Hecho — Botón "Activarme como: Project Manager"** -- visible solo para Incident Manager, reutiliza `system_specialists` con `team_type='project-manager'`.
3. **Hecho — Regla de asignación del motor para CDC** -- prioridad de 4 pasos, verificada con pruebas reales (ver `it-service-desk-motor-asignacion.md` sección 10).
4. **Fase "En revisión" de CDC** — lógica de la etapa una vez resueltos los 3 puntos anteriores.
5. **RCA** — flujo de captura y recordatorio (columnas ya existen en `incidents`).
6. **Filtro de Backlog cuando exista el Tablero Proyectos propio de CDC** — hoy CDC y Incidente comparten la misma vista de Backlog a propósito; cuando CDC tenga su propio tablero, se agrega un filtro de visualización (no un cambio al modelo de datos compartido).
7. **Renombrado gradual** de archivos/variables internas que todavía dicen "incidencias"/"mesa de soporte" cuando en realidad ya aplican a los 3 tipos de ticket — sin prisa, conforme se toque cada archivo.
8. **Corrección cosmética de Nginx** — el comentario `# Legal Service` sobre el bloque de IT Service Desk en `intranet.conf`.
