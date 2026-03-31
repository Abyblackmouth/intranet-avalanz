# Notify Service — Guía de Referencia

Ubicación: `backend/notify-service/`

El `notify-service` gestiona las notificaciones en base de datos de la plataforma Avalanz. Cualquier servicio o módulo puede crear notificaciones para uno o varios usuarios. El frontend las consulta y las marca como leídas.

---

## Responsabilidades

- Crear notificaciones individuales y en masa
- Listar notificaciones del usuario autenticado
- Contar notificaciones no leídas
- Marcar notificaciones como leídas (individual o todas)

---

## Estructura

```
notify-service/
├── app/
│   ├── main.py                      → Punto de entrada
│   ├── config.py                    → Configuración del servicio
│   ├── database.py                  → Motor async, sesión de BD
│   ├── routes/
│   │   └── notifications.py        → Endpoints de notificaciones
│   ├── services/
│   │   └── notify_service.py       → Lógica de negocio
│   ├── models/
│   │   └── notify_models.py        → Modelo SQLAlchemy
│   └── middleware/
├── migrations/
├── tests/
├── Dockerfile
├── requirements.txt
└── .env
```

---

## Modelo de base de datos

### notifications

| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID | Usuario destinatario |
| company_id | UUID | Empresa relacionada (opcional) |
| module_slug | String(100) | Módulo que generó la notificación |
| type | String(100) | Tipo de notificación |
| title | String(255) | Título de la notificación |
| body | Text | Cuerpo del mensaje |
| data | JSONB | Datos extra del módulo (IDs, links, etc.) |
| is_read | Boolean | Si fue leída |
| read_at | DateTime | Fecha en que se leyó |
| created_at | DateTime | Fecha de creación |

---

## Tipos de notificación sugeridos

| Tipo | Descripción |
|---|---|
| info | Información general |
| warning | Advertencia |
| success | Acción completada exitosamente |
| error | Error en algún proceso |
| module.update | Actualización dentro de un módulo |
| account.locked | Cuenta bloqueada |
| session.revoked | Sesión revocada remotamente |
| password.reset | Solicitud de recuperación de contraseña |

---

## Endpoints

| Método | Ruta | Auth | Roles | Descripción |
|---|---|---|---|---|
| POST | /api/v1/notifications/ | Si | Cualquiera | Crear notificación individual |
| POST | /api/v1/notifications/bulk | Si | super_admin, admin_empresa | Crear notificaciones en masa |
| GET | /api/v1/notifications/ | Si | Cualquiera | Listar mis notificaciones |
| GET | /api/v1/notifications/unread-count | Si | Cualquiera | Contar no leídas |
| PATCH | /api/v1/notifications/{id}/read | Si | Cualquiera | Marcar una como leída |
| PATCH | /api/v1/notifications/read-all | Si | Cualquiera | Marcar todas como leídas |

### GET /api/v1/notifications/ — Query parameters

| Parámetro | Tipo | Descripción |
|---|---|---|
| page | int | Número de página (default: 1) |
| per_page | int | Resultados por página (default: 20, max: 100) |
| is_read | bool | Filtrar por leídas / no leídas |
| module_slug | string | Filtrar por módulo |

### Respuesta de notificación

```json
{
  "notification_id": "uuid",
  "user_id": "uuid",
  "company_id": "uuid",
  "module_slug": "legal",
  "type": "info",
  "title": "Nuevo expediente asignado",
  "body": "Se te ha asignado el expediente EXP-2026-001",
  "data": {
    "expediente_id": "uuid",
    "expediente_code": "EXP-2026-001"
  },
  "is_read": false,
  "read_at": null,
  "created_at": "2026-03-30T10:00:00+00:00"
}
```

---

## Cómo crear notificaciones desde otros servicios

Cualquier microservicio puede crear notificaciones haciendo una llamada HTTP interna al `notify-service`:

```python
import httpx

async def notify_user(user_id: str, title: str, body: str, data: dict = None):
    async with httpx.AsyncClient() as client:
        await client.post(
            "http://notify-service/api/v1/notifications/",
            json={
                "user_id": user_id,
                "type": "info",
                "title": title,
                "body": body,
                "data": data,
            },
            headers={"Authorization": f"Bearer {internal_token}"}
        )
```

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| DB_NAME | Base de datos del servicio | avalanz_notify |
| DEFAULT_PAGE_SIZE | Tamaño de página por defecto | 20 |
| MAX_PAGE_SIZE | Tamaño máximo de página | 100 |

---

## Instalación y arranque local

```bash
cd backend/notify-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8004
```

El servicio queda disponible en `http://localhost:8004`