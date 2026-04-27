from sqlalchemy import Column, String, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase
import uuid

class Base(DeclarativeBase):
    pass

# Agrega tus modelos aquí
# class Boveda(Base):
#     __tablename__ = "bovedas"
#     id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
