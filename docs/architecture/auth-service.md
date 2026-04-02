# Auth Service — Guía de Referencia

Ubicación: `backend/auth-service/`

El `auth-service` es el servicio de autenticación centralizada de la plataforma Avalanz. Es el único servicio que emite tokens JWT y gestiona el ciclo de vida completo de las sesiones de usuario.

---

## Responsabilidades

- Autenticación de usuarios con usuario y contraseña
- 2FA condicional por ubicación de red (TOTP)
- Emisión y renovación de tokens JWT
- Gestión de sesiones activas e historial
- Recuperación de contraseña por email
- Bloqueo de cuenta por intentos fallidos
- Primer login con contraseña temporal
- Endpoints internos para que otros servicios consulten datos de autenticación

---

## Estructura

```
auth-service/
├── app/
│   ├── main.py               → Punto de entrada, middlewares, routers
│   ├── config.py             → Configuración del servicio
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
| Migraciones | Alembic |
| JWT | python-jose |
| Hashing | bcrypt |
| Cifrado | cryptography Fernet |
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
| last_login_at | DateTime | Último login exitoso |
| last_login_ip | String(45) | IP del último login |

---

## Endpoints públicos — `/api/v1/auth`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | /login | No | Iniciar sesión |
| POST | /2fa/verify | No | Verificar código TOTP tras login |
| POST | /change-temp-password | No | Cambiar contraseña temporal |
| POST | /refresh | No | Renovar access token |
| POST | /password-reset/request | No | Solicitar recuperación de contraseña |
| POST | /password-reset/confirm | No | Confirmar nueva contraseña |
| POST | /logout | Si | Cerrar sesión actual |
| POST | /sessions/revoke | Si | Revocar una sesión específica |
| GET | /sessions | Si | Listar sesiones activas |
| GET | /me | Si | Obtener datos del usuario autenticado |

---

## Endpoints internos — `/internal`

Estos endpoints no requieren autenticación JWT y solo son accesibles dentro de la red Docker. No están expuestos por Nginx.

| Método | Ruta | Descripción |
|---|---|---|
| POST | /internal/users | Crear credenciales de usuario (llamado por admin-service al crear usuario) |
| GET | /internal/users/{user_id}/permissions | Obtener roles, módulos y empresas (llamado al emitir JWT) |
| GET | /internal/users/{user_id}/info | Obtener is_locked, is_2fa_configured, last_login_at |
| POST | /internal/users/batch-info | Obtener datos de auth para múltiples usuarios |

### GET /internal/users/{user_id}/permissions
```json
{
  "roles": ["super_admin", "legal:director_legal"],
  "modules": ["legal", "boveda"],
  "companies": ["uuid-corporativo", "uuid-dyce"],
  "permissions": []
}
```

### GET /internal/users/{user_id}/info
```json
{
  "user_id": "uuid",
  "is_locked": false,
  "is_2fa_configured": true,
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

---

## Flujos de autenticación

### Flujo 1 — Primer login (contraseña temporal)

```
POST /api/v1/auth/login
        |
{ action: "change_password", user_id }
        |
POST /api/v1/auth/change-temp-password
        |
{ action: "setup_2fa", user_id }
        |
GET /api/v1/2fa/setup         → QR + secret + backup_codes
        |
POST /api/v1/2fa/activate     → { code: "123456" }
        |
Sesión lista — realizar login normal
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
| JWT_INACTIVITY_EXPIRE_MINUTES | Expiración por inactividad | 30 |
| JWT_ABSOLUTE_EXPIRE_HOURS | Expiración absoluta de sesión | 8 |
| JWT_2FA_TEMP_EXPIRE_MINUTES | Duración del token temporal 2FA | 15 |
| CORPORATE_IP_RANGES | Rangos IP corporativos (formato JSON) | ["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12"] |
| TOTP_ISSUER | Nombre mostrado en el autenticador | Avalanz |
| MAX_ACTIVE_SESSIONS | Máximo de sesiones simultáneas | 3 |
| MAX_FAILED_ATTEMPTS | Intentos antes de bloquear cuenta | 5 |

### Formato correcto de CORPORATE_IP_RANGES

Pydantic requiere formato JSON con corchetes, NO separado por comas:

```bash
# Correcto
CORPORATE_IP_RANGES=["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]

# Incorrecto — rompe el servicio
CORPORATE_IP_RANGES=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12
```

---

## Problema conocido: URL del admin-service

En `auth_service.py`, la URL para consultar permisos debe incluir el puerto:

```python
# Correcto
f"http://admin-service:8000/internal/users/{user_id}/permissions"

# Incorrecto — causa roles vacíos en el JWT
f"http://admin-service/internal/users/{user_id}/permissions"
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
