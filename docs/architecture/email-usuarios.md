# Email Service — Flujos de Usuarios

Ubicación: `docs/architecture/email-usuarios.md`

Documenta los correos transaccionales conectados al ciclo de vida de usuarios. Todos los correos se envían via `email-service` desde `admin-service` o `auth-service` mediante llamadas HTTP internas.

---

## Correos implementados

### 1. Bienvenida — Cuenta creada
**Disparado por:** `admin-service` → `user_service.py` → `_send_welcome_email()`
**Cuándo:** Al crear un usuario nuevo desde el panel de administración
**Endpoint email-service:** `POST /api/v1/email/welcome`
**Contenido:** Nombre del usuario, correo, contraseña temporal, botón "Iniciar sesión"
**Nota:** El botón lleva al login. El sistema detecta `is_temp_password=True` y redirige automáticamente a cambiar contraseña.

### 2. Contraseña reseteada por administrador
**Disparado por:** `admin-service` → `user_service.py` → `_send_reset_password_email()`
**Cuándo:** Cuando un super_admin o admin_empresa resetea la contraseña de un usuario
**Endpoint email-service:** `POST /api/v1/email/system-notification`
**Contenido:** Aviso de reset, botón que lleva a `/change-password?user_id=xxx`
**Nota:** El usuario debe cambiar la contraseña en su próximo login — `is_temp_password=True` se activa.

### 3. Cuenta bloqueada por intentos fallidos
**Disparado por:** `auth-service` → `auth_service.py` → `_send_account_locked_email()`
**Cuándo:** Al alcanzar `MAX_FAILED_ATTEMPTS` (actualmente 3) intentos fallidos consecutivos
**Endpoint email-service:** `POST /api/v1/email/account-locked`
**Contenido:** Aviso de bloqueo, número de intentos, IP de origen, fecha, instrucciones para contactar al administrador

### 4. Recuperación de contraseña
**Disparado por:** `auth-service` → `auth_service.py` → `_send_password_reset_email()`
**Cuándo:** Al solicitar recuperación de contraseña desde `/reset-password`
**Endpoint email-service:** `POST /api/v1/email/password-reset`
**Contenido:** Link de recuperación válido 30 minutos, botón "Restablecer contraseña"
**Nota:** Al confirmar la nueva contraseña, `is_locked=False` y `failed_attempts=0` se resetean automáticamente.

---

## Mensajes de bloqueo en el login

El mensaje de error al intentar iniciar sesión con cuenta bloqueada se diferencia según el origen del bloqueo:

| Origen | Mensaje |
|---|---|
| Bloqueo automático por intentos fallidos | "Cuenta bloqueada por múltiples intentos fallidos, contacta al administrador" |
| Bloqueo manual por administrador | "Tu cuenta ha sido bloqueada, contacta al administrador" |

**Implementación:** `auth-service/app/services/auth_service.py` → función `login()` — si `failed_attempts >= MAX_FAILED_ATTEMPTS` es automático, si no es manual.

---

## Configuración SMTP en desarrollo

Mailpit intercepta todos los correos en desarrollo sin enviarlos a internet.

| Servicio | URL |
|---|---|
| UI de correos | http://localhost:8025 |
| SMTP (interno Docker) | mailpit:1025 |

Mailpit debe estar conectado a la red Docker de Avalanz:
```bash
docker network connect docker_avalanz-network mailpit
```

Configuración en `backend/email-service/.env`:
```bash
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USE_TLS=False
```

---

## Correos pendientes de conectar

| Evento | Servicio | Estado |
|---|---|---|
| Sesión revocada remotamente | auth-service | Pendiente |
| Bloqueo manual por administrador | admin-service | Pendiente |

---

## Notas importantes

- El `email-service` no está expuesto por Nginx — todos sus endpoints son internos
- Si el email falla, el flujo principal no se interrumpe — los errores se capturan silenciosamente con `except Exception: pass`
- En producción reemplazar `SMTP_HOST=mailpit` con el servidor SMTP real
- Ver guía de funciones futuras para el módulo de configuración SMTP desde la UI
