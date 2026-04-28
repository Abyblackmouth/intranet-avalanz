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

## Servidor provisional — 10.12.0.51

### Conectar al servidor

```bash
ssh abcovarrubias@10.12.0.51
```

### Levantar el stack completo

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build -d
```

### Ver estado de servicios

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
pm2 status
```

### Rebuild de un servicio específico

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build --force-recreate admin-service -d
```

### Rebuild del frontend

```bash
cd ~/intranet-avalanz/frontend
npm run build && pm2 restart intranet-frontend
```

### Variables de entorno críticas en el servidor provisional

El archivo `frontend/.env.local` no está en el repo — se crea manualmente:

```bash
cat > ~/intranet-avalanz/frontend/.env.local << 'ENVEOF'
NEXT_PUBLIC_API_URL=http://10.12.0.51
NEXT_PUBLIC_WS_URL=ws://10.12.0.51/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://10.12.0.51:3002
ENVEOF
```

El `admin-service/.env` debe tener:
```
SCAFFOLD_SERVER_URL=http://10.12.0.250:3002
```
La IP `10.12.0.250` es la IP del host Docker — los contenedores la usan para salir al servidor.

### Paneles en el servidor provisional

| Panel | URL | Credenciales |
|---|---|---|
| Frontend | http://10.12.0.51:3000 | admin@avalanz.com / Admin@2026! |
| RabbitMQ | http://10.12.0.51:15672 | avalanz / Avalanz2026! |
| MinIO Console | http://10.12.0.51:9001 | minioadmin / Avalanz2026! |
| Prometheus | http://10.12.0.51:9090 | — |
| Grafana | http://10.12.0.51:3001 | admin / Avalanz2026! |
| Mailpit | http://10.12.0.51:8025 | — |
| Scaffold-server | http://10.12.0.51:3002/health | — |

---

## Configuración del Frontend con PM2 (servidor provisional y producción)

### Instalar Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Build y lanzar con PM2

```bash
sudo npm install -g pm2
cd ~/intranet-avalanz/frontend
npm install
npm run build
pm2 start npm --name "intranet-frontend" -- start -- -p 3000
pm2 save
pm2 startup
# Ejecutar el comando que genera pm2 startup para activar arranque automático
```

### Scaffold-server con PM2

```bash
pm2 start ~/intranet-avalanz/scripts/scaffold-server.js --name "scaffold-server"
pm2 save
```

### Configurar git en el servidor para auto-commit del scaffold

```bash
git -C ~/intranet-avalanz config user.email "abraham_covarrubias@avalanz.com"
git -C ~/intranet-avalanz config user.name "Abraham Covarrubias"
ssh-keygen -t ed25519 -C "abraham_covarrubias@avalanz.com" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# Agregar clave pública en GitHub Settings > SSH Keys
git -C ~/intranet-avalanz remote set-url origin git@github.com:Abyblackmouth/intranet-avalanz.git
ssh -T git@github.com  # verificar
```

### Comandos PM2 frecuentes

```bash
pm2 status
pm2 restart intranet-frontend
pm2 restart scaffold-server
pm2 logs intranet-frontend --lines 20
pm2 logs scaffold-server --lines 20
```

---

## Configuración inicial en servidor nuevo (primera vez)

Los `.env` no están en el repo — crearlos manualmente. Ver `despliegue-local-a-pruebas.md` para los valores completos.

### Crear BDs manualmente

```bash
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_auth;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_admin;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_notify;"
```

### Correr migraciones de Alembic

```bash
pip3 install alembic asyncpg psycopg2-binary --break-system-packages
export PATH=$PATH:/home/$USER/.local/bin
export PYTHONPATH=/home/$USER/intranet-avalanz/backend
export DB_HOST=$(docker inspect avalanz-postgres | grep '"IPAddress"' | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
export DB_PORT=5432 DB_USER=avalanz_user DB_PASSWORD=Avalanz2026!

export DB_NAME=avalanz_auth
cd ~/intranet-avalanz/backend/auth-service && alembic upgrade head

export DB_NAME=avalanz_admin
cd ~/intranet-avalanz/backend/admin-service && alembic upgrade head
```

Notify-service no tiene migraciones — crear tabla manualmente:

```bash
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_notify -c "
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL, company_id UUID, module_slug VARCHAR(100),
    type VARCHAR(100) NOT NULL, title VARCHAR(255) NOT NULL, body TEXT NOT NULL,
    data JSONB, is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_company_id ON notifications(company_id);"
```

### Ejecutar el seeder

```bash
pip3 install asyncpg passlib bcrypt --break-system-packages -q
cd ~/intranet-avalanz/infrastructure/docker
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

## Verificar que todo está corriendo

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

Contenedores esperados (19 total):

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
# Health checks desarrollo local (requiere Host header)
curl -s -H "Host: intranet.avalanz.com" http://localhost/health/auth
curl -s -H "Host: intranet.avalanz.com" http://localhost/health/admin

# Health checks servidor provisional (sin Host header)
curl -s http://10.12.0.51/health/auth
curl -s http://10.12.0.51/health/admin
```

---

## Paneles de administración — Desarrollo local

| Panel | URL | Credenciales |
|---|---|---|
| RabbitMQ | http://localhost:15672 | avalanz / Avalanz2026! |
| MinIO Console | http://localhost:9001 | minioadmin / Avalanz2026! |
| Consul UI | http://localhost:8500 | — |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3001 | admin / Avalanz2026! |
| Mailpit | http://localhost:8025 | — |

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

# Desbloquear super admin
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_auth \
  -c "UPDATE users SET is_locked=false, failed_attempts=0, locked_at=NULL, lock_type=NULL WHERE email='admin@avalanz.com';"

# Verificar integridad de backups manualmente
docker exec avalanz-cron /scripts/verify_backups.sh
```

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

### Variable de entorno no llega al contenedor después de `docker compose restart`
`restart` no recarga variables del `.env`. Usar `--force-recreate`:
```bash
docker compose up --force-recreate admin-service -d
```

### El frontend no carga — `Could not find a production build`
El scaffold-server reinició PM2 mientras el build estaba corriendo. Solución:
```bash
cd ~/intranet-avalanz/frontend
npm run build && pm2 restart intranet-frontend
```