from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy import Column, DateTime, Boolean, func
from datetime import datetime
from typing import Optional


class Base(DeclarativeBase):
    __abstract__ = True


class TimestampMixin:
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SoftDeleteMixin:
    is_deleted = Column(Boolean, default=False, nullable=False)
    deleted_at = Column(DateTime(timezone=True), nullable=True)


class BaseModel(TimestampMixin, Base):
    __abstract__ = True

    @declared_attr.directive
    def __tablename__(cls) -> str:
        return cls.__name__.lower()


class BaseModelWithSoftDelete(TimestampMixin, SoftDeleteMixin, Base):
    __abstract__ = True

    @declared_attr.directive
    def __tablename__(cls) -> str:
        return cls.__name__.lower()
