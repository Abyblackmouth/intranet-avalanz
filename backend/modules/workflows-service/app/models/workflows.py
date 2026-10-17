"""Modelos del workflows-service. Base propia avalanz_workflows.

Reglas de la plataforma: UUID como texto, sin llaves foraneas hacia otras
bases (company_id y user_id se guardan como UUID y se consultan al servicio
dueno), snapshot del actor en todo lo que se registra, estatus como varchar
validado en codigo (no ENUM de Postgres) e indices desde el inicio.
Detalle en docs/modules/workflows/contexto-workflows.md, seccion 8.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint, BigInteger, func, text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import declarative_base

Base = declarative_base()

# Actor reservado para las acciones automaticas (motor, bandeja de salida).
SYSTEM_ACTOR_ID = "00000000-0000-0000-0000-000000000000"


def gen_uuid() -> str:
    return str(uuid.uuid4())


def ahora() -> datetime:
    return datetime.now(timezone.utc)


# ───────────────────────────────────────────────────────────────────────────
# Configuracion (Ajustes y Flujos)
# ───────────────────────────────────────────────────────────────────────────

class Conexion(Base):
    """Una plataforma conectada (TOTVS, Odoo...). La tarjeta de Ajustes → Conexiones."""
    __tablename__ = "conexiones"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    slug = Column(String(50), nullable=False, unique=True)            # "totvs"; viaja en el sobre como platform
    titulo = Column(String(150), nullable=False)
    url_base = Column(String(500), nullable=False, default="")
    auth_tipo = Column(String(20), nullable=False, default="ninguna")  # ninguna | basica | token
    auth_usuario = Column(String(150), nullable=True)
    auth_secreto = Column(Text, nullable=True)                         # cifrado con Fernet; nunca se regresa
    token_entrada = Column(Text, nullable=False)                       # cifrado; lo manda la plataforma en X-WF-Token
    timeout_seg = Column(Integer, nullable=False, default=20)
    reintentos_max = Column(Integer, nullable=False, default=5)
    espaciado_min = Column(JSONB, nullable=False, default=list)       # [1, 5, 15, 60, 240]
    activa = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class ConexionEmpresa(Base):
    """Empresas de la plataforma: clave grupo|empresa tal como la manda, y su nombre.
    company_id de la Intranet es opcional: solo para scope y ruta en MinIO."""
    __tablename__ = "conexion_empresas"
    __table_args__ = (UniqueConstraint("conexion_id", "clave", name="uq_conexion_empresas_clave"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="CASCADE"), nullable=False, index=True)
    clave = Column(String(20), nullable=False)                         # "02|01"
    nombre = Column(String(255), nullable=False, default="")
    company_id = Column(UUID(as_uuid=False), nullable=True)
    activa = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)


class ConexionUsuario(Base):
    """Mapa de identidades: id de usuario de la plataforma ↔ usuario de la Intranet.
    Se llena solo al llegar un sobre con correo; lo que no empate queda por ligar."""
    __tablename__ = "conexion_usuarios"
    __table_args__ = (UniqueConstraint("conexion_id", "id_externo", name="uq_conexion_usuarios_id_externo"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="CASCADE"), nullable=False, index=True)
    id_externo = Column(String(50), nullable=False)                    # "000012"
    login_externo = Column(String(150), nullable=True)
    email = Column(String(255), nullable=True)
    nombre = Column(String(255), nullable=False, default="")
    user_id = Column(UUID(as_uuid=False), nullable=True, index=True)   # null = pendiente de ligar
    ultima_vez = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class Flujo(Base):
    """Definicion de un flujo: con que processId llega y que servicio recibe el resultado."""
    __tablename__ = "flujos"
    __table_args__ = (UniqueConstraint("conexion_id", "process_id", name="uq_flujos_conexion_process"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="RESTRICT"), nullable=False, index=True)
    process_id = Column(String(100), nullable=False)                   # "CompraDirecta"
    aliases = Column(JSONB, nullable=False, default=list)              # nombres anteriores que se siguen aceptando
    nombre = Column(String(150), nullable=False)
    descripcion = Column(Text, nullable=True)
    result_service = Column(String(100), nullable=False, default="")  # "WFM110RESULT"
    activo = Column(Boolean, nullable=False, default=True)
    version = Column(Integer, nullable=False, default=1)
    correos = Column(JSONB, nullable=True)                             # null = hereda los ajustes del modulo
    # Que campos de cardData son el "resumen" del flujo (tabla, correo y detalle) y cual es el numero de documento visible:
    # {"numero": "numerosolicitud" | "folio", "campos": [{"clave": "total", "etiqueta": "Total", "tipo": "moneda"}, ...]}
    resumen = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class FlujoVersion(Base):
    """Cada guardado en Flujos crea una version; las instancias recuerdan con cual nacieron."""
    __tablename__ = "flujo_versiones"
    __table_args__ = (UniqueConstraint("flujo_id", "numero", name="uq_flujo_versiones_numero"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    flujo_id = Column(UUID(as_uuid=False), ForeignKey("flujos.id", ondelete="CASCADE"), nullable=False, index=True)
    numero = Column(Integer, nullable=False)
    vigente = Column(Boolean, nullable=False, default=True)
    definicion = Column(JSONB, nullable=False, default=dict)          # copia completa de grupos y etapas
    creada_por = Column(UUID(as_uuid=False), nullable=True)
    creada_por_nombre = Column(String(255), nullable=False, default="")
    creada_en = Column(DateTime(timezone=True), nullable=False, default=ahora)


class FlujoGrupo(Base):
    """Grupo de aprobacion: un grupo = una cascada. Por flujo y por empresa de la plataforma."""
    __tablename__ = "flujo_grupos"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    flujo_id = Column(UUID(as_uuid=False), ForeignKey("flujos.id", ondelete="CASCADE"), nullable=False, index=True)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="RESTRICT"), nullable=False)
    origen_clave = Column(String(20), nullable=False, index=True)     # "02|01"
    nombre = Column(String(150), nullable=False)
    es_default = Column(Boolean, nullable=False, default=False)
    auto_aprobacion = Column(String(10), nullable=False, default="omitir")  # omitir | subir
    activo = Column(Boolean, nullable=False, default=True)
    orden = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class FlujoGrupoMiembro(Base):
    """Solicitantes que caen en este grupo (quien no sea miembro de ninguno va al default)."""
    __tablename__ = "flujo_grupo_miembros"
    __table_args__ = (UniqueConstraint("grupo_id", "user_id", name="uq_flujo_grupo_miembros_user"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    grupo_id = Column(UUID(as_uuid=False), ForeignKey("flujo_grupos.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), nullable=True, index=True)
    login_externo = Column(String(150), nullable=True)                # por si aun no esta ligado
    nombre = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)


class FlujoGrupoEtapa(Base):
    """Una parada de la cascada. El aprobador es una persona; tipo_resolucion queda para crecer."""
    __tablename__ = "flujo_grupo_etapas"
    __table_args__ = (UniqueConstraint("grupo_id", "orden", name="uq_flujo_grupo_etapas_orden"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    grupo_id = Column(UUID(as_uuid=False), ForeignKey("flujo_grupos.id", ondelete="CASCADE"), nullable=False, index=True)
    orden = Column(Integer, nullable=False)
    nombre = Column(String(150), nullable=False)
    tipo = Column(String(20), nullable=False, default="aprobacion")   # aprobacion | notificacion | revision
    puesto_esperado = Column(String(150), nullable=True)              # informativo por ahora
    tipo_resolucion = Column(String(20), nullable=False, default="persona")  # persona (futuro: rol, jefe_directo)
    aprobador_user_id = Column(UUID(as_uuid=False), nullable=True, index=True)
    aprobador_nombre = Column(String(255), nullable=False, default="")
    aprobador_email = Column(String(255), nullable=True)
    suplente_user_id = Column(UUID(as_uuid=False), nullable=True)
    suplente_nombre = Column(String(255), nullable=True)
    suplente_email = Column(String(255), nullable=True)
    condicion = Column(String(255), nullable=True)                    # "total > 100000" sobre cardData
    comentario_rechazo_obligatorio = Column(Boolean, nullable=False, default=True)
    permite_adjuntos = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class Ajuste(Base):
    """Clave/valor del modulo. Mismo patron que incidencias_settings del IT Service Desk."""
    __tablename__ = "ajustes"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(String(255), nullable=False)
    updated_by = Column(UUID(as_uuid=False), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class AjusteHistorial(Base):
    """Quien cambio que y cuando en Ajustes. Los secretos nunca se guardan aqui."""
    __tablename__ = "ajustes_historial"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    key = Column(String(100), nullable=False, index=True)
    valor_anterior = Column(Text, nullable=True)
    valor_nuevo = Column(Text, nullable=False)
    usuario_id = Column(UUID(as_uuid=False), nullable=True)
    usuario_nombre = Column(String(255), nullable=False, server_default="")
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FolioCounter(Base):
    """Consecutivo atomico por prefijo y familia: SELECT ... FOR UPDATE al generar un folio."""
    __tablename__ = "folio_counters"
    __table_args__ = (UniqueConstraint("prefix", "family_clave", name="uq_folio_counters_prefix_family"),)

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    prefix = Column(String(5), nullable=False)
    family_clave = Column(String(4), nullable=False)
    last_number = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


# ───────────────────────────────────────────────────────────────────────────
# Ejecucion (cada envio)
# ───────────────────────────────────────────────────────────────────────────

class Instancia(Base):
    """Un tramite: una solicitud concreta que llego de la plataforma y recorre su cascada."""
    __tablename__ = "instancias"
    __table_args__ = (
        Index("ix_instancias_status", "status"),
        Index("ix_instancias_flujo", "flujo_id"),
        Index("ix_instancias_origen", "origen_clave"),
        Index("ix_instancias_external_key", "external_key"),
        Index("ix_instancias_requester_user", "requester_user_id"),
        # Idempotencia: solo una instancia ABIERTA por documento de la plataforma.
        Index("uq_instancias_abierta", "conexion_id", "external_key", unique=True,
              postgresql_where=text("status = 'en_aprobacion'")),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    folio = Column(String(20), nullable=False, unique=True)
    flujo_id = Column(UUID(as_uuid=False), ForeignKey("flujos.id", ondelete="RESTRICT"), nullable=False)
    version_id = Column(UUID(as_uuid=False), ForeignKey("flujo_versiones.id", ondelete="SET NULL"), nullable=True)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="RESTRICT"), nullable=False)
    grupo_id = Column(UUID(as_uuid=False), ForeignKey("flujo_grupos.id", ondelete="SET NULL"), nullable=True)
    grupo_nombre = Column(String(150), nullable=False, default="")

    # Lo que vino en el sobre (se regresa intacto)
    process_id = Column(String(100), nullable=False)
    result_service = Column(String(100), nullable=False, default="")
    external_key = Column(String(150), nullable=False)
    company_group = Column(String(10), nullable=False)
    tenant_id = Column(String(10), nullable=False)
    company_name = Column(String(255), nullable=False, default="")
    origen_clave = Column(String(20), nullable=False)                 # company_group|tenant_id[:2]
    company_id = Column(UUID(as_uuid=False), nullable=True)
    requester_id_externo = Column(String(50), nullable=False)
    requester_login = Column(String(150), nullable=True)
    requester_user_id = Column(UUID(as_uuid=False), nullable=True)
    requester_nombre = Column(String(255), nullable=False, default="")
    requester_email = Column(String(255), nullable=True)
    card_data = Column(JSONB, nullable=False, default=dict)
    definicion = Column(JSONB, nullable=False, default=dict)          # snapshot de la cascada al nacer

    # Estado
    status = Column(String(30), nullable=False, default="en_aprobacion")
    etapa_actual = Column(Integer, nullable=True)
    approved = Column(Boolean, nullable=True)
    decidida_en = Column(DateTime(timezone=True), nullable=True)
    afectacion = Column(String(20), nullable=True)                    # pendiente | aplicada | fallida
    afectada_en = Column(DateTime(timezone=True), nullable=True)
    mensaje_plataforma = Column(Text, nullable=True)
    sustituida_por_id = Column(UUID(as_uuid=False), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class InstanciaEtapa(Base):
    """Una etapa del tramite. Columnas planas, listas para copiarse a una ZW2 del ERP."""
    __tablename__ = "instancia_etapas"
    __table_args__ = (
        UniqueConstraint("instancia_id", "orden", name="uq_instancia_etapas_orden"),
        Index("ix_instancia_etapas_aprobador_status", "aprobador_user_id", "status"),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=False, index=True)
    orden = Column(Integer, nullable=False)
    nombre = Column(String(150), nullable=False)
    tipo = Column(String(20), nullable=False, default="aprobacion")
    puesto_esperado = Column(String(150), nullable=True)
    condicion = Column(String(255), nullable=True)
    aprobador_user_id = Column(UUID(as_uuid=False), nullable=True)
    aprobador_id_externo = Column(String(50), nullable=True)
    aprobador_nombre = Column(String(255), nullable=False, default="")
    aprobador_email = Column(String(255), nullable=True)
    suplente_user_id = Column(UUID(as_uuid=False), nullable=True)
    suplente_nombre = Column(String(255), nullable=True)
    suplente_email = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="pendiente")  # pendiente | en_turno | aprobada | rechazada | omitida | no_alcanzada | reasignada
    nota = Column(Text, nullable=True)                                # por que se omitio, etc.
    decidio_user_id = Column(UUID(as_uuid=False), nullable=True)
    decidio_id_externo = Column(String(50), nullable=True)
    decidio_nombre = Column(String(255), nullable=True)
    decidio_email = Column(String(255), nullable=True)
    decidio_en = Column(DateTime(timezone=True), nullable=True)
    comentario = Column(Text, nullable=True)
    en_turno_desde = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)


class InstanciaArchivo(Base):
    """Archivos del tramite en MinIO: los del sobre, los de los aprobadores, el acta y la salida."""
    __tablename__ = "instancia_archivos"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=False, index=True)
    etapa_id = Column(UUID(as_uuid=False), ForeignKey("instancia_etapas.id", ondelete="SET NULL"), nullable=True)
    tipo = Column(String(30), nullable=False, default="entrada")      # entrada | adjunto_aprobador | acta | salida
    original_name = Column(String(255), nullable=False)
    object_key = Column(String(500), nullable=False)
    bucket = Column(String(100), nullable=False, default="dirdoc")
    mime_type = Column(String(100), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)
    sha256 = Column(String(64), nullable=True)
    uploaded_by = Column(UUID(as_uuid=False), nullable=True)
    uploaded_by_name = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime(timezone=True), nullable=False, default=ahora)


class AprobacionToken(Base):
    """Liga personal de un solo uso para decidir desde el correo sin iniciar sesion."""
    __tablename__ = "aprobacion_tokens"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    token = Column(String(128), nullable=False, unique=True)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=False, index=True)
    etapa_id = Column(UUID(as_uuid=False), ForeignKey("instancia_etapas.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=False), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    invalidado_en = Column(DateTime(timezone=True), nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)


# ───────────────────────────────────────────────────────────────────────────
# Trazabilidad y resiliencia
# ───────────────────────────────────────────────────────────────────────────

class Transaccion(Base):
    """Cada mensaje de ida o regreso con la plataforma. La bandeja de salida vive aqui."""
    __tablename__ = "transacciones"
    __table_args__ = (
        Index("ix_transacciones_estado_proximo", "estado", "proximo_intento"),
        Index("ix_transacciones_instancia", "instancia_id"),
    )

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=True)
    conexion_id = Column(UUID(as_uuid=False), ForeignKey("conexiones.id", ondelete="RESTRICT"), nullable=False)
    flujo_id = Column(UUID(as_uuid=False), nullable=True)
    direccion = Column(String(10), nullable=False)                    # entrada | salida
    tipo = Column(String(20), nullable=False)                         # envio | resultado
    estado = Column(String(20), nullable=False)                       # recibido | pendiente_envio | enviado | error | abandonado
    intento = Column(Integer, nullable=False, default=0)
    proximo_intento = Column(DateTime(timezone=True), nullable=True)
    payload = Column(JSONB, nullable=False, default=dict)
    respuesta_status = Column(Integer, nullable=True)
    respuesta_body = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=ahora, onupdate=ahora)


class CorreoEnviado(Base):
    """Registro de cada correo que manda el motor (para el "no me llego")."""
    __tablename__ = "correos_enviados"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=False, index=True)
    etapa_id = Column(UUID(as_uuid=False), nullable=True)
    plantilla = Column(String(50), nullable=False)
    destinatario_email = Column(String(255), nullable=False)
    destinatario_user_id = Column(UUID(as_uuid=False), nullable=True)
    destinatario_nombre = Column(String(255), nullable=True)
    enviado_en = Column(DateTime(timezone=True), nullable=False, default=ahora)
    resultado = Column(String(255), nullable=False, default="")
    reenvio_de_id = Column(UUID(as_uuid=False), nullable=True)
    enviado_por = Column(UUID(as_uuid=False), nullable=False, default=SYSTEM_ACTOR_ID)
    enviado_por_nombre = Column(String(255), nullable=False, default="Sistema")


class Bitacora(Base):
    """Bitacora del tramite con snapshot del actor. Mismo patron que incident_activity_log."""
    __tablename__ = "bitacora"

    id = Column(UUID(as_uuid=False), primary_key=True, default=gen_uuid)
    instancia_id = Column(UUID(as_uuid=False), ForeignKey("instancias.id", ondelete="CASCADE"), nullable=False, index=True)
    accion = Column(String(50), nullable=False)
    performed_by = Column(UUID(as_uuid=False), nullable=False, default=SYSTEM_ACTOR_ID)
    performed_by_name = Column(String(255), nullable=False, default="Sistema")
    performed_by_role = Column(String(100), nullable=False, default="sistema")
    performed_at = Column(DateTime(timezone=True), nullable=False, default=ahora)
    ip_address = Column(String(45), nullable=True)
    detail = Column(JSONB, nullable=True)
