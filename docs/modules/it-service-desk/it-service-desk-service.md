# IT Service Desk Service — Guía de Referencia

Ubicación: `backend/modules/it-service-desk-service/`
Última actualización: octubre 2026 (arranque en productivo)

Servicio de mesa de ayuda de la plataforma Avalanz. Nació como "Mesa de Soporte" (gestión de Incidentes) y se expandió hacia un orquestador de flujos de trabajo más amplio: hoy cubre **Incidentes**, **Control de Cambios (CDC)** y **Solicitud de Accesos (ACC)**, los tres en productivo. El nombre visible al usuario ("IT Service Desk") ya es lo bastante general para esta ampliación; el nombre interno del código conserva referencias a "mesa de soporte" e "incidencias" por herencia histórica, y se va renombrando gradualmente conforme se toca cada archivo — no de golpe, por decisión explícita del dueño del proyecto.

Documentos relacionados:
- `it-service-desk-motor-asignacion.md` — detalle del motor de asignación
- `it-service-desk-roles-y-perfiles.md` — detalle de roles y perfiles
- `it-service-desk-base-de-datos.md` — detalle de tablas
- `it-service-desk-control-accesos-docusign.md` — Control de accesos con DocuSign
- `it-service-desk-control-accesos-firma-manual.md` — Control de accesos con firma manual

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

El proceso documentado como **"Verus"** (`Verus_Proceso_Gestion_Incidencias_V2.docx`, `Verus_Proceso_Controles_de_Cambio_V1.docx`, `Verus_Proceso_ABC_Roles_y_Perfiles_V1.docx`) define la gestión formal de incidencias, control de cambios y accesos para el ERP TOTVS y sus sistemas periféricos (Portal de Proveedores, CRM Odoo DYCE, CRM Odoo Vanta Media, TOTVS V25, Detecno…), usado por las empresas del grupo (Corporativo/AGIM, DYCE, SPPEL, Vanta Media, CNCI, Todito, Zignia). Este servicio es la implementación de ese proceso dentro de la Intranet Avalanz, sección "Mesa de Servicios".

La plataforma compite directamente contra una cotización de software comercial equivalente — es una justificación de negocio activa de todo el proyecto, no solo de este módulo.

### 1.2 Los 3 tipos de ticket (columna `ticket_type`)

| Tipo | `ticket_type` | Sigla de folio | Qué es | Estado de construcción |
|---|---|---|---|---|
| Incidente | `incidente` | `INC` | Falla, error, duda de uso o caída de servicio sobre un sistema ya existente | En productivo — Kanban, tabla, tiempo real, SLA en horas hábiles con relojes de respuesta y resolución, cambio de severidad, correos, cierre automático |
| Control de Cambios | `control_cambio` | `CDC` | Solicitud de una funcionalidad nueva o mejora a algo existente — en esencia, gestión de proyectos | En productivo — ciclo completo de 12 etapas (Registrado → Cerrado), Tablero Proyectos y reporte Excel "Seguimiento CC" |
| Solicitud de Accesos | `solicitud_acceso` | `ACC` | Alta o modificación de acceso a un sistema — requiere un formato firmado | En productivo — formulario de 7 etapas, revisión de TI y firma por DocuSign; firma manual implementada, pendiente de prueba completa |

Los 3 tipos se ofrecen desde un mismo punto de entrada ("+ Nuevo ticket" → modal de selección de tipo), decisión explícita del dueño del proyecto para no fragmentar la experiencia en módulos separados, aun cuando CDC y ACC tienen un ciclo de vida y roles distintos a Incidente. Los tres **comparten la misma tabla `incidents`** (folio, estatus, solicitante, fechas) — ver sección 7 para el razonamiento completo de este diseño.

### 1.3 Roles del proceso — Incidente

| Rol | Responsabilidad principal | Interactúa con |
|---|---|---|
| Usuario solicitante | Detecta y reporta la incidencia; valida la solución antes del cierre | Incident Manager |
| Incident Manager | Punto único de contacto — recibe, clasifica severidad, canaliza, da seguimiento a SLA, cierra formalmente | Solicitante, Project Manager, equipos |
| Project Manager | Seguimiento del estatus general, evalúa escalamiento a Dirección, reporta al comité directivo | Incident Manager, Dirección |
| Equipo funcional | Configuración, parametrización, procesos de negocio del ERP y CRMs | Incident Manager |
| Equipo técnico | Infraestructura, bases de datos, integraciones, desempeño | Incident Manager, soporte TOTVS |
| Técnico (apoyo externo) | Consultores externos (TOTVS, Detecno, Exertus, CEM Odoo) ligados a un sistema o módulo; reciben y ven solo los tickets que se les asignan | Equipos, Incident Manager |
| Administrador del sistema | Roles y accesos — vive en `admin-service`, no en este servicio; en ACC es el **encargado de TI del formato**, que revisa y libera | Incident Manager, técnico, auditoría |
| Auditoría | Controles internos, segregación de funciones, cumplimiento | Incident Manager, Dirección |
| Soporte TOTVS / Nivel 3 | Parches del fabricante o desarrollo a la medida | Equipos, Incident Manager |

### 1.4 Roles del proceso — Control de Cambios (decisión propia del proyecto, distinta del documento fuente)

El documento Verus original para CDC define un rol "Champion" por empresa/sistema que dictamina factibilidad. **Esa decisión fue revertida explícitamente durante la construcción**: no se creó ningún rol nuevo. CDC lo manejan los mismos **Incident Manager** y **Project Manager** ya existentes, con el mismo alcance entre ambos sobre estos tickets. La etiqueta visible al usuario durante "En revisión" debe leerse como *"En revisión por Gerencia de Proyectos"*, sin implicar un rol técnico nuevo en el sistema de permisos.

Reglas confirmadas durante la construcción del ciclo completo:
- Los roles de gobierno (patrocinador, líder técnico, usuario validador…) se asignan en la **priorización** con el selector `CdcUserPicker`, sin crear roles nuevos.
- **Diseño funcional y diseño técnico corren en secuencia**, no en paralelo.
- La **UAT siempre la hace el solicitante**.
- La **garantía** de un CDC cerrado es de **15 días** (ajuste `cdc.dias_garantia`).

### 1.5 Severidad y SLA — Incidente

La severidad la propone el solicitante al reportar; el Incident Manager (en cualquier ticket) o el especialista asignado (en los suyos) la pueden **cambiar** después: queda como severidad validada, recalcula el SLA desde la creación y se le avisa al solicitante con el motivo (ver 9.1).

**Horario hábil:** lunes a viernes, de **9:00 a 19:00, hora de Monterrey** (10 horas diarias con la comida incluida, porque las empresas del grupo comen en horarios distintos), **sin** el 1 de enero, el 16 de septiembre ni el 25 de diciembre. S1 corre en horas **naturales** (24/7).

> Antes: lunes a viernes de 8:00 a 18:00 hora de CDMX, con S1 24/7 solo en estabilización post-liberación. Monterrey y CDMX tienen hoy la misma hora (UTC−6 sin horario de verano), pero el proyecto usa explícitamente `America/Monterrey`.

| Severidad | Criterio | Respuesta | Resolución | Corre en |
|---|---|---|---|---|
| S1 — Crítica | Interrupción total de un proceso crítico, sin workaround, afecta a una o más empresas | ≤ 30 min | ≤ 5 horas | Naturales |
| S2 — Alta | Funcionalidad relevante no disponible o degradada; workaround limitado | ≤ 45 min | ≤ 8 horas hábiles | Hábiles |
| S3 — Media | Afecta a grupo reducido o proceso no crítico; workaround razonable | ≤ 2 horas hábiles | ≤ 24 horas hábiles | Hábiles |
| S4 — Baja | Duda de uso, error cosmético, mejora menor, un solo usuario | ≤ 4 horas hábiles | ≤ 50 horas hábiles (5 días) | Hábiles |

Los tiempos de resolución son objetivos de servicio, no garantías absolutas. Actualizaciones periódicas al solicitante: cada 30 min (S1), cada 2 horas (S2), diario (S3), al resolverse (S4).

Cómo funciona en el código:
- **Un solo cálculo** para todo el servicio: `app/services/sla.py` → `limites_sla(severidad, inicio)`, que regresa la tupla (límite de respuesta, límite de resolución). Lo usan la creación de incidentes, la de solicitudes de acceso (que toman el SLA de S1) y el cambio de severidad.
- `ticket_severities.is_24_7` decide si la severidad corre en horas naturales o hábiles.
- Los tiempos se ajustan sin tocar la base en **Actualizaciones → SLA** (solo Incident Manager y super admin), con equivalencias en vivo y un ejemplo de cuándo vencería un ticket creado en ese momento. Cada cambio queda en `ajustes_historial` y aplica a los tickets **nuevos**.
- **SLA de respuesta:** se cumple cuando el asignado **revisa** el ticket y se guarda en `first_response_at` (antes nunca se llenaba). Se marca al **abrir el enlace del correo** de asignación (solo el asignado vigente, solo la primera vez) o con el botón **Marcar como revisado** del panel. Si se **resuelve sin haberlo revisado**, la hora de la resolución cuenta como hora de respuesta: si fue antes del límite de respuesta, se cumple; si fue después, se incumple la respuesta aunque la resolución quede a tiempo. Una revisión previa se respeta y no se cambia.

