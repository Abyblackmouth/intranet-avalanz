# Contexto de Sesión — Intranet Avalanz

Este archivo debe ser lo primero que lea el asistente al iniciar un nuevo chat.
Antes de continuar el trabajo, el asistente debe leer las siguientes guías en orden:

1. docs/architecture/contexto-sesion.md (este archivo)
2. docs/Acta_Constitucion / Alcance / Resumen_Ejecutivo (documentos de proyecto)
3. docs/architecture/politica-roles-permisos.md
4. docs/architecture/shared.md
5. docs/architecture/auth-service.md
6. docs/architecture/admin-service.md
7. docs/architecture/frontend.md
8. docs/architecture/notify-service.md
9. docs/architecture/websocket-service.md
10. docs/architecture/monitoring.md
11. docs/architecture/modulos-submodulos.md
12. docs/architecture/docker-levantamiento.md
13. La guía específica del módulo en el que se va a trabajar

---

## Reglas de trabajo

Estas reglas aplican en cada sesión de chat sin excepción.

**Código completo** — todo archivo nuevo se entrega como artefacto descargable. Ajustes y cambios puntuales se entregan con el comando cat directo en terminal.

**Lectura de archivos** — siempre con grep o sed, nunca cat en el chat (rompe el heredoc).

**Archivos de Windows a Linux** — después de cada descarga dar el comando PowerShell con ruta UNC:
```powershell
$src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
```

**Git** — una rama por feature. Push y merge a develop solo cuando se confirma que el entregable está completo. Nunca push en medio de una feature.

**Guías** — al cerrar cada rama revisar todas las guías relevantes, ajustar lo que cambió y agregar lo nuevo. La guía debe leerse como si siempre hubiera sido así — sin mencionar cambios ni movimientos.

**contexto-sesion.md** — solo se actualiza cuando se está perdiendo contexto y hay que cambiar de chat. No se actualiza al final de cada rama.

**Comentarios en código** — solo comentarios que expliquen qué hace el código. Nunca comentarios que describan refactorizaciones, movimientos o cambios realizados.

**Inicio de sesión nueva** — el flujo es siempre este orden:
1. El usuario pega el contenido de contexto-sesion.md
2. El usuario carga los archivos: Alcance, Resumen Técnico y Acta de Constitución
3. Claude pide la estructura del proyecto con un comando Ubuntu y espera a que el usuario la pegue
4. El usuario carga todos los archivos .md de docs/architecture/
5. Claude lee todos los .md cargados y da un resumen breve de cada uno para confirmar que los leyó
6. Solo después de todo esto se puede continuar trabajando

**Para archivos grandes** — escribir directamente con cat en WSL en lugar de descargar desde artefacto, ya que los artefactos a veces se guardan como duplicados con (1) en el nombre.

**Backend modificado** — siempre copiar el archivo al contenedor con docker cp y reiniciar el servicio después de cada cambio.

---

## Estado actual del proyecto

**Rama activa:** `develop`
**Última actividad:** 2026-04-16

---

## Módulos completados

### Autenticación
- Login con 2FA condicional por red (corporativa = sin 2FA, externa = con 2FA)
- Cambio de contraseña temporal en primer login
- Configuración y verificación de TOTP (Google Authenticator)
- Recuperación de contraseña con desbloqueo automático
- Bloqueo automático por intentos fallidos (MAX_FAILED_ATTEMPTS = 3)
- Bloqueo manual por administrador con motivo obligatorio
- lock_type diferencia bloqueo manual vs intentos fallidos
- Refresh automático de JWT en el frontend

### Panel de administración
- **Usuarios** — tabla completa, alta, edición, detalle con pestañas, bloqueo/desbloqueo, reset contraseña, revocar sesiones, eliminar, badge Protegido
- **Empresas** — tarjetas por grupo, alta manual y desde constancia SAT, edición, detalle, eliminar con trazabilidad
- **Grupos** — tarjetas con stats, CRUD, panel detalle, trazabilidad
- **Módulos y submódulos** — CRUD, íconos Lucide, scaffold automático, sidebar dinámico
- **Roles** — catálogo de roles globales y operativos con scope (empresa/corporativo), CRUD completo
- **Permisos** — permisos globales por categoría, permisos por submódulo en árbol, CRUD completo

