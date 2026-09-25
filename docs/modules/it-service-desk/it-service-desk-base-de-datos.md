# IT Service Desk — Base de Datos

Documento complementario a `it-service-desk-service.md` (sección 7, resumida ahí). Aquí va el detalle completo: cada tabla columna por columna con su tipo real, todas las relaciones, los índices y restricciones tal como existen hoy en producción, el razonamiento detrás de las decisiones de esquema, y un hallazgo real de rendimiento detectado al revisar la estructura.

Base de datos: `avalanz_it_service_desk` (PostgreSQL, propia de este servicio — ningún otro microservicio la consulta directamente).

---

## 1. Filosofía general del esquema

### 1.1 Una tabla compartida para los 3 tipos de ticket, no tres tablas paralelas

`incidents` es la tabla central para Incidente, Control de Cambios y (a futuro) Solicitud de Accesos — no hay `control_cambios` ni `solicitudes_acceso` como tablas independientes con su propio folio, estatus y solicitante. La columna `ticket_type` clasifica cuál es cuál.

**Por qué se decidió así, explícitamente, en vez de tablas separadas:** folio, estatus, solicitante, empresa, fechas de creación/actualización y la bitácora de actividad son conceptualmente los mismos para los 3 tipos — solo cambia la información específica de cada uno. Duplicar esa base común en 3 tablas habría significado triplicar la lógica de generación de folio, de listado, de broadcast en tiempo real, y de bitácora.

### 1.2 Las columnas específicas de cada tipo NO viven en `incidents`

Para no llenar la tabla compartida de columnas que un tipo nunca usa, cada tipo con necesidades propias tiene su **tabla de detalle**, ligada 1:1 por `incident_id`. Hoy solo existe `control_cambios_detalle` (Incidente no necesita una porque sus columnas específicas — severidad, SLA, sistema — ya estaban en `incidents` desde el diseño original, antes de que existiera CDC).

**Alternativas que se consideraron y se descartaron explícitamente antes de llegar a este diseño:**
- Una sola columna JSON genérica (`extra_data`) en `incidents` para que cada tipo guarde lo que necesite — descartada porque pierde tipado fuerte por campo y complica filtrar/consultar (ej. "dame todos los CDC de urgencia alta" requeriría desempacar JSON en cada consulta)
- Agregar columnas sueltas directamente a `incidents` por cada campo nuevo de CDC — descartada porque Incidente terminaría cargando columnas que nunca usa (`sistemas_afectados`, `tipo_solicitud`, `justificacion`...), ensuciando el modelo compartido

La tabla de detalle con columnas tipadas propias fue la decisión final — más trabajo inicial (una tabla nueva por tipo), pero cada campo mantiene su tipo real y las consultas quedan directas.

### 1.3 Camposcompartidos que se relajaron para poder compartir la tabla

`system_id` y `severity_reported_id` en `incidents` eran originalmente `NOT NULL` — Incidente siempre los requiere a nivel de negocio. Se relajaron a `nullable=True` a nivel de base de datos (migración `fcd35a61ecfe`) específicamente para que CDC pudiera dejarlos vacíos sin romper el esquema compartido:

- CDC no tiene un solo sistema — tiene `sistemas_afectados` (un arreglo) en su propia tabla de detalle
- CDC no usa severidad — usa "impacto" y "urgencia" en su lugar, campos de naturaleza distinta

**Importante:** esto es una relajación a nivel de esquema, no de negocio — el frontend de Incidente sigue exigiendo ambos campos al crear un ticket; solo la base de datos ya no los fuerza, para poder aceptar renglones de CDC sin esos valores.

---

## 2. Catálogos

### 2.1 `ticket_severities`

Severidades S1–S4, configurable por el Incident Manager (no hardcodeado en el código — vive en base de datos, editable vía `/actualizaciones`... aunque en la práctica no se encontró un endpoint CRUD específico para severidades en el código revisado, solo lectura vía `GET /severidades`).

