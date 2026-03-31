import asyncio
import json
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket
from shared.utils.helpers import now_utc


# ── Gestor de conexiones activas ──────────────────────────────────────────────

class ConnectionManager:

    def __init__(self):
        # { user_id: set of WebSocket connections }
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)

    def disconnect(self, websocket: WebSocket, user_id: str) -> None:
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]

    def get_connection_count(self, user_id: str) -> int:
        return len(self._connections.get(user_id, set()))

    def get_online_users(self) -> list:
        return list(self._connections.keys())

    def is_online(self, user_id: str) -> bool:
        return user_id in self._connections and len(self._connections[user_id]) > 0

    # ── Envio de mensajes ─────────────────────────────────────────────────────

    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> bool:
        if user_id not in self._connections:
            return False
        payload = json.dumps(message, default=str)
        dead = set()
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.add(ws)
        for ws in dead:
            self._connections[user_id].discard(ws)
        return True

    async def broadcast_to_company(
        self,
        company_user_ids: list,
        message: Dict[str, Any],
    ) -> int:
        sent = 0
        for user_id in company_user_ids:
            if await self.send_to_user(user_id, message):
                sent += 1
        return sent

    async def broadcast_to_all(self, message: Dict[str, Any]) -> int:
        sent = 0
        for user_id in list(self._connections.keys()):
            if await self.send_to_user(user_id, message):
                sent += 1
        return sent


# ── Instancia global del gestor ───────────────────────────────────────────────

manager = ConnectionManager()


# ── Tipos de eventos ──────────────────────────────────────────────────────────

def build_event(event_type: str, data: Any, module_slug: Optional[str] = None) -> Dict[str, Any]:
    return {
        "event": event_type,
        "module": module_slug,
        "data": data,
        "timestamp": now_utc().isoformat(),
    }


# ── Eventos predefinidos ──────────────────────────────────────────────────────

async def notify_new_notification(user_id: str, notification: Dict[str, Any]) -> None:
    await manager.send_to_user(
        user_id,
        build_event("notification.new", notification),
    )


async def notify_module_update(user_ids: list, module_slug: str, data: Dict[str, Any]) -> None:
    event = build_event("module.update", data, module_slug=module_slug)
    for uid in user_ids:
        await manager.send_to_user(uid, event)


async def notify_session_revoked(user_id: str) -> None:
    await manager.send_to_user(
        user_id,
        build_event("session.revoked", {"message": "Tu sesion fue revocada"}),
    )