### Sistema de notificaciones en tiempo real
- notify-service guarda notificaciones en BD y llama al websocket-service
- websocket-service entrega el evento al frontend via WebSocket
- Frontend: campana con contador en tiempo real, panel desplegable, marcar como leída
- Toasts flotantes en esquina inferior derecha con animación, auto-cierre 5s, máximo 3 simultáneos
- Hook useWebSocket con reconexión automática cada 5s y heartbeat cada 30s

### Monitoreo
- prometheus-fastapi-instrumentator en los 6 servicios FastAPI
- Prometheus recolecta métricas cada 15s
- Dashboard Grafana con auto-refresh 10s: peticiones/seg, errores, latencia, RAM, CPU
- RabbitMQ también monitoreado
- Pendiente: exporters para PostgreSQL, Redis y Nginx

### Infraestructura
- Cron de limpieza: login_history (90 días) y user_sessions (30 días) con CSV backup y rotación semanal
- Mailpit para captura de correos en desarrollo (restart unless-stopped)
- Scaffold automático genera estructura frontend y backend al crear módulo

---

## Modelo de roles (importante)

El sistema tiene dos tipos de roles:

**Roles globales** — solo dos, hardcodeados: `super_admin` y `admin_empresa`. Definen acceso al panel de administración.

**Roles operativos** — catálogo general reutilizable en cualquier módulo. Se crean desde `/admin/roles`. Tienen `scope` (empresa o corporativo) y `module_id` nullable (null = catálogo general).

El JWT incluye `cross_company: true` para super_admin y roles con scope corporativo.

La tabla `user_table` muestra: rol global si existe, rol operativo si no hay rol global, "Sin rol" si no tiene ninguno.

---

## Correos implementados

| Evento | Estado |
|---|---|
| Bienvenida al crear usuario | Activo |
| Reset de contraseña por admin | Activo |
| Cuenta bloqueada por intentos fallidos | Activo |
| Recuperación de contraseña | Activo |
| Sesión revocada remotamente | Pendiente |
| Bloqueo manual por administrador | Pendiente |

---

## Próximos pasos

1. **Release UI/UX** — pulir todas las pantallas del panel de administración
2. **Dashboard principal** — pantalla de inicio con métricas de negocio, accesos rápidos y notificaciones recientes
3. **Primer módulo operativo** — según lo que defina el negocio (Bóveda DYCE o Legal)
4. **Configuración para producción** — HTTPS, servidor real, backups reales, alertas Grafana

---

## Convenciones de UI

- Bordes siempre `border-slate-300`, cards con `shadow-md hover:shadow-xl hover:border-[#1a4fa0]`
- Botones primarios: `bg-[#1a4fa0] hover:bg-blue-700`
- Hover menús: gris `slate-300`, rojo `red-200`
- Menús flotantes: `border-2 border-slate-300 shadow-2xl`
- `MoreHorizontal size={20}` en todos los menús de 3 puntos

---

## Notas técnicas importantes

- CORPORATE_IP_RANGES en auth-service formato JSON: `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]`
- URL servicios internos siempre con puerto: `http://admin-service:8000/...`
- dcron no funciona en WSL2 — el cron usa loop con sleep 60
- Hydration: todo lo que dependa de Zustand protegido con `mounted &&`
- PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com" en user_service.py
- Roles globales usan campo `role_id` (no `id`) en la respuesta del API
- IP WSL2 puede cambiar — verificar con `ip addr show eth0` si el login falla
- NEXT_PUBLIC_WS_URL = `ws://172.20.92.197/ws` (IP WSL2 en desarrollo)
- Mailpit: UI en http://localhost:8025, SMTP en mailpit:1025
- Grafana: http://localhost:3001, credenciales: admin / Avalanz2026!
- Prometheus: http://localhost:9090
- MAX_FAILED_ATTEMPTS = 3 en auth-service/app/config.py
- Módulos en JWT: `{ slug, icon, submodules: [{ slug, icon, name }] }`
- Super admin recibe todos los módulos activos automáticamente en JWT
- Scaffold server corre en puerto 3002 (3001 ocupado por Grafana)
- Clave eliminación módulos: TF9DX4-2JAQSJ-61FVM6-0QB1AK (ver claves-admin.md)
- `turbopack.root` configurado en next.config.ts para resolver Tailwind en WSL2
- Al modificar backend: copiar al contenedor con docker cp y reiniciar el servicio