Control de Cambios **no usa severidad ni SLA automático** — usa en su lugar "Impacto si no se realiza" (alto/medio/bajo) y "Urgencia solicitada" (alta/media/baja) como campos propuestos por el solicitante, y su seguimiento se basa en las fechas compromiso de cada etapa.

### 1.6 Formato de folio

```
{PREFIJO_TIPO}-{CLAVE_FAMILIA}-{CONSECUTIVO 6 DÍGITOS}
```

Ejemplos reales: `INC-AVAL-000001`, `CDC-AVAL-000001`, `ACC-AVAL-000001`. El consecutivo es atómico por combinación (prefijo, clave de familia) — nunca se reutiliza, ni si el ticket se cancela o rechaza, para conservar trazabilidad histórica. Ver sección 8.3 (`folio_counters`) para la implementación. En pantalla, paneles, hoja impresa y formato de acceso se rotula como **"Folio número:"**.

> **Nota de brecha entre documento fuente y código:** el documento Verus original define el prefijo por *empresa* (`COR`, `DYC`, `SPP`, `VAN`) con 4 dígitos. La implementación real usa `family_clave` (clave de la familia de empresas, ej. `AVAL` para Grupo Avalanz) con 6 dígitos, y el prefijo identifica el *tipo de ticket* (`INC`/`CDC`/`ACC`), no la empresa — la empresa queda reflejada en la clave de familia y en `company_id`. Este documento describe lo implementado; para la intención de negocio original ver los `.docx` de Verus en el proyecto.

### 1.7 RCA (Root Cause Analysis) — pendiente de construir

Para toda incidencia S1, y S2 cuando el Incident Manager lo considere relevante, se documenta un análisis de causa raíz dentro de los 5 días hábiles posteriores al cierre (descripción y línea de tiempo, causa raíz, solución aplicada, acciones preventivas y responsables). El modelo `Incident` ya tiene columnas `rca_text` y `rca_due_date`, y el tablero de SLA permite marcar la RCA como obligatoria por severidad (`rca_mandatory`) — **el flujo de captura y recordatorio del RCA no está construido todavía**.

### 1.8 Solicitud de Accesos — resumen

Una solicitud de acceso (por ejemplo, a ERP TOTVS 25) recorre:

1. El usuario llena el formulario de **7 etapas** (datos, tipo de movimiento, empresas, módulos con perfiles y rutinas, vigencia, jefe directo y confirmación con vista previa del formato). Si ya tiene cuenta en ese sistema, el movimiento es **Modificación**; si no, **Alta**.
2. Al enviar se crea el ticket `ACC`, con el PDF del formato como evidencia, asignado al **encargado de TI del formato** en `en_revision`, con el SLA de S1. A TI le llega un correo con el PDF adjunto.
3. TI **aprueba** (decidiendo si lleva firma del jefe administrativo) o **rechaza** con motivo.
4. Según el ajuste `acc.metodo_firma`: **DocuSign** (sobre con firmantes en orden y el usuario asignado como campo obligatorio de TI) o **manual** (liga para subir el escaneo y liberación con la firma guardada de TI).
5. Al quedar firmado: ticket **Terminado**, PDF firmado como evidencia, registro de la cuenta, formato en el **expediente del empleado** y correo al solicitante con su usuario y su **contraseña temporal**.

Detalle completo en `it-service-desk-control-accesos-docusign.md` y `it-service-desk-control-accesos-firma-manual.md`.

---

## 2. Arquitectura general

```
Frontend (Next.js)
      │
      ▼
   nginx (proxy inverso, puerto 80/443)
      │  /api/v1/it-service-desk/*
      ▼
┌─────────────────────────────────────────────────────────┐
│                it-service-desk-service                   │
│                (FastAPI, puerto 8000 interno)            │
│                                                          │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐  │
│  │ mesa_de_soporte│ │ control_cambios│ │control_accesos│ │
│  │ (Incidente)    │ │ (CDC)          │ │ (ACC)         │ │
│  └────────────────┘ └────────────────┘ └──────────────┘  │
│  ┌────────────────┐ ┌────────────────┐ ┌──────────────┐  │
│  │ actualizaciones│ │ ajustes        │ │it_service_desk│ │
│  │ (catálogos,SLA)│ │ (super admin)  │ │(stub, sin uso)│ │
│  └────────────────┘ └────────────────┘ └──────────────┘  │
│                                                          │
│  Consumidor RabbitMQ en background (asyncio)             │
│  → motor de asignación                                   │
└──┬───────┬────────┬────────┬─────────┬─────────┬────────┘
   │       │        │        │         │         │
   ▼       ▼        ▼        ▼         ▼         ▼
Postgres admin-  upload-  email-/   Gotenberg  DocuSign
(BD      service service  notify-   (HTML→PDF) (API externa)
propia)          (MinIO)  service
avalanz_it_
service_desk

Además:
- websocket-service ← recibe eventos para tiempo real (tabla y tableros)
- RabbitMQ ← cola "incidencias.motor.asignacion"
- MinIO directo (boto3) ← PDF firmados, escaneos y firma de TI de ACC
- cron del host ← reporte SLA diario, cierre automático 24h y consulta de DocuSign
```

### 2.1 Comunicación con otros servicios

| Servicio | Dirección | Para qué |
|---|---|---|
| admin-service | it-service-desk → admin | Perfil del solicitante (`/internal/users/{id}/profile`, con matrícula, razón social y familia), catálogo de departamentos (`/internal/departamentos`), usuarios por rol de módulo (`/internal/users/by-module-role`), búsqueda de personas (`/internal/users/search`), empresas (`/internal/companies`) y registro de documentos en el expediente del empleado (`POST /internal/users/{id}/files`) |
| upload-service | it-service-desk → upload | Subir evidencia, PDFs de solicitud CDC y de solicitud de acceso, generar URLs firmadas de descarga |
| MinIO (boto3) | it-service-desk → MinIO | PDF firmados, escaneos y firma de TI del Control de accesos, cuando no hay sesión de usuario (por ejemplo, en el webhook de DocuSign) |
| email-service | it-service-desk → email | Correos de notificación (creación, asignación, resolución, cambio de severidad, revisión y firma de accesos — `system-notification` acepta **adjuntos** opcionales) y el reporte diario de SLA con gráfica embebida |
| notify-service | it-service-desk → notify | Notificaciones in-app (campana) |
| websocket-service | it-service-desk → websocket | Broadcast de eventos `it_service_desk.ticket_created` / `ticket_updated` para tiempo real |
| RabbitMQ | it-service-desk ↔ RabbitMQ | Publica al crear un ticket; el propio servicio consume en background para correr el motor de asignación |
| Gotenberg | it-service-desk → gotenberg | Convierte el formato de acceso (HTML) a PDF con Chromium (`http://gotenberg:3000/forms/chromium/convert/html`) |
| DocuSign | it-service-desk ↔ DocuSign | Sobres de firma de las solicitudes de acceso; DocuSign avisa al webhook |

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
│   ├── config.py                        → Configuración (pydantic-settings) — no acepta variables desconocidas
│   ├── database.py                      → Motor async, sesión de BD
│   ├── motor.py                         → Motor de asignación — "función cerrada" (ver sección 8)
│   ├── rabbitmq.py                      → Publicador y consumidor de la cola de asignación
│   ├── assignment.py                    → finalize_assignment — aplica una asignación ya resuelta
│   ├── models/
│   │   └── mesa_de_soporte.py           → TODOS los modelos SQLAlchemy (catálogos, Incident, CDC, ACC, ajustes, logs)
│   ├── routes/
│   │   ├── __init__.py                 → Router agregador — registra todos los sub-routers
│   │   ├── it_service_desk.py           → Stub generado por scaffold, sin uso real
│   │   ├── mesa_de_soporte/
│   │   │   └── mesa_de_soporte.py       → Incidente: CRUD, asignación, revisión, severidad, SLA, dashboard, reportes
│   │   ├── control_cambios/
│   │   │   └── control_cambios.py       → CDC: ciclo completo de 12 etapas, PDFs, reporte Excel
│   │   ├── control_accesos/
│   │   │   ├── configuracion.py         → Configuración de formatos (IM o super admin)
│   │   │   └── solicitudes.py           → Formulario, envío, revisión, DocuSign, liga, liberación, firma de TI
│   │   ├── actualizaciones/
│   │   │   └── actualizaciones.py       → Catálogos: sistemas, módulos, especialistas
│   │   └── ajustes/
│   │       └── ajustes.py               → Ajustes del módulo (super admin) e historial
│   ├── services/
│   │   ├── sla.py                       → limites_sla(): horas naturales u hábiles (Monterrey)
│   │   ├── logo.py                      → Logo recortado para los documentos generados
│   │   ├── mesa_de_soporte/mesa_de_soporte_service.py
│   │   ├── actualizaciones/actualizaciones_service.py
│   │   ├── ajustes/ajustes_service.py
│   │   ├── it_service_desk_service.py   → Stub, sin uso real
│   │   └── control_accesos/
│   │       ├── motor/documento.py       → Contexto del formato, render Jinja y html_a_pdf (Gotenberg)
│   │       ├── formatos/totvs25/template.html → Formato ERP TOTVS 25 (A4, con anclas de firma)
│   │       └── firma/
│   │           ├── docusign.py          → Cliente DocuSign: JWT, sobres, estado, campos, descarga
│   │           ├── cierre.py            → Cierre del sobre, registro de cuenta y expediente
│   │           └── almacen.py           → Leer y guardar en MinIO (boto3)
│   ├── cron/
│   │   ├── chart_generator.py           → Genera el PNG de barras (matplotlib/Agg) para el correo de SLA
│   │   └── templates/sla_report_template.py → HTML del correo diario de SLA
│   └── static/
│       └── logo_avalanz.png             → Logo usado en el PDF de solicitud de CDC (reportlab)
└── migrations/
    ├── env.py / script.py.mako
    └── versions/                        → Ver sección 7.6 para el listado
