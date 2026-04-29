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
8. docs/architecture/modulos-submodulos.md
9. docs/architecture/docker-levantamiento.md
10. docs/architecture/despliegue-local-a-pruebas.md
11. docs/architecture/scaffold-server-guia.md
12. docs/architecture/frontend-produccion.md
13. La guía específica del módulo en el que se va a trabajar

---

## Reglas de trabajo

Estas reglas aplican en cada sesión de chat sin excepción.

- **Código completo** — todo archivo nuevo se entrega como artefacto descargable. Ajustes y cambios puntuales se entregan con el comando cat directo en terminal.
- **Lectura de archivos** — siempre con grep o sed, nunca cat en el chat.
- **Archivos de Windows a Linux** — después de cada descarga dar el comando PowerShell con ruta UNC:
```powershell
$src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
```
- **Git** — una rama por feature. Push y merge a develop solo cuando se confirma que el entregable está completo.
- **Guías** — al cerrar cada rama revisar todas las guías relevantes y ajustar lo que cambió.
- **contexto-sesion.md** — solo se actualiza cuando se está perdiendo contexto y hay que cambiar de chat.
- **Comentarios en código** — solo comentarios que expliquen qué hace el código. Nunca comentarios que describan refactorizaciones o movimientos.
- **Inicio de sesión nueva** — el flujo es siempre este orden:
  1. El usuario pega el contenido de contexto-sesion.md
  2. El usuario carga los archivos: Alcance, Resumen Técnico y Acta de Constitución
  3. Claude pide la estructura del proyecto con un comando Ubuntu y espera a que el usuario la pegue
  4. El usuario carga todos los archivos .md de docs/architecture/
  5. Claude lee todos los .md cargados y da un resumen breve de cada uno para confirmar que los leyó
  6. Solo después de todo esto se puede continuar trabajando
- **Backend modificado** — siempre copiar el archivo al contenedor con docker cp y reiniciar el servicio después de cada cambio.
- **Commits** — siempre en inglés.

---

## Estado actual del proyecto

**Rama activa:** `develop`
**Próxima tarea:** Cerrar el cascarón — SSL, DEBUG=False, contraseñas de producción, merge a main
**Última actividad:** 2026-04-28
**Dominio activo:** http://intranet.avalanz.com (HTTP, sin SSL aún)
**Servidor provisional:** 10.12.0.51 (Ubuntu 24.04, usuario: abcovarrubias)

---

## Lo que está funcionando

### Autenticación
- Login completo con 2FA condicional por red
- Cambio de contraseña temporal en primer login
- Configuración de TOTP (Microsoft Authenticator) con QR
- Recuperación de contraseña con token de un solo uso
- Bloqueo automático por intentos fallidos (MAX_FAILED_ATTEMPTS = 3)
- Bloqueo manual por administrador con lock_type (manual | failed_attempts)
- Refresh automático de JWT en el frontend
- `is_super_admin` incluido en el JWT payload (leído desde admin-service permissions response)

### Panel de administración — todos los módulos completos
- **Usuarios** — tabla, alta, edición, detalle (3 pestañas: info, sesiones, historial), bloquear/desbloquear, reset contraseña, revocar sesiones, eliminar, badge Protegido
- **Empresas** — tarjetas por grupo, alta manual y desde constancia SAT, edición, detalle, eliminar con clave
- **Grupos** — tarjetas con stats, CRUD completo, panel detalle con empresas del grupo
- **Módulos y submódulos** — CRUD, 100 íconos Lucide con popover flotante, scaffold automático, clave de eliminación
- **Roles** — roles globales y de módulo con scope, CRUD completo
- **Permisos** — permisos globales por categoría, permisos por submódulo en árbol, CRUD completo

### Perfil de usuario
- Página `/profile` con datos personales precargados (nombre, email, puesto, departamento, matrícula)
- Avatar circular con iniciales
- Empresa muestra "Grupo Avalanz" para super admins
- Mensaje informativo — edición solo por administrador

### Archivos de empleados
- upload-service configurado con bucket `dirdoc` en MinIO
- Tab Documentos en UserDetail — subir, descargar (URL firmada 15 min), eliminar

### Notificaciones en tiempo real
- notify-service + websocket-service + frontend (campana, panel, toasts)
- Endpoint `/api/v1/notifications` sin trailing slash en Nginx (fix aplicado 2026-04-28)

