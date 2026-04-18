# Email Service — Guía de Referencia

Ubicación: `backend/email-service/`

El `email-service` es el servicio de envío de correos transaccionales de la plataforma Avalanz. Es un servicio completamente interno — ningún usuario ni el frontend lo llama directamente. Solo otros microservicios lo consumen via HTTP interno.

---

## Responsabilidades

- Envío de correos transaccionales usando SMTP
- Renderizado de plantillas HTML con branding Avalanz
- Soporte para SMTP local (Mailpit) y externo (Gmail, Outlook)
- Plantilla genérica reutilizable para módulos futuros

---

## Estructura

```
email-service/
├── app/
│   ├── main.py                  → Punto de entrada
│   ├── config.py                → Configuración SMTP, remitente y FRONTEND_URL
│   ├── routes/
│   │   └── email.py             → Endpoints internos de envío
│   ├── services/
│   │   └── email_service.py    → Lógica de envío y renderizado
│   ├── templates/
│   │   └── base.html           → Plantilla HTML corporativa base
│   └── middleware/
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
| SMTP async | aiosmtplib |
| Plantillas | HTML con reemplazo de variables |

---

## Tipos de correo

| Tipo | Endpoint | Descripción |
|---|---|---|
| Bienvenida | POST /api/v1/email/welcome | Correo al crear usuario con contraseña temporal |
| Recuperación de contraseña | POST /api/v1/email/password-reset | Link de restablecimiento válido 30 minutos |
| Cuenta bloqueada | POST /api/v1/email/account-locked | Notificación de bloqueo por intentos fallidos |
| Notificación del sistema | POST /api/v1/email/system-notification | Mensaje general configurable |
| Correo de módulo | POST /api/v1/email/module | Plantilla genérica para módulos futuros |

Todos los endpoints tienen `include_in_schema=False` — no aparecen en `/docs` y solo son accesibles desde la red interna de Docker.

---

## Plantilla corporativa base

Todos los correos se renderizan usando `base.html`. El diseño:

- **Header:** fondo blanco, logo de Avalanz (110px de alto via `{{ frontend_url }}/logo_200.png`), nombre "Intranet Avalanz" debajo
- **Tipografía:** system fonts stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`)
- **Botones:** `#1a4fa0` con `border-radius: 10px` — mismo azul corporativo del sistema
- **Credenciales box:** fondo gris claro con filas label/valor separadas por línea
- **Alert boxes:** cuatro variantes con ícono Unicode inline y borde lateral de color
  - Default/warning: amarillo `#f59e0b`
  - Danger: rojo `#ef4444`
  - Success: verde `#22c55e`
  - Info: azul `#3b82f6`
- **Footer:** fondo slate claro con aviso de no responder y copyright

El render inyecta estas variables:

```python
base
  .replace("{{ subject }}", subject)
  .replace("{{ company_name }}", config.EMAIL_FROM_NAME)
  .replace("{{ year }}", str(datetime.now().year))
  .replace("{{ frontend_url }}", config.FRONTEND_URL)
  .replace("{{ content }}", content)
```

---

## Correos y sus parámetros

### POST /api/v1/email/welcome
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "temp_password": "Xk9#mP2qLw"
}
```
Muestra credenciales en un `credentials box` y un alert box info con el aviso de 24 horas de validez.

### POST /api/v1/email/password-reset
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "reset_token": "token-seguro-generado"
}
```
El link generado apunta a: `{FRONTEND_URL}/reset-password?token={reset_token}`

> **Importante:** El auth-service manda solo el token, no la URL completa. El email-service construye la URL internamente.

El token se invalida con `is_used=True` al usarse. El frontend verifica el token al cargar via `GET /api/v1/auth/password-reset/validate` antes de mostrar el formulario.

### POST /api/v1/email/account-locked
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "failed_attempts": 3,
  "locked_from_ip": "201.100.45.23"
}
```
Muestra un alert box danger con IP, intentos y fecha. Incluye botón para restablecer contraseña.

### POST /api/v1/email/system-notification
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "subject": "Tu contrasena ha sido reseteada",
  "message": "Un administrador ha reseteado tu contrasena.",
  "action_label": "Iniciar sesion",
  "action_url": "http://localhost:3000/change-password?user_id=uuid",
  "alert_type": "warning"
}
```
Valores de `alert_type`: `warning`, `danger`, `success`, `info` o `null` para mensaje simple.

### POST /api/v1/email/module
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "subject": "Expediente asignado",
  "html_content": "<h2>Nuevo expediente</h2><p>Se te ha asignado EXP-2026-001.</p>"
}
```
El `html_content` se inserta dentro de la plantilla base automáticamente.

---

## Cuándo usa cada servicio el email-service

| Evento | Servicio que lo dispara | Endpoint | Correo enviado |
|---|---|---|---|
| Usuario creado | admin-service → `_send_welcome_email()` | /welcome | Bienvenida con credenciales temporales |
| Contraseña reseteada por admin | admin-service → `_send_reset_password_email()` | /system-notification | Aviso de reset con link a /change-password |
| Cuenta bloqueada por intentos | auth-service → `_send_account_locked_email()` | /account-locked | Notificación con IP y fecha |
| Recuperación de contraseña | auth-service → `_send_password_reset_email()` | /password-reset | Link de recuperación válido 30 min |
| Evento de módulo | Cualquier módulo futuro | /module | Correo genérico del módulo |

---

## Cómo consumir desde otros servicios

```python
import httpx

async def send_welcome(email: str, name: str, password: str):
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            "http://email-service:8000/api/v1/email/welcome",
            json={
                "to_email": email,
                "full_name": name,
                "temp_password": password,
            }
        )
```

Los errores del email-service se capturan silenciosamente con `except Exception: pass` — un fallo en el correo no interrumpe el flujo principal.

---

## Configuración SMTP

### Desarrollo con Mailpit (recomendado)

Mailpit intercepta todos los correos sin enviarlos a internet. UI disponible en `http://localhost:8025`.

Configuración en `backend/email-service/.env`:
```bash
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USE_TLS=False
SMTP_USE_SSL=False
FRONTEND_URL=http://localhost:3000
```

### Gmail
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_app_password
SMTP_USE_TLS=True
SMTP_USE_SSL=False
```

Para Gmail usar una **App Password** — Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.

### Outlook / Office 365
```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=tu_correo@empresa.com
SMTP_PASSWORD=tu_password
SMTP_USE_TLS=True
SMTP_USE_SSL=False
```

---

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| SMTP_HOST | Host del servidor SMTP | localhost |
| SMTP_PORT | Puerto SMTP | 25 |
| SMTP_USER | Usuario SMTP | — |
| SMTP_PASSWORD | Contraseña SMTP | — |
| SMTP_USE_TLS | Usar STARTTLS | False |
| SMTP_USE_SSL | Usar SSL directo | False |
| EMAIL_FROM_NAME | Nombre del remitente | Avalanz |
| EMAIL_FROM_ADDRESS | Correo del remitente | noreply@avalanz.com |
| FRONTEND_URL | URL base del frontend para links y logo | http://localhost:3000 |

---

## Instalación y arranque local

```bash
cd backend/email-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8006
```

El servicio queda disponible en `http://localhost:8006`