# Guía de Despliegue — Local a Servidor Provisional

Ubicación: `docs/architecture/`

Esta guía documenta el proceso completo para desplegar Intranet Avalanz desde el entorno de desarrollo local (WSL2) a un servidor provisional Linux (Ubuntu 24.04). Incluye todos los problemas encontrados en el primer despliegue y cómo evitarlos.

---

## Contexto

El proyecto maneja tres ambientes:

| Ambiente | Descripción | Servidor |
|---|---|---|
| Desarrollo | WSL2 local del desarrollador | Laptop Abraham |
| Provisional (pruebas / producción) | VM Ubuntu 24.04 | 10.12.0.51 |
| Producción (definitivo) | Servidor físico on-premise | Pendiente |

Esta guía cubre el paso de **desarrollo → provisional**.

---

## Prerequisitos en el servidor

### 1. Ubuntu Server 24.04 LTS con OpenSSH activo

Verificar acceso SSH desde la laptop:
```bash
ssh abcovarrubias@10.12.0.51
```

### 2. Instalar Docker

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### 3. Instalar Node.js y PM2 (para el frontend y scaffold-server)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
pm2 startup
```

### 4. Instalar dependencias para migraciones y seeder

```bash
sudo apt install -y python3-pip
pip3 install alembic asyncpg psycopg2-binary passlib bcrypt --break-system-packages
export PATH=$PATH:/home/$USER/.local/bin
echo 'export PATH=$PATH:/home/$USER/.local/bin' >> ~/.bashrc
source ~/.bashrc
```

### 5. Instalar fail2ban

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
```

---

## Paso 1 — Clonar el repositorio

```bash
cd ~
git clone git@github.com:Abyblackmouth/intranet-avalanz.git
cd intranet-avalanz
```

---

## Paso 2 — Crear los archivos .env

Los `.env` están en `.gitignore` por seguridad — hay que crearlos manualmente en cada servidor.

> **Importante para producción:** Generar nuevas claves seguras en lugar de usar los valores de ejemplo.
> ```bash
> JWT_KEY=$(openssl rand -hex 32)
> FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
> ```

### auth-service — `backend/auth-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=auth-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_auth
DB_USER=avalanz_user
DB_PASSWORD=<contraseña_segura>
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<contraseña_segura>
REDIS_DB=0
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
RABBITMQ_VHOST=/
JWT_SECRET_KEY=<openssl rand -hex 32>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
JWT_INACTIVITY_EXPIRE_MINUTES=30
JWT_ABSOLUTE_EXPIRE_HOURS=8
JWT_2FA_TEMP_EXPIRE_MINUTES=15
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32","200.23.36.0/24"]
TOTP_ISSUER=Avalanz
TOTP_DIGITS=6
TOTP_INTERVAL=30
MAX_ACTIVE_SESSIONS=3
TEMP_PASSWORD_EXPIRE_HOURS=24
PASSWORD_RESET_EXPIRE_MINUTES=30
PASSWORD_RESET_BASE_URL=https://intranet.avalanz.com/reset-password
CONSUL_HOST=consul
CONSUL_PORT=8500
LOG_LEVEL=INFO
LOG_FORMAT=json
FERNET_KEY=<Fernet.generate_key()>
```

### admin-service — `backend/admin-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=admin-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_admin
DB_USER=avalanz_user
DB_PASSWORD=<contraseña_segura>
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<contraseña_segura>
REDIS_DB=0
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
RABBITMQ_VHOST=/
JWT_SECRET_KEY=<misma_clave_que_auth>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
JWT_INACTIVITY_EXPIRE_MINUTES=30
JWT_ABSOLUTE_EXPIRE_HOURS=8
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32","200.23.36.0/24"]
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
TEMP_PASSWORD_LENGTH=12
TEMP_PASSWORD_EXPIRE_HOURS=24
CONSUL_HOST=consul
CONSUL_PORT=8500
LOG_LEVEL=INFO
LOG_FORMAT=json
FRONTEND_URL=https://intranet.avalanz.com
SCAFFOLD_SERVER_URL=http://10.12.0.250:3002
```

### upload-service — `backend/upload-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=upload-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=<misma_clave_que_auth>
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=<minio_access_key>
STORAGE_SECRET_KEY=<minio_secret_key>
STORAGE_USE_SSL=False
BUCKET_IMAGES=avalanz-images
BUCKET_DOCUMENTS=avalanz-documents
BUCKET_DIRDOC=dirdoc
MAX_FILE_SIZE_MB=50
SIGNED_URL_EXPIRATION=900
SIGNED_URL_HOST=http://IP_SERVIDOR:9000
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### notify-service — `backend/notify-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=notify-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_notify
DB_USER=avalanz_user
DB_PASSWORD=<contraseña_segura>
JWT_SECRET_KEY=<misma_clave_que_auth>
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### websocket-service — `backend/websocket-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=websocket-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=<misma_clave_que_auth>
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
WS_HEARTBEAT_INTERVAL=30
WS_MAX_CONNECTIONS_PER_USER=5
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### email-service — `backend/email-service/.env`
```env
ENV=production
DEBUG=False
SERVICE_NAME=email-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=<misma_clave_que_auth>
JWT_ALGORITHM=HS256
CORS_ORIGINS=["https://intranet.avalanz.com"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
SMTP_HOST=<host_smtp_corporativo>
SMTP_PORT=587
SMTP_USER=<correo_corporativo>
SMTP_PASSWORD=<contraseña_smtp>
SMTP_USE_TLS=True
SMTP_USE_SSL=False
EMAIL_FROM_NAME=Avalanz
EMAIL_FROM_ADDRESS=no-reply@avalanz.com
FRONTEND_URL=https://intranet.avalanz.com
LOG_LEVEL=INFO
LOG_FORMAT=json
```

