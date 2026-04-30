from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase
import uuid

class Base(DeclarativeBase):
    pass

# Agrega tus modelos aquí
# class Legal(Base):
#     __tablename__ = "legals"
#     id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
