# Guía de Despliegue — Local a Servidor Provisional

Ubicación: `docs/architecture/`

Esta guía documenta el proceso completo para desplegar Intranet Avalanz desde el entorno de desarrollo local (WSL2) a un servidor provisional Linux (Ubuntu 24.04). Incluye todos los problemas encontrados en el primer despliegue y cómo evitarlos.

---

## Contexto

El proyecto maneja tres ambientes:

| Ambiente | Descripción | Servidor |
|---|---|---|
| Desarrollo | WSL2 local del desarrollador | Laptop Abraham |
| Provisional (pruebas) | VM Ubuntu 24.04 | 10.12.0.51 |
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

### 3. Instalar dependencias para migraciones y seeder

```bash
sudo apt install -y python3-pip
pip3 install alembic asyncpg psycopg2-binary passlib bcrypt --break-system-packages
export PATH=$PATH:/home/$USER/.local/bin
```

Para que el PATH persista entre sesiones:
```bash
echo 'export PATH=$PATH:/home/$USER/.local/bin' >> ~/.bashrc
source ~/.bashrc
```

---

## Paso 1 — Clonar el repositorio

```bash
cd ~
git clone https://github.com/Abyblackmouth/intranet-avalanz.git
cd intranet-avalanz
```

---

## Paso 2 — Crear los archivos .env

Los `.env` están en `.gitignore` por seguridad — hay que crearlos manualmente en cada servidor. Genera primero el JWT key que debe ser compartido por todos los servicios:

```bash
JWT_KEY=$(openssl rand -hex 32)
echo "JWT Key generado: $JWT_KEY"
```

Guarda ese valor. Luego crea cada `.env`:

### auth-service
```bash
cat > ~/intranet-avalanz/backend/auth-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=auth-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_auth
DB_USER=avalanz_user
DB_PASSWORD=Avalanz2026!
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=Avalanz2026!
REDIS_DB=0
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
RABBITMQ_VHOST=/
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
JWT_INACTIVITY_EXPIRE_MINUTES=30
JWT_ABSOLUTE_EXPIRE_HOURS=8
JWT_2FA_TEMP_EXPIRE_MINUTES=15
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]
TOTP_ISSUER=Avalanz
TOTP_DIGITS=6
TOTP_INTERVAL=30
MAX_ACTIVE_SESSIONS=3
TEMP_PASSWORD_EXPIRE_HOURS=24
PASSWORD_RESET_EXPIRE_MINUTES=30
PASSWORD_RESET_BASE_URL=http://IP_SERVIDOR:3000/reset-password
CONSUL_HOST=consul
CONSUL_PORT=8500
LOG_LEVEL=INFO
LOG_FORMAT=json
FERNET_KEY=Fgvf8CXWgcBCc2cKTWe1UbPZoy9rf5FOoKR6aDlCf4s=
EOF
```

### admin-service
```bash
cat > ~/intranet-avalanz/backend/admin-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=admin-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_admin
DB_USER=avalanz_user
DB_PASSWORD=Avalanz2026!
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=Avalanz2026!
REDIS_DB=0
RABBITMQ_HOST=rabbitmq
RABBITMQ_PORT=5672
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
RABBITMQ_VHOST=/
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=30
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7
JWT_INACTIVITY_EXPIRE_MINUTES=30
JWT_ABSOLUTE_EXPIRE_HOURS=8
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
TEMP_PASSWORD_LENGTH=12
TEMP_PASSWORD_EXPIRE_HOURS=24
CONSUL_HOST=consul
CONSUL_PORT=8500
LOG_LEVEL=INFO
LOG_FORMAT=json
EOF
```

### upload-service
```bash
cat > ~/intranet-avalanz/backend/upload-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=upload-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
STORAGE_ENDPOINT=http://minio:9000
STORAGE_ACCESS_KEY=minioadmin
STORAGE_SECRET_KEY=Avalanz2026!
STORAGE_USE_SSL=False
BUCKET_IMAGES=avalanz-images
BUCKET_DOCUMENTS=avalanz-documents
BUCKET_DIRDOC=dirdoc
MAX_FILE_SIZE_MB=50
SIGNED_URL_EXPIRATION=900
SIGNED_URL_HOST=http://IP_SERVIDOR:9000
LOG_LEVEL=INFO
LOG_FORMAT=json
EOF
```

### notify-service
```bash
cat > ~/intranet-avalanz/backend/notify-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=notify-service
SERVICE_VERSION=1.0.0
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avalanz_notify
DB_USER=avalanz_user
DB_PASSWORD=Avalanz2026!
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
DEFAULT_PAGE_SIZE=20
MAX_PAGE_SIZE=100
LOG_LEVEL=INFO
LOG_FORMAT=json
EOF
```

### websocket-service
```bash
cat > ~/intranet-avalanz/backend/websocket-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=websocket-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
WS_HEARTBEAT_INTERVAL=30
WS_MAX_CONNECTIONS_PER_USER=5
LOG_LEVEL=INFO
LOG_FORMAT=json
EOF
```

