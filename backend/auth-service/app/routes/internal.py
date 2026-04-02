from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Dict, Any

from app.database import get_db
from app.models.auth_models import User

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