| Columna | Tipo | Nullable | Default | Notas |
|---|---|---|---|---|
| id | UUID | No | — | PK |
| code | String(4) | No | — | Único — "S1".."S4" |
| name | String(50) | No | — | |
| response_sla_minutes | Integer | No | — | Minutos de SLA de respuesta |
| resolution_sla_hours | Integer | No | — | Horas de SLA de resolución |
| is_24_7 | Boolean | No | False | Solo S1 en estabilización, según el proceso de negocio |
| rca_mandatory | Boolean | No | False | |
| is_active | Boolean | No | True | |
| created_at / updated_at | DateTime tz | No | now | |

### 2.2 `ticket_systems`

Catálogo abierto de sistemas (ERP TOTVS, Portal de Proveedores, CRM Odoo DYCE/Vanta, TOTVS V25...) — crece vía el CRUD de `/actualizaciones/sistemas`, sin cambios de código.

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | UUID | No | PK |
| name | String(150) | No | Único |
| is_active | Boolean | No | |

### 2.3 `ticket_modules`

Módulos dentro de cada sistema (ej. "Contabilidad" dentro de TOTVS).

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | UUID | No | PK |
| system_id | UUID FK → ticket_systems.id | No | `ON DELETE CASCADE` |
| name | String(150) | No | Único junto con `system_id` (`uq_ticket_modules_system_name`) |
| is_active | Boolean | No | |

### 2.4 `system_specialists`

El catálogo que consume directamente el motor de asignación (ver `it-service-desk-motor-asignacion.md`).

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | UUID | No | PK |
| system_id | UUID FK → ticket_systems.id | **Sí** | `NULL` = aplica a cualquier sistema |
| module_id | UUID FK → ticket_modules.id | **Sí** | `NULL` = aplica a cualquier módulo |
| team_type | String(30) | No | `especialista-funcional` / `especialista-tecnico` |
| specialist_user_id | UUID | No | Sin FK — el usuario vive en `admin-service`, no aquí |
| is_active | Boolean | No | |

**La combinación `system_id IS NULL AND module_id IS NULL`** son los especialistas "generales" — el respaldo del Paso 3 del motor, y lo que activa/desactiva el botón "Activarme como especialista general" (ver `it-service-desk-roles-y-perfiles.md`).

### 2.5 `folio_counters`

Consecutivo atómico — ver `it-service-desk-motor-asignacion.md` sección de fórmula del folio para el `SELECT ... FOR UPDATE` exacto.

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | UUID | No | PK |
| prefix | String(3) | No | `INC` / `CDC` / `ACC` |
| family_clave | String(4) | No | Ej. `AVAL` |
| last_number | Integer | No, default 0 | |

Único por `(prefix, family_clave)` — restricción `uq_folio_counters_prefix_family`.

### 2.6 `incidencias_settings`

Configuración clave/valor genérica.

| Columna | Tipo | Nullable |
|---|---|---|
| key | String(100) | No, único |
| value | String(255) | No |
| updated_by | UUID | Sí |

---

## 3. Tabla central — `incidents`

Estructura real confirmada directo en producción (`\d incidents`):