### email-service
```bash
cat > ~/intranet-avalanz/backend/email-service/.env << EOF
ENV=development
DEBUG=True
SERVICE_NAME=email-service
SERVICE_VERSION=1.0.0
JWT_SECRET_KEY=$JWT_KEY
JWT_ALGORITHM=HS256
CORS_ORIGINS=["http://IP_SERVIDOR:3000"]
CORS_ALLOW_CREDENTIALS=True
CORS_ALLOW_METHODS=["*"]
CORS_ALLOW_HEADERS=["*"]
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW_SECONDS=60
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_USE_TLS=False
SMTP_USE_SSL=False
EMAIL_FROM_NAME=Avalanz
EMAIL_FROM_ADDRESS=noreply@avalanz.com
FRONTEND_URL=http://IP_SERVIDOR:3000
LOG_LEVEL=INFO
LOG_FORMAT=json
EOF
```

### infrastructure/docker/.env
```bash
cat > ~/intranet-avalanz/infrastructure/docker/.env << EOF
POSTGRES_USER=avalanz_user
POSTGRES_PASSWORD=Avalanz2026!
REDIS_PASSWORD=Avalanz2026!
RABBITMQ_USER=avalanz
RABBITMQ_PASSWORD=Avalanz2026!
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=Avalanz2026!
GRAFANA_USER=admin
GRAFANA_PASSWORD=Avalanz2026!
EOF
```

> **Nota:** Reemplaza `IP_SERVIDOR` por la IP real del servidor en todos los archivos. Para el servidor provisional es `10.12.0.51`.

---

## Paso 3 — Levantar el stack

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose up --build -d
```

Verifica que todos los contenedores levantaron:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## Paso 4 — Crear las bases de datos

El `init-db.sql` solo se ejecuta automáticamente si el volumen de PostgreSQL es nuevo. Si ya existe el volumen hay que crear las BDs manualmente:

```bash
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_auth;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_admin;"
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_notify;"
```

Verifica que se crearon:
```bash
docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "\l"
```

---

## Paso 5 — Correr las migraciones de Alembic

Las migraciones se corren desde el servidor, no desde dentro del contenedor. Hay que pasar las variables de entorno explícitamente:

```bash
export PATH=$PATH:/home/$USER/.local/bin
export PYTHONPATH=/home/$USER/intranet-avalanz/backend

