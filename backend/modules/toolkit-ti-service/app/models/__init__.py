import uuid

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class PluginEstado(Base):
    """Si un plugin esta activo. Los plugins sin fila aqui se consideran activos."""
    __tablename__ = "plugin_estado"

    slug = Column(String(100), primary_key=True)
    activo = Column(Boolean, nullable=False, default=True)
    actualizado_por = Column(String(200), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class PluginEjecucion(Base):
    """Cada vez que corre un plugin: parametros, registro, resultado y duracion."""
    __tablename__ = "plugin_ejecuciones"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug = Column(String(100), nullable=False, index=True)
    estado = Column(String(20), nullable=False, default="en_proceso")   # en_proceso | ok | error
    parametros = Column(JSONB, nullable=False, default=dict)
    archivos_entrada = Column(JSONB, nullable=False, default=list)      # [{nombre, object_key, bucket, size_bytes}]
    archivos_salida = Column(JSONB, nullable=False, default=list)
    log = Column(Text, nullable=False, default="")
    error = Column(Text, nullable=True)
    iniciado_por_id = Column(UUID(as_uuid=True), nullable=True)
    iniciado_por = Column(String(200), nullable=True)
    origen = Column(String(20), nullable=False, default="manual")       # manual | programado | correo
    iniciado_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())
    terminado_at = Column(DateTime(timezone=True), nullable=True)
    duracion_ms = Column(Integer, nullable=True)