```

### 3.1 Por qué existen routers separados para negocio (no uno solo)

`mesa_de_soporte.py`, `control_cambios.py`, `control_accesos/` y `actualizaciones.py` son archivos separados a propósito — decisión explícita para no mezclar la lógica de Incidente (ya de por sí extensa) con la de CDC y ACC. Comparten tabla, folio, broadcast de tiempo real y notificaciones (importados desde `mesa_de_soporte.py`), pero cada quien mantiene su propia lógica de negocio en su propio archivo.

Dentro del Control de accesos, la **firma está separada por método**: DocuSign (`firma/docusign.py`) y manual (rutas de liga y liberación), compartiendo `cierre.py` (registro de cuenta y expediente) y `almacen.py` (MinIO). Los **formatos** son plantillas por sistema (`formatos/{clave}/template.html`) que comparten el mismo motor de documentos, para poder agregar Detecno u otros sin tocar la lógica.

---

## 4. Stack tecnológico

### Backend

| Componente | Tecnología / versión |
|---|---|
| Framework | FastAPI 0.111.0 |
| Servidor ASGI | Uvicorn 0.29.0 (`uvicorn[standard]`) |
| Python del contenedor | 3.11 (imagen `python:3.11-slim`) |
| Base de datos | PostgreSQL — SQLAlchemy 2.0.30 async, driver `asyncpg` 0.29.0 |
| Migraciones | Alembic 1.13.1 |
| JWT | `python-jose[cryptography]` 3.3.0 — también firma el JWT de DocuSign |
| HTTP cliente (a otros servicios) | httpx 0.27.0 |
| Mensajería | `aio-pika` 9.4.1 (RabbitMQ) |
| Excel | `openpyxl` 3.1.2 |
| Gráficas (correo SLA) | `matplotlib` 3.9.0 (backend `Agg`, sin display) |
| PDF (solicitud CDC) | `reportlab` 4.2.2 — agregado 2026-09-25 |
| PDF (formatos de acceso) | Plantillas Jinja2 convertidas por **Gotenberg** 8 (Chromium) |
| Unir PDF (firma manual) | `pypdf` 4.3.1 |
| MinIO directo | `boto3` |
| Métricas | `prometheus-fastapi-instrumentator` 7.0.0 |
| Config | `pydantic-settings` 2.2.1 |

> `reportlab` se eligió tras confirmar que Legal genera sus PDFs de contrato del lado del **frontend** con jsPDF (no hay librería de PDF en ningún backend de la plataforma antes de esto). Se decidió backend para CDC porque la "solicitud" es un documento formal de registro, no algo que el usuario edite o previsualice interactivamente — conviene que salga idéntico siempre y se pueda regenerar sin depender del navegador.

> Para los **formatos de acceso** se probó primero WeasyPrint y se descartó: rompía la rejilla de empresas y la alineación de las casillas. Gotenberg usa el mismo motor que el navegador (Chromium), así que el PDF sale **idéntico a la vista previa**.

> **Cuidado con el Python del contenedor (3.11):** no anidar comillas dobles dentro de un f-string con comillas dobles — Python 3.12 lo acepta y 3.11 no, y el servicio no arranca. Siempre probar con la Python del contenedor antes de reconstruir (ver 6.3).

### Frontend (piezas específicas de este módulo — ver `frontend.md` para el stack general)

| Pieza | Ubicación |
|---|---|
| Tabla + tableros | `frontend/app/(private)/app/it-service-desk/mesa-de-soporte/page.tsx` |
| Componentes de la Mesa | `frontend/components/app/it-service-desk/mesa-de-soporte/` |
| Modal selector de tipo de ticket | `NewTicketTypeModal.tsx` |
| Modal de creación de incidente | `CreateIncidentModal.tsx` |
| Modal de creación de CDC (pasarela 5 pasos) | `CreateControlCambioModal.tsx` |
| Modal de solicitud de acceso (7 etapas) | `CreateSolicitudAccesoModal.tsx` |
| Resumen y revisión de un acceso | `AccResumenSolicitud.tsx` |
| Liga pública de subida | `frontend/app/(auth)/subir-firmado/[token]/page.tsx` |
| Actualizaciones (catálogo, accesos, SLA) | `frontend/components/app/it-service-desk/actualizaciones/` |
| Servicios (llamadas API) | `frontend/services/itServiceDeskService.ts` |

---

## 5. Configuración (.env)

```env
SERVICE_NAME=it-service-desk-service
DATABASE_URL=postgresql+asyncpg://avalanz_user:***@postgres:5432/avalanz_it_service_desk
JWT_SECRET_KEY=***
JWT_ALGORITHM=HS256
RABBITMQ_URL=amqp://avalanz:***@rabbitmq:5672/
FRONTEND_URL=https://intranet.avalanz.com

# DocuSign (misma cuenta que Legal) -- Control de accesos
DOCUSIGN_INTEGRATION_KEY=***
DOCUSIGN_USER_ID=***
DOCUSIGN_ACCOUNT_ID=***
DOCUSIGN_BASE_URI=https://demo.docusign.net
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY_PATH=/app/docusign_private.pem

# MinIO (mismas credenciales que Legal) -- PDF firmados del Control de accesos
MINIO_ENDPOINT=***
MINIO_ACCESS_KEY=***
MINIO_SECRET_KEY=***
```

| Variable | Descripción | Default |
|---|---|---|
| SERVICE_NAME | Nombre del servicio (usado en logs/health) | it-service-desk-service |
| DATABASE_URL | Cadena de conexión async a PostgreSQL | — |
| JWT_SECRET_KEY | Misma clave que el resto de la plataforma — debe coincidir con auth-service | — |
| JWT_ALGORITHM | Algoritmo de firma del JWT | HS256 |
| RABBITMQ_URL | Cadena de conexión a RabbitMQ (usuario/contraseña/vhost) | — |
| FRONTEND_URL | Links de los correos (atender, subir firmado) y dirección del webhook de DocuSign | http://localhost:3000 |
| DOCUSIGN_* | Cuenta de DocuSign compartida con Legal. `demo.docusign.net` / `account-d.docusign.com` = pruebas | Pruebas |
| MINIO_* | Acceso directo a MinIO para los PDF firmados (mismas que Legal) | — |

`config.py` usa `pydantic-settings`, carga `.env` automáticamente y expone una instancia única `config` importable desde cualquier módulo (`from app.config import config`).

> **Importante — variables desconocidas:** `config.py` **no acepta** variables que no estén declaradas (`Extra inputs are not permitted`). Toda variable nueva del `.env` se declara también en `config.py` con un valor por defecto, o el servicio no arranca. Así pasó al agregar las de DocuSign: el servicio entró en ciclo de reinicios hasta declararlas.

> **El `.env` se copia dentro de la imagen** al construir (`COPY modules/it-service-desk-service/ .`). Después de cambiarlo hay que **reconstruir** la imagen; recrear el contenedor no basta.

> Los `.env` y la llave `.pem` **no están en Git**. Al montar otro servidor se copian a mano.

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
  volumes:
    - ../../backend/modules/legal-service/docusign_private.pem:/app/docusign_private.pem:ro
  environment:
    DB_HOST: postgres
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - avalanz-network
  logging: *default-logging

gotenberg:
  image: gotenberg/gotenberg:8
  container_name: avalanz-gotenberg
  restart: unless-stopped
  command: ["gotenberg", "--api-timeout=30s", "--chromium-disable-javascript=true"]
  networks:
    - avalanz-network
```

La llave de DocuSign se **monta en solo lectura** desde la carpeta de Legal, así hay una sola llave para los dos módulos y nunca se copia a otra carpeta. Gotenberg solo vive en la red interna (sin puertos publicados).

### 6.3 Comandos frecuentes

