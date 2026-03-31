# Intranet Avalanz

Plataforma intranet corporativa on-premise con arquitectura de microservicios y modelo multi-tenant centralizado. Diseñada para servir a múltiples empresas de los grupos Avalanz y Zignia con datos completamente aislados por empresa y una administración centralizada de usuarios, módulos, roles y permisos.

---

## Arquitectura general

```
intranet-avalanz/
├── backend/
│   ├── shared/                → Código reutilizable entre servicios
│   ├── auth-service/          → Autenticación JWT + 2FA condicional
│   ├── admin-service/         → Usuarios, empresas, módulos, roles, permisos
│   ├── upload-service/        → Almacenamiento S3/MinIO
│   ├── notify-service/        → Notificaciones en base de datos
│   ├── websocket-service/     → Comunicación en tiempo real
│   └── email-service/         → Correos transaccionales
├── frontend/                  → Next.js 14
├── infrastructure/
│   ├── docker/                → Docker Compose (base, dev, prod)
│   ├── nginx/                 → API Gateway y proxy inverso
│   ├── consul/                → Registro y descubrimiento de servicios
│   ├── prometheus/            → Métricas y alertas
│   └── grafana/               → Dashboards de monitoreo
└── docs/
    └── architecture/          → Guías de cada servicio
```

---

## Stack tecnológico

| Categoría | Tecnología |
|---|---|
| Frontend | Next.js 14 |
| Backend | Python FastAPI |
| Base de datos | PostgreSQL 15 |
| Caché | Redis 7 |
| Mensajería | RabbitMQ 3.13 |
| Almacenamiento | MinIO (S3-compatible) |
| Gateway | Nginx 1.25 |
| Descubrimiento | Consul 1.17 |
| Monitoreo | Prometheus + Grafana |
| Orquestación | Docker Compose |
| Control de versiones | Gitflow |

---

## Microservicios

| Servicio | Puerto (dev) | Base de datos | Descripción |
|---|---|---|---|
| auth-service | 8001 | avalanz_auth | Autenticación, JWT, 2FA TOTP |
| admin-service | 8002 | avalanz_admin | Grupos, empresas, usuarios, módulos, roles |
| upload-service | 8003 | — | Archivos con MinIO/S3 |
| notify-service | 8004 | avalanz_notify | Notificaciones |
| websocket-service | 8005 | — | Tiempo real |
| email-service | 8006 | — | Correos transaccionales |

---

## Requisitos previos

- Docker Engine 24+
- Docker Compose v2+
- Git

```bash
# Verificar versiones
docker --version
docker compose version
git --version
```

---

## Instalación y arranque

### 1. Clonar el repositorio

```bash
git clone <url-del-repositorio>
cd intranet-avalanz
```

### 2. Configurar variables de entorno

```bash
# Variables de infraestructura Docker
cp infrastructure/docker/.env.example infrastructure/docker/.env

# Variables de cada servicio
cp backend/auth-service/.env.example backend/auth-service/.env
cp backend/admin-service/.env.example backend/admin-service/.env
cp backend/upload-service/.env.example backend/upload-service/.env
cp backend/notify-service/.env.example backend/notify-service/.env
cp backend/websocket-service/.env.example backend/websocket-service/.env
cp backend/email-service/.env.example backend/email-service/.env
```

Editar cada `.env` con los valores correspondientes. Como mínimo cambiar:
- `JWT_SECRET_KEY` en todos los servicios (usar el mismo valor en todos)
- `POSTGRES_PASSWORD` en `infrastructure/docker/.env`
- `SUPER_ADMIN_EMAIL` y `SUPER_ADMIN_PASSWORD` para el seeder

Generar una clave JWT segura:
```bash
openssl rand -hex 32
```

### 3. Levantar el entorno de desarrollo

```bash
cd infrastructure/docker

docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### 4. Ejecutar el seeder (primera vez)

```bash
# En otra terminal, con los contenedores corriendo
docker exec -it avalanz-postgres bash

# Dentro del contenedor
cd /tmp
pip install asyncpg passlib bcrypt
python /seeder.py
```

O directamente desde la máquina:
```bash
cd infrastructure/docker

