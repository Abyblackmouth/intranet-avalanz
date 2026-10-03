# ----------------------------------------------------------------------
# Entorno de migraciones
# Las migraciones corren con el driver sincrono psycopg2; la URL se toma
# de la configuracion del servicio cambiando el driver asincrono.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from alembic import context
from sqlalchemy import create_engine, pool

from app.config import settings


# ----------------------------------------------------------------------
# URL sincrona a partir de la del servicio (asyncpg -> psycopg2)
# ----------------------------------------------------------------------
def sync_url() -> str:
    return settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")


# ----------------------------------------------------------------------
# Ejecucion de las migraciones contra la base
# Las migraciones usan SQL explicito, sin metadatos de modelos.
# ----------------------------------------------------------------------
def run_migrations() -> None:
    engine = create_engine(sync_url(), poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=None)
        with context.begin_transaction():
            context.run_migrations()


run_migrations()