### infrastructure/docker/.env
```env
POSTGRES_USER=avalanz_user
POSTGRES_PASSWORD=<contraseña_segura>
REDIS_PASSWORD=<contraseña_segura>
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
MINIO_ACCESS_KEY=<access_key_seguro>
MINIO_SECRET_KEY=<secret_key_seguro>
GRAFANA_USER=admin
GRAFANA_PASSWORD=<contraseña_segura>
```

---

## Paso 3 — Configurar certificados SSL

Colocar los certificados en la carpeta del proyecto:
```bash
mkdir -p ~/intranet-avalanz/infrastructure/nginx/ssl
# Copiar los archivos desde donde los tengas
cp /ruta/al/certificado.pem ~/intranet-avalanz/infrastructure/nginx/ssl/intranet.avalanz.com.pem
cp /ruta/a/la/llave.key ~/intranet-avalanz/infrastructure/nginx/ssl/intranet.avalanz.com.key
chmod 600 ~/intranet-avalanz/infrastructure/nginx/ssl/intranet.avalanz.com.key
chmod 644 ~/intranet-avalanz/infrastructure/nginx/ssl/intranet.avalanz.com.pem
```

> **Nota:** La carpeta `nginx/ssl/` está en `.gitignore` — los certificados no se commitean al repo.

---