export DB_HOST=$(docker inspect avalanz-postgres | grep '"IPAddress"' | tail -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+')
export DB_PORT=5432
export DB_USER=avalanz_user
export DB_PASSWORD=Avalanz2026!

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

## Paso 6 — Reiniciar servicios que fallan por BD

Después de crear las BDs y correr las migraciones, los servicios que fallaron al arrancar deben reiniciarse:

```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose restart admin-service notify-service
docker compose up -d
```

---

## Paso 7 — Ejecutar el seeder

```bash
pip3 install asyncpg passlib bcrypt --break-system-packages -q
cd ~/intranet-avalanz/infrastructure/docker
DB_PASSWORD=Avalanz2026! python3 seeder.py
```

Resultado esperado: 75 empresas creadas, super admin `admin@avalanz.com` con contraseña `Admin@2026!`.

---

## Paso 8 — Verificar el sistema

```bash
# Health checks
curl -s -H "Host: intranet.avalanz.com" http://localhost/health/auth
curl -s -H "Host: intranet.avalanz.com" http://localhost/health/admin

# Login
curl -s -X POST http://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "Host: intranet.avalanz.com" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' | python3 -m json.tool
```

Respuesta esperada del login: `"success": true` con `access_token` y `refresh_token`.

---

## Paneles de administración

| Panel | URL | Credenciales |
|---|---|---|
| Prometheus | http://IP_SERVIDOR:9090 | — |
| Grafana | http://IP_SERVIDOR:3001 | admin / Avalanz2026! |
| RabbitMQ | http://IP_SERVIDOR:15672 | avalanz / Avalanz2026! |
| MinIO | http://IP_SERVIDOR:9001 | minioadmin / Avalanz2026! |
| Mailpit | http://IP_SERVIDOR:8025 | — |

---

## Hallazgos del primer despliegue y mitigaciones

### 1. Los .env no están en el repo — hay que crearlos manualmente en cada servidor

**Problema:** Los `.env` están en `.gitignore` por seguridad. En el primer despliegue hay que crearlos a mano en cada servidor, lo cual es lento y propenso a errores.

**Mitigación futura:** Crear un script `setup-env.sh` en el repo que tome la IP del servidor como argumento y genere todos los `.env` automáticamente con los valores correctos. El script no incluiría contraseñas — solo la estructura.

---

### 2. Las migraciones de Alembic no corren desde dentro del contenedor

**Problema:** Al intentar correr `alembic upgrade head` dentro del contenedor el comando falla porque el contenedor está en crash loop (no puede conectarse a la BD que aún no tiene las tablas). Es un problema circular.

**Mitigación futura:** Agregar un script de entrypoint en cada microservicio que espere a que la BD esté disponible y corra las migraciones automáticamente al arrancar el contenedor. Ejemplo:
```bash
# entrypoint.sh de cada servicio
wait_for_db() {
  until pg_isready -h $DB_HOST -p $DB_PORT -U $DB_USER; do sleep 1; done
}
wait_for_db
alembic upgrade head
uvicorn app.main:app ...
```

---

### 3. El notify-service no tiene migraciones de Alembic

**Problema:** El notify-service no tiene carpeta `migrations` — su tabla `notifications` nunca se creó con Alembic. Hay que crearla manualmente con SQL.

**Mitigación futura:** Crear las migraciones de Alembic para el notify-service igual que los demás servicios, para que el proceso de despliegue sea homogéneo.

---

### 4. passlib incompatible con bcrypt 5.x

**Problema:** El `requirements.txt` del auth-service tenía `bcrypt==4.0.1` duplicado y no tenía `passlib`. Al construir la imagen en el servidor, pip instaló `bcrypt 5.0.0` como dependencia de `python-jose` y `passlib 1.7.4` como dependencia transitiva. La combinación `passlib 1.7.4` + `bcrypt 5.x` es incompatible y produce `ValueError: password cannot be longer than 72 bytes` al hacer login.

**Solución aplicada:** Agregar `passlib[bcrypt]==1.7.4` y fijar `bcrypt==4.0.1` explícitamente en `requirements.txt` para que pip no instale versiones más nuevas.

**Mitigación futura:** Fijar todas las versiones de dependencias transitivas críticas en `requirements.txt`. Correr `pip freeze` en el entorno de desarrollo y usar ese output como base del requirements.

---

### 5. La migración d47aff39e7ad falla en BDs nuevas

**Problema:** La migración `d47aff39e7ad_add_description_to_submodules.py` intenta borrar el constraint `users_matricula_key` que solo existe si se aplicó una versión anterior de la BD. En una BD completamente nueva el constraint no existe y la migración falla.

**Solución aplicada:** Hacer el DROP CONSTRAINT condicional usando un bloque `DO $$ IF EXISTS $$`.

**Mitigación futura:** Siempre usar `IF EXISTS` en operaciones DROP dentro de migraciones de Alembic. Nunca asumir que un objeto de BD existe en una migración.

---

### 6. El init-db.sql no se ejecuta si el volumen de PostgreSQL ya existe

**Problema:** Docker solo ejecuta los scripts de `docker-entrypoint-initdb.d/` cuando el volumen es completamente nuevo. Si el volumen ya existe (de un deploy anterior) las BDs no se crean automáticamente.

**Mitigación futura:** Agregar un script de inicialización que verifique si las BDs existen y las cree si no:
```bash
docker exec avalanz-postgres psql -U avalanz_user -d postgres -tc \
  "SELECT 1 FROM pg_database WHERE datname='avalanz_auth'" | grep -q 1 || \
  docker exec avalanz-postgres psql -U avalanz_user -d postgres -c "CREATE DATABASE avalanz_auth;"
```

---

### 7. El `alembic.ini` del repo tiene URL placeholder

**Problema:** El `alembic.ini` commiteado tiene `sqlalchemy.url = driver://user:pass@localhost/dbname`. Al correr las migraciones desde el servidor, alembic intenta conectarse a `localhost:5432` que no existe — PostgreSQL está en Docker.

**Solución aplicada:** Pasar las variables de BD como variables de entorno (`DB_HOST`, `DB_NAME`, etc.) que el `env.py` de cada servicio lee con `os.getenv()`.

**Mitigación futura:** El `alembic.ini` en el repo puede mantener el placeholder — el `env.py` siempre debe leer las variables de entorno y no depender del valor en `alembic.ini`.

---

## Lista de verificación pre-despliegue

Antes de desplegar a un servidor nuevo revisar esta lista:

- [ ] Docker y docker compose instalados
- [ ] Python 3, pip, alembic, psycopg2-binary instalados
- [ ] PATH actualizado con `/home/$USER/.local/bin`
- [ ] Todos los `.env` creados con la IP del servidor correcta
- [ ] `infrastructure/docker/.env` creado
- [ ] Stack levantado y todos los contenedores `Up`
- [ ] BDs `avalanz_auth`, `avalanz_admin`, `avalanz_notify` creadas
- [ ] Migraciones de auth-service corridas exitosamente
- [ ] Migraciones de admin-service corridas exitosamente
- [ ] Tabla `notifications` creada en `avalanz_notify`
- [ ] Servicios admin y notify reiniciados después de migraciones
- [ ] Seeder ejecutado con resultado exitoso
- [ ] Login funciona desde red externa al servidor
