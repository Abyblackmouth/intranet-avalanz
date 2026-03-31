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
│   │   └── twofa.py          → Endpoints de configuración 2FA
│   ├── services/
│   │   ├── auth_service.py   → Lógica de negocio de autenticación
│   │   └── twofa_service.py  → Lógica de negocio TOTP
│   ├── models/
│   │   └── auth_models.py    → Modelos SQLAlchemy
│   └── middleware/           → Middlewares específicos del servicio
├── migrations/               → Migraciones Alembic
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
| Hashing | passlib bcrypt |
| Cifrado | cryptography Fernet |
| TOTP | pyotp |
| QR | qrcode |
| HTTP cliente | httpx |

---

## Modelos de base de datos

### users
Tabla central de usuarios de la plataforma.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
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
| created_at | DateTime | Fecha de creación |
| updated_at | DateTime | Fecha de última actualización |
| is_deleted | Boolean | Soft delete |
| deleted_at | DateTime | Fecha de eliminación lógica |

### user_totp
Configuración TOTP por usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID FK | Referencia a users |
| secret | String(255) | Secreto TOTP cifrado con Fernet |
| is_active | Boolean | Si el 2FA está activado |
| activated_at | DateTime | Fecha de activación |
| backup_codes | Text | JSON con hashes de códigos de respaldo |

### user_sessions
Sesiones activas por usuario.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID FK | Referencia a users |
| refresh_token_hash | String(255) | Hash SHA256 del refresh token |
| ip_address | String(45) | IP de la sesión |
| user_agent | String(500) | Navegador / dispositivo |
| is_corporate_network | Boolean | Si inició desde red corporativa |
| session_started_at | DateTime | Inicio de sesión |
| last_activity_at | DateTime | Última actividad |
| expires_at | DateTime | Expiración del refresh token |
| is_revoked | Boolean | Si fue revocada |
| revoked_at | DateTime | Fecha de revocación |
| revoked_reason | String(255) | Motivo de revocación |

### password_resets
Tokens de recuperación de contraseña.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID FK | Referencia a users |
| token_hash | String(255) | Hash SHA256 del token |
| expires_at | DateTime | Expiración (30 minutos) |
| is_used | Boolean | Si ya fue usado |
| used_at | DateTime | Fecha de uso |
| requested_from_ip | String(45) | IP desde donde se solicitó |

### login_history
Historial completo de intentos de login.

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID FK | Referencia a users |
| ip_address | String(45) | IP del intento |
| user_agent | String(500) | Navegador / dispositivo |
| is_corporate_network | Boolean | Si fue desde red corporativa |
| success | Boolean | Si el login fue exitoso |
| failure_reason | String(255) | Motivo del fallo |
| requires_2fa | Boolean | Si se requirió 2FA |
| completed_2fa | Boolean | Si completó el 2FA |

---

## Flujos de autenticación

### Flujo 1 — Primer login (contraseña temporal)

```
POST /api/v1/auth/login
        |
        v
{ action: "change_password", user_id }
        |
        v
POST /api/v1/auth/change-temp-password
        |
        v
{ action: "setup_2fa", user_id }
        |
        v
GET /api/v1/2fa/setup         → QR + secret + backup_codes
        |
        v
POST /api/v1/2fa/activate     → { code: "123456" }
        |
        v
Sesión lista — realizar login normal
```

### Flujo 2 — Login desde red corporativa

```
POST /api/v1/auth/login
        |
        v
IP detectada en rangos corporativos
        |
        v
{ access_token, refresh_token, token_type: "bearer" }
```

### Flujo 3 — Login desde red externa (2FA requerido)

```
POST /api/v1/auth/login
        |
        v
IP externa detectada
        |
        v
{ action: "2fa_required", temp_token }   ← válido 15 minutos
        |
        v
POST /api/v1/2fa/verify
{ temp_token, code: "123456" }
        |
        v
{ access_token, refresh_token, token_type: "bearer" }
```

