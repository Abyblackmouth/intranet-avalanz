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
ws://localhost:8005/ws?token=<access_token>
```

El token JWT va como query parameter porque los WebSockets no soportan headers de autorización como HTTP.

### Flujo de conexión

```
1. Frontend abre conexión WebSocket con token en URL
        |
2. Servidor valida el token JWT
        |
   Token inválido → cierre con código 4001
   Límite de conexiones → cierre con código 4002
        |
3. Conexión aceptada
        |
4. Servidor envía evento de confirmación:
   { "event": "connection.established", "data": { "user_id": "uuid" } }
        |
5. Conexión activa — el servidor envía eventos cuando ocurren
        |
6. Frontend envía ping cada 30 segundos para mantener la conexión viva
   { "type": "ping" } → { "type": "pong" }
```

### Códigos de cierre

| Código | Descripción |
|---|---|
| 4001 | Token inválido o expirado |
| 4002 | Límite de conexiones simultáneas alcanzado |

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

| Evento | Descripción |
|---|---|
| connection.established | Confirmación de conexión exitosa |
| notification.new | Nueva notificación para el usuario |
| module.update | Actualización dentro de un módulo |
| session.revoked | La sesión del usuario fue revocada remotamente |

---

## Endpoints HTTP internos

Estos endpoints no aparecen en `/docs` y solo son accesibles desde la red interna de Docker. Permiten que otros servicios disparen eventos sin conectarse por WebSocket.

### POST /ws/send
Enviar evento a un usuario específico.

```json
{
  "user_id": "uuid",
  "event_type": "notification.new",
  "data": { "title": "Nuevo expediente", "body": "..." },
  "module_slug": "legal"
}
```

### POST /ws/broadcast
Enviar evento a una lista de usuarios.

```json
{
  "user_ids": ["uuid1", "uuid2", "uuid3"],
  "event_type": "module.update",
  "data": { "message": "El módulo fue actualizado" },
  "module_slug": "legal"
}
```

### GET /ws/online-users
Retorna la lista de `user_id` de usuarios con conexión activa.

---

## Integración desde otros servicios

```python
import httpx

# Notificar a un usuario en tiempo real
async def push_event(user_id: str, event_type: str, data: dict):
    async with httpx.AsyncClient() as client:
        await client.post(
            "http://websocket-service/ws/send",
            json={
                "user_id": user_id,
                "event_type": event_type,
                "data": data,
            }
        )

# Ejemplo: notificar cuando se crea una notificacion
await push_event(
    user_id="uuid-usuario",
    event_type="notification.new",
    data={"title": "Nuevo expediente asignado", "body": "EXP-2026-001"}
)
```

---

## Integración desde el frontend (Next.js)

```javascript
const token = localStorage.getItem("access_token")
const ws = new WebSocket(`ws://localhost:8005/ws?token=${token}`)

ws.onopen = () => {
  console.log("Conectado")
  // Iniciar heartbeat
  setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000)
}

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)

  switch (msg.event) {
    case "notification.new":
      // Mostrar badge de notificacion
      break
    case "session.revoked":
      // Cerrar sesion y redirigir al login
      break
    case "module.update":
      // Refrescar datos del modulo
      break
  }
}

ws.onclose = (event) => {
  if (event.code === 4001) {
    // Token invalido, redirigir al login
  }
}
```

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| WS_HEARTBEAT_INTERVAL | Intervalo de heartbeat en segundos | 30 |
| WS_MAX_CONNECTIONS_PER_USER | Máximo de conexiones simultáneas por usuario | 5 |

---

## Instalación y arranque local

```bash
cd backend/websocket-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8005
```

El servicio queda disponible en `ws://localhost:8005/ws`