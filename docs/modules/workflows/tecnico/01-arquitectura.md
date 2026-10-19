# 01 · Arquitectura

## Piezas

| Pieza | Dónde | Notas |
|---|---|---|
| `workflows-service` | `backend/modules/workflows-service/` · contenedor `avalanz-workflows` | FastAPI + SQLAlchemy 2 (async) + Alembic; Python 3.11 |
| Base de datos | `avalanz_workflows` en `avalanz-postgres` | Migraciones con Alembic; head actual con columnas `flujos.resumen` y `flujos.hoja` |
| Cola | `avalanz-rabbitmq`, cola `workflows.resultados` | Dispara el envío de resultados a la plataforma; un barrido cada minuto cubre lo que la cola no alcance |
| Archivos | MinIO, bucket `dirdoc`, ruta `{conexion}/{grupo-empresa}/workflows/{processId}/{clave}/` | Se guardan con huella SHA-256; se descargan con ligas firmadas por `/storage/` (Nginx) |
| Correo | `email-service` (`POST /api/v1/email/module`) | Plantilla corporativa; Workflows manda el contenido |
| Campana | `notify-service` (`POST /api/v1/notifications/`) | Avisos en la Intranet |
| Usuarios | `admin-service` (`/internal/users/search`, `/internal/users/{id}/profile`, `/internal/users/by-module-role`) | Búsqueda de aprobadores, correo del solicitante, administradores del módulo |
| Frontend | `frontend/app/(private)/app/workflows/` y `frontend/components/app/workflows/` | Next.js; la página pública vive en `frontend/app/(auth)/aprobar/[token]` |
| Nginx | `location ^~ /api/v1/workflows` → `workflows_service` | La ruta `/aprobar` es pública en `frontend/proxy.ts` |

## Estructura del código

```
backend/modules/workflows-service/
├── app/
│   ├── main.py · config.py · database.py · auth.py · rabbitmq.py
│   ├── models/workflows.py            Las 18 tablas
│   ├── motor/                         Lógica del módulo (sin rutas)
│   │   ├── grupos.py                  Condiciones, resolución de grupo, armado de etapas, simulador
│   │   ├── instancias.py              Recibir, avanzar, decidir, reasignar, reprocesar, tokens, bitácora
│   │   ├── transacciones.py           Bandeja de salida: armar resultado, procesar, reintentar
│   │   ├── avisos.py                  Campana y correos (aprobador, solicitante, TI)
│   │   ├── consultas.py               Listados y detalle con vistas por rol
│   │   ├── archivos.py                MinIO: guardar el sobre, ligas firmadas
│   │   ├── resumen.py                 Resumen por flujo (columnas de tablas)
│   │   ├── hoja.py · hoja_db.py       Hoja del trámite: configuración y armado
│   │   ├── hoja_pagina.py             Página de aprobación (Jinja2)
│   │   ├── hoja_correo.py             Versión correo de la hoja (no se usa hoy en los avisos)
│   │   └── plantillas/hoja_pagina.html
│   ├── plataformas/                   Conectores por plataforma
│   │   ├── base.py                    POST JSON genérico con la autenticación de la conexión
│   │   └── totvs.py                   Interpreta {"actualizado": bool, "mensaje": ...}
│   ├── routes/                        ajustes · flujos · bandeja · seguimiento · integration · publico
│   └── services/                      ajustes (ajustes, conexiones, usuarios) · flujos
├── migrations/                        Alembic
└── sembrar_hoja_compra.py             Siembra la hoja de CompraDirecta
```

## Base de datos

**Configuración**

| Tabla | Para qué |
|---|---|
| `conexiones` | Una por plataforma: slug, título, URL base, autenticación (cifrada), token de entrada (cifrado), tiempo de espera, reintentos y espaciado |
| `conexion_empresas` | Empresas de cada plataforma por clave `grupo\|empresa` (`02\|01`) con su nombre |
| `conexion_usuarios` | Liga entre el id de usuario de la plataforma (`000006`) y el usuario de la Intranet |
| `flujos` | `processId`, aliases, nombre, `resultService`, activo, versión, `resumen` (JSON) y `hoja` (JSON) |
| `flujo_versiones` | Una por cada cambio: la definición completa en JSON |
| `flujo_grupos` | Grupos de aprobación por empresa (`origen_clave`), default, regla de auto-aprobación |
| `flujo_grupo_miembros` | Solicitantes que caen en un grupo |
| `flujo_grupo_etapas` | Etapas del grupo: orden, nombre, tipo, aprobador, suplente, condición |
| `ajustes` · `ajustes_historial` | Valores de los ajustes y quién los cambió |
| `folio_counters` | Consecutivo por prefijo + familia (con bloqueo de fila) |

**Ejecución**