### Flujo 4 — Renovación de token (actividad del usuario)

```
access_token expirado (30 min inactividad)
        |
        v
POST /api/v1/auth/refresh
{ refresh_token }
        |
        v
{ access_token }    ← session_started_at original conservado
        |
        v
A las 8 horas absolutas → refresh_token deja de funcionar → nuevo login
```

### Flujo 5 — Recuperación de contraseña

```
POST /api/v1/auth/password-reset/request
{ email }
        |
        v
Link enviado al correo (válido 30 minutos)
        |
        v
POST /api/v1/auth/password-reset/confirm
{ token, new_password }
        |
        v
Contraseña actualizada — realizar login normal
```

### Flujo 6 — Bloqueo por intentos fallidos

```
5 intentos fallidos consecutivos
        |
        v
is_locked = True en users
        |
        v
Login bloqueado — mensaje: "Contacta al administrador"
        |
        v
Admin desbloquea desde admin-service
```

---

## Endpoints

### Autenticación — `/api/v1/auth`

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

### 2FA — `/api/v1/2fa`

| Método | Ruta | Auth | Rol requerido | Descripción |
|---|---|---|---|---|
| GET | /setup | Si | Cualquiera | Obtener QR y secret para configurar |
| POST | /activate | Si | Cualquiera | Activar 2FA con primer código |
| POST | /backup-codes/regenerate | Si | Cualquiera | Regenerar códigos de respaldo |
| POST | /deactivate | Si | super_admin | Desactivar 2FA de un usuario |
| GET | /status | Si | Cualquiera | Consultar estado del 2FA |

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
  "session_started_at": "2026-03-30T10:00:00+00:00",
  "absolute_exp": "2026-03-30T18:00:00+00:00",
  "exp": 1743330000,
  "iat": 1743328200,
  "type": "access"
}
```

Los campos `roles`, `modules`, `companies` y `permissions` son consultados al `admin-service` en cada login y renovación de token.

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
| CORPORATE_IP_RANGES | Rangos IP corporativos | 192.168.0.0/16, 10.0.0.0/8 |
| TOTP_ISSUER | Nombre mostrado en el autenticador | Avalanz |
| MAX_ACTIVE_SESSIONS | Máximo de sesiones simultáneas | 3 |
| TEMP_PASSWORD_EXPIRE_HOURS | Validez de contraseña temporal | 24 |
| PASSWORD_RESET_EXPIRE_MINUTES | Validez del link de recuperación | 30 |
| MAX_FAILED_ATTEMPTS | Intentos antes de bloquear cuenta | 5 |

### Generar JWT_SECRET_KEY segura

```bash
openssl rand -hex 32
```

---

## Comunicación con otros servicios

| Servicio | Tipo | Endpoint | Propósito |
|---|---|---|---|
| admin-service | HTTP interno | /internal/users/{id}/permissions | Obtener roles, módulos, empresas y permisos del usuario al emitir token |

---

## Seguridad

- Las contraseñas se almacenan como hash bcrypt, nunca en texto plano
- El secreto TOTP se cifra con Fernet antes de guardarse en base de datos
- Los refresh tokens se almacenan como hash SHA256, nunca en texto plano
- Los tokens de recuperación de contraseña se almacenan como hash SHA256
- El endpoint de recuperación de contraseña no revela si el email existe
- Las credenciales incorrectas devuelven siempre el mismo mensaje de error
- Los docs de la API (`/docs`, `/redoc`) solo están disponibles en modo DEBUG
- El rate limiting protege todos los endpoints contra fuerza bruta

---

## Instalación y arranque local

```bash
cd backend/auth-service

# Crear entorno virtual
python -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus valores locales

# Arrancar el servicio
uvicorn app.main:app --reload --port 8001
```

El servicio queda disponible en `http://localhost:8001`
La documentación interactiva en `http://localhost:8001/docs` (solo en DEBUG=True)