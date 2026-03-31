import pyotp
import qrcode
import qrcode.image.svg
import io
import json
import base64
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import config
from app.models.auth_models import User, UserTOTP
from shared.utils.encryption import generate_secure_token, hash_sha256, encrypt_data, decrypt_data
from shared.utils.helpers import now_utc
from shared.exceptions.http_exceptions import (
    NotFoundException,
    ValidationException,
    ForbiddenException,
)


# ── Generacion del secreto TOTP y QR ─────────────────────────────────────────

async def generate_totp_setup(db: AsyncSession, user: User) -> Dict[str, Any]:

    # Generar nuevo secreto TOTP
    secret = pyotp.random_base32()

    # Generar codigos de respaldo
    backup_codes = _generate_backup_codes()
    backup_codes_hashed = [hash_sha256(code) for code in backup_codes]

    # Guardar o actualizar configuracion TOTP del usuario (sin activar aun)
    result = await db.execute(
        select(UserTOTP).where(UserTOTP.user_id == user.id)
    )
    existing = result.scalar_one_or_none()

    encrypted_secret = encrypt_data(secret, config.JWT_SECRET_KEY[:32])

    if existing:
        await db.execute(
            update(UserTOTP).where(UserTOTP.user_id == user.id).values(
                secret=encrypted_secret,
                is_active=False,
                activated_at=None,
                backup_codes=json.dumps(backup_codes_hashed),
            )
        )
    else:
        db.add(UserTOTP(
            user_id=user.id,
            secret=encrypted_secret,
            is_active=False,
            backup_codes=json.dumps(backup_codes_hashed),
        ))

    await db.commit()

    # Generar URI para QR
    totp = pyotp.TOTP(
        secret,
        issuer=config.TOTP_ISSUER,
        digits=config.TOTP_DIGITS,
        interval=config.TOTP_INTERVAL,
    )
    provisioning_uri = totp.provisioning_uri(name=user.email, issuer_name=config.TOTP_ISSUER)

    # Generar imagen QR en SVG
    qr_svg = _generate_qr_svg(provisioning_uri)

    return {
        "qr_code_svg": qr_svg,
        "secret": secret,
        "backup_codes": backup_codes,
        "issuer": config.TOTP_ISSUER,
        "account": user.email,
    }


# ── Activacion del 2FA (confirmacion con primer codigo) ───────────────────────

async def activate_totp(db: AsyncSession, user: User, totp_code: str) -> Dict[str, Any]:

    result = await db.execute(
        select(UserTOTP).where(UserTOTP.user_id == user.id)
    )
    totp_config = result.scalar_one_or_none()

    if not totp_config:
        raise NotFoundException("Configuracion TOTP")

    if totp_config.is_active:
        raise ValidationException("El 2FA ya esta activado para este usuario")

    secret = decrypt_data(totp_config.secret, config.JWT_SECRET_KEY[:32])
    if not secret:
        raise ValidationException("Error al recuperar configuracion TOTP")

    totp = pyotp.TOTP(
        secret,
        digits=config.TOTP_DIGITS,
        interval=config.TOTP_INTERVAL,
    )

    if not totp.verify(totp_code, valid_window=1):
        raise ValidationException("Codigo TOTP invalido, verifica tu autenticador")

    # Activar 2FA
    await db.execute(
        update(UserTOTP).where(UserTOTP.user_id == user.id).values(
            is_active=True,
            activated_at=now_utc(),
        )
    )
    await db.execute(
        update(User).where(User.id == user.id).values(
            is_2fa_configured=True,
        )
    )
    await db.commit()

    return {"message": "2FA activado exitosamente"}


# ── Verificacion del codigo TOTP en login ─────────────────────────────────────

async def verify_totp_code(db: AsyncSession, user: User, totp_code: str) -> bool:

    result = await db.execute(
        select(UserTOTP).where(UserTOTP.user_id == user.id, UserTOTP.is_active == True)
    )
    totp_config = result.scalar_one_or_none()

    if not totp_config:
        return False

    secret = decrypt_data(totp_config.secret, config.JWT_SECRET_KEY[:32])
    if not secret:
        return False

    totp = pyotp.TOTP(
        secret,
        digits=config.TOTP_DIGITS,
        interval=config.TOTP_INTERVAL,
    )

    # valid_window=1 permite un codigo anterior y uno posterior por desfase de reloj
    if totp.verify(totp_code, valid_window=1):
        return True

    # Verificar si es un codigo de respaldo
    return await _verify_backup_code(db, totp_config, totp_code)


# ── Regeneracion de codigos de respaldo ───────────────────────────────────────

async def regenerate_backup_codes(db: AsyncSession, user: User, totp_code: str) -> Dict[str, Any]:

    valid = await verify_totp_code(db, user, totp_code)
    if not valid:
        raise ValidationException("Codigo TOTP invalido")

    backup_codes = _generate_backup_codes()
    backup_codes_hashed = [hash_sha256(code) for code in backup_codes]

    await db.execute(
        update(UserTOTP).where(UserTOTP.user_id == user.id).values(
            backup_codes=json.dumps(backup_codes_hashed),
        )
    )
    await db.commit()

    return {"backup_codes": backup_codes}


# ── Desactivar 2FA (solo admin) ───────────────────────────────────────────────

async def deactivate_totp(db: AsyncSession, user_id: str) -> None:

    await db.execute(
        update(UserTOTP).where(UserTOTP.user_id == user_id).values(
            is_active=False,
            activated_at=None,
        )
    )
    await db.execute(
        update(User).where(User.id == user_id).values(
            is_2fa_configured=False,
        )
    )
    await db.commit()


# ── Helpers internos ──────────────────────────────────────────────────────────

def _generate_backup_codes(count: int = 8) -> List[str]:
    # Genera codigos de respaldo en formato XXXX-XXXX
    codes = []
    for _ in range(count):
        token = generate_secure_token(4)
        code = f"{token[:4].upper()}-{token[4:8].upper()}"
        codes.append(code)
    return codes


async def _verify_backup_code(
    db: AsyncSession,
    totp_config: UserTOTP,
    code: str,
) -> bool:
    if not totp_config.backup_codes:
        return False

    stored_hashes = json.loads(totp_config.backup_codes)
    code_hash = hash_sha256(code.upper())

    if code_hash not in stored_hashes:
        return False

    # Eliminar el codigo usado para que no pueda reutilizarse
    stored_hashes.remove(code_hash)
    await db.execute(
        update(UserTOTP).where(UserTOTP.id == totp_config.id).values(
            backup_codes=json.dumps(stored_hashes),
        )
    )
    await db.commit()
    return True


def _generate_qr_svg(provisioning_uri: str) -> str:
    factory = qrcode.image.svg.SvgImage
    qr = qrcode.make(provisioning_uri, image_factory=factory)
    buffer = io.BytesIO()
    qr.save(buffer)
    return buffer.getvalue().decode("utf-8")