| Tabla | Para qué |
|---|---|
| `instancias` | El trámite: folio, flujo, versión, conexión, `externalKey`, empresa, solicitante, `card_data`, grupo, `status`, `afectacion` |
| `instancia_etapas` | Copia plana de las etapas del trámite con su estado y quién decidió (columnas planas para poder copiarse a tablas del ERP) |
| `instancia_archivos` | Archivos del trámite en MinIO, con tipo y SHA-256 |
| `aprobacion_tokens` | Ligas personales: una por aprobador y etapa, con vencimiento, uso e invalidación |

**Trazabilidad**

| Tabla | Para qué |
|---|---|
| `transacciones` | Cada mensaje con la plataforma: dirección, estado, intento, próximo intento, respuesta |
| `correos_enviados` | Cada correo: plantilla, destinatario, resultado, reenvíos |
| `bitacora` | Cada evento del trámite con actor, fecha, IP y detalle |

**Estados**

| Campo | Valores |
|---|---|
| `instancias.status` | `en_aprobacion` · `aprobada` · `rechazada` · `sustituida` · `cancelada` · `error_configuracion` |
| `instancias.afectacion` | `pendiente` · `aplicada` · `fallida` |
| `instancia_etapas.status` | `pendiente` · `en_turno` · `aprobada` · `rechazada` · `omitida` · `no_alcanzada` · `reasignada` |
| `transacciones.estado` | `recibido` · `pendiente_envio` · `enviado` · `error` · `abandonado` |

Índices desde el inicio en `status`, `flujo_id`, `external_key` y `estado + proximo_intento`, y un índice único parcial en `instancias(conexion_id, external_key)` solo para trámites `en_aprobacion` (no puede haber dos abiertos para el mismo documento).

## API

Prefijo: `/api/v1/workflows`. Todas las rutas usan el JWT de la Intranet salvo **integración** (token de la conexión en `X-WF-Token`) y **público** (token de la liga en la URL).

| Grupo | Rutas | Acceso |
|---|---|---|
| Integración | `POST /integration/instances` · `GET /integration/instances/{id}` · `GET /integration/instances?externalKey=` | Plataforma (`X-WF-Token`) |
| Público | `GET /public/aprobar/{token}` (JSON) · `GET /public/aprobar/{token}/pagina` (HTML) · `POST /public/aprobar/{token}/decidir` | Liga del correo |
| Bandeja | `GET /bandeja?filtro=mias\|decididas\|participo` · `GET /bandeja/{id}` · `POST /bandeja/{id}/decidir` | Usuario participante |
| Seguimiento | `GET /seguimiento/resumen` · `GET /seguimiento/instancias` · `GET /seguimiento/instancias/{id}` · `POST …/reasignar` · `POST …/reprocesar` · `POST …/reenviar-aviso` · `GET /seguimiento/transacciones` · `GET /seguimiento/transacciones/{id}` · `POST /seguimiento/transacciones/{id}/reenviar` | Lectura según scope; acciones: administrador (reenviar aviso también el solicitante) |
| Flujos | CRUD de flujos, grupos, miembros y etapas · `GET /flujos/{id}/versiones` · `GET /flujos/{id}/definicion` · `POST /flujos/{id}/simular` · `GET /flujos/{id}/hoja/sugerida` · `POST /flujos/{id}/hoja/vista-previa` · `POST /flujos/{id}/hoja/prueba` · catálogos de conexiones y usuarios | Administrador y diseñador (auditoría lectura) |
| Ajustes | `GET /ajustes` · `PUT /ajustes/{key}` · `GET /ajustes/historial` · CRUD de conexiones y sus empresas · `POST …/probar` · `POST …/regenerar-token` · CRUD de usuarios de plataformas · `GET /ajustes/usuarios/buscar-intranet` | Super administrador |

## Frontend

| Ruta | Archivo |
|---|---|
| Inicio | `app/(private)/app/workflows/page.tsx` |
| Bandeja | `app/(private)/app/workflows/bandeja/page.tsx` |
| Seguimiento | `app/(private)/app/workflows/seguimiento/page.tsx` |
| Flujos | `app/(private)/app/workflows/flujos/page.tsx` (+ `components/app/workflows/flujos/`: `GruposConfig`, `HojaConfig`, `FlujoPestanas`) |
| Ajustes | `app/(private)/app/workflows/ajustes/page.tsx` (+ `components/app/workflows/ajustes/`) |
| Liga del correo | `app/(auth)/aprobar/[token]/page.tsx` (iframe a `/public/aprobar/{token}/pagina`) |

Componentes compartidos: `VistaTramite` (detalle con vistas por rol), `HojaTramite` (muestra la hoja renderizada por el servidor), `RielFlujo` (diagrama de etapas), `TablaTramites`, `ModalTramite`, `compartidos.tsx`. Servicio: `services/workflowsService.ts`.
