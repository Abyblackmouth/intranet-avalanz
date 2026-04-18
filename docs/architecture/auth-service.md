# Auth Service — Guía de Referencia

Ubicación: `backend/auth-service/`

El `auth-service` es el servicio de autenticación centralizada de la plataforma Avalanz. Es el único servicio que emite tokens JWT y gestiona el ciclo de vida completo de las sesiones de usuario.

---

## Responsabilidades

- Autenticación de usuarios con usuario y contraseña
- 2FA condicional por ubicación de red (TOTP)
- Emisión y renovación de tokens JWT
- Gestión de sesiones activas e historial
- Recuperación de contraseña por email con tokens de un solo uso
- Bloqueo de cuenta por intentos fallidos (automático y manual)
- Primer login con contraseña temporal
- Endpoints internos para que otros servicios consulten y actualicen datos de autenticación

---

## Estructura

```
auth-service/
├── app/
│   ├── main.py               → Punto de entrada, middlewares, routers
│   ├── config.py             → Configuración del servicio (incluye FERNET_KEY)
│   ├── database.py           → Motor async, sesión de BD, init/close
│   ├── routes/
│   │   ├── auth.py           → Endpoints de autenticación y sesiones
│   │   ├── twofa.py          → Endpoints de configuración 2FA
│   │   └── internal.py       → Endpoints internos (sin auth) para otros servicios
│   ├── services/
│   │   ├── auth_service.py   → Lógica de negocio de autenticación
│   │   └── twofa_service.py  → Lógica de negocio TOTP
│   ├── models/
│   │   └── auth_models.py    → Modelos SQLAlchemy
│   └── middleware/
├── migrations/
│   └── versions/
│       └── e6c58da1bf69_add_lock_type_to_users.py  → Migración 1: campo lock_type
├── tests/
├── Dockerfile
├── requirements.txt
└── .env
```

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | FastAPI |
| Base de datos | PostgreSQL 15 (asyncpg) |
| ORM | SQLAlchemy 2.0 async |
| Migraciones | Alembic (con psycopg2-binary para migraciones) |
| JWT | python-jose |
| Hashing | bcrypt |
| Cifrado | cryptography Fernet (FERNET_KEY en .env) |
| TOTP | pyotp |
| QR | qrcode |
| HTTP cliente | httpx |

---

## Modelos de base de datos

### users
Tabla central de autenticación.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria — mismo UUID que en admin-service |
| email | String(255) | Email único, indexado |
| full_name | String(255) | Nombre completo |
| hashed_password | String(255) | Hash bcrypt de la contraseña |
| is_active | Boolean | Si la cuenta está activa |
| is_temp_password | Boolean | Si usa contraseña temporal |
| temp_password_expires_at | DateTime | Expiración de contraseña temporal |
| is_2fa_configured | Boolean | Si el 2FA está configurado y activo |
| failed_attempts | Integer | Intentos fallidos consecutivos |
| is_locked | Boolean | Si la cuenta está bloqueada |
| locked_at | DateTime | Fecha de bloqueo |
| lock_type | String(20) | Tipo de bloqueo: "manual" o "failed_attempts" |
| last_login_at | DateTime | Último login exitoso |
| last_login_ip | String(45) | IP del último login |

### Valores de lock_type

| Valor | Descripción |
|---|---|
| `manual` | Bloqueado por un administrador desde el panel |
| `failed_attempts` | Bloqueado automáticamente por intentos fallidos |
| `null` | No está bloqueado |

---

## Registro de routers en main.py

```python
app.include_router(auth_router, prefix="/api/v1")
app.include_router(twofa_router, prefix="/api/v1")
app.include_router(internal_router, prefix="/api/v1/auth")
```

El `internal_router` tiene prefix `/api/v1/auth` para que Nginx pueda enrutar las llamadas. Las llamadas entre servicios también usan la URL completa:

```python
# Correcto — admin-service llamando al auth-service
f"http://auth-service:8000/api/v1/auth/internal/users/{user_id}/reset-password"

# Incorrecto — sin prefix ni puerto
f"http://auth-service/internal/users/{user_id}/reset-password"
```

---

## Endpoints públicos — `/api/v1/auth`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | /login | No | Iniciar sesión |
| POST | /2fa/verify | No | Verificar código TOTP tras login |
| POST | /change-temp-password | No | Cambiar contraseña temporal |
| POST | /refresh | No | Renovar access token |
| POST | /password-reset/request | No | Solicitar recuperación de contraseña |
| GET | /password-reset/validate | No | Verificar si un token es válido sin consumirlo |
| POST | /password-reset/confirm | No | Confirmar nueva contraseña con token |
| POST | /logout | Si | Cerrar sesión actual |
| POST | /sessions/revoke | Si | Revocar una sesión específica |
| GET | /sessions | Si | Listar sesiones activas |
| GET | /me | Si | Obtener datos del usuario autenticado |

---

## Endpoints internos — `/api/v1/auth/internal`