| Columna | Tipo real (Postgres) | Nullable | Default |
|---|---|---|---|
| id | uuid | No | — |
| folio | varchar(15) | No | — |
| title | varchar(150) | No | — |
| company_id | uuid | No | — |
| requester_id | uuid | No | — |
| requester_name | varchar(255) | No | — |
| requester_phone | varchar(20) | Sí | — |
| requester_puesto | varchar(255) | Sí | — |
| requester_area | varchar(255) | Sí | — |
| requester_company_name | varchar(255) | No | — |
| system_id | uuid | **Sí** | — |
| module_id | uuid | Sí | — |
| reported_type | varchar(20) | Sí | — |
| description | text | No | — |
| severity_reported_id | uuid | **Sí** | — |
| severity_validated_id | uuid | Sí | — |
| assigned_team | varchar(30) | Sí | — |
| assigned_to_user_id | uuid | Sí | — |
| assigned_at | timestamptz | Sí | — |
| attention_level | varchar(5) | Sí | — |
| first_response_at | timestamptz | Sí | — |
| sla_response_limit | timestamptz | Sí | — |
| sla_resolution_limit | timestamptz | Sí | — |
| is_sla_breached | boolean | No | — |
| resolved_at | timestamptz | Sí | — |
| resolution_type | varchar(20) | Sí | — |
| reopen_window_expires_at | timestamptz | Sí | — |
| reopened_at | timestamptz | Sí | — |
| reopen_count | integer | No | — |
| related_incident_id | uuid | Sí | — |
| escalated_to | varchar(30) | No | — |
| escalated_at | timestamptz | Sí | — |
| rca_text | text | Sí | — |
| rca_due_date | timestamptz | Sí | — |
| closed_at | timestamptz | Sí | — |
| status | `incident_status_enum` | No | — |
| created_at | timestamptz | No | — |
| updated_at | timestamptz | No | — |
| ticket_type | varchar(20) | No | `'incidente'` |

### 3.1 Restricciones y llaves

```sql
PRIMARY KEY (id)
UNIQUE (folio)                                    -- incidents_folio_key

FOREIGN KEY (module_id)             → ticket_modules(id)
FOREIGN KEY (severity_reported_id)  → ticket_severities(id)
FOREIGN KEY (severity_validated_id) → ticket_severities(id)
FOREIGN KEY (system_id)             → ticket_systems(id)
FOREIGN KEY (related_incident_id)   → incidents(id)      -- autoreferencia, incidencias relacionadas
```

**`company_id` y `requester_id` no tienen FK** — ambos referencian entidades que viven en `admin-service` (empresas y usuarios), en una base de datos distinta. Es consistente con el resto de la plataforma: los microservicios nunca tienen FK cruzando bases de datos, solo guardan el UUID y consultan al servicio dueño cuando necesitan el detalle.

### 3.2 Quién referencia a `incidents` (relaciones entrantes)

```
control_cambios_detalle.incident_id  → incidents.id   ON DELETE CASCADE
incident_activity_log.incident_id    → incidents.id   ON DELETE CASCADE
incident_attachments.incident_id     → incidents.id   ON DELETE CASCADE
incident_resolution_tokens.incident_id → incidents.id ON DELETE CASCADE
incidents.related_incident_id        → incidents.id   (autoreferencia, sin cascade)
```

Todas las tablas hijas se borran en cascada si se borra el ticket padre — coherente, dado que ninguna tiene sentido sin su ticket. La autoreferencia (`related_incident_id`) **no** tiene cascade — borrar un ticket relacionado no debe borrar el otro.

### 3.3 El enum `incident_status_enum` — los 15 valores reales

```sql
SELECT unnest(enum_range(NULL::incident_status_enum));
```
```
en_backlog, asignado, en_atencion, escalado, resuelto, cerrado,        -- Incidente (6 originales)
registrado, en_revision, aprobado, rechazado, priorizado,              -- CDC (agregados 2026-09-25)
en_desarrollo, en_pruebas, terminado, cancelado                        -- CDC (agregados 2026-09-25)
```

**Nota técnica sobre cómo se agregaron los 9 valores nuevos:** Postgres no permite `ALTER TYPE ... ADD VALUE` dentro de una transacción abierta. La migración `a91f3d2e7c48` hace un `op.execute("COMMIT")` explícito antes de correr cada `ADD VALUE IF NOT EXISTS` — patrón necesario a repetir si se vuelve a necesitar ampliar este enum.

**Aunque el enum ya tiene los 9 valores de CDC, hoy en producción ningún ticket de CDC los usa todavía** — todos están en `en_backlog` (ver sección 6, snapshot de datos reales). La lógica que los mueve hacia su propia cadena de estatus es trabajo pendiente.

### 3.4 ⚠️ Hallazgo de rendimiento — sin índices más allá de PK y folio