```bash
# Reconstruir tras cambios de código o dependencias nuevas
docker compose -f infrastructure/docker/docker-compose.yml up -d --build it-service-desk-service

# Reload de nginx (necesario tras rebuild -- IP interna cambia)
docker exec avalanz-nginx nginx -s reload

# Ver logs
docker logs avalanz-it-service-desk --tail 50

# Migraciones
docker exec avalanz-it-service-desk alembic upgrade head
docker exec avalanz-it-service-desk alembic current

# Copiar un archivo sin rebuild completo + reiniciar (cambios rápidos de un solo archivo)
docker cp backend/modules/it-service-desk-service/app/routes/mesa_de_soporte/mesa_de_soporte.py avalanz-it-service-desk:/app/app/routes/mesa_de_soporte/mesa_de_soporte.py
docker restart avalanz-it-service-desk
```

**Despliegue seguro (patrón usado en productivo):** construir la imagen y probarla en un contenedor **idéntico al real** antes de reemplazar el que está corriendo:

```bash
cd infrastructure/docker
docker compose build it-service-desk-service
docker compose run --rm --no-deps --entrypoint python it-service-desk-service \
  -c "from app.main import app; print('ARRANCA BIEN')"
# Solo si arranca:
docker compose up -d --force-recreate it-service-desk-service
docker exec avalanz-nginx nginx -s reload
```

`docker compose run` usa el `.env`, las variables del compose y los volúmenes reales, sin tocar el contenedor en línea. Una prueba con `docker run` montando solo la carpeta `app/` **no** detecta errores de configuración (por ejemplo, variables no declaradas), y una con la Python del host **no** detecta incompatibilidades con la 3.11 del contenedor.

> El consumidor de RabbitMQ corre como una tarea de `asyncio` **dentro del mismo proceso** de Uvicorn (arrancada en el evento `startup` de FastAPI) — no es un contenedor ni un worker separado. Si el consumidor truena, `main.py` lo reintenta automáticamente cada 5 segundos indefinidamente (`_run_consumer_forever`).

### 6.4 Tareas programadas (crontab del host)

| Frecuencia | Qué |
|---|---|
| Diario | Reporte de SLA (`/internal/reportes/sla-diario`) |
| Diario | Cierre automático de resueltos (`/internal/reportes/cierre-automatico`) |
| Cada 5 min | Consulta de respaldo de DocuSign del Control de accesos |

```
*/5 * * * * docker exec avalanz-it-service-desk python -c "import httpx; httpx.post('http://127.0.0.1:8000/api/v1/it-service-desk/control-accesos/internal/docusign-poll', timeout=120)" >/dev/null 2>&1
```

La imagen no trae `curl`, por eso la consulta usa `httpx` desde Python.

---

## 7. Base de datos — estructura y esquemas

Base de datos propia: `avalanz_it_service_desk`. Todas las tablas viven en el mismo modelo `models/mesa_de_soporte.py` (nombre heredado, aunque ya contiene tablas de CDC, ACC y ajustes también).

### 7.1 Catálogos

#### ticket_severities
Catálogo de severidades S1–S4, configurable desde el tablero de SLA.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| code | String(4) | Único — "S1".."S4" |
| name | String(50) | Nombre visible |
| response_sla_minutes | Integer | Minutos de SLA de respuesta |
| resolution_sla_hours | Integer | Horas de SLA de resolución |
| is_24_7 | Boolean | `true` = corre en horas naturales; `false` = en horas hábiles |
| rca_mandatory | Boolean | Si requiere RCA obligatorio |
| is_active | Boolean | — |

Valores en productivo: S1 30 min / 5 h (naturales), S2 45 min / 8 h, S3 120 min / 24 h, S4 240 min / 50 h (hábiles).

#### ticket_systems
Catálogo abierto de sistemas (ERP TOTVS, Portal de Proveedores, CRM Odoo DYCE/Vanta, TOTVS V25, Detecno…). Crece según se necesite, sin cambios de código. Incluye **"Otro"** como renglón real del catálogo.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| name | String(150) | Único |
| is_active | Boolean | — |

#### ticket_modules
Módulos dentro de cada sistema (ej. "Stock" o "Contabilidad" dentro de TOTVS). Cada sistema tiene también su módulo "Otro".

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
| team_type | String(30) | `especialista-funcional` / `especialista-tecnico` / `incident-manager` / `project-manager` |
| specialist_user_id | UUID | Usuario asignado |
| is_active | Boolean | — |

**Las combinaciones NULL/NULL son especialistas "generales" (catch-all)** — el respaldo final cuando no hay especialista específico por sistema o módulo. Ver sección 8.2. Un usuario con rol **Técnico** se liga aquí con el `team_type` del equipo que apoya (por ejemplo, `especialista-tecnico` en TOTVS · Stock).

#### folio_counters
Consecutivo atómico por familia.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| prefix | String(3) | `INC` / `CDC` / `ACC` |
| family_clave | String(4) | Clave de la familia de empresas (ej. `AVAL`) |
| last_number | Integer | Último consecutivo usado |

Único por `(prefix, family_clave)`. Se incrementa con `SELECT ... FOR UPDATE` dentro de la misma transacción de creación del ticket — ver sección 8.3. Si se borra un renglón, el siguiente folio de esa combinación lo **recrea** empezando en 1 (así se reinician los folios al limpiar datos de prueba).

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
| title | String(150) | En el formulario de incidente se rotula "Descripción corta del ticket" |
| company_id | UUID | Sin FK explícita (viene de admin-service) |
| requester_id / requester_name / requester_phone / requester_puesto / requester_area / requester_company_name | — | Snapshot del solicitante al momento de crear — no se actualiza si el usuario cambia su perfil después |
| system_id | UUID FK, **nullable** | Requerido a nivel de negocio para Incidente; en ACC es el sistema del formato |
| module_id | UUID FK, nullable | |
| reported_type | String(20), nullable | `funcional` / `tecnico` — alimenta el motor |
| description | Text | En ACC, un resumen de la solicitud |
| severity_reported_id / severity_validated_id | UUID FK, **nullable** | La validada la llena el cambio de severidad. NULL para CDC |
| assigned_team / assigned_to_user_id / assigned_at | — | Resultado de la asignación (manual o del motor) |
| attention_level | String(5) | N1/N2/N3 |
| first_response_at | DateTime | Revisión del asignado — se llena desde el enlace del correo o el botón del panel |
| sla_response_limit / sla_resolution_limit / is_sla_breached | — | Calculados con `limites_sla()` |
| resolved_at / resolution_type | — | En ACC, `resolved_at` = cuando queda firmado |
| reopen_window_expires_at / reopened_at / reopen_count | — | Ventana de reapertura tras resolución |
| related_incident_id | UUID FK → incidents.id | Autoreferencia — incidencias relacionadas |
| escalated_to | String(30), default `no_aplica` | |
| rca_text / rca_due_date | — | Ver sección 1.7 — columnas presentes, flujo pendiente |
| closed_at | DateTime | |
| status | Enum `incident_status_enum` | Ver detalle abajo |
| created_at / updated_at | — | |

> **`is_sla_breached` no se actualiza en ningún lado.** Los relojes de la tabla, el dashboard y el Excel calculan el estado del SLA con las **fechas reales** (límite contra revisión o resolución), no con ese campo.

**Valores del enum `incident_status_enum`** (20 en total):

```
en_backlog, asignado, en_atencion, escalado, resuelto, cerrado,              -- Incidente
registrado, en_revision, aprobado, rechazado, priorizado, en_arranque,       -- CDC
en_diseno_funcional, en_diseno_tecnico, en_desarrollo, en_pruebas,
en_paso_produccion, terminado, cancelado,
en_firma                                                                      -- ACC
```

Un ticket de acceso pasa por `en_revision` → `en_firma` → `terminado`, o termina en `rechazado` (rechazo de TI, firma declinada o sobre anulado). En pantalla, `en_firma` tiene etiqueta **rosa**.

> **Decisión de diseño clave:** aunque CDC tiene su propia cadena de estatus, el estatus **inicial real** de un ticket CDC recién creado es `en_backlog` (el mismo que usa Incidente), no `registrado`. Razón explícita del dueño del proyecto: *"backlog es la cubeta concentradora universal de todo lo que no cumple regla de asignación, sin importar el tipo — el motor solo tiene reglas de asignación, no de recepción"*. El parámetro `excluir_tipo` del listado solo filtra lo que se **muestra**, nunca la lógica de asignación.

> Las solicitudes de acceso son la excepción: nacen **directamente** en `en_revision`, asignadas al encargado de TI del formato. Si el formato no tiene encargado, sí van al backlog.

**Por qué `system_id` y `severity_reported_id` son nullable:** originalmente `NOT NULL` (Incidente siempre los requiere a nivel de UI). Se relajaron a nivel de base de datos el 2026-09-25 para permitir que CDC deje estos campos vacíos sin romper el esquema compartido — Incidente sigue requiriéndolos operativamente (el frontend no permite crear un Incidente sin ellos), solo la restricción de BD se relajó.

### 7.3 Tablas de Control de Cambios

