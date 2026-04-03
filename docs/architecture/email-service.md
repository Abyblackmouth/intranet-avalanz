# Email Service — Guía de Referencia

Ubicación: `backend/email-service/`

El `email-service` es el servicio de envío de correos transaccionales de la plataforma Avalanz. Es un servicio completamente interno — ningún usuario ni el frontend lo llama directamente. Solo otros microservicios lo consumen via HTTP interno.

---

## Responsabilidades

- Envío de correos transaccionales usando SMTP
- Renderizado de plantillas HTML corporativas
- Soporte para SMTP local (Postfix) y externo (Gmail, Outlook)
- Plantilla genérica reutilizable para módulos futuros

---

## Estructura

```
email-service/
├── app/
│   ├── main.py                  → Punto de entrada
│   ├── config.py                → Configuración SMTP y remitente
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

Todos los correos se renderizan usando `base.html` que incluye:

- Header con nombre de la empresa sobre fondo oscuro
- Cuerpo con tipografía limpia y espaciado correcto
- Botón de acción estilizado
- Footer con año y nombre de la empresa
- Estilos de alerta: `alert-box`, `alert-box danger`, `alert-box success`

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

### POST /api/v1/email/password-reset
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "reset_token": "token-seguro-generado"
}
```
El link generado apunta a: `{FRONTEND_URL}/reset-password?token={reset_token}`

> **Importante:** El auth-service debe mandar solo el token, no la URL completa. El email-service construye la URL internamente.

### POST /api/v1/email/account-locked
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "failed_attempts": 3,
  "locked_from_ip": "201.100.45.23"
}
```

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

Valores de `alert_type`: `warning`, `danger`, `success` o `null` para mensaje simple.

### POST /api/v1/email/module
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "subject": "Expediente asignado",
  "html_content": "<h2>Nuevo expediente</h2><p>Se te ha asignado EXP-2026-001.</p>"
}
```

El `html_content` se inserta dentro de la plantilla corporativa base automáticamente.

---

## Cuándo usa cada servicio el email-service

| Evento | Servicio que lo dispara | Endpoint | Correo enviado |
|---|---|---|---|
| Usuario creado | admin-service → `_send_welcome_email()` | /welcome | Bienvenida con contraseña temporal |
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

> Los errores del email-service se capturan silenciosamente con `except Exception: pass` — un fallo en el correo no interrumpe el flujo principal.

---

## Configuración SMTP

### Desarrollo con Mailpit (recomendado)

Mailpit intercepta todos los correos sin enviarlos a internet. UI disponible en `http://localhost:8025`.

```bash
# Levantar Mailpit
docker run -d --name mailpit -p 8025:8025 -p 1025:1025 axllent/mailpit

# Conectar a la red Docker de Avalanz
docker network connect docker_avalanz-network mailpit
```

Configuración en `backend/email-service/.env`:
```bash
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_USE_TLS=False
SMTP_USE_SSL=False
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

Para Gmail se debe usar una **App Password**, no la contraseña de la cuenta. Se genera en: Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones.

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
| FRONTEND_URL | URL base del frontend para links | http://localhost:3000 |

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
