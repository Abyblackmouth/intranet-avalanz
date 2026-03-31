from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import NullPool
from typing import AsyncGenerator

from app.config import config
from shared.models.base import Base

# ── Motor de base de datos ────────────────────────────────────────────────────

engine = create_async_engine(
    config.DATABASE_URL,
    echo=config.DEBUG,
    poolclass=NullPool if config.ENV == "testing" else None,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

# ── Fabrica de sesiones ───────────────────────────────────────────────────────

AsyncSessionFactory = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

# ── Dependencia para las rutas ────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionFactory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Inicializacion de tablas ──────────────────────────────────────────────────

async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


# ── Cierre del motor al apagar el servicio ────────────────────────────────────

async def close_db() -> None:
    await engine.dispose()