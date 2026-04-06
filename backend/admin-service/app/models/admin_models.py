from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
import uuid

from shared.models.base import BaseModelWithSoftDelete, BaseModel


class Group(BaseModelWithSoftDelete):
    __tablename__ = "groups"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(255), unique=True, nullable=False)
    slug            = Column(String(255), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)


class Company(BaseModelWithSoftDelete):
    __tablename__ = "companies"

    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id         = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="RESTRICT"), nullable=False)
    nombre_comercial = Column(String(100), nullable=False)
    name             = Column(String(255), nullable=False)
    slug             = Column(String(255), unique=True, nullable=False, index=True)
    rfc              = Column(String(20), unique=True, nullable=True)
    description      = Column(Text, nullable=True)
    is_active        = Column(Boolean, default=True, nullable=False)
    # Domicilio fiscal
    calle            = Column(String(255), nullable=True)
    num_ext          = Column(String(20), nullable=True)
    num_int          = Column(String(20), nullable=True)
    colonia          = Column(String(150), nullable=True)
    cp               = Column(String(10), nullable=True)
    municipio        = Column(String(150), nullable=True)
    estado           = Column(String(100), nullable=True)
    # Vigencia de constancia SAT
    constancia_fecha_emision  = Column(String(50), nullable=True)
    constancia_fecha_vigencia = Column(String(50), nullable=True)


class User(BaseModelWithSoftDelete):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    full_name       = Column(String(255), nullable=False)
    matricula       = Column(String(50), unique=True, nullable=True, index=True)
    puesto          = Column(String(150), nullable=True)
    departamento    = Column(String(150), nullable=True)
    lock_reason     = Column(String(255), nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    is_super_admin  = Column(Boolean, default=False, nullable=False)


class GlobalRole(BaseModelWithSoftDelete):
    __tablename__ = "global_roles"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name        = Column(String(100), unique=True, nullable=False)
    slug        = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)


class GlobalPermission(BaseModel):
    __tablename__ = "global_permissions"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name        = Column(String(100), unique=True, nullable=False)
    slug        = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    category    = Column(String(100), nullable=True)


class Module(BaseModelWithSoftDelete):
    __tablename__ = "modules"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id  = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    name        = Column(String(255), nullable=False)
    slug        = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon        = Column(String(100), nullable=True)
    order       = Column(Integer, default=0, nullable=False)
    is_active   = Column(Boolean, default=True, nullable=False)


class Submodule(BaseModelWithSoftDelete):
    __tablename__ = "submodules"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id   = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False)
    name        = Column(String(255), nullable=False)
    slug        = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    icon        = Column(String(100), nullable=True)
    order       = Column(Integer, default=0, nullable=False)
    is_active   = Column(Boolean, default=True, nullable=False)


class ModuleRole(BaseModelWithSoftDelete):
    __tablename__ = "module_roles"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id   = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="RESTRICT"), nullable=False)
    name        = Column(String(100), nullable=False)
    slug        = Column(String(100), nullable=False, index=True)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)


class SubmodulePermission(BaseModel):
    __tablename__ = "submodule_permissions"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submodule_id = Column(UUID(as_uuid=True), ForeignKey("submodules.id", ondelete="RESTRICT"), nullable=False)
    name         = Column(String(100), nullable=False)
    slug         = Column(String(100), nullable=False, index=True)
    description  = Column(Text, nullable=True)


class UserGlobalRole(BaseModel):
    __tablename__ = "user_global_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    id      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(UUID(as_uuid=True), ForeignKey("global_roles.id", ondelete="CASCADE"), nullable=False)


class UserModuleAccess(BaseModel):
    __tablename__ = "user_module_accesses"
    __table_args__ = (UniqueConstraint("user_id", "module_id"),)

    id        = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id   = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    role_id   = Column(UUID(as_uuid=True), ForeignKey("module_roles.id", ondelete="RESTRICT"), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)


class GlobalRolePermission(BaseModel):
    __tablename__ = "global_role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id       = Column(UUID(as_uuid=True), ForeignKey("global_roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(UUID(as_uuid=True), ForeignKey("global_permissions.id", ondelete="CASCADE"), nullable=False)


class ModuleRolePermission(BaseModel):
    __tablename__ = "module_role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)

    id            = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id       = Column(UUID(as_uuid=True), ForeignKey("module_roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(UUID(as_uuid=True), ForeignKey("submodule_permissions.id", ondelete="CASCADE"), nullable=False)
