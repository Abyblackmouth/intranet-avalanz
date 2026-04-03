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
