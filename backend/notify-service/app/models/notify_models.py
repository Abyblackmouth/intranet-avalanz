from sqlalchemy import Column, String, Boolean, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid
from shared.models.base import BaseModel


class Notification(BaseModel):
    __tablename__ = "notifications"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), nullable=False, index=True)
    company_id      = Column(UUID(as_uuid=True), nullable=True, index=True)
    module_slug     = Column(String(100), nullable=True)
    type            = Column(String(100), nullable=False)
    title           = Column(String(255), nullable=False)
    body            = Column(Text, nullable=False)
    data            = Column(JSONB, nullable=True)
    is_read         = Column(Boolean, default=False, nullable=False)
    read_at         = Column(DateTime(timezone=True), nullable=True)