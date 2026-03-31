from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.config import config
from app.database import get_db
from app.models.auth_models import User
from app.services.twofa_service import (
    generate_totp_setup,
    activate_totp,
    regenerate_backup_codes,
    deactivate_totp,
)
from shared.models.responses import DataResponse, BaseResponse
from shared.middleware.jwt_validator import JWTValidator
from shared.exceptions.http_exceptions import NotFoundException, ForbiddenException

router = APIRouter(prefix="/2fa", tags=["Doble Factor de Autenticacion"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas de entrada ────────────────────────────────────────────────────────

class ActivateTOTPRequest(BaseModel):
    code: str


class RegenerateBackupCodesRequest(BaseModel):
    code: str


class DeactivateTOTPRequest(BaseModel):
    user_id: str


# ── Helper para obtener usuario desde payload ─────────────────────────────────

async def get_user_from_payload(
    payload: dict,
    db: AsyncSession,
) -> User:
    result = await db.execute(
        select(User).where(
            User.id == payload.get("user_id"),
            User.is_deleted == False,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("Usuario")
    return user


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/setup", response_model=DataResponse)
async def get_totp_setup(
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    user = await get_user_from_payload(payload, db)
    result = await generate_totp_setup(db=db, user=user)
    return DataResponse(
        success=True,
        message="Escanea el codigo QR con tu autenticador",
        data={
            "qr_code_svg": result["qr_code_svg"],
            "secret": result["secret"],
            "backup_codes": result["backup_codes"],
            "issuer": result["issuer"],
            "account": result["account"],
        },
    )


@router.post("/activate", response_model=BaseResponse)
async def activate_2fa(
    body: ActivateTOTPRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    user = await get_user_from_payload(payload, db)
    result = await activate_totp(db=db, user=user, totp_code=body.code)
    return BaseResponse(success=True, message=result["message"])


@router.post("/backup-codes/regenerate", response_model=DataResponse)
async def regenerate_codes(
    body: RegenerateBackupCodesRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    user = await get_user_from_payload(payload, db)
    result = await regenerate_backup_codes(db=db, user=user, totp_code=body.code)
    return DataResponse(
        success=True,
        message="Codigos de respaldo regenerados. Guardalos en un lugar seguro",
        data=result,
    )


@router.post("/deactivate", response_model=BaseResponse)
async def deactivate_2fa(
    body: DeactivateTOTPRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await deactivate_totp(db=db, user_id=body.user_id)
    return BaseResponse(
        success=True,
        message="2FA desactivado. El usuario debera configurarlo nuevamente en su proximo login",
    )


@router.get("/status", response_model=DataResponse)
async def get_2fa_status(
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.get_current_user()),
):
    user = await get_user_from_payload(payload, db)
    return DataResponse(
        success=True,
        message="Estado del 2FA obtenido",
        data={
            "is_2fa_configured": user.is_2fa_configured,
            "user_id": str(user.id),
        },
    )