## Paso 4 — Levantar el stack

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build -d
```

Verifica que todos los contenedores levantaron:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## Paso 5 — Crear las bases de datos

El `init-db.sql` solo se ejecuta automáticamente si el volumen de PostgreSQL es nuevo. Si ya existe el volumen hay que crear las BDs manualmente:

```bash
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_auth;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_admin;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_notify;"
```

---

## Paso 6 — Correr las migraciones de Alembic

```bash
export PATH=$PATH:/home/$USER/.local/bin
export PYTHONPATH=/home/$USER/intranet-avalanz/backend
export DB_HOST=$(docker inspect avalanz-postgres | grep '"IPAddress"' | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
export DB_PORT=5432
export DB_USER=avalanz_user
export DB_PASSWORD=<contraseña_postgres>

export DB_NAME=avalanz_auth
cd ~/intranet-avalanz/backend/auth-service && alembic upgrade head

export DB_NAME=avalanz_admin
cd ~/intranet-avalanz/backend/admin-service && alembic upgrade head
```

El notify-service no tiene migraciones — su tabla se crea manualmente:
```bash
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_notify -c "
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    company_id UUID,
    module_slug VARCHAR(100),
    type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_company_id ON notifications(company_id);"
```

---

## Paso 7 — Reiniciar servicios

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose restart admin-service notify-service
docker compose up -d
```

---

## Paso 8 — Ejecutar el seeder

```bash
pip3 install asyncpg passlib bcrypt --break-system-packages -q
cd ~/intranet-avalanz/infrastructure/docker
DB_PASSWORD=<contraseña_postgres> python3 seeder.py
```

Resultado esperado: 75 empresas creadas, super admin `admin@avalanz.com` con contraseña `Admin@2026!`.

---

## Paso 9 — Instalar y levantar el frontend con PM2

```bash
cd ~/intranet-avalanz/frontend
npm install

# Crear .env.local
cat > .env.local << EOF
NEXT_PUBLIC_API_URL=https://intranet.avalanz.com
NEXT_PUBLIC_WS_URL=wss://intranet.avalanz.com/ws
NEXT_PUBLIC_SCAFFOLD_URL=https://intranet.avalanz.com:3002
EOF

npm run build
pm2 start npm --name "intranet-frontend" -- start -- -p 3000
pm2 save
```

---

## Paso 10 — Levantar el scaffold-server con PM2

```bash
cd ~/intranet-avalanz
npm install
pm2 start scripts/scaffold-server.js --name "scaffold-server"
pm2 save
```

---

## Paso 11 — Configurar fail2ban

```bash
sudo nano /etc/fail2ban/jail.local
```

Contenido:
```ini
[DEFAULT]
bantime  = 3600
findtime = 60
maxretry = 10

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/lib/docker/containers/*/*-json.log
maxretry = 10
findtime = 60
bantime  = 3600
```

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status nginx-limit-req
```

---

## Paso 12 — Verificar el sistema

```bash
# Health checks
curl -sk https://intranet.avalanz.com/health/auth
curl -sk https://intranet.avalanz.com/health/admin

# Estado PM2
pm2 status

# Estado Docker
docker ps --format "table {{.Names}}\t{{.Status}}"

# Estado fail2ban
sudo fail2ban-client status nginx-limit-req
```

---

## Checklist de producción — antes de go-live

- [ ] DEBUG=False en todos los servicios
- [ ] JWT_SECRET_KEY generada con `openssl rand -hex 32` (misma en todos los servicios)
- [ ] FERNET_KEY generada con `Fernet.generate_key()` (solo en auth-service)
- [ ] Contraseñas de PostgreSQL, Redis y MinIO cambiadas a valores seguros
- [ ] CORS_ORIGINS apuntando a `https://intranet.avalanz.com`
- [ ] FRONTEND_URL=`https://intranet.avalanz.com` en admin-service y email-service
- [ ] Certificados SSL en `infrastructure/nginx/ssl/`
- [ ] Puerto 443 abierto en el Fortinet con NAT hacia 10.12.0.51
- [ ] Puerto 5432 (PostgreSQL) cerrado al exterior en docker-compose.yml
- [ ] Puerto 9001 (MinIO consola) cerrado al exterior en docker-compose.yml
- [ ] Rotación de logs Docker configurada (50MB max, 5 archivos)
- [ ] fail2ban activo y jail nginx-limit-req funcionando
- [ ] UptimeRobot configurado con monitores y alertas por email
- [ ] SPF + DKIM configurados en tenant Office 365
- [ ] Frontend rebuildeado con las variables de producción
- [ ] Login funciona sobre HTTPS

---

## Paneles de administración

| Panel | URL | Notas |
|---|---|---|
| Frontend | https://intranet.avalanz.com | Credenciales en KeePass |
| Grafana | http://10.12.0.51:3001 | Credenciales en KeePass |
| RabbitMQ | http://10.12.0.51:15672 | Credenciales en KeePass |
| MinIO | http://10.12.0.51:9000 | Credenciales en KeePass — consola 9001 cerrada |
| Prometheus | http://10.12.0.51:9090 | Sin autenticación |
| Mailpit | http://10.12.0.51:8025 | Solo dev — no disponible en producción |
| UptimeRobot | https://uptimerobot.com | Credenciales en KeePass |

---

## Hallazgos del primer despliegue y mitigaciones

### 1. Los .env no están en el repo — hay que crearlos manualmente

**Mitigación futura:** Crear un script `setup-env.sh` que tome la IP y dominio como argumentos y genere todos los `.env` automáticamente con la estructura correcta.

### 2. Las migraciones de Alembic no corren desde dentro del contenedor

**Problema:** Los contenedores están en crash loop cuando las BDs no existen aún — circular.

**Mitigación futura:** Agregar entrypoint con `wait_for_db` + `alembic upgrade head` en cada microservicio.

### 3. El notify-service no tiene migraciones de Alembic

**Mitigación futura:** Crear migraciones Alembic para el notify-service igual que los demás servicios.

### 4. passlib incompatible con bcrypt 5.x

**Solución aplicada:** Fijar `passlib[bcrypt]==1.7.4` y `bcrypt==4.0.1` en `requirements.txt`.

### 5. La migración d47aff39e7ad falla en BDs nuevas

**Solución aplicada:** Usar `IF EXISTS` en operaciones DROP dentro de migraciones.

### 6. El init-db.sql no se ejecuta si el volumen de PostgreSQL ya existe

**Mitigación:** Crear las BDs manualmente si el volumen ya existe (ver Paso 5).

### 7. El alembic.ini del repo tiene URL placeholder

**Solución aplicada:** El `env.py` de cada servicio lee las variables de entorno con `os.getenv()`.

### 8. El scp desde WSL falla si se ejecuta desde dentro del servidor SSH

**Solución:** El `scp` siempre se ejecuta desde PowerShell en Windows local, no desde dentro del servidor.

### 9. Los certificados SSL deben montarse como volumen en el contenedor Nginx

**Solución aplicada:** Agregar `../nginx/ssl:/etc/nginx/ssl:ro` en los volúmenes del servicio nginx en docker-compose.yml y exponer el puerto 443.