#### control_cambios_detalle
Un renglón por ticket `control_cambio`, ligado 1:1 por `incident_id`. Existe para no llenar `incidents` de columnas que Incidente nunca usa — decisión explícita del dueño del proyecto tras descartar tanto "agregar columnas sueltas a incidents" como "una columna JSON genérica", a favor de una tabla de detalle propia con tipos concretos por campo.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | PK |
| incident_id | UUID FK → incidents.id, único | Cascade delete |
| system_id / module_id | UUID FK | Sistema y módulo afectados (antes un `ARRAY(String)` de texto; migración `5c0967de0571`) — selección única en cascada, como en Incidente |
| area_departamento | String(150) | Viene del catálogo real de departamentos |
| tipo_solicitud | String(30) | `nueva_funcionalidad` / `mejora_existente` |
| justificacion | Text | Beneficio de negocio que sustenta la solicitud |
| impacto_si_no_se_realiza | String(10) | `alto` / `medio` / `bajo` |
| urgencia_solicitada | String(10) | `alta` / `media` / `baja` |
| fecha_requerida / fecha_compromiso | Date, nullable | Deseada por el solicitante y comprometida en la priorización |
| comentarios_adicionales | Text, nullable | |
| solicitud_pdf_object_key | String(500), nullable | Ruta del PDF "SOLICITUD" generado, en MinIO |
| created_at | DateTime | |

#### control_cambios_etapas / control_cambios_documentos / control_cambios_avances

| Tabla | Para qué |
|---|---|
| `control_cambios_etapas` | Un renglón por etapa del ciclo, con sus datos (JSON), responsable, fechas y documento (`documento_object_key`) |
| `control_cambios_documentos` | Documentos generados por el sistema (Acta de Constitución, Alcance, Resumen ejecutivo, dictamen, priorización, acta de cierre) y subidos (cronograma `.mpp`/`.vsdx`/`.drawio`…) |
| `control_cambios_avances` | Avance por RT durante el desarrollo (migración `aa6f45a22bb9`) |

Detalle completo en `it-service-desk-base-de-datos.md`.

### 7.4 Tablas del Control de accesos

| Tabla | Para qué |
|---|---|
| `acc_formatos` | Formato (ej. ERP TOTVS 25): `nombre`, `clave` (carpeta de la plantilla), sistema, severidad, encargado de TI (`admin_user_id`, `admin_nombre`) y `presentacion` (JSONB: orden de familias, columnas compartidas y `firma_admin`, la referencia a la firma guardada de TI) |
| `acc_formato_empresas` | Empresas que aparecen en el formato, por familia |
| `acc_formato_modulos` | Módulos del formato (`exclusivo_admin` para los que solo pide un administrador) |
| `acc_modulo_perfiles` / `acc_modulo_rutinas` | Perfiles y rutinas sugeridas por módulo |
| `acc_cuentas` | Registro de la cuenta del usuario en cada sistema: `estado` (`pendiente`, `activa`) y `accesos` (empresas, módulos, usuario asignado y folio). Su existencia convierte la siguiente solicitud en **Modificación** |
| `acc_solicitudes` | La solicitud: `movimiento` (alta/modificacion), `datos` (JSONB — ver abajo), `pdf_object_key`, `metodo_firma`, `estado_firma`, `docusign_envelope_id`, `firmado_object_key`, `usuario_asignado`, `fecha_alta` |

`acc_solicitudes.datos` guarda una **copia completa** de todo, para que el documento siempre se pueda regenerar igual aunque cambie la configuración del formato: `captura` (lo que llenó el usuario), `usuario` (snapshot del perfil), `config` (el formato tal como estaba), `enviado_en`, `revision` (quién aprobó o rechazó, cuándo, el motivo y el jefe administrativo), `subida` (token y vencimiento de la liga), `escaneo` (ruta, tamaño y huella SHA-256), `liberacion` y, solo de forma temporal, `entrega` (la contraseña temporal hasta que se manda el correo de cierre).

Valores de `estado_firma`: `enviado` (DocuSign), `por_firmar` y `por_liberar` (manual), `firmado`, `rechazada`, `declinado`.

### 7.5 Tablas de apoyo

#### incident_attachments
Evidencia adjunta — mismo patrón que `envelope_attachments` de Legal.

| Columna | Tipo | Descripción |
|---|---|---|
| attachment_type | Enum | `evidencia_reporte` / `evidencia_resolucion` |
| reopen_cycle | Integer | Para distinguir evidencia de reaperturas sucesivas |
| object_key / bucket / mime_type / size_bytes | — | Metadata de MinIO |
| uploaded_by / uploaded_at | — | |

En los tickets de acceso: el PDF de la solicitud y el escaneo son `evidencia_reporte`; el documento firmado final es `evidencia_resolucion`.

#### incident_activity_log
Bitácora completa del ciclo de vida — mismo patrón que `user_file_audit_log` de admin-service.

| Columna | Tipo | Descripción |
|---|---|---|
| action | String(50) | Ver la lista en la sección 14.1 |
| performed_by / performed_by_name / performed_by_role | — | Snapshot del actor al momento del evento — se preserva aunque el usuario cambie de rol después |
| performed_at | DateTime | ⚠️ No es `created_at` — nombre de columna real |
| detail | JSON, nullable | Datos extra según la acción |

#### incident_resolution_tokens
Enlace seguro para atender un Incidente desde correo (sin necesitar login).

| Columna | Tipo |
|---|---|
| token | String(128), único |
| created_for_user_id | UUID |
| expires_at / used_at | DateTime |

Al reasignar, los enlaces anteriores se invalidan; un enlace viejo del asignado **vigente** todavía marca la revisión, pero ya no deja resolver.

#### ajustes / ajustes_historial
Ajustes del módulo (solo super admin) y su historial (quién, cuándo, valor anterior y nuevo).

| Ajuste | Para qué |
|---|---|
| `acc.metodo_firma` | `docusign` o `manual` |
| `acc.docusign_ambiente` | `pruebas` (leyenda "DOCUMENTO DE PRUEBA" en el PDF) o `produccion` |
| `cdc.dias_garantia` | Días de garantía de un CDC cerrado (15) |
| `cdc.permitir_documento_propio` | Si el arranque del CDC acepta documentos propios |

Los cambios del tablero de SLA también quedan en `ajustes_historial` (claves `sla.S1`…`sla.S4`).

### 7.6 Migraciones relevantes (orden cronológico)

```
e31e3edfb865_init_incidencias_tables.py
1ae5444f3133_add_assigned_at_to_incidents.py
7c2a91f4d8b3_add_ticket_type_to_incidents.py            -- clasificador de tipo
fcd35a61ecfe_add_control_cambios_detalle_table_.py       -- tabla de detalle CDC + nullable system/severity
a91f3d2e7c48_add_cdc_statuses_to_enum.py                 -- 9 estatus nuevos al enum
c3e1a7d2f9b4_add_cdc_statuses_to_enum.py                 -- estatus adicionales del ciclo CDC
d4f2b8c1a6e7_add_cdc_design_stages.py                    -- etapas de diseño funcional y técnico
5c0967de0571                                             -- control_cambios_detalle: system_id/module_id FK
aa6f45a22bb9                                             -- control_cambios_avances
f6b4d2a8c1e3_add_ajustes_historial.py                    -- ajustes del módulo e historial
4e832b89cab4_add_control_de_accesos_tables.py            -- tablas acc_*
e6e9c81e9ba2_add_presentacion_to_acc_formatos.py         -- presentación del formato (JSONB)
b7a1c3e9d2f4_add_en_firma_status.py                      -- estatus en_firma (head actual)
```

> `ALTER TYPE ... ADD VALUE` de Postgres no puede correr dentro de una transacción abierta. Las migraciones de estatus lo resuelven con `op.execute("COMMIT")` explícito (las primeras) o con `op.get_context().autocommit_block()` (la de `en_firma`), siempre con `ADD VALUE IF NOT EXISTS`. Usar este patrón si se necesitan más valores en el enum.

> Los **cambios de datos** (no de esquema), como los tiempos de las severidades, se aplicaron con `UPDATE` directo y se cambian después desde el tablero de SLA.

---

## 8. Motor de asignación — fórmulas y lógica

Vive en `app/motor.py`, descrito en su propio docstring como **"función cerrada"**: entrada/salida fijas, lógica interna reemplazable por un modelo de predicción más sofisticado en el futuro sin cambiar el contrato. Esta es una decisión de arquitectura deliberada, no accidental. Detalle completo en `it-service-desk-motor-asignacion.md`.

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
   Si ticket_type == "control_cambio" → corre resolve_cdc_assignment() (regla propia, ver 8.5)
        │
        ▼
