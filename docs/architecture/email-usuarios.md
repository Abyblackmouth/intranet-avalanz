# Email Service — Flujos de Usuarios

Ubicación: `docs/architecture/email-usuarios.md`

Documenta los correos transaccionales conectados al ciclo de vida de usuarios. Todos los correos se envían via `email-service` desde `admin-service` o `auth-service` mediante llamadas HTTP internas.

---

## Diseño de plantillas

Todas las plantillas usan `backend/email-service/app/templates/base.html` como base.

- **Header:** fondo blanco, logo de Avalanz (110px de alto), nombre "Intranet Avalanz" debajo
- **Tipografía:** system fonts stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`)
- **Botones:** `#1a4fa0` con bordes redondeados — mismo azul corporativo del sistema
- **Credenciales box:** fondo gris claro con filas label/valor para mostrar usuario y contraseña temporal
- **Alert boxes:** cuatro variantes (default/warning, danger, success, info) con ícono Unicode inline y borde lateral de color
- **Footer:** fondo slate claro con aviso de no responder y copyright

El render inyecta `{{ frontend_url }}` para construir URLs de botones y cargar el logo:

```python
def _render(content: str, subject: str) -> str:
    base = template_path.read_text(encoding="utf-8")
    return (
        base
        .replace("{{ subject }}", subject)
        .replace("{{ company_name }}", config.EMAIL_FROM_NAME)
        .replace("{{ year }}", str(datetime.now().year))
        .replace("{{ frontend_url }}", config.FRONTEND_URL)
        .replace("{{ content }}", content)
    )
```

---

## Correos implementados

### 1. Bienvenida — Cuenta creada
**Disparado por:** `admin-service` → `user_service.py` → `_send_welcome_email()`
**Cuándo:** Al crear un usuario nuevo desde el panel de administración
**Endpoint email-service:** `POST /api/v1/email/welcome`
**Contenido:** Nombre del usuario, credenciales box con correo y contraseña temporal, alert box info con aviso de 24 horas, botón "Iniciar sesión"
**Nota:** El botón lleva al login. El sistema detecta `is_temp_password=True` y redirige automáticamente a cambiar contraseña.

### 2. Contraseña reseteada por administrador
**Disparado por:** `admin-service` → `user_service.py` → `_send_reset_password_email()`
**Cuándo:** Cuando un super_admin o admin_empresa resetea la contraseña de un usuario
**Endpoint email-service:** `POST /api/v1/email/system-notification`
**Contenido:** Aviso de reset, botón que lleva a `/change-password?user_id=xxx`
**Nota:** El usuario debe cambiar la contraseña en su próximo login — `is_temp_password=True` se activa. El link expira cuando `is_temp_password` cambia a `False`.

### 3. Cuenta bloqueada por intentos fallidos
**Disparado por:** `auth-service` → `auth_service.py` → `_send_account_locked_email()`
**Cuándo:** Al alcanzar `MAX_FAILED_ATTEMPTS` (actualmente 3) intentos fallidos consecutivos
**Endpoint email-service:** `POST /api/v1/email/account-locked`
**Contenido:** Alert box danger con número de intentos, IP de origen y fecha, botón "Restablecer contraseña"

### 4. Recuperación de contraseña
**Disparado por:** `auth-service` → `auth_service.py` → `_send_password_reset_email()`
**Cuándo:** Al solicitar recuperación de contraseña desde `/reset-password`
**Endpoint email-service:** `POST /api/v1/email/password-reset`
**Contenido:** Alert box warning con aviso de 30 minutos, botón "Restablecer contraseña", link de respaldo en texto plano
**Nota:** El token se invalida con `is_used=True` al usarse. El frontend verifica el token al cargar la página via `GET /api/v1/auth/password-reset/validate` — si ya no es válido muestra "Enlace expirado" sin mostrar el formulario.

---

## Mensajes de bloqueo en el login

| Origen | Mensaje |
|---|---|
| Bloqueo automático por intentos fallidos | "Cuenta bloqueada por múltiples intentos fallidos, contacta al administrador" |
| Bloqueo manual por administrador | "Tu cuenta ha sido bloqueada, contacta al administrador" |

**Implementación:** `auth-service/app/services/auth_service.py` → función `login()`.

---

## Configuración SMTP en desarrollo

Mailpit intercepta todos los correos en desarrollo sin enviarlos a internet.

| Servicio | URL |
|---|---|
| UI de correos | http://localhost:8025 |
| SMTP (interno Docker) | mailpit:1025 |

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
- `FRONTEND_URL` debe estar configurado en el `.env` del email-service para que los botones y el logo funcionen correctamente