### Monitoreo
- Prometheus + Grafana con métricas de los 6 servicios FastAPI (todos en `up`)
- `notify-service` y `websocket-service` ahora tienen `prometheus-fastapi-instrumentator` instalado
- Dashboard agrupado por `job` — paneles de peticiones y latencia correctos
- Redis con límite de 256MB y política `allkeys-lru`
- Exporters: postgres-exporter, redis-exporter, nginx-exporter
- Alertas configuradas
- Grafana con `allowUiUpdates: false` para respetar el JSON del repo

### Backups automáticos
- backup_postgres.sh — diario 1:00 AM, 30 días retención
- verify_backups.sh — verificación domingos 4:00 AM
- cleanup.sh — historial login (90 días) y sesiones revocadas (30 días)

### Correo electrónico
- SMTP configurado con Office 365 via soporte@avalanz.com
- Remitente: no-reply@avalanz.com (grupo de distribución sin licencia)
- Templates HTML inline compatibles con Outlook
- Flujos: bienvenida, reset contraseña, cuenta bloqueada, recuperación contraseña
- Pendiente: configurar SPF + DKIM en tenant Office 365 para evitar no deseados

### Scaffold automático de módulos
- `scripts/create-module.js` — genera estructura backend + frontend con validación de duplicados
- `scripts/scaffold-server.js` — HTTP puerto 3002, recibe llamadas del admin-service y del browser
- Al crear módulo desde el admin: scaffold genera archivos → rebuild frontend → pm2 restart → git commit + push
- Página "Módulo en construcción" como fallback en `[module]/page.tsx`
- Módulos ya creados en el servidor: `boveda`, `legal`

---

## Historial de ambientes

### Desarrollo local (WSL2)
- **Máquina:** LAPTOP-4SPKNTJH (Windows + WSL2 Ubuntu)
- **Usuario WSL2:** abyblackmouth
- **Ruta repo:** `/home/abyblackmouth/code/avalanz/intranet-avalanz`
- **Frontend:** `http://localhost:3000`
- **API:** `http://localhost` (Nginx en Docker)
- **Grafana:** `http://localhost:3001`
- **SMTP:** Mailpit `http://localhost:8025`
- **Variables:** `NEXT_PUBLIC_API_URL=http://localhost`, `NEXT_PUBLIC_WS_URL=ws://localhost/ws`
- **Red Docker:** `172.16.0.0/12` agregada a `CORPORATE_IP_RANGES` para WSL2

### Servidor provisional / pruebas (activo)
- **IP interna:** `10.12.0.51`
- **Dominio:** `http://intranet.avalanz.com` (HTTP sin SSL aún)
- **IP pública:** `200.23.37.225` (NAT en Fortinet)
- **Usuario SSH:** `abcovarrubias`
- **SO:** Ubuntu 24.04
- **Frontend PM2:** proceso `intranet-frontend`, puerto 3000
- **Scaffold PM2:** proceso `scaffold-server`, puerto 3002
- **Variables activas:**
  - `NEXT_PUBLIC_API_URL=http://intranet.avalanz.com`
  - `NEXT_PUBLIC_WS_URL=ws://intranet.avalanz.com/ws`
  - `NEXT_PUBLIC_SCAFFOLD_URL=http://intranet.avalanz.com:3002`
  - `SCAFFOLD_SERVER_URL=http://10.12.0.250:3002` en admin-service
- **Paneles:**

| Panel | URL | Credenciales |
|---|---|---|
| Frontend | http://intranet.avalanz.com | admin@avalanz.com / Admin@2026! |
| Grafana | http://10.12.0.51:3001 | admin / Avalanz2026! |
| RabbitMQ | http://10.12.0.51:15672 | avalanz / Avalanz2026! |
| MinIO | http://10.12.0.51:9001 | minioadmin / Avalanz2026! |
| Prometheus | http://10.12.0.51:9090 | — |
| Mailpit | http://10.12.0.51:8025 | — |
| Scaffold health | http://10.12.0.51:3002/health | — |

### Producción (pendiente)
- **Dominio:** `https://intranet.avalanz.com` (HTTPS con certificado SSL)
- **Certificado:** pendiente — lo gestionan desde el Fortinet (infra)
- **Puertos a cerrar:** 5432 (PostgreSQL), 9001 (MinIO)
- **Pendiente antes del go-live:** DEBUG=False, nuevas JWT keys y contraseñas, merge a main