6a. Encontrado → finalize_assignment() → status pasa a "asignado" (o "en_revision" en CDC), notifica
6b. No encontrado → log "motor_sin_especialista", se queda en backlog, notifica a Incident Managers
```

Las **solicitudes de acceso no pasan por el motor**: se asignan al encargado de TI del formato al crearse (ver 7.2).

### 8.2 `resolve_assignment` — búsqueda en 3 pasos

```python
async def resolve_assignment(db, system_id, module_id, reported_type) -> dict:
    team_type = TEAM_BY_REPORTED_TYPE.get(reported_type)  # "funcional"→"especialista-funcional", "tecnico"→"especialista-tecnico"
    roles = [team_type] if team_type else [ambos equipos]
    # Usuarios válidos: el rol del equipo, el Incident Manager y el Técnico ligado en el catálogo
    activos = await _usuarios_activos(roles + ["incident-manager", "tecnico"])

    # Paso 1 -- por módulo exacto (el más específico)
    # Paso 2 -- por sistema completo (module_id NULL)
    # Paso 3 -- especialista general del equipo (system_id y module_id ambos NULL)
    # En cada paso: el primer especialista del equipo cuyo usuario esté en "activos"

    return {"encontrado": False}   # si ningún paso encontró a nadie
```

Se detiene en el primer resultado. Cada paso es estrictamente más genérico que el anterior.

**Quién cuenta como "activo"** (`_usuarios_activos` consulta `/internal/users/by-module-role` del admin-service):
- Se excluyen los usuarios **inactivos** (dados de baja) y los eliminados.
- Los **bloqueados** (por intentos fallidos o bloqueo manual) **sí** cuentan: siguen siendo empleados y deben seguir recibiendo tickets. *Bloqueado ≠ baja*. El admin-service devuelve `is_locked` para poder marcarlos en pantalla.
- Desde octubre de 2026 se acepta también el rol **Técnico**: un consultor externo ligado a un sistema o módulo en el catálogo recibe sus tickets automáticamente. Antes se descartaba (no tenía rol de especialista) y el ticket caía en el especialista general. El filtro por equipo sigue aplicando: un técnico ligado al equipo técnico solo recibe tickets técnicos.

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

### 8.4 Bug real encontrado y corregido — CDC no debe buscar especialista de Incidente

Al conectar CDC al motor por primera vez, `resolve_assignment` con `system_id=None, reported_type=None` coincidía accidentalmente con los especialistas "generales" (NULL/NULL) de **Incidente** — asignando tickets de CDC a personas sin ninguna relación real con Control de Cambios. La corrección **no tocó `motor.py`** (se mantiene como función cerrada) — se hizo en el punto de llamada, dentro del consumidor: un CDC nunca llama a `resolve_assignment`, sino a su propia regla.

### 8.5 Regla de asignación de CDC

`resolve_cdc_assignment` — lógica propia de CDC, separada de la de Incidente a propósito. Prioridad confirmada con el dueño del proyecto:

1. **Incident Manager ligado** específicamente al sistema/módulo del CDC (`team_type='incident-manager'`).
2. **Project Manager real** (tiene el rol de módulo), no dado de baja.
3. **Incident Manager activado como PM** con el botón general "Activarme como: Project Manager" (`team_type='project-manager'`, NULL/NULL) — solo si no hubo paso 2.
4. Nada de lo anterior → se queda en backlog.

Al asignarse, el CDC pasa a `en_revision`. Las etapas de diseño usan `resolve_cdc_design_assignment`, que valida que el empleado esté activo.

### 8.6 Reasignación

`finalize_assignment` (en `assignment.py`) invalida los enlaces anteriores, crea uno nuevo y avisa al nuevo asignado y al solicitante. **Reasignar a quien ya tiene el ticket no hace nada**: no invalida su enlace ni le duplica el correo.

---

## 9. Endpoints — todos los routers

Prefijo raíz de todo el servicio: `/api/v1/it-service-desk` (definido en `main.py`).

### 9.1 `/mesa-de-soporte` — Incidente

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health del router |
| GET | `/severidades` | Catálogo de severidades |
| GET | `/incidencias` | Listado paginado de los 3 tipos (alimenta Tabla y tableros), con `first_response_at` y `resolved_at`; filtrado por rol (ver 15) y por `excluir_tipo` solo para mostrar |
| GET | `/incidencias/{id}` | Detalle, con la misma regla de acceso que el listado |
| POST | `/incidencias` | Crear Incidente (varias imágenes en `files`) |
| PATCH | `/incidencias/{id}/asignar` | Asignación o reasignación manual (Incident Manager) |
| POST | `/incidencias/{id}/revisado` | Marcar como revisado — SLA de respuesta (asignado o Incident Manager) |
| PATCH | `/incidencias/{id}/severidad` | **Ruta única** (`cambiar_severidad`): severidad validada, recálculo del SLA desde la creación, bitácora con motivo, aviso al solicitante por correo y campana. IM en cualquier ticket; especialistas en los asignados a ellos |
| GET | `/atender/{token}` | Vista pública vía token de correo — marca la revisión del asignado vigente |
| POST | `/atender/{token}/redirigir` | Redirigir vía token |
| POST | `/atender/{token}/resolver` | Resolver vía token, sin login |
| POST | `/incidencias/{id}/resolver` | Resolver (autenticado) — solo la persona asignada o el Incident Manager |
| POST | `/incidencias/{id}/reabrir` | Reabrir dentro de la ventana permitida |
| POST | `/incidencias/{id}/cerrar` | Cierre formal |
| POST | `/incidencias/{id}/escalar` | Escalamiento |
| GET | `/sla/severidades` | Tablero de SLA (IM o super admin) |
| PUT | `/sla/severidades/{code}` | Guardar tiempos, tipo de horas y RCA de una severidad (deja historial) |
| GET | `/estadisticas` | Dashboard — filtrado a `ticket_type=incidente`; incluye `cumplimiento.respuesta` y `cumplimiento.resolucion`, histograma por día de Monterrey y "por vencer" al 25 % del tiempo |
| GET | `/reportes/incidencias-excel` | Exportar Excel — incidentes **y solicitudes de acceso**, con columnas Tipo y Título, fechas en hora de Monterrey y SLA de respuesta por la revisión |
| POST | `/internal/reportes/sla-diario` | Sin JWT — disparado por cron, filtrado a incidente; fecha en español |
| POST | `/internal/reportes/cierre-automatico` | Sin JWT — cierre automático 24h, filtrado a incidente |

> Hasta octubre de 2026 existían **dos** rutas `PATCH /incidencias/{id}/severidad` (la vieja `validate_severity` y la nueva). FastAPI siempre usa la primera registrada, así que la nueva nunca respondía: el cambio se guardaba, pero sin recálculo ni aviso. Se eliminó la vieja. Al agregar rutas, revisar que no exista otra con la misma dirección.

### 9.2 `/control-cambios` — CDC

| Método | Ruta | Descripción |
|---|---|---|
| POST | `` (raíz del prefijo) | Crear CDC — etapa Registrado: folio, PDF, MinIO, broadcast, motor |
| POST | `/{id}/evidencia` | Subir evidencia a `evidencias_registro/` |
| GET | `/departamentos` | Puente hacia `admin-service` — catálogo real de departamentos |
| GET | `/mi-perfil` | Puente hacia `admin-service` — puesto/departamento/empresa del solicitante actual |
| — | Rutas de cada etapa | Revisión (dictamen con PDF), priorización (roles de gobierno), arranque (documentos generados y cronograma), diseño funcional y técnico, desarrollo (avances por RT), UAT (validación por criterio, evidencia obligatoria, borrador automático y ciclos), paso a producción, terminado (acta de cierre, encuesta y garantía) y cierre automático |
| GET | `/reportes/excel` | Reporte "Seguimiento CC" con semáforo, en formato Verus |

### 9.3 `/control-accesos` — Solicitud de Accesos

| Método | Ruta | Quién | Descripción |
|---|---|---|---|
| GET | `/formatos` | Usuario | Formatos disponibles, con Alta o Modificación según su cuenta |
| GET | `/formatos/{id}/formulario` | Usuario | Datos para el formulario de 7 etapas |
| POST | `/formatos/{id}/vista-previa` | Usuario | El formato lleno, en HTML |
| POST | `/formatos/{id}/solicitudes` | Usuario | Envía: revalida en servidor, crea el ticket `ACC`, guarda la copia, la cuenta pendiente, el PDF como evidencia, el SLA de S1 y manda el correo a TI con el PDF adjunto |
| GET | `/solicitudes/{id}/resumen` | Solicitante, asignado o IM | Resumen por secciones, método y estado de la firma, revisión |
| POST | `/solicitudes/{id}/pdf` | Los mismos | Genera y adjunta el PDF si faltara |
| POST | `/solicitudes/{id}/aprobar` | Encargado de TI del formato, asignado o IM | DocuSign: sobre con anclas; manual: PDF y liga al solicitante |
| POST | `/solicitudes/{id}/rechazar` | Los mismos | Termina como `rechazado`, con motivo |
| POST | `/solicitudes/{id}/contrasena-temporal` | Encargado de TI | DocuSign: guarda la contraseña para el correo final |
| POST | `/solicitudes/{id}/liberar` | Encargado de TI o IM | Manual: documento final con la hoja de Liberación |
| GET · POST | `/subida/{token}` | Público con la liga | Manual: ver la solicitud y subir el escaneo |
| GET · POST | `/formatos/{id}/firma-ti` | Encargado de TI o IM | Ver y subir la firma guardada de TI |
| POST | `/docusign/webhook` | DocuSign | Procesa solo sobres propios |
| POST | `/internal/docusign-poll` | Solo `127.0.0.1` | Consulta de respaldo |
| — | `/config/...` | IM o super admin | Configuración de formatos, empresas, módulos, perfiles, rutinas y vista previa |

### 9.4 `/actualizaciones` — catálogos

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/` | Health del router |
| GET | `/usuarios-por-rol` | Usuarios filtrables por rol de módulo |
| GET / POST / PATCH | `/sistemas` | CRUD de `ticket_systems` |
| GET / POST / PATCH | `/modulos` | CRUD de `ticket_modules` |
| GET / POST / PATCH | `/especialistas` | CRUD de `system_specialists` — aquí se configuran las reglas que consume el motor (especialistas, Incident Managers y técnicos ligados) |

