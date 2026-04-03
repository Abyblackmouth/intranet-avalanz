from sqlalchemy import Column, String, Boolean, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from shared.models.base import BaseModel, BaseModelWithSoftDelete


# ── Usuarios ──────────────────────────────────────────────────────────────────

class User(BaseModelWithSoftDelete):
    __tablename__ = "users"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email                   = Column(String(255), unique=True, nullable=False, index=True)
    full_name               = Column(String(255), nullable=False)
    hashed_password         = Column(String(255), nullable=False)
    is_active               = Column(Boolean, default=True, nullable=False)
    is_temp_password        = Column(Boolean, default=True, nullable=False)
    temp_password_expires_at= Column(DateTime(timezone=True), nullable=True)
    is_2fa_configured       = Column(Boolean, default=False, nullable=False)
    failed_attempts         = Column(Integer, default=0, nullable=False)
    is_locked               = Column(Boolean, default=False, nullable=False)
    locked_at               = Column(DateTime(timezone=True), nullable=True)
    lock_type               = Column(String(20), nullable=True)  # manual | failed_attempts
    last_login_at           = Column(DateTime(timezone=True), nullable=True)
    last_login_ip           = Column(String(45), nullable=True)

    # Relaciones
    totp_config             = relationship("UserTOTP", back_populates="user", uselist=False)
    sessions                = relationship("UserSession", back_populates="user")
    password_resets         = relationship("PasswordReset", back_populates="user")
    login_history           = relationship("LoginHistory", back_populates="user")


# ── Configuracion TOTP ────────────────────────────────────────────────────────

class UserTOTP(BaseModel):
    __tablename__ = "user_totp"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                 = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    secret                  = Column(String(255), nullable=False)
    is_active               = Column(Boolean, default=False, nullable=False)
    activated_at            = Column(DateTime(timezone=True), nullable=True)
    backup_codes            = Column(Text, nullable=True)

    # Relaciones
    user                    = relationship("User", back_populates="totp_config")


# ── Sesiones activas ──────────────────────────────────────────────────────────

class UserSession(BaseModel):
    __tablename__ = "user_sessions"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                 = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash      = Column(String(255), nullable=False, unique=True)
    ip_address              = Column(String(45), nullable=True)
    user_agent              = Column(String(500), nullable=True)
    is_corporate_network    = Column(Boolean, default=False, nullable=False)
    session_started_at      = Column(DateTime(timezone=True), nullable=False)
    last_activity_at        = Column(DateTime(timezone=True), nullable=False)
    expires_at              = Column(DateTime(timezone=True), nullable=False)
    is_revoked              = Column(Boolean, default=False, nullable=False)
    revoked_at              = Column(DateTime(timezone=True), nullable=True)
    revoked_reason          = Column(String(255), nullable=True)

    # Relaciones
    user                    = relationship("User", back_populates="sessions")


# ── Recuperacion de contrasena ────────────────────────────────────────────────

class PasswordReset(BaseModel):
    __tablename__ = "password_resets"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                 = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash              = Column(String(255), nullable=False, unique=True)
    expires_at              = Column(DateTime(timezone=True), nullable=False)
    is_used                 = Column(Boolean, default=False, nullable=False)
    used_at                 = Column(DateTime(timezone=True), nullable=True)
    requested_from_ip       = Column(String(45), nullable=True)

    # Relaciones
    user                    = relationship("User", back_populates="password_resets")


# ── Historial de login ────────────────────────────────────────────────────────

class LoginHistory(BaseModel):
    __tablename__ = "login_history"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                 = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    ip_address              = Column(String(45), nullable=True)
    user_agent              = Column(String(500), nullable=True)
    is_corporate_network    = Column(Boolean, default=False, nullable=False)
    success                 = Column(Boolean, nullable=False)
    failure_reason          = Column(String(255), nullable=True)
    requires_2fa            = Column(Boolean, default=False, nullable=False)
    completed_2fa           = Column(Boolean, default=False, nullable=False)

    # Relaciones
    user                    = relationship("User", back_populates="login_history")