---

## Notas técnicas importantes

- `CORPORATE_IP_RANGES` formato JSON: `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]`
- URL servicios internos siempre con puerto: `http://admin-service:8000/...`
- `PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com"` en user_service.py
- Roles globales usan `role_id` (no `id`) en respuesta del API
- `passlib[bcrypt]==1.7.4` + `bcrypt==4.0.1` en auth-service (incompatible con bcrypt 5.x)
- Migración `d47aff39e7ad` usa `IF EXISTS` — compatible con BDs nuevas
- Variables `NEXT_PUBLIC_*` se hornean en build — rebuild requerido al cambiar
- `docker compose restart` NO recarga variables .env — usar `--force-recreate`
- Scaffold-server corre en host (fuera de Docker) en puerto 3002
- IP del host Docker desde contenedores: `10.12.0.250`
- Clave módulos: `TF9DX4-2JAQSJ-61FVM6-0QB1AK`
- Notify-service no tiene migraciones Alembic — tabla creada con SQL directo
- PM2 configurado como servicio systemd — arranca automáticamente
- SSH key de VM en GitHub: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFg1E4FrR30WLeyPBRb2VPzEaLz/Ml66UAGhc3gt5zfW`
- Git en VM configurado: user.email = abraham_covarrubias@avalanz.com
- Remote de la VM: `git@github.com:Abyblackmouth/intranet-avalanz.git` (SSH, no HTTPS)
- El auto-commit del scaffold está implementado pero puede fallar silenciosamente — pendiente debug
- `is_super_admin` viene del campo `perms.get("is_super_admin")` del admin-service, NO del modelo User del auth-service
- `_is_super_admin()` en admin-service verifica `roles` Y `is_super_admin` del JWT
- Nginx location `/api/v1/notifications` sin trailing slash (fix 2026-04-28)
- Nginx `location /` apunta al frontend en `http://10.12.0.51:3000`
- Redis maxmemory: 256mb con política allkeys-lru

---

## Convenciones de UI

- Azul corporativo: `#1a4fa0`
- Cards: `border border-slate-200 shadow-sm hover:shadow-md hover:border-[#1a4fa0]/30 hover:-translate-y-0.5 transition-all duration-200`
- Inputs: `border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150`
- Sidebar: `border-r-2 border-slate-300`, w-60 / w-16 colapsado
- Header: `border-b-2 border-slate-300`
- Botones primarios: `bg-[#1a4fa0] hover:bg-blue-700`
- Hover menús: gris `slate-300`, rojo `red-200`
- Menús flotantes: `border-2 border-slate-300 shadow-2xl`
- `MoreHorizontal size={20}` en todos los menús de 3 puntos
- Hydration: todo lo que dependa de Zustand protegido con `mounted &&`
- No usar banners de degradado azul en páginas — usar fondo neutro `bg-slate-100` o nada

---

## Pendiente

### Para cerrar el cascarón (bloqueante)
- HTTPS con certificado SSL — lo gestiona infra desde el Fortinet
- SPF + DKIM en tenant Office 365 — pendiente con el admin del tenant
- DEBUG=False en todos los servicios backend
- Nuevas JWT keys y contraseñas de producción
- Puertos 5432 y 9001 cerrados al exterior
- Merge a main (cuando Edgar y Andrés aprueben)

### Técnico sin producción
- Auto-commit del scaffold — falla silenciosamente, pendiente debug completo del flujo gitCommit()
- Rsyslog + logrotate para centralizar logs Docker
- rsync al servidor secundario de backups

### Desarrollo (próximas ramas)
- Primer módulo operativo: Bóveda DYCE o Legal
- Dashboard de métricas principal (V2)
- Motor de workflows
- Módulo de configuración SMTP

---

## Comandos frecuentes VM