Solo el Incident Manager y el super admin (`"Solo Incident Manager puede administrar este catalogo"`).

### 9.5 `/ajustes`

Lista, edición e historial de los ajustes del módulo. Solo super admin (el submódulo **Ajustes** del menú solo lo ve el super admin).

---

## 10. Estructura de MinIO

Sigue la misma convención documentada en `minio.md` / `upload-service.md` — bucket `dirdoc`, rutas `{company_slug}/{module_slug}/{submodule_slug}/`.

```
dirdoc/
├── {company_slug}/
│   ├── it-service-desk/
│   │   ├── control-de-cambios/
│   │   │   └── {folio}/
│   │   │       ├── {uuid8}_solicitud_{folio}_{fecha}.pdf   ← generado al crear (reportlab)
│   │   │       ├── evidencias_registro/                     ← etapa "En revisión"
│   │   │       └── ...                                      ← documentos de cada etapa
│   │   └── control-de-accesos/
│   │       └── {folio}/
│   │           └── {uuid8}_solicitud_{folio}_{fecha}.pdf    ← formato de la solicitud (upload-service)
│   └── control-de-accesos/
│       └── {folio}/
│           ├── ESCANEO_{folio}_{fecha}_{hora}.pdf           ← firma manual (boto3)
│           └── FIRMADO_{folio}_{fecha}_{hora}.pdf           ← documento final firmado (boto3)
└── control-de-accesos/
    └── firmas/{formato_id}/{aleatorio}.png                  ← firma guardada de TI (privada)
```

El nombre de archivo se normaliza a minúsculas y espacios→guión bajo por el propio `upload-service` (comportamiento estándar de la plataforma). Los archivos que escribe el Control de accesos con `boto3` (cuando no hay sesión de usuario, como en el webhook) llevan su nombre tal cual.

El documento firmado también se registra en el **expediente del empleado** (`user_files` del admin-service) como `ALTA|MOD_{FORMATO}_{MATRICULA}_{FOLIO}_{FECHA}.pdf`, apuntando **al mismo objeto**, sin duplicarlo. Ordenados por fecha, se leen como línea de tiempo de los accesos de la persona.

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

Los endpoints `/internal/reportes/...` (SLA diario, cierre automático) se llaman desde dentro de la red Docker (el cron) directo al nombre del contenedor.

Rutas **públicas a propósito**: `/atender/{token}`, `/control-accesos/subida/{token}` y `/control-accesos/docusign/webhook`. La consulta `/control-accesos/internal/docusign-poll` pasa por Nginx, pero **rechaza** todo lo que no venga de `127.0.0.1` (solo se llama con `docker exec`).

**Acceso desde internet:** `intranet.avalanz.com` apunta a una IP pública y es alcanzable desde fuera de la red del grupo. Los consultores externos pueden necesitar que el área de TI de su empresa permita el sitio en su proxy corporativo (síntoma: *"failed to connect · Connection timed out"* en sus equipos). Como sitio público, recibe escaneos automáticos de robots.

---

## 12. WebSocket / tiempo real

El servicio no aloja su propio WebSocket — transmite eventos al `websocket-service` central, que reenvía a los clientes conectados.

### 12.1 Función `_broadcast_ticket_update`

Vive en `mesa_de_soporte.py`, se importa desde `control_cambios.py` y `control_accesos/solicitudes.py` para reutilizarla:

```python
async def _broadcast_ticket_update(incident, event_type="it_service_desk.ticket_updated"):
    # Resuelve el nombre del asignado si aplica
    # Consulta admin-service por Incident Managers y Project Managers
    # Envía al websocket-service para reenviar a los clientes conectados
```

Se llama con `event_type="it_service_desk.ticket_created"` en la creación (de los 3 tipos), y con el default `ticket_updated` en el resto de mutaciones: asignación del motor, reasignación, revisión (desde el correo o el panel), resolver, reabrir, cerrar, escalar, cambio de severidad, aprobación o rechazo de un acceso, subida del escaneo, liberación y cierre del sobre de DocuSign.

> **Siempre `await db.refresh(incident)` entre el `commit` y el broadcast.** Al hacer commit, SQLAlchemy expira los atributos del objeto; sin el refresh, el broadcast sale incompleto o falla en silencio, y la pantalla no se actualiza hasta recargar (pasó con el cierre de DocuSign).

> Borrar datos directo en la base (por ejemplo, con la limpieza de datos de prueba) **no** genera eventos: las pantallas abiertas siguen mostrando lo anterior hasta recargar.

### 12.2 Consumo en frontend — tableros y tabla

Dos suscripciones vía `useWSEvent`:
- `it_service_desk.ticket_created` → prepend en la columna correcta + resaltado 4s
- `it_service_desk.ticket_updated` → si es la misma columna, actualiza in-place; si cambió de columna, anima salida (fade + scale) y entra en la columna destino

**Bug de carrera conocido y ya resuelto (documentado para no repetirlo):** el evento `ticket_updated` puede llegar antes que `ticket_created` (la asignación automática puede terminar antes del broadcast de creación). La solución: `ticket_updated` agrega el ticket al arreglo local si no existe todavía, en vez de asumir que ya está ahí.

**Layout del Kanban de incidentes (`KanbanBoard.tsx`):** las columnas usan una sola regla CSS universal (`grid-cols-[repeat(auto-fit,minmax(170px,1fr))]`) que calcula cuántas tarjetas caben por fila según el ancho real de cada columna — reemplazó una serie de casos especiales por columna (`flexGrow >= 1.5 ? 3 : 2`, más un caso aparte para Backlog) que requerían ajuste manual cada vez que cambiaba el ancho de una columna. La columna Backlog usa `pageSize: 4` (vs. 8-12 de las demás) para no crecer más alto que sus columnas vecinas y desbordar el layout general de la página. **`KanbanBoard.tsx` no se modifica sin extremo cuidado** por problemas de estabilidad previos.

**Tablero Proyectos (`CdcKanbanBoard.tsx`):** componente **separado** para CDC, justo para no tocar `KanbanBoard.tsx`. Agrupa las 12 etapas en 4 fases, con columnas de tamaño fijo que miden la altura disponible (2 a 4 filas con `ResizeObserver`) y scroll solo hacia los lados.

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
| Solicitudes de acceso | No publican en la cola: se asignan al crearse (salvo que el formato no tenga encargado de TI) |

---

## 14. Trazabilidad y logs

### 14.1 `incident_activity_log`

Registra cada evento del ciclo de vida con snapshot del actor (nombre y rol en el momento del evento, no una referencia viva al usuario). Acciones observadas en el código:

| Ámbito | Acciones |
|---|---|
| Incidente | `creado`, `motor_asigno`, `motor_sin_especialista`, `asignado`, `reasignado`, `revisado` (desde el correo o el panel), `cambio_severidad` (de, a y motivo), `resuelto`, `reabierto`, `cerrado`, `escalado` |
| CDC | Avance de cada etapa (dictamen, priorización, arranque, diseño, desarrollo, UAT, paso a producción, terminado, cierre) |
| Solicitud de acceso | `aprobada_enviada_a_firma`, `aprobada_firma_manual`, `solicitud_rechazada`, `documento_firmado_subido`, `liberada_por_ti` (con la huella del escaneo), `firmada_por_todos`, `firma_declinada` |

El actor "sistema" (motor de asignación, cierre automático) usa un UUID fijo y reservado:

```python
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"
```

Este UUID **nunca representa a una persona real** — es la convención de la plataforma para que la bitácora distinga acciones automáticas de acciones humanas sin necesitar una columna booleana aparte. Los eventos de DocuSign aparecen con el nombre de actor `"DocuSign"` y el rol `sistema`.

### 14.2 Logs de aplicación

`docker logs avalanz-it-service-desk` — incluye tracebacks completos de SQLAlchemy en caso de error de base de datos (útil para depurar problemas de tipo de dato, como el enum de estatus), y las líneas `INFO Motor de asignacion: consumidor conectado...` al arrancar. Los fallos de correo, PDF y DocuSign del Control de accesos se registran con `log.warning` (logger `control_accesos`) en lugar de fallar en silencio.

### 14.3 Zona horaria

