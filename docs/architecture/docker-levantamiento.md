# Guía de Levantamiento — Docker

Ubicación de los archivos de infraestructura: `infrastructure/docker/`

---

## Requisitos previos

- Docker Desktop corriendo en Windows con integración WSL2 activada
- WSL2 con Ubuntu configurado
- Git

### Verificar que Docker está disponible en WSL2

```bash
docker --version
docker compose version
```

Si aparece `The command 'docker' could not be found in this WSL 2 distro`, abrir Docker Desktop en Windows, ir a **Settings → Resources → WSL Integration** y activar la integración con Ubuntu.

---

## Configuración inicial (primera vez)

### 1. Generar JWT_SECRET_KEY

Debe ser el mismo valor en todos los servicios:

```bash
JWT_KEY=$(openssl rand -hex 32)
echo $JWT_KEY

sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/auth-service/.env
sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/admin-service/.env
sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/upload-service/.env
sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/notify-service/.env
sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/websocket-service/.env
sed -i "s/cambia-esta-clave-por-una-segura-en-produccion/$JWT_KEY/g" backend/email-service/.env
```

### 2. Configurar contraseñas de infraestructura

```bash
sed -i 's/changeme/Avalanz2026!/g' infrastructure/docker/.env
```

### 3. Sincronizar contraseñas en los servicios

```bash
sed -i 's/DB_PASSWORD=changeme/DB_PASSWORD=Avalanz2026!/g' backend/auth-service/.env
sed -i 's/DB_PASSWORD=changeme/DB_PASSWORD=Avalanz2026!/g' backend/admin-service/.env
sed -i 's/DB_PASSWORD=changeme/DB_PASSWORD=Avalanz2026!/g' backend/notify-service/.env

sed -i 's/REDIS_PASSWORD=/REDIS_PASSWORD=Avalanz2026!/g' backend/auth-service/.env
sed -i 's/REDIS_PASSWORD=/REDIS_PASSWORD=Avalanz2026!/g' backend/admin-service/.env
sed -i 's/REDIS_PASSWORD=/REDIS_PASSWORD=Avalanz2026!/g' backend/notify-service/.env

sed -i 's/RABBITMQ_PASSWORD=guest/RABBITMQ_PASSWORD=Avalanz2026!/g' backend/auth-service/.env
sed -i 's/RABBITMQ_PASSWORD=guest/RABBITMQ_PASSWORD=Avalanz2026!/g' backend/admin-service/.env
sed -i 's/RABBITMQ_PASSWORD=guest/RABBITMQ_PASSWORD=Avalanz2026!/g' backend/notify-service/.env

sed -i 's/STORAGE_SECRET_KEY=minioadmin/STORAGE_SECRET_KEY=Avalanz2026!/g' backend/upload-service/.env
```

---

## Levantar el entorno

### Desarrollo

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Desarrollo (sin reconstruir imágenes)

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

### Producción

```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Verificar que todo está corriendo

```bash
# Estado de los contenedores
docker ps --format "table {{.Names}}\t{{.Status}}"

# Health checks de cada servicio
curl http://localhost/health/auth
curl http://localhost/health/admin
curl http://localhost/health/notify
curl http://localhost/health/upload
curl http://localhost/health/websocket
curl http://localhost/health/email
```

Respuesta esperada de cada servicio:
```json
{"service":"auth-service","version":"1.0.0","status":"ok",...}
```

---

## Ejecutar el seeder (primera vez)

```bash
pip3 install asyncpg passlib bcrypt
cd infrastructure/docker
DB_PASSWORD=Avalanz2026! python3 seeder.py
```

Variables de entorno disponibles para el seeder:

| Variable | Default | Descripción |
|---|---|---|
| DB_HOST | localhost | Host de PostgreSQL |
| DB_PORT | 5432 | Puerto de PostgreSQL |
| DB_USER | avalanz_user | Usuario de PostgreSQL |
| DB_PASSWORD | changeme | Contraseña de PostgreSQL |
| SUPER_ADMIN_EMAIL | admin@avalanz.com | Email del super admin inicial |
| SUPER_ADMIN_NAME | Super Administrador | Nombre del super admin |
| SUPER_ADMIN_PASSWORD | Admin@2026! | Contraseña del super admin |

---

## Comandos útiles

```bash
# Ver logs de un servicio
docker logs -f avalanz-auth

# Reiniciar un servicio
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart auth-service

# Reconstruir y recrear un servicio específico
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate auth-service

# Detener todo sin borrar datos
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# Detener todo y borrar volúmenes (borra todos los datos)
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

# Ver estado detallado
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Acceder a PostgreSQL
docker exec -it avalanz-postgres psql -U avalanz_user -d avalanz_auth

# Acceder a Redis
docker exec -it avalanz-redis redis-cli -a Avalanz2026!

# Ver logs de todos los servicios
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f
```

---

## Paneles de administración (solo desarrollo)

| Panel | URL | Credenciales |
|---|---|---|
| RabbitMQ | http://localhost:15672 | avalanz / Avalanz2026! |
| MinIO Console | http://localhost:9001 | minioadmin / Avalanz2026! |
| Consul UI | http://localhost:8500 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / Avalanz2026! |

---

## Solución de problemas comunes

### `The command 'docker' could not be found in this WSL 2 distro`
Abrir Docker Desktop → Settings → Resources → WSL Integration → activar Ubuntu → Apply & Restart.

### `failed to resolve reference "consul:1.17"`
La imagen de Consul cambió de repositorio. Usar `hashicorp/consul:1.17` en `docker-compose.yml`.

### `the Dockerfile cannot be empty`
El `setup.sh` crea archivos vacíos como placeholders. Verificar que todos los Dockerfiles tienen contenido con:
```bash
for service in auth-service admin-service upload-service notify-service websocket-service email-service; do
    echo "=== $service ===" && wc -l backend/$service/Dockerfile
done
```

### `COPY ../shared /app/shared: not found`
Docker no puede acceder a rutas fuera del contexto de build. El contexto debe ser `../../backend` y el Dockerfile debe usar `COPY shared/ /app/shared`.

### `database "avalanz_user" does not exist`
El healthcheck de PostgreSQL usa la base de datos incorrecta. Verificar que el healthcheck sea:
```yaml
test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d postgres"]
```

### `host not found in upstream "frontend"`
El frontend aún no está levantado. Comentar el bloque `location /` en `infrastructure/nginx/conf.d/intranet.conf` hasta que el frontend esté disponible.

### `prometheus.yml is a directory`
El archivo `prometheus.yml` se creó como carpeta. Eliminarlo y renombrar el archivo correcto:
```bash
sudo rm -rf infrastructure/prometheus/prometheus.yml
mv infrastructure/prometheus/rometheus.yml infrastructure/prometheus/prometheus.yml
```

### `ModuleNotFoundError: No module named 'app.database'`
El archivo `database.py` no existe en el servicio. Crearlo manualmente copiando el contenido del `auth-service/app/database.py` y ajustando el import de `config`.

### `sqlalchemy.exc.ArgumentError: Type annotation for ... can't be correctly interpreted`
SQLAlchemy 2.0 no acepta anotaciones de tipo simples en mixins. Las columnas en `shared/models/base.py` deben declararse sin anotaciones de tipo usando `Column()` directamente.