---

## Estructura del proyecto

```
intranet-avalanz/
├── backend/
│   ├── admin-service/           → CRUD usuarios, empresas, grupos, módulos, roles, permisos
│   ├── auth-service/            → JWT, 2FA, sesiones, bloqueo de cuentas
│   ├── email-service/           → Correos transaccionales con plantillas HTML
│   ├── notify-service/          → Notificaciones en BD + push a websocket-service
│   ├── upload-service/          → Archivos a MinIO/S3
│   ├── websocket-service/       → Comunicación en tiempo real via WebSocket
│   └── shared/                  → Config, excepciones, modelos base, middlewares, utils
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/              → login, change-password, setup-2fa, reset-password
│   │   └── (private)/
│   │       ├── admin/           → users, companies, groups, modules, roles, permissions
│   │       └── app/             → módulos operativos dinámicos [module]/[submodule]
│   ├── components/
│   │   ├── admin/               → users, companies, groups, modules, roles, permissions
│   │   ├── auth/                → AuthProvider, formularios de autenticación
│   │   ├── layout/              → Sidebar, Header, Breadcrumb, PageWrapper
│   │   ├── notifications/       → NotificationBell (campana + panel)
│   │   └── shared/              → ToastContainer, componentes reutilizables
│   ├── hooks/                   → useWebSocket, useNotifications, useAuth, usePagination
│   ├── store/                   → authStore, notificationStore, toastStore
│   ├── services/                → api, authService, adminService, notificationService, roleService
│   └── types/                   → api.types, auth.types, user.types, role.types, module.types
│
├── scripts/
│   ├── create-module.js         → Generador de estructura para módulos y submódulos
│   └── scaffold-server.js       → Webhook scaffold automático (puerto 3002, solo desarrollo)
│
├── infrastructure/
│   ├── cron/                    → Limpieza de históricos con backup CSV
│   ├── docker/                  → docker-compose.yml, docker-compose.dev.yml, seeder.py
│   ├── nginx/                   → nginx.conf, conf.d/intranet.conf
│   ├── prometheus/              → prometheus.yml, alerts.yml
│   └── grafana/                 → datasources.yml, avalanz-services-dashboard.json
│
└── docs/architecture/           → Todas las guías técnicas del proyecto
```

---

## Servicios Docker

| Contenedor | Puerto externo | Descripción |
|---|---|---|
| avalanz-nginx | 80 | API Gateway + WebSocket proxy |
| avalanz-auth | — | Auth Service (interno :8000) |
| avalanz-admin | — | Admin Service (interno :8000) |
| avalanz-upload | — | Upload Service (interno :8000) |
| avalanz-notify | — | Notify Service (interno :8000) |
| avalanz-websocket | — | WebSocket Service (interno :8000) |
| avalanz-email | — | Email Service (interno :8000) |
| avalanz-postgres | 5432 | PostgreSQL |
| avalanz-redis | 6379 | Redis |
| avalanz-rabbitmq | 5672 / 15692 | RabbitMQ |
| avalanz-minio | 9000 | MinIO |
| avalanz-prometheus | 9090 | Prometheus |
| avalanz-grafana | 3001 | Grafana |
| avalanz-cron | — | Limpieza de históricos |
| mailpit | 8025 / 1025 | Captura de correos en desarrollo |
