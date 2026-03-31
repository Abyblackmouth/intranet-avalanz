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

### POST /api/v1/email/account-locked
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "failed_attempts": 5,
  "locked_from_ip": "201.100.45.23"
}
```

### POST /api/v1/email/system-notification
```json
{
  "to_email": "usuario@empresa.com",
  "full_name": "Juan Pérez",
  "subject": "Mantenimiento programado",
  "message": "El sistema estará en mantenimiento el sábado de 2am a 4am.",
  "action_label": "Ver detalles",
  "action_url": "http://intranet/anuncios/123",
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

## Cómo consumir desde otros servicios

```python
import httpx

async def send_welcome(email: str, name: str, password: str):
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            "http://email-service/api/v1/email/welcome",
            json={
                "to_email": email,
                "full_name": name,
                "temp_password": password,
            }
        )
```

---

## Configuración SMTP

### Desarrollo (Postfix local)
```bash
SMTP_HOST=localhost
SMTP_PORT=25
SMTP_USER=
SMTP_PASSWORD=
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

## Cuándo usa cada servicio el email-service

| Evento | Servicio que lo dispara | Correo enviado |
|---|---|---|
| Usuario creado | admin-service | Bienvenida con contraseña temporal |
| Solicitud de recuperación | auth-service | Link de restablecimiento |
| Cuenta bloqueada | auth-service | Notificación de bloqueo |
| Evento de módulo | Cualquier módulo futuro | Correo de módulo genérico |

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