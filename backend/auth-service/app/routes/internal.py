from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from app.database import get_db
from app.models.auth_models import User, UserSession, LoginHistory

router = APIRouter(prefix="/internal", tags=["Internal"])


class BatchInfoRequest(BaseModel):
    user_ids: List[str]


@router.get("/users/{user_id}/info")
async def get_user_info(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {}
    return {
        "user_id": str(user.id),
        "is_locked": user.is_locked,
        "is_2fa_configured": user.is_2fa_configured,
        "is_temp_password": user.is_temp_password,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "roles": [],
    }


@router.post("/users/batch-info")
async def get_users_batch_info(
    body: BatchInfoRequest,
    db: AsyncSession = Depends(get_db),
) -> Dict[str, Any]:
    result = await db.execute(
        select(User).where(
            User.id.in_(body.user_ids),
            User.is_deleted == False,
        )
    )
    users = result.scalars().all()
    return {
        str(u.id): {
            "user_id": str(u.id),
            "is_locked": u.is_locked,
            "is_2fa_configured": u.is_2fa_configured,
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None,
            "roles": [],
        }
        for u in users
    }


@router.get("/users/{user_id}/sessions")
async def get_user_sessions(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(UserSession)
        .where(
            UserSession.user_id == user_id,
            UserSession.is_revoked == False,
        )
        .order_by(desc(UserSession.last_activity_at))
        .limit(50)
    )
    sessions = result.scalars().all()
    return [
        {
            "session_id": str(s.id),
            "ip_address": s.ip_address,
            "user_agent": s.user_agent,
            "is_corporate_network": s.is_corporate_network,
            "session_started_at": s.session_started_at.isoformat(),
            "last_activity_at": s.last_activity_at.isoformat(),
            "expires_at": s.expires_at.isoformat(),
        }
        for s in sessions
    ]


@router.get("/users/{user_id}/login-history")
async def get_user_login_history(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(LoginHistory)
        .where(LoginHistory.user_id == user_id)
        .order_by(desc(LoginHistory.created_at))
        .limit(50)
    )
    history = result.scalars().all()
    return [
        {
            "id": str(h.id),
            "ip_address": h.ip_address,
            "user_agent": h.user_agent,
            "is_corporate_network": h.is_corporate_network,
            "success": h.success,
            "failure_reason": h.failure_reason,
            "requires_2fa": h.requires_2fa,
            "completed_2fa": h.completed_2fa,
            "created_at": h.created_at.isoformat(),
        }
        for h in history
    ]


class LockUserRequest(BaseModel):
    lock: bool
    reason: str


@router.post("/users/{user_id}/lock")
async def lock_user(
    user_id: str,
    body: LockUserRequest,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update
    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"success": False, "message": "Usuario no encontrado"}

    values = {"is_locked": body.lock}
    if body.lock:
        from datetime import datetime, timezone
        values["locked_at"] = datetime.now(timezone.utc)
        values["lock_type"] = "manual"
    else:
        values["locked_at"] = None
        values["lock_type"] = None

    await db.execute(update(User).where(User.id == user_id).values(**values))
    await db.commit()

    return {"success": True, "is_locked": body.lock}


class CreateUserRequest(BaseModel):
    user_id: str
    email: str
    full_name: str
    temp_password: str
    temp_password_expires_at: str


@router.post("/users")
async def create_user(body: CreateUserRequest, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import insert
    from datetime import datetime, timezone
    from shared.utils.encryption import hash_password

    result = await db.execute(
        select(User).where(User.email == body.email)
    )
    if result.scalar_one_or_none():
        return {"success": True, "message": "Usuario ya existe"}

    expires_at = datetime.fromisoformat(body.temp_password_expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    hashed = hash_password(body.temp_password)

    user = User(
        id=body.user_id,
        email=body.email,
        full_name=body.full_name,
        hashed_password=hashed,
        is_active=True,
        is_temp_password=True,
        temp_password_expires_at=expires_at,
        is_2fa_configured=False,
        failed_attempts=0,
        is_locked=False,
    )
    db.add(user)
    await db.commit()

    return {"success": True, "user_id": body.user_id}


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
):
    from shared.utils.encryption import hash_password
    from sqlalchemy import update

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"success": False, "message": "Usuario no encontrado"}

    hashed = hash_password(body.new_password)
    await db.execute(
        update(User).where(User.id == user_id).values(
            hashed_password=hashed,
            is_temp_password=True,
            failed_attempts=0,
        )
    )
    await db.commit()
    return {"success": True, "message": "Contrasena reseteada"}

class RevokeSessionsRequest(BaseModel):
    revoked_by_name: str
    revoked_by_email: str


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_all_user_sessions(
    user_id: str,
    body: RevokeSessionsRequest,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update
    from shared.utils.helpers import now_utc

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        return {"success": False, "message": "Usuario no encontrado"}

    await db.execute(
        update(UserSession).where(
            UserSession.user_id == user_id,
            UserSession.is_revoked == False,
        ).values(
            is_revoked=True,
            revoked_at=now_utc(),
            revoked_reason="revocado por administrador",
        )
    )
    await db.commit()

    try:
        import httpx
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": user.email,
                    "full_name": user.full_name,
                    "subject": "Tus sesiones han sido cerradas",
                    "message": f"Un administrador ({body.revoked_by_name}) ha cerrado todas tus sesiones activas. Si no reconoces esta acción, contacta al área de TI.",
                    "action_label": "Iniciar sesión",
                    "action_url": "http://localhost:3000/login",
                    "alert_type": "warning",
                }
            )
    except Exception:
        pass

    return {"success": True, "message": "Sesiones revocadas"}


class RevokeSingleSessionRequest(BaseModel):
    session_id: str


@router.post("/users/{user_id}/revoke-session")
async def revoke_single_session(
    user_id: str,
    body: RevokeSingleSessionRequest,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import update
    from shared.utils.helpers import now_utc

    result = await db.execute(
        select(UserSession).where(
            UserSession.id == body.session_id,
            UserSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return {"success": False, "message": "Sesion no encontrada"}

    await db.execute(
        update(UserSession).where(UserSession.id == body.session_id).values(
            is_revoked=True,
            revoked_at=now_utc(),
            revoked_reason="revocado por administrador",
        )
    )
    await db.commit()
    return {"success": True, "message": "Sesion revocada"}
