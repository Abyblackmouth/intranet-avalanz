import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# Agregar el path del proyecto para importar los modelos
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.admin_models import (
    Group, Company, User, GlobalRole, GlobalPermission,
    Module, Submodule, ModuleRole, SubmodulePermission,
    UserGlobalRole, UserModuleAccess, GlobalRolePermission, ModuleRolePermission
)
from shared.models.base import Base

# Alembic Config
config = context.config

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata de los modelos para autogenerate
target_metadata = Base.metadata

# Leer la URL de la BD desde variables de entorno
def get_url():
    host     = os.getenv("DB_HOST", "localhost")
    port     = os.getenv("DB_PORT", "5432")
    name     = os.getenv("DB_NAME", "avalanz_admin")
    user     = os.getenv("DB_USER", "avalanz_user")
    password = os.getenv("DB_PASSWORD", "changeme")
    return f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{name}"


def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section, {})
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()