El contenedor corre en **UTC** (también el email-service y Legal; el admin-service y el auth-service, en CST). La base guarda todo en UTC. **Toda hora que se muestra** (correos, reporte de SLA, Excel, PDF, hoja de liberación) se convierte a `America/Monterrey` con la constante `TZ_MTY` antes de formatearla. Una hora que aparece **6 horas adelantada** es una que se formateó sin convertir.

---

## 15. Perfiles de usuario y roles (resumen)

Este servicio **no gestiona roles ni permisos** — esa es responsabilidad exclusiva de `admin-service` (roles de módulo con prefijo `it-service-desk:{rol}` en el JWT). Lo que sí vive aquí es la lógica de negocio que *usa* esos roles. Un usuario tiene **un solo acceso por módulo con un solo rol**; el acceso **sin rol** es el **solicitante**.

| Rol de módulo | Tickets que ve | Dashboard | Actualizaciones | Uso dentro de este servicio |
|---|---|---|---|---|
| Super admin | Todos | Completo | Administra | Todo, incluidos los Ajustes |
| `incident-manager` | Todos | Completo | Administra | Recibe avisos cuando el motor no encuentra especialista; reasigna; cambia severidades; tablero de SLA; puede activarse como Especialista Funcional/Técnico o como Project Manager |
| `project-manager` | Todos | Completo | — | Destinatario de los CDC en revisión; prioriza |
| `especialista-funcional` / `especialista-tecnico` | Todos | De su equipo | — | Atienden, resuelven y cambian la severidad de los suyos; ligados en `system_specialists` |
| `tecnico` | **Asignados a él y los que levante** | — | — | Apoyo externo ligado a un sistema o módulo; el motor le asigna sus tickets |
| `comite-directivo` | Todos | Completo | — | Consulta |
| `auditoria` | Todos | — | — | Consulta |
| `jefe-empresa` | Los de su empresa | — | — | Levanta los suyos |
| Solicitante (sin rol) | Solo los suyos | — | — | Levanta tickets y solicitudes de acceso |

La regla de visibilidad vive en `MODULE_WIDE_ROLES` (el Técnico **no** está, desde octubre de 2026) y aplica igual al listado y al detalle: nadie puede abrir un ticket que no le toca, ni escribiendo la dirección a mano.

Ver `it-service-desk-roles-y-perfiles.md` para el detalle completo de scope, botones de activación y su relación exacta con el motor.

---

## 16. Frontend

Ver `frontend.md` para convenciones generales de UI de toda la plataforma. Específico de este módulo:

- **Barra de la Mesa de Soporte:** vistas a la izquierda (Tabla · Tablero incidentes · Tablero proyectos), **"+ Nuevo ticket"** como pastilla azul centrada (antes un botón flotante), y "Activo como" y Exportar Excel a la derecha. Azul de marca `#1a4fa0` (antes café `#7c2d12`).
- **Tabla:** dos relojes de SLA por ticket — **R** (respuesta) y **S** (resolución) — cada uno cumplido a tiempo, a tiempo, por vencer (último 25 %), vencido o cumplido tarde, con globo de detalle. Chips de tipo (Incidentes, Solicitudes de acceso, Control de cambios) con filtro inicial según el rol.
- **Modal selector de tipo** (`NewTicketTypeModal.tsx`): al dar clic en "Nuevo ticket", aparece un modal con 3 opciones (Incidente, Control de Cambios, Solicitud de Accesos) antes de abrir el formulario correspondiente. Entrada animada tipo resorte (`cubic-bezier(0.34, 1.56, 0.64, 1)`) con las tarjetas apareciendo en cascada.
- **Modal de incidente** (`CreateIncidentModal.tsx`): "Descripción corta del ticket" (antes "Título", porque los usuarios no sabían qué poner), con ejemplo; hasta **5 imágenes** de 10 MB, elegidas, **arrastradas** o **pegadas con Ctrl + V** (las pegadas se llaman `captura-1.png`…), con miniaturas y sin repetidas.
- **Modal de creación de CDC** (`CreateControlCambioModal.tsx`): pasarela de 5 pasos (Datos / Alcance / Solicitud / Prioridad / Confirmar), con validación de avance por paso, conectado a `POST /control-cambios`. El paso 1 muestra datos reales de sesión más puesto, departamento y empresa obtenidos vía `GET /control-cambios/mi-perfil`. Sistema y Módulo en cascada desde el catálogo real.
- **Modal de solicitud de acceso** (`CreateSolicitudAccesoModal.tsx`): 7 etapas con tarjeta de perfil, empresas por familia, módulos con perfiles y rutinas, vigencia, jefe directo y vista previa del formato.
- **Panel del ticket** (`IncidentDetailModal.tsx`): "Folio número:", **Cambiar** severidad (diálogo con motivo obligatorio), **Marcar como revisado**, impresión del ticket (`imprimirTicket.ts`), y para los accesos el resumen por secciones con la **Revisión de TI** (`AccResumenSolicitud.tsx`): aprobar, rechazar, contraseña temporal y liberación. "Marcar como resuelto" se oculta en los tickets de acceso.
- **Liga pública** (`app/(auth)/subir-firmado/[token]/page.tsx`): marcada como pública en el middleware, igual que `/atender`.
- **Actualizaciones:** catálogo de sistemas/módulos/especialistas, Control de accesos (`ControlAccesosConfig.tsx`, con la tarjeta de la firma de TI `FirmaTI.tsx`) y **SLA** (`SlaConfig.tsx`).
- **Dashboard de métricas:** Completados, SLA de respuesta, SLA de resolución y Abiertos; volumen diario por día de Monterrey.
- **Responsivo:** hasta 1440 px de ancho (laptops de 13"-15"), el sidebar abre recogido en íconos (la flecha de su orilla lo despliega), las filas de la tabla quedan en un renglón (folio, fecha, título y nombres recortados con su globo) y los márgenes son más angostos. En pantallas grandes, sin cambios: los nombres se ven completos.
- **Después de un despliegue**, quien tenga la intranet abierta puede ver *"This page couldn't load"* (`Failed to find Server Action` en el log de PM2): basta con recargar. Conviene desplegar fuera del horario de mayor uso.
- **Tipografía:** el cuerpo general de la plataforma usa una pila de fuentes de sistema (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`) desde el 2026-09-25 — ver `frontend.md`, sección Fuentes.

---

## 17. Brechas conocidas y pendientes

Lista viva — actualizar conforme se resuelva cada punto.

### Resueltos

1. **Hecho — CDC Alcance:** "Sistema"/"Módulo" usan el catálogo real de `/actualizaciones` (selección única en cascada, igual que Incidente), con "Otro" como renglón real del catálogo — incluyendo un módulo "Otro" por cada sistema.
2. **Hecho — Botón "Activarme como: Project Manager"**, visible solo para Incident Manager; reutiliza `system_specialists` con `team_type='project-manager'`.
3. **Hecho — Regla de asignación del motor para CDC** (ver 8.5).
4. **Hecho — Ciclo completo del CDC** (12 etapas), Tablero Proyectos y reporte Excel.
5. **Hecho — Solicitud de Accesos** con revisión de TI y firma por DocuSign; expediente del empleado.
6. **Hecho — SLA en horas hábiles**, SLA de respuesta, relojes R/S, tablero de SLA y dashboard corregido.

### Pendientes

7. **Firma manual del Control de accesos:** prueba completa de punta a punta, y opción para reenviar la liga si vence.
8. **DocuSign en producción:** credenciales de la cuenta de producción para firmas con validez y `acc.docusign_ambiente = produccion`.
9. **RCA** — flujo de captura y recordatorio (columnas ya existen en `incidents`).
10. **Roles:** confirmar el alcance de Auditoría (hoy ve el contenido completo) y corregir la descripción de Jefe Empresa en Administración → Roles (dice que dictamina CDC; ya no lo hace).
11. **Bajas:** registrar fecha y motivo ("Dar de baja" en lugar de "Desactivar") y marcar a los bloqueados en los buscadores.
12. **Seguridad:** proteger la consulta interna de DocuSign de **Legal** (hoy llamable desde internet) y revisar qué buscan los escáneres que llegan a la intranet.
13. **Dashboard y demás pantallas** con el criterio responsivo de 13".
14. **Aviso de versión nueva** en la intranet, para que nadie vea el mensaje en inglés tras un despliegue.
15. **Zona horaria de los contenedores:** unificar a `America/Monterrey` después de revisar todo `datetime` sin zona.
16. **CDC (heredados):** guardado automático en dictamen y priorización, catálogo "Quién lo desarrolla", ventana de instalación en paso a producción, aprobación de ajuste de alcance y flujo de Modificación, cancelación del CDC y responsable por RT en desarrollo.
17. **Renombrado gradual** de archivos/variables internas que todavía dicen "incidencias"/"mesa de soporte" cuando en realidad ya aplican a los 3 tipos de ticket — sin prisa, conforme se toque cada archivo.
18. **Corrección cosmética de Nginx** — el comentario `# Legal Service` sobre el bloque de IT Service Desk en `intranet.conf`.