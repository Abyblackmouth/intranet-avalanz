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
```

Contenedores esperados:

| Contenedor | Descripción |
|---|---|
| avalanz-nginx | API Gateway |
| avalanz-auth | Auth Service |
| avalanz-admin | Admin Service |
| avalanz-upload | Upload Service |
| avalanz-notify | Notify Service |
| avalanz-websocket | WebSocket Service |
| avalanz-email | Email Service |
| avalanz-postgres | Base de datos PostgreSQL |
| avalanz-redis | Caché Redis |
| avalanz-rabbitmq | Message Broker |
| avalanz-minio | Almacenamiento S3 |
| avalanz-consul | Service Registry |
| avalanz-prometheus | Métricas |
| avalanz-grafana | Dashboards |
| avalanz-cron | Tareas programadas de limpieza |
| avalanz-postgres-exporter | Exporter de métricas PostgreSQL |
| avalanz-redis-exporter | Exporter de métricas Redis |
| avalanz-nginx-exporter | Exporter de métricas Nginx |
| avalanz-mailpit | SMTP local para desarrollo |

```bash
# Verificar que los exporters están activos
docker ps --format "table {{.Names}}\t{{.Status}}" | grep exporter
```

```bash
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

# Ejecutar limpieza manual del cron
docker exec avalanz-cron /scripts/cleanup.sh

# Ver logs del cron
docker exec avalanz-cron cat /var/log/cron/cleanup.log

# Recargar configuración de Prometheus sin reiniciar
docker exec avalanz-prometheus kill -HUP 1

# Recargar configuración de Nginx sin reiniciar
docker exec avalanz-nginx nginx -s reload

# Verificar métricas del nginx-exporter
docker exec avalanz-prometheus wget -qO- 'http://nginx-exporter:9113/metrics' | grep nginx_up

# Recrear Grafana limpio (borra dashboards guardados en volumen)
docker rm -f avalanz-grafana
docker volume rm docker_grafana-data
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d grafana
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
| Mailpit | http://localhost:8025 | — |

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

### `passlib` incompatible con `bcrypt` 4.x
`passlib 1.7.4` no es compatible con `bcrypt 4.x`. El `auth-service` usa `bcrypt` directamente sin `passlib`. Si ves el error `ValueError: password cannot be longer than 72 bytes` significa que hay una versión incorrecta instalada. Verifica `backend/auth-service/requirements.txt` — debe tener `bcrypt==4.0.1` sin `passlib[bcrypt]`.

### El super admin no puede iniciar sesion — 2FA no configurado
En desarrollo el sistema detecta la IP de Docker como red externa y exige 2FA. Soluciones:
1. Agregar el rango `172.16.0.0/12` a `CORPORATE_IP_RANGES` en `backend/auth-service/.env` en formato JSON:
```bash
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]
```
2. Marcar al super admin con `is_2fa_configured = true` directamente en la BD:
```bash
docker exec -it avalanz-postgres psql -U avalanz_user -d avalanz_auth -c "UPDATE users SET is_2fa_configured = true WHERE email = 'admin@avalanz.com';"
```

### `CORPORATE_IP_RANGES` rompe el auth-service al arrancar
Pydantic requiere formato JSON con corchetes. Formato incorrecto:
```bash
# Incorrecto
CORPORATE_IP_RANGES=192.168.0.0/16,10.0.0.0/8
# Correcto
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12"]
```

### Tailwind no carga estilos — `Can't resolve 'tailwindcss'`
Turbopack busca `tailwindcss` en la raíz del proyecto. Soluciones aplicadas:
1. `globals.css` debe usar `@import "tailwindcss"` (sintaxis Tailwind v4)
2. Crear `package.json` en la raíz con workspaces:
```bash
cat > ~/code/avalanz/intranet-avalanz/package.json << 'EOF'
{
  "name": "intranet-avalanz-root",
  "private": true,
  "workspaces": ["frontend"]
}
EOF
```
3. Limpiar caché: `rm -rf frontend/.next && npm run dev`

### Token persistido redirige al dashboard sin sesión válida
Zustand persiste `isAuthenticated` en localStorage. Al reiniciar el servidor el token expira pero el store sigue activo. Solución: limpiar desde consola del navegador:
```javascript
localStorage.clear();
document.cookie.split(";").forEach(c => document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"));
location.reload();
```

### El contenedor `avalanz-cron` hace crash loop con `setpgid: Operation not permitted`
`dcron` no funciona correctamente en WSL2. El contenedor usa un loop con `sleep 60` en lugar de `dcron`. Si el contenedor sigue en crash loop, reconstruirlo:
```bash
cd infrastructure/docker
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build --force-recreate cron -d
```

### nginx-exporter muestra `nginx_up 0`
El endpoint `/nginx_status` no está accesible desde el exporter. Verificar que el bloque esté en `intranet.conf` y que incluya la red Docker en el allow:
```nginx
location /nginx_status {
    stub_status on;
    allow 127.0.0.1;
    allow 172.18.0.0/16;
    allow 172.16.0.0/12;
    allow 192.168.0.0/16;
    allow 10.0.0.0/8;
    deny all;
}
```
Después de editar el archivo recargar Nginx: `docker exec avalanz-nginx nginx -s reload`

### Grafana muestra "Datasource not found" en el dashboard
El dashboard JSON usa el UID `PBFA97CFB590B2093` para referenciar Prometheus. Si el datasource tiene un UID diferente (por ejemplo al recrear el volumen de Grafana), obtener el UID real y actualizar el JSON:
```bash
docker exec avalanz-grafana wget -qO- 'http://admin:Avalanz2026!@localhost:3000/api/datasources' | grep -o '"uid":"[^"]*"'
```
Reemplazar todas las ocurrencias del UID en `avalanz-services-dashboard.json` y reiniciar Grafana.

### Prometheus sigue usando targets viejos tras actualizar prometheus.yml
Recargar la configuración sin reiniciar el contenedor:
```bash
docker exec avalanz-prometheus kill -HUP 1
```
Verificar en `http://localhost:9090/targets` que los nuevos targets aparezcan.