```
Indexes:
    "incidents_pkey" PRIMARY KEY, btree (id)
    "incidents_folio_key" UNIQUE CONSTRAINT, btree (folio)
```

No existe ningún índice sobre `ticket_type`, `status`, `company_id`, `requester_id`, ni `assigned_to_user_id` — las columnas que **más se filtran** en la práctica: el listado principal ordena por `created_at` y (hoy) ya no filtra por `ticket_type` a nivel de query, el dashboard filtra por rango de fechas y (para Incidente) por `ticket_type`, y el Kanban agrupa por `status`. Con el volumen actual (~98 renglones, ver sección 6) esto no se nota, pero es una brecha real a vigilar conforme crezca el volumen de tickets — especialmente ahora que `ticket_type` se volvió una columna de filtro activo desde que CDC comparte la tabla.

**No se aplicó ningún índice nuevo durante esta sesión** — se deja como hallazgo documentado, no como cambio hecho, ya que agregar índices en producción amerita su propia decisión (y su propia migración) por separado.

---

## 4. Tabla de detalle — `control_cambios_detalle`

Un renglón por ticket `control_cambio`, ligado 1:1 por `incident_id`.

| Columna | Tipo | Nullable | Notas |
|---|---|---|---|
| id | uuid | No | PK |
| incident_id | uuid FK → incidents.id | No | **Único** — garantiza el 1:1. `ON DELETE CASCADE` |
| sistemas_afectados | varchar[] (ARRAY) | No | Multi-selección — ej. `{"ERP TOTVS","Portal de Proveedores"}` |
| sistema_otro_detalle | varchar(255) | Sí | Texto libre si se eligió "Otro" |
| area_departamento | varchar(150) | No | Viene del catálogo real de departamentos de `admin-service` |
| tipo_solicitud | varchar(30) | No | `nueva_funcionalidad` / `mejora_existente` |
| justificacion | text | No | |
| impacto_si_no_se_realiza | varchar(10) | No | `alto` / `medio` / `bajo` |
| urgencia_solicitada | varchar(10) | No | `alta` / `media` / `baja` |
| fecha_requerida | date | Sí | Opcional |
| comentarios_adicionales | text | Sí | Opcional |
| solicitud_pdf_object_key | varchar(500) | Sí | Ruta del PDF generado, en MinIO |
| created_at | timestamptz | No | |

```sql
Indexes:
    "control_cambios_detalle_pkey" PRIMARY KEY, btree (id)
    "control_cambios_detalle_incident_id_key" UNIQUE CONSTRAINT, btree (incident_id)
Foreign-key constraints:
    "control_cambios_detalle_incident_id_fkey" FOREIGN KEY (incident_id) REFERENCES incidents(id) ON DELETE CASCADE
```

`sistemas_afectados` como `ARRAY(String)` de Postgres (no una tabla pivote aparte) — decisión pragmática dado que es una lista corta y cerrada de opciones (5-6 sistemas + "Otro"), sin necesidad de metadatos propios por combinación.

---

## 5. Tablas de apoyo

### 5.1 `incident_attachments`

Evidencia adjunta — mismo patrón que `envelope_attachments` de Legal.

| Columna | Tipo | Notas |
|---|---|---|
| attachment_type | Enum `incident_attachment_type_enum` | `evidencia_reporte` / `evidencia_resolucion` |
| reopen_cycle | Integer, default 0 | Distingue evidencia de reaperturas sucesivas del mismo ticket |
| object_key / bucket / mime_type / size_bytes | — | Metadata de MinIO |
| uploaded_by / uploaded_at | — | |

### 5.2 `incident_activity_log`

Bitácora completa — mismo patrón que `user_file_audit_log` de admin-service.