Estos endpoints no requieren autenticación JWT. Son accesibles desde Nginx en `/api/v1/auth/internal/...` y desde otros servicios Docker en `http://auth-service:8000/api/v1/auth/internal/...`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | /internal/users | Crear credenciales de usuario al crear desde admin-service |
| GET | /internal/users/{user_id}/info | Obtener is_locked, is_2fa_configured, is_temp_password, last_login_at |
| POST | /internal/users/batch-info | Obtener datos de auth para múltiples usuarios |
| GET | /internal/users/{user_id}/sessions | Listar sesiones activas de un usuario (max 50) |
| GET | /internal/users/{user_id}/login-history | Historial de login de un usuario (max 50) |
| POST | /internal/users/{user_id}/lock | Bloquear o desbloquear cuenta de un usuario |
| POST | /internal/users/{user_id}/reset-password | Resetear contraseña — hashea la nueva y activa is_temp_password |

### POST /internal/users
Crea las credenciales en el auth-service cuando el admin-service crea un usuario nuevo.

```json
{
  "user_id": "uuid",
  "email": "usuario@empresa.com",
  "full_name": "Nombre Completo",
  "temp_password": "contraseña_temporal",
  "temp_password_expires_at": "2026-04-04T00:00:00+00:00"
}
```

### GET /internal/users/{user_id}/info
```json
{
  "user_id": "uuid",
  "is_locked": false,
  "is_2fa_configured": true,
  "is_temp_password": false,
  "last_login_at": "2026-04-02T02:46:00+00:00",
  "roles": []
}
```

### POST /internal/users/batch-info
Request:
```json
{ "user_ids": ["uuid1", "uuid2", "uuid3"] }
```
Response:
```json
{
  "uuid1": { "is_locked": false, "is_2fa_configured": true, "last_login_at": "..." },
  "uuid2": { "is_locked": true, "is_2fa_configured": false, "last_login_at": null }
}
```

### POST /internal/users/{user_id}/lock
Bloquea o desbloquea una cuenta. Asigna `lock_type = "manual"` al bloquear y `lock_type = null` al desbloquear.

Request:
```json
{ "lock": true, "reason": "Motivo del bloqueo" }
```
Response:
```json
{ "success": true, "is_locked": true }
```

### POST /internal/users/{user_id}/reset-password
Resetea la contraseña del usuario. Activa `is_temp_password = true` y resetea `failed_attempts = 0`.

Request:
```json
{ "new_password": "NuevaContrasena@123" }
```
Response:
```json
{ "success": true, "message": "Contrasena reseteada" }
```

---

## Mensajes de bloqueo en el login

| lock_type | Mensaje mostrado al usuario |
|---|---|
| `failed_attempts` | "Cuenta bloqueada por múltiples intentos fallidos, contacta al administrador" |
| `manual` | "Tu cuenta ha sido bloqueada, contacta al administrador" |

---

## Recuperación de contraseña y bloqueos

| Escenario | Comportamiento |
|---|---|
| Usuario no bloqueado | Envía correo con link de recuperación |
| Bloqueado por intentos fallidos | Envía correo — al confirmar nueva contraseña se desbloquea automáticamente |
| Bloqueado manualmente por admin | No envía correo — muestra "Tu cuenta tiene restricciones. Contacta al administrador." |

El token de recuperación se invalida con `is_used=True` inmediatamente después de usarse. El frontend verifica el token al cargar la página via `GET /password-reset/validate` antes de mostrar el formulario.

---

## Flujos de autenticación

### Flujo 1 — Primer login (contraseña temporal)

```
POST /api/v1/auth/login
        |
{ action: "change_password", user_id }
        |
Frontend verifica is_temp_password via GET /internal/users/{id}/info
Si is_temp_password=false → muestra "Link expirado"
        |
POST /api/v1/auth/change-temp-password
        |
{ action: "setup_2fa", access_token, refresh_token }
        |
GET /api/v1/2fa/setup         → QR + secret + backup_codes
        |
POST /api/v1/2fa/activate     → { code: "123456" }
        |
clearSession() → redirect /login
```

### Flujo 2 — Login desde red corporativa

```
POST /api/v1/auth/login
        |
IP detectada en rangos corporativos
        |
{ access_token, refresh_token, token_type: "bearer" }
```

### Flujo 3 — Login desde red externa (2FA requerido)

```
POST /api/v1/auth/login
        |
IP externa detectada
        |
{ action: "2fa_required", temp_token }   ← válido 15 minutos
        |
POST /api/v1/auth/2fa/verify
{ temp_token, code: "123456" }
        |
{ access_token, refresh_token, token_type: "bearer" }
```

### Flujo 4 — Creación de usuario desde admin-service

```
admin-service POST /api/v1/users/
        |
admin-service llama internamente a:
POST http://auth-service:8000/api/v1/auth/internal/users
        |
auth-service crea credenciales con contraseña temporal hasheada
        |
Usuario recibe correo con contraseña temporal via email-service
```

### Flujo 5 — Bloqueo manual desde admin-service

```
super_admin ejecuta bloqueo en el frontend
        |
admin-service guarda lock_reason en su BD
        |
admin-service llama internamente a:
POST http://auth-service:8000/api/v1/auth/internal/users/{user_id}/lock
        |
auth-service actualiza is_locked, locked_at y lock_type="manual"
        |
El usuario no puede iniciar sesión hasta ser desbloqueado
```

