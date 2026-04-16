# WebSocket Service — Guía de Referencia

Ubicación: `backend/websocket-service/`

El `websocket-service` gestiona la comunicación bidireccional en tiempo real de la plataforma Avalanz. Mantiene conexiones persistentes con los usuarios autenticados y permite que cualquier servicio envíe eventos en tiempo real sin que el frontend tenga que hacer polling.

---

## Responsabilidades

- Mantener conexiones WebSocket activas por usuario
- Validar tokens JWT al conectar
- Enviar eventos en tiempo real a usuarios específicos
- Broadcast a grupos de usuarios por empresa o módulo
- Exponer endpoints HTTP internos para que otros servicios disparen eventos

---

## Estructura

```
websocket-service/
├── app/
│   ├── main.py              → Punto de entrada
│   ├── config.py            → Configuración del servicio
│   ├── routes/
│   │   └── ws.py            → Endpoint WebSocket y endpoints HTTP internos
│   ├── services/
│   │   └── ws_service.py    → ConnectionManager y eventos predefinidos
│   ├── models/
│   │   └── ws_models.py
│   └── middleware/
├── tests/
├── Dockerfile
├── requirements.txt
└── .env
```

---

## Conexión WebSocket

### URL de conexión

```
ws://<host>/ws?token=<access_token>
```

El token JWT va como query parameter porque los WebSockets no soportan headers de autorización. La conexión pasa por Nginx en el puerto 80, que la redirige internamente al websocket-service en el puerto 8000.

La URL se configura en el frontend via la variable de entorno `NEXT_PUBLIC_WS_URL` en `frontend/.env.local`:

```env
# Desarrollo — IP del servidor WSL2
NEXT_PUBLIC_WS_URL=ws://172.20.92.197/ws

# Producción — dominio real
NEXT_PUBLIC_WS_URL=ws://intranet.avalanz.com/ws
```

### Flujo de conexión

```
1. Frontend abre conexión WebSocket con token en query param
        |
2. Nginx recibe la conexión y la redirige al websocket-service:8000
        |
3. websocket-service valida el token JWT
        |
   Token inválido → cierre inmediato con código 4001
   Límite de conexiones → cierre con código 4002
        |
4. Conexión aceptada — servidor registra al usuario en el ConnectionManager
        |
5. Servidor envía evento de confirmación:
   { "event": "connection.established", "data": { "user_id": "uuid" } }
        |
6. Conexión activa — el servidor envía eventos conforme ocurren
        |
7. Frontend envía ping cada 30 segundos para mantener la conexión viva
   { "type": "ping" } → servidor responde { "type": "pong" }
```

### Códigos de cierre

| Código | Descripción | Acción en el frontend |
|---|---|---|
| 4001 | Token inválido o expirado | Limpia el store y redirige al login |
| 4002 | Límite de conexiones simultáneas alcanzado | Muestra error y no reconecta |
| Cualquier otro | Desconexión inesperada | Reconexión automática cada 5 segundos |

---

## Formato de eventos

Todos los eventos del servidor siguen el mismo formato:

```json
{
  "event": "notification.new",
  "module": "legal",
  "data": { ... },
  "timestamp": "2026-03-30T10:00:00+00:00"
}
```

### Eventos predefinidos

| Evento | Descripción | Acción en el frontend |
|---|---|---|
| connection.established | Confirmación de conexión exitosa | Ninguna — solo log interno |
| notification.new | Nueva notificación para el usuario | Agrega al notificationStore, incrementa contador, muestra toast |
| module.update | Actualización dentro de un módulo | Refresca datos del módulo activo |
| session.revoked | La sesión del usuario fue revocada remotamente | Limpia el store y redirige al login |

---

## Servicios que usan el WebSocket

El notify-service es el único servicio que actualmente llama al websocket-service. Cuando se crea una notificación, notify-service guarda el registro en BD y llama a `POST /ws/send` para entregar el evento al usuario en tiempo real.

El flujo completo de notificaciones está documentado en `docs/architecture/notify-service.md`.

---

## Endpoints HTTP internos

Estos endpoints no aparecen en `/docs` y solo son accesibles desde la red interna de Docker. Permiten que otros microservicios disparen eventos WebSocket sin necesidad de mantener una conexión propia.

### POST /ws/send

Envía un evento a un usuario específico.

```json
{
  "user_id": "uuid",
  "event_type": "notification.new",
  "data": { "title": "Nuevo expediente", "body": "EXP-2026-001" },
  "module_slug": "legal"
}
```

### POST /ws/broadcast

Envía un evento a una lista de usuarios simultáneamente.

```json
{
  "user_ids": ["uuid1", "uuid2", "uuid3"],
  "event_type": "module.update",
  "data": { "message": "El módulo fue actualizado" },
  "module_slug": "legal"
}
```

### GET /ws/online-users

Retorna la lista de `user_id` de usuarios con conexión WebSocket activa en ese momento.

---

## Integración desde otros servicios

Cualquier microservicio puede notificar a un usuario en tiempo real llamando al endpoint interno. El puerto es 8000 — la comunicación es interna entre contenedores Docker.

```python
import httpx

async def push_event(user_id: str, event_type: str, data: dict, module_slug: str = None):
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                "http://websocket-service:8000/ws/send",
                json={
                    "user_id": user_id,
                    "event_type": event_type,
                    "data": data,
                    "module_slug": module_slug,
                },
            )
    except Exception:
        pass
```

El bloque `try/except` es importante — si el websocket-service no está disponible o el usuario no tiene conexión activa, el evento simplemente no se entrega, sin interrumpir el flujo principal del servicio que lo llama.

---

## Integración en el frontend (Next.js)

El frontend gestiona la conexión WebSocket a través del hook `useWebSocket` ubicado en `frontend/hooks/useWebSocket.ts`. No es necesario instanciar WebSocket manualmente en ningún componente.

El hook se inicializa una sola vez en el `Header` y permanece activo durante toda la sesión del usuario. Internamente maneja:

- Conexión automática al detectar un usuario autenticado en el authStore
- Token leído desde las cookies (`access_token`)
- URL leída desde `NEXT_PUBLIC_WS_URL`
- Heartbeat cada 30 segundos para mantener la conexión viva
- Reconexión automática cada 5 segundos ante desconexiones inesperadas
- Al recibir `notification.new` — normaliza el campo `id`, agrega la notificación al `notificationStore`, incrementa el contador no leído y despacha un toast al `toastStore`
- Al recibir `session.revoked` — limpia el authStore y redirige al login
- Al recibir código de cierre `4001` — limpia el authStore y redirige al login sin intentar reconexión

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| WS_HEARTBEAT_INTERVAL | Intervalo de heartbeat en segundos | 30 |
| WS_MAX_CONNECTIONS_PER_USER | Máximo de conexiones simultáneas por usuario | 5 |

---

## Arranque local para desarrollo

El servicio corre dentro de Docker junto con el resto de la plataforma. Para levantarlo de forma aislada:

```bash
cd backend/websocket-service

python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

uvicorn app.main:app --reload --port 8000
```

En desarrollo aislado el servicio queda en `ws://localhost:8000/ws`. En el stack completo la URL pasa por Nginx y queda en `ws://localhost/ws`.
