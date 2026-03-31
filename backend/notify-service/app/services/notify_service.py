from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from typing import Optional, Dict, Any, List

from app.config import config
from app.models.notify_models import Notification
from shared.utils.helpers import paginate, get_offset, now_utc
from shared.exceptions.http_exceptions import NotFoundException, ForbiddenException


# ── Crear notificacion ────────────────────────────────────────────────────────

async def create_notification(
    db: AsyncSession,
    user_id: str,
    type: str,
    title: str,
    body: str,
    company_id: Optional[str] = None,
    module_slug: Optional[str] = None,
    data: Optional[dict] = None,
) -> Dict[str, Any]:

    notification = Notification(
        user_id=user_id,
        company_id=company_id,
        module_slug=module_slug,
        type=type,
        title=title,
        body=body,
        data=data,
    )
    db.add(notification)
    await db.commit()
    await db.refresh(notification)

    return _serialize(notification)


# ── Crear notificaciones en masa ──────────────────────────────────────────────

async def create_bulk_notifications(
    db: AsyncSession,
    user_ids: List[str],
    type: str,
    title: str,
    body: str,
    company_id: Optional[str] = None,
    module_slug: Optional[str] = None,
    data: Optional[dict] = None,
) -> Dict[str, Any]:

    notifications = [
        Notification(
            user_id=uid,
            company_id=company_id,
            module_slug=module_slug,
            type=type,
            title=title,
            body=body,
            data=data,
        )
        for uid in user_ids
    ]
    db.add_all(notifications)
    await db.commit()

    return {
        "total_sent": len(notifications),
        "type": type,
        "title": title,
    }


# ── Listar notificaciones del usuario ─────────────────────────────────────────

async def list_notifications(
    db: AsyncSession,
    user_id: str,
    page: int = 1,
    per_page: int = 20,
    is_read: Optional[bool] = None,
    module_slug: Optional[str] = None,
) -> Dict[str, Any]:

    per_page = min(per_page, config.MAX_PAGE_SIZE)
    query = select(Notification).where(Notification.user_id == user_id)

    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    if module_slug:
        query = query.where(Notification.module_slug == module_slug)

    query = query.order_by(Notification.created_at.desc())

    total_result = await db.execute(select(func.count()).select_from(query.subquery()))
    total = total_result.scalar()

    query = query.offset(get_offset(page, per_page)).limit(per_page)
    result = await db.execute(query)
    notifications = result.scalars().all()

    return {
        "data": [_serialize(n) for n in notifications],
        "meta": paginate(total, page, per_page),
    }


# ── Contar no leidas ──────────────────────────────────────────────────────────

async def count_unread(db: AsyncSession, user_id: str) -> int:
    result = await db.execute(
        select(func.count()).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        )
    )
    return result.scalar()


# ── Marcar como leida ─────────────────────────────────────────────────────────

async def mark_as_read(
    db: AsyncSession,
    notification_id: str,
    user_id: str,
) -> Dict[str, Any]:

    result = await db.execute(
        select(Notification).where(Notification.id == notification_id)
    )
    notification = result.scalar_one_or_none()
    if not notification:
        raise NotFoundException("Notificacion")

    if str(notification.user_id) != user_id:
        raise ForbiddenException("No puedes marcar notificaciones de otro usuario")

    await db.execute(
        update(Notification).where(Notification.id == notification_id).values(
            is_read=True,
            read_at=now_utc(),
        )
    )
    await db.commit()

    result = await db.execute(select(Notification).where(Notification.id == notification_id))
    return _serialize(result.scalar_one())


# ── Marcar todas como leidas ──────────────────────────────────────────────────

async def mark_all_as_read(db: AsyncSession, user_id: str) -> Dict[str, Any]:
    now = now_utc()
    await db.execute(
        update(Notification).where(
            Notification.user_id == user_id,
            Notification.is_read == False,
        ).values(is_read=True, read_at=now)
    )
    await db.commit()
    return {"message": "Todas las notificaciones marcadas como leidas"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _serialize(n: Notification) -> Dict[str, Any]:
    return {
        "notification_id": str(n.id),
        "user_id": str(n.user_id),
        "company_id": str(n.company_id) if n.company_id else None,
        "module_slug": n.module_slug,
        "type": n.type,
        "title": n.title,
        "body": n.body,
        "data": n.data,
        "is_read": n.is_read,
        "read_at": n.read_at.isoformat() if n.read_at else None,
        "created_at": n.created_at.isoformat(),
    }