### Flujo 6 — Bloqueo automático por intentos fallidos

```
Usuario falla 3 intentos consecutivos (MAX_FAILED_ATTEMPTS)
        |
auth-service actualiza is_locked=true, lock_type="failed_attempts"
        |
auth-service llama a email-service → correo de cuenta bloqueada
        |
Usuario puede recuperar contraseña via /reset-password → al confirmar se desbloquea
```

### Flujo 7 — Recuperación de contraseña

```
Usuario va a /reset-password → ingresa su correo
        |
POST /api/v1/auth/password-reset/request
        |
Si lock_type == "manual" → responde { success: false } sin enviar correo
Si no bloqueado o lock_type == "failed_attempts" → genera token y envía correo
        |
Usuario recibe correo con link válido 30 minutos
        |
Frontend carga /reset-password?token=xxx
GET /api/v1/auth/password-reset/validate?token=xxx
Si inválido o expirado → muestra "Enlace expirado" sin mostrar formulario
        |
POST /api/v1/auth/password-reset/confirm { token, new_password }
token marcado is_used=True → no puede reutilizarse
is_locked=false, failed_attempts=0, lock_type=null, is_temp_password=false
        |
Modal de éxito con countdown → redirect /login
```

---

## Payload del access_token

```json
{
  "user_id": "uuid",
  "email": "usuario@avalanz.com",
  "full_name": "Nombre Completo",
  "roles": ["super_admin"],
  "modules": ["boveda", "legal"],
  "companies": ["empresa_1", "empresa_2"],
  "permissions": ["users:read", "users:write"],
  "session_started_at": "2026-04-01T10:00:00+00:00",
  "absolute_exp": "2026-04-01T18:00:00+00:00",
  "exp": 1743330000,
  "iat": 1743328200,
  "type": "access"
}
```

---

## Configuración (.env)

| Variable | Descripción | Valor por defecto |
|---|---|---|
| ENV | Entorno de ejecución | development |
| DEBUG | Modo debug (habilita /docs) | True |
| DB_NAME | Nombre de la base de datos | avalanz_auth |
| JWT_SECRET_KEY | Clave secreta JWT | — (obligatorio cambiar) |
| FERNET_KEY | Clave para cifrado de secrets TOTP | — (generar con Fernet.generate_key()) |
| JWT_INACTIVITY_EXPIRE_MINUTES | Expiración por inactividad | 30 |
| JWT_ABSOLUTE_EXPIRE_HOURS | Expiración absoluta de sesión | 8 |
| JWT_2FA_TEMP_EXPIRE_MINUTES | Duración del token temporal 2FA | 15 |
| CORPORATE_IP_RANGES | Rangos IP corporativos (formato JSON) | ["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12"] |
| TOTP_ISSUER | Nombre mostrado en el autenticador | Avalanz |
| MAX_ACTIVE_SESSIONS | Máximo de sesiones simultáneas | 3 |
| MAX_FAILED_ATTEMPTS | Intentos antes de bloquear cuenta | 3 |

### Formato correcto de CORPORATE_IP_RANGES

```bash
# Correcto — incluir 172.16.0.0/12 para WSL2
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]

# Incorrecto — rompe el servicio
CORPORATE_IP_RANGES=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
```

---

## Persistencia de archivos en contenedor

Los archivos del auth-service se pierden al recrear el contenedor porque la imagen no incluye los cambios locales. Siempre copiar después de reiniciar:

```bash
docker cp backend/auth-service/app/services/auth_service.py avalanz-auth:/app/app/services/auth_service.py
docker cp backend/auth-service/app/services/twofa_service.py avalanz-auth:/app/app/services/twofa_service.py
docker cp backend/auth-service/app/config.py avalanz-auth:/app/app/config.py
docker cp backend/auth-service/app/routes/internal.py avalanz-auth:/app/app/routes/internal.py
docker cp backend/auth-service/app/routes/auth.py avalanz-auth:/app/app/routes/auth.py
docker cp backend/auth-service/app/main.py avalanz-auth:/app/app/main.py
docker restart avalanz-auth
```

La solución permanente es reconstruir la imagen:

```bash
cd infrastructure/docker
docker compose build auth-service
docker compose up -d auth-service
```

---

## Alembic en auth-service

El auth-service tiene Alembic configurado. Usa `psycopg2-binary` para las migraciones (no `asyncpg`).

```bash
# Instalar psycopg2 en el contenedor (solo necesario la primera vez)
docker exec avalanz-auth pip install psycopg2-binary --quiet --root-user-action=ignore

# Generar migración
docker exec avalanz-auth bash -c "cd /app && alembic revision --autogenerate -m 'descripcion'"

# Aplicar migraciones
docker exec avalanz-auth bash -c "cd /app && alembic upgrade head"

# Copiar versiones al proyecto local
docker cp avalanz-auth:/app/migrations/versions/ backend/auth-service/migrations/
```

---

## Instalación y arranque local

```bash
cd backend/auth-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8001
```