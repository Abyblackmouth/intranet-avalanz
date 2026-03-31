import json
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, Depends
from pydantic import BaseModel
from typing import List, Optional

from app.config import config
from app.services.ws_service import (
    manager,
    build_event,
    notify_new_notification,
    notify_module_update,
    notify_session_revoked,
)
from shared.utils.jwt import decode_access_token
from shared.exceptions.http_exceptions import UnauthorizedException
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(tags=["WebSocket"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas ───────────────────────────────────────────────────────────────────

class SendToUserRequest(BaseModel):
    user_id: str
    event_type: str
    data: dict
    module_slug: Optional[str] = None


class BroadcastRequest(BaseModel):
    user_ids: List[str]
    event_type: str
    data: dict
    module_slug: Optional[str] = None


# ── Conexion WebSocket ────────────────────────────────────────────────────────

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...),
):
    # Validar token antes de aceptar la conexion
    try:
        payload = decode_access_token(
            token,
            config.JWT_SECRET_KEY,
            config.JWT_ALGORITHM,
        )
        user_id = payload.get("user_id")
        if not user_id:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return

    # Verificar limite de conexiones por usuario
    if manager.get_connection_count(user_id) >= config.WS_MAX_CONNECTIONS_PER_USER:
        await websocket.close(code=4002)
        return

    await manager.connect(websocket, user_id)

    try:
        # Enviar confirmacion de conexion
        await websocket.send_text(json.dumps(
            build_event("connection.established", {"user_id": user_id})
        ))

        while True:
            # Mantener conexion viva escuchando mensajes del cliente
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # Ping / Pong para heartbeat
                if msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except Exception:
                pass

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


# ── Endpoints HTTP para enviar eventos desde otros servicios ──────────────────

@router.post("/ws/send", include_in_schema=False)
async def send_to_user(body: SendToUserRequest):
    await manager.send_to_user(
        body.user_id,
        build_event(body.event_type, body.data, body.module_slug),
    )
    return {"sent": True}


@router.post("/ws/broadcast", include_in_schema=False)
async def broadcast(body: BroadcastRequest):
    sent = await manager.broadcast_to_company(
        body.user_ids,
        build_event(body.event_type, body.data, body.module_slug),
    )
    return {"sent": sent}


@router.get("/ws/online-users", include_in_schema=False)
async def online_users():
    return {"users": manager.get_online_users()}