| Columna | Tipo | Notas |
|---|---|---|
| action | varchar(50) | `creado`, `motor_asigno`, `motor_sin_especialista`, `asignado`, `reasignado`, `resuelto`, `reabierto`, `cerrado`, `escalado`, `severidad_validada`... |
| performed_by / performed_by_name / performed_by_role | — | **Snapshot** del actor en el momento del evento — no cambia si el usuario luego cambia de nombre o rol |
| performed_at | timestamptz | ⚠️ No es `created_at` — nombre real de la columna, a tener presente al escribir consultas |
| company_id | uuid, nullable | |
| module_slug | varchar(100), default `it-service-desk` | |
| detail | json, nullable | Datos extra según la acción (ej. `{"equipo_asignado": ..., "usuario_asignado": ..., "es_reasignacion": bool}`) |

El actor `SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"` se usa cuando la acción la hizo el motor o un proceso automático — nunca representa a una persona real.

### 5.3 `incident_resolution_tokens`

Enlace de un solo uso para atender/resolver un ticket desde correo, sin login.

| Columna | Tipo | Notas |
|---|---|---|
| token | varchar(128), único | Generado con `secrets.token_urlsafe(32)` |
| created_for_user_id | uuid | |
| expires_at | timestamptz | 30 días desde su creación (`RESOLUTION_TOKEN_VALID_DAYS`) |
| used_at | timestamptz, nullable | Se marca al usarse; también se invalida (se marca usado) si el ticket se reasigna antes de que el token original se use |

---

## 6. Snapshot de datos reales (referencia de escala, no una regla fija)

```sql
SELECT ticket_type, status, COUNT(*) FROM incidents GROUP BY ticket_type, status ORDER BY ticket_type, status;
```

| ticket_type | status | count |
|---|---|---|
| control_cambio | en_backlog | 13 |
| incidente | asignado | 36 |
| incidente | resuelto | 18 |
| incidente | cerrado | 31 |

Total: 98 tickets. Nota relevante: **ningún Incidente aparece en `en_backlog`** en este corte — todos los que existen ya fueron asignados o resueltos, lo cual es consistente con que el motor encuentra especialista casi siempre para Incidente (hay especialistas generales configurados). Los 13 de `control_cambio` sí están todos en `en_backlog`, como se espera dado que el motor los salta deliberadamente (ver `it-service-desk-motor-asignacion.md` sección 4) y la lógica para sacarlos de ahí todavía no existe.

---

## 7. Migraciones — orden cronológico completo

| Revisión | Descripción | Qué cambió |
|---|---|---|
| `e31e3edfb865` | init_incidencias_tables | Esquema original completo — catálogos + `incidents` + tablas de apoyo, pensado solo para Incidente |
| `1ae5444f3133` | add_assigned_at_to_incidents | Agrega columna `assigned_at` |
| `7c2a91f4d8b3` | add_ticket_type_to_incidents | Agrega `ticket_type` (`server_default='incidente'`) — clasificador que habilita todo lo demás. Verificado tras aplicar: los 85 renglones existentes en ese momento quedaron como `incidente`, ninguno nulo |
| `fcd35a61ecfe` | add_control_cambios_detalle_table_ | Crea `control_cambios_detalle` + relaja `system_id` y `severity_reported_id` a nullable en `incidents` |
| `a91f3d2e7c48` | add_cdc_statuses_to_enum | Agrega los 9 valores de estatus de CDC al enum, con `COMMIT` explícito antes de cada `ADD VALUE` |

---

## 8. Preguntas abiertas / trabajo futuro relacionado con el esquema

1. **Índices faltantes** (sección 3.4) — evaluar agregar sobre `ticket_type`, `status`, `company_id` conforme crezca el volumen; no urgente hoy, sí a vigilar.
2. **CDC saliendo de `en_backlog`** — cuando se construya la regla del motor planeada (ver `it-service-desk-motor-asignacion.md` sección 9), los 13 renglones actuales en `en_backlog` serán los primeros en probarla.
3. **Tabla de detalle para Solicitud de Accesos (ACC)** cuando se construya — seguirá previsiblemente el mismo patrón que `control_cambios_detalle` (tabla propia, 1:1 por `incident_id`), pero eso todavía no está decidido a detalle.