DB_HOST=localhost \
DB_USER=avalanz_user \
DB_PASSWORD=tu_password \
SUPER_ADMIN_EMAIL=admin@avalanz.com \
SUPER_ADMIN_PASSWORD=Admin@2026! \
python seeder.py
```

### 5. Verificar que todo esté corriendo

```bash
# Health checks
curl http://localhost/health/auth
curl http://localhost/health/admin
curl http://localhost/health/upload
curl http://localhost/health/notify
curl http://localhost/health/websocket
curl http://localhost/health/email
```

---

## Levantar en producción

```bash
cd infrastructure/docker

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Paneles de administración (solo desarrollo)

| Panel | URL | Credenciales |
|---|---|---|
| RabbitMQ | http://localhost:15672 | Ver .env |
| MinIO Console | http://localhost:9001 | Ver .env |
| Consul UI | http://localhost:8500 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | Ver .env |
| API Auth docs | http://localhost:8001/docs | — |
| API Admin docs | http://localhost:8002/docs | — |
| API Upload docs | http://localhost:8003/docs | — |
| API Notify docs | http://localhost:8004/docs | — |
| API WebSocket docs | http://localhost:8005/docs | — |
| API Email docs | http://localhost:8006/docs | — |

---

## Comandos útiles

```bash
# Ver logs de un servicio
docker logs -f avalanz-auth

# Reiniciar un servicio sin reconstruir
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart auth-service

# Reconstruir solo un servicio
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build auth-service

# Detener todo
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# Detener y eliminar volúmenes (cuidado: borra los datos)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# Ver estado de los contenedores
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Acceder a la base de datos
docker exec -it avalanz-postgres psql -U avalanz_user -d avalanz_admin

# Acceder a Redis
docker exec -it avalanz-redis redis-cli -a tu_password
```

---

## Metodología de trabajo — Gitflow

```
main          → código en producción
develop       → rama de integración
feature/*     → nuevas funcionalidades
hotfix/*      → correcciones urgentes en producción
release/*     → preparación de versiones
```

```bash
# Iniciar una nueva funcionalidad
git checkout develop
git checkout -b feature/nombre-funcionalidad

# Integrar al desarrollo
git checkout develop
git merge feature/nombre-funcionalidad
git branch -d feature/nombre-funcionalidad
```

---

## Grupos y empresas

### Grupo Avalanz
78 empresas incluyendo: AVALANZ, AGIM, AGIMTY, SPPEL, CNCI, TODITO CARD, TODITO PAGOS, HORIZONTE, AVZ DIGITAL MEDIA, PUBLIMAX, entre otras.

### Zignia
15 empresas incluyendo: SUPER ESPECTACULOS, PROMOTORAEVENTO, DOME, TICKETING, entre otras.

El estado `is_active` de cada empresa refleja si aparece en el catálogo operativo del sistema.

---

## Seguridad

- Contraseñas hasheadas con bcrypt
- Secretos TOTP cifrados con Fernet
- Tokens JWT con expiración por inactividad (30 min) y absoluta (8 hrs)
- 2FA condicional por ubicación de red (solo fuera de red corporativa)
- Rate limiting en Nginx y en cada microservicio
- Todos los servicios internos inaccesibles desde fuera de Docker en producción
- Soft delete en todas las entidades críticas

---

## Documentación

| Documento | Ruta |
|---|---|
| Shared | docs/architecture/shared.md |
| Auth Service | docs/architecture/auth-service.md |
| Admin Service | docs/architecture/admin-service.md |
| Upload Service | docs/architecture/upload-service.md |
| Notify Service | docs/architecture/notify-service.md |
| WebSocket Service | docs/architecture/websocket-service.md |
| Email Service | docs/architecture/email-service.md |

---

## Equipo

| Nombre | Rol |
|---|---|
| Andrés Hinojosa | Patrocinador |
| Héctor Abraham Covarrubias Martínez | Gerente de Proyecto / Líder Técnico |
| Edgar Horteales | Project Manager |