```bash
# Estado general
pm2 status
docker ps --format "table {{.Names}}\t{{.Status}}"

# Rebuild frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Rebuild servicio
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build --force-recreate admin-service -d

# Actualizar desde repo
cd ~/intranet-avalanz && git pull origin develop

# Desbloquear admin
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_auth \
  -c "UPDATE users SET is_locked=false, failed_attempts=0, locked_at=NULL, lock_type=NULL WHERE email='admin@avalanz.com';"

# Borrar módulo de prueba
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin \
  -c "DELETE FROM modules WHERE slug='nombre';"

# Ver logs scaffold-server
pm2 logs scaffold-server --lines 30

# Verificar targets Prometheus
curl -s http://localhost:9090/api/v1/targets | python3 -c "
import json,sys
data = json.load(sys.stdin)
for t in data['data']['activeTargets']:
    print(t['labels']['job'], '|', t['health'], '|', t.get('lastError',''))
"
```

---

## Rutas Nginx críticas

El archivo `infrastructure/nginx/conf.d/intranet.conf` tiene estas rutas que deben existir en este orden (más específicas primero):

```nginx
# Raíz — frontend
location / { proxy_pass http://frontend; }

# Auth sub-rutas — antes de /api/v1/auth/
location ~ ^/api/v1/auth/internal/users/[^/]+/sessions { proxy_pass http://auth_service; }
location ~ ^/api/v1/auth/internal/users/[^/]+/login-history { proxy_pass http://auth_service; }
location ~ ^/api/v1/auth/internal/users/[^/]+/revoke-sessions { proxy_pass http://auth_service; }

# User files — antes de /api/v1/users/
location ~ ^/api/v1/users/[^/]+/files { proxy_pass http://admin_service; client_max_body_size 55M; }

# Notifications — sin trailing slash
location /api/v1/notifications { proxy_pass http://notify_service; }

# WebSocket
location /ws { proxy_pass http://websocket_service; proxy_http_version 1.1; ... }
```

El `server_name` incluye `_` como catch-all:
```nginx
server_name intranet.avalanz.com 10.12.0.51 _;
```

---

## Estructura del proyecto

```
intranet-avalanz/
├── backend/
│   ├── modules/                 → Módulos operativos generados con scaffold
│   │   ├── boveda-service/
│   │   └── legal-service/
│   ├── admin-service/
│   ├── auth-service/
│   ├── email-service/
│   ├── notify-service/
│   ├── upload-service/
│   ├── websocket-service/
│   └── shared/
├── frontend/
│   ├── app/
│   │   ├── (auth)/              → login, change-password, setup-2fa, reset-password
│   │   └── (private)/
│   │       ├── admin/           → users, companies, groups, modules, roles, permissions
│   │       ├── profile/         → perfil del usuario autenticado
│   │       └── app/
│   │           ├── [module]/    → fallback "Módulo en construcción"
│   │           ├── boveda/      → generado por scaffold
│   │           └── legal/       → generado por scaffold
│   ├── components/
│   ├── hooks/
│   ├── services/
│   ├── store/
│   ├── types/
│   └── lib/
├── scripts/
│   ├── create-module.js
│   └── scaffold-server.js
├── infrastructure/
│   ├── cron/
│   ├── docker/
│   ├── nginx/
│   ├── prometheus/
│   ├── grafana/
│   └── consul/
└── docs/architecture/
```

---

## Servicios Docker

| Contenedor | Puerto externo | Descripción |
|---|---|---|
| avalanz-nginx | 80 | API Gateway + Frontend proxy |
| avalanz-auth | — | Auth Service :8000 |
| avalanz-admin | — | Admin Service :8000 |
| avalanz-upload | — | Upload Service :8000 |
| avalanz-notify | — | Notify Service :8000 |
| avalanz-websocket | — | WebSocket Service :8000 |
| avalanz-email | — | Email Service :8000 |
| avalanz-postgres | 5432 | PostgreSQL (cerrar en prod) |
| avalanz-redis | 6379 | Redis (256MB limit) |
| avalanz-rabbitmq | 5672/15672 | RabbitMQ |
| avalanz-minio | 9000/9001 | MinIO (cerrar 9001 en prod) |
| avalanz-consul | 8500 | Consul |
| avalanz-prometheus | 9090 | Prometheus |
| avalanz-grafana | 3001 | Grafana |
| avalanz-cron | — | Backups y limpieza |
| avalanz-mailpit | 8025/1025 | Correos desarrollo |
| avalanz-postgres-exporter | — | Métricas PostgreSQL |
| avalanz-redis-exporter | — | Métricas Redis |
| avalanz-nginx-exporter | — | Métricas Nginx |