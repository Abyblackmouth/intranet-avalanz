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
8. docs/architecture/docker-levantamiento.md
9. La guía específica del módulo en el que se va a trabajar



---

## Estado actual del proyecto

**Rama activa:** `feature/email-service`
**Última actividad:** 2026-04-03

---

## Lo que está funcionando

- Login completo con 2FA condicional por red
- Sidebar y Header sin errores de hidratación
- Panel admin — módulo de usuarios completo:
  - Tabla con empresa, rol, 2FA, candado de acceso, estado, última conexión
  - Badge "Protegido" en el Super Administrador del sistema
  - Formulario de alta con todos los campos y asignación de rol y módulos
  - Formulario de edición con todos los campos y cambio de rol global
  - Modal de detalle con 3 pestañas: info, sesiones activas, historial de login
  - Menú de 3 puntos con: ver detalle, editar, resetear contraseña, bloquear/desbloquear, revocar sesiones, eliminar
  - Modal de motivo obligatorio para bloquear/desbloquear
  - Modal de confirmación para revocar sesiones y eliminar
  - Acciones ocultas para el usuario protegido (editar, bloquear, eliminar)
- Bloqueo/desbloqueo funcional — se guarda en admin-service y auth-service
- Reseteo de contraseña funcional — modal con validación, correo al usuario, is_temp_password activado
- Eliminación de usuario funcional — soft delete con is_deleted y deleted_at
- Cron de limpieza diaria de login_history y user_sessions con respaldo CSV
- Alembic configurado en admin-service con 3 migraciones aplicadas
- Alembic configurado en auth-service con 1 migración aplicada (lock_type)
- Endpoints internos en auth-service: create, info, batch-info, sessions, login-history, lock, reset-password
- Servicio de correo conectado con Mailpit en desarrollo:
  - Bienvenida al crear usuario
  - Reset de contraseña por admin
  - Cuenta bloqueada por intentos fallidos
  - Recuperación de contraseña con desbloqueo automático
- Campo lock_type en auth-service: diferencia bloqueo manual vs intentos fallidos
- Mensajes de bloqueo diferenciados en el login
- Recuperación de contraseña bloqueada para usuarios bloqueados manualmente

---

## Rama activa: feature/admin-companies-groups

### Completado en esta rama
- Panel de empresas con tarjetas por grupo, búsqueda, toggle activa/inactiva
- Alta de empresa manual y carga automática desde constancia SAT (pdfjs-dist, sin almacenar archivo)
- Editar empresa con validación de RFC y razón social solo para super_admin
- Actualización de constancia SAT en edición — valida RFC, carga solo domicilio y fechas
- Vista detalle de empresa — panel lateral con info, domicilio y vigencia de constancia
- Eliminar empresa con trazabilidad: debe estar inactiva y sin usuarios
- Campos de domicilio fiscal en companies: calle, num_ext, num_int, colonia, cp, municipio, estado
- Campos de vigencia de constancia SAT: constancia_fecha_emision, constancia_fecha_vigencia
- Migración 951e0445379d aplicada en admin-service
- Filtro de empresas inactivas en selectores de usuario (UserForm, page usuarios)
- Hover y bordes mejorados en menús de 3 puntos (companies y users)

### Pendiente en esta rama
- Merge a develop

---

## Próximos módulos admin pendientes

- Grupos (CRUD)
- Módulos y submódulos
- Roles y permisos

---

## Convenciones importantes

- Comandos de copia siempre en PowerShell — Linux WSL no llega a Downloads de Windows
- Si el archivo se descarga como (1), usar este patrón en PowerShell:
```powershell
  $src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
  Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
```
- Para archivos grandes usar cat directo en WSL, no descargar desde artefacto
- Sin comentarios de movimientos en el código, solo comentarios de funciones
- Sin emojis a menos que el usuario los use primero
- Guías van a docs/architecture/
- Al modificar backend: copiar al contenedor y reiniciar el servicio
- Commits siempre en inglés

---

## Notas técnicas importantes

- CORPORATE_IP_RANGES en auth-service formato JSON: `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]`
- URL servicios internos siempre con puerto: `http://admin-service:8000/...`
- dcron no funciona en WSL2 — el cron usa loop con sleep 60
- Hydration: todo lo que dependa de Zustand protegido con `mounted &&`
- PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com" en user_service.py
- Roles globales usan campo `role_id` (no `id`) en la respuesta del API
- Al crear usuario: admin-service sincroniza al auth-service via POST /internal/users
- Al bloquear: admin-service guarda lock_reason, llama a POST /internal/users/{id}/lock
- IP WSL2 puede cambiar — verificar con `ip addr show eth0` si el login falla
- lock_type en auth-service: "manual" = bloqueado por admin, "failed_attempts" = bloqueado automáticamente
- Mailpit para desarrollo: UI en http://localhost:8025, SMTP en mailpit:1025
- Mailpit debe estar conectado a la red Docker: docker network connect docker_avalanz-network mailpit
- MAX_FAILED_ATTEMPTS = 3 en auth-service/app/config.py

