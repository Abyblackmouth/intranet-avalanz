# ----------------------------------------------------------------------
# Importaciones
# Motor y sesiones asincronas de SQLAlchemy para PostgreSQL con pgvector.
# ----------------------------------------------------------------------
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings


# ----------------------------------------------------------------------
# Motor de base de datos
# pool_pre_ping verifica cada conexion antes de usarla, asi el servicio
# se recupera solo si la base se reinicia. El pool es pequeno a proposito
# para cuidar la RAM del servidor.
# ----------------------------------------------------------------------
engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=5,
)


# ----------------------------------------------------------------------
# Fabrica de sesiones
# expire_on_commit=False conserva los datos del objeto despues del commit,
# para poder usarlos sin una consulta adicional.
# ----------------------------------------------------------------------
SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


# ----------------------------------------------------------------------
# Dependencia de FastAPI
# Entrega una sesion por peticion y la cierra al terminar, aunque ocurra
# un error.
# ----------------------------------------------------------------------
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session