---

## Estructura del proyecto
```
intranet-avalanz/
├── backend/
│   ├── admin-service/           → CRUD usuarios, empresas, grupos, módulos, roles, permisos
│   │   ├── app/
│   │   │   ├── models/admin_models.py
│   │   │   ├── routes/          → companies, groups, modules, permissions, roles, users
│   │   │   └── services/        → company, group, module, permission, role, user service
│   │   └── migrations/versions/ → 3 migraciones aplicadas
│   ├── auth-service/            → JWT, 2FA, sesiones, bloqueo de cuentas
│   │   ├── app/routes/          → auth.py, twofa.py, internal.py
│   │   └── migrations/versions/ → 1 migración aplicada (lock_type)
│   ├── email-service/           → Correos transaccionales con plantillas HTML
│   ├── notify-service/          → Notificaciones en BD
│   ├── upload-service/          → Archivos a MinIO/S3
│   ├── websocket-service/       → Comunicación en tiempo real
│   └── shared/                  → Config, excepciones, modelos base, middlewares, utils
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/              → login, change-password, setup-2fa, reset-password
│   │   └── (private)/
│   │       ├── admin/           → users, companies, groups, modules, roles, permissions
│   │       └── app/             → módulos operativos dinámicos
│   ├── components/
│   │   ├── admin/
│   │   │   ├── users/           → UserTable, UserForm, UserEditForm, UserDetail, UserModuleAccess
│   │   │   ├── companies/       → CompanyTable, CompanyForm
│   │   │   ├── groups/          → GroupTable, GroupForm
│   │   │   ├── modules/         → ModuleTable, ModuleForm, SubmoduleForm
│   │   │   ├── permissions/     → PermissionForm, PermissionTree
│   │   │   └── roles/           → RoleTable, RoleForm
│   │   ├── auth/                → AuthProvider, LoginForm, ChangePasswordForm, Setup2FAForm, ResetPasswordForm
│   │   ├── layout/              → Sidebar, Header, Breadcrumb, PageWrapper
│   │   ├── notifications/       → NotificationBell, NotificationList
│   │   └── shared/              → ConfirmDialog, DataTable, EmptyState, LoadingSpinner, StatusBadge
│   ├── hooks/                   → useAuth, useModules, useNotifications, usePagination, usePermissions, useWebSocket
│   ├── services/                → api, authService, adminService, moduleService, notificationService, roleService, uploadService
│   ├── store/                   → authStore, notificationStore, uiStore
│   ├── types/                   → api.types, auth.types, company.types, module.types, user.types
│   └── lib/                     → constants, formatters, utils, validators
│
├── infrastructure/
│   ├── cron/                    → Dockerfile, entrypoint.sh, cleanup.sh, rotate_backups.sh
│   ├── docker/                  → docker-compose.yml, docker-compose.dev.yml, docker-compose.prod.yml, seeder.py
│   ├── nginx/                   → nginx.conf, conf.d/intranet.conf
│   ├── prometheus/              → prometheus.yml, alerts.yml
│   ├── grafana/                 → datasources.yml
│   └── consul/                  → consul.json
│
└── docs/architecture/           → Todas las guías técnicas del proyecto
```

---

## Servicios Docker

| Contenedor | Puerto interno | Descripción |
|---|---|---|
| avalanz-nginx | 80 | API Gateway |
| avalanz-auth | 8000 | Auth Service |
| avalanz-admin | 8000 | Admin Service |
| avalanz-upload | 8000 | Upload Service |
| avalanz-notify | 8000 | Notify Service |
| avalanz-websocket | 8000 | WebSocket Service |
| avalanz-email | 8000 | Email Service |
| avalanz-postgres | 5432 | PostgreSQL |
| avalanz-redis | 6379 | Redis |
| avalanz-rabbitmq | 5672 | RabbitMQ |
| avalanz-minio | 9000 | MinIO |
| avalanz-consul | 8500 | Consul |
| avalanz-prometheus | 9090 | Prometheus |
| avalanz-grafana | 3001 | Grafana |
| avalanz-cron | — | Limpieza de historicos |
| mailpit | 8025 / 1025 | Captura de correos en desarrollo |
