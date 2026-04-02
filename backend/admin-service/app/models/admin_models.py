from sqlalchemy import Column, String, Boolean, ForeignKey, Text, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from shared.models.base import BaseModel, BaseModelWithSoftDelete

class Group(BaseModelWithSoftDelete):
    __tablename__ = "groups"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(255), unique=True, nullable=False)
    slug            = Column(String(255), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    companies       = relationship("Company", back_populates="group")

class Company(BaseModelWithSoftDelete):
    __tablename__ = "companies"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id        = Column(UUID(as_uuid=True), ForeignKey("groups.id", ondelete="RESTRICT"), nullable=False)
    nombre_comercial= Column(String(100), nullable=False)
    name            = Column(String(255), nullable=False)
    slug            = Column(String(255), unique=True, nullable=False, index=True)
    rfc             = Column(String(20), unique=True, nullable=True)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    group           = relationship("Group", back_populates="companies")
    users           = relationship("User", back_populates="company")
    modules         = relationship("Module", back_populates="company")

class User(BaseModelWithSoftDelete):
    __tablename__ = "users"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    email           = Column(String(255), unique=True, nullable=False, index=True)
    full_name       = Column(String(255), nullable=False)
    matricula       = Column(String(50), unique=True, nullable=True, index=True)
    puesto          = Column(String(150), nullable=True)
    departamento    = Column(String(150), nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    is_super_admin  = Column(Boolean, default=False, nullable=False)
    company         = relationship("Company", back_populates="users")
    global_roles    = relationship("UserGlobalRole", back_populates="user")
    module_accesses = relationship("UserModuleAccess", back_populates="user")

class GlobalRole(BaseModelWithSoftDelete):
    __tablename__ = "global_roles"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(100), unique=True, nullable=False)
    slug            = Column(String(100), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    users           = relationship("UserGlobalRole", back_populates="role")
    permissions     = relationship("GlobalRolePermission", back_populates="role")

class GlobalPermission(BaseModelWithSoftDelete):
    __tablename__ = "global_permissions"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(100), unique=True, nullable=False)
    slug            = Column(String(100), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    category        = Column(String(100), nullable=True)
    roles           = relationship("GlobalRolePermission", back_populates="permission")

class Module(BaseModelWithSoftDelete):
    __tablename__ = "modules"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id      = Column(UUID(as_uuid=True), ForeignKey("companies.id", ondelete="RESTRICT"), nullable=False)
    name            = Column(String(255), nullable=False)
    slug            = Column(String(255), unique=True, nullable=False, index=True)
    description     = Column(Text, nullable=True)
    icon            = Column(String(100), nullable=True)
    order           = Column(Integer, default=0, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    company         = relationship("Company", back_populates="modules")
    submodules      = relationship("Submodule", back_populates="module")
    roles           = relationship("ModuleRole", back_populates="module")
    user_accesses   = relationship("UserModuleAccess", back_populates="module")

class Submodule(BaseModelWithSoftDelete):
    __tablename__ = "submodules"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id       = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(255), nullable=False)
    slug            = Column(String(255), nullable=False, index=True)
    description     = Column(Text, nullable=True)
    icon            = Column(String(100), nullable=True)
    order           = Column(Integer, default=0, nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    module          = relationship("Module", back_populates="submodules")
    permissions     = relationship("SubmodulePermission", back_populates="submodule")
    __table_args__  = (UniqueConstraint("module_id", "slug", name="uq_submodule_module_slug"),)

class ModuleRole(BaseModelWithSoftDelete):
    __tablename__ = "module_roles"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id       = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(100), nullable=False)
    slug            = Column(String(100), nullable=False, index=True)
    description     = Column(Text, nullable=True)
    is_active       = Column(Boolean, default=True, nullable=False)
    module          = relationship("Module", back_populates="roles")
    permissions     = relationship("ModuleRolePermission", back_populates="role")
    user_accesses   = relationship("UserModuleAccess", back_populates="role")
    __table_args__  = (UniqueConstraint("module_id", "slug", name="uq_module_role_slug"),)

class SubmodulePermission(BaseModelWithSoftDelete):
    __tablename__ = "submodule_permissions"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    submodule_id    = Column(UUID(as_uuid=True), ForeignKey("submodules.id", ondelete="CASCADE"), nullable=False)
    name            = Column(String(100), nullable=False)
    slug            = Column(String(100), nullable=False, index=True)
    description     = Column(Text, nullable=True)
    submodule       = relationship("Submodule", back_populates="permissions")
    role_permissions = relationship("ModuleRolePermission", back_populates="permission")
    __table_args__  = (UniqueConstraint("submodule_id", "slug", name="uq_submodule_permission_slug"),)

class UserGlobalRole(BaseModel):
    __tablename__ = "user_global_roles"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id         = Column(UUID(as_uuid=True), ForeignKey("global_roles.id", ondelete="CASCADE"), nullable=False)
    user            = relationship("User", back_populates="global_roles")
    role            = relationship("GlobalRole", back_populates="users")
    __table_args__  = (UniqueConstraint("user_id", "role_id", name="uq_user_global_role"),)

class UserModuleAccess(BaseModel):
    __tablename__ = "user_module_accesses"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    module_id       = Column(UUID(as_uuid=True), ForeignKey("modules.id", ondelete="CASCADE"), nullable=False)
    role_id         = Column(UUID(as_uuid=True), ForeignKey("module_roles.id", ondelete="CASCADE"), nullable=False)
    is_active       = Column(Boolean, default=True, nullable=False)
    user            = relationship("User", back_populates="module_accesses")
    module          = relationship("Module", back_populates="user_accesses")
    role            = relationship("ModuleRole", back_populates="user_accesses")
    __table_args__  = (UniqueConstraint("user_id", "module_id", name="uq_user_module_access"),)

class GlobalRolePermission(BaseModel):
    __tablename__ = "global_role_permissions"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id         = Column(UUID(as_uuid=True), ForeignKey("global_roles.id", ondelete="CASCADE"), nullable=False)
    permission_id   = Column(UUID(as_uuid=True), ForeignKey("global_permissions.id", ondelete="CASCADE"), nullable=False)
    role            = relationship("GlobalRole", back_populates="permissions")
    permission      = relationship("GlobalPermission", back_populates="roles")
    __table_args__  = (UniqueConstraint("role_id", "permission_id", name="uq_global_role_permission"),)

class ModuleRolePermission(BaseModel):
    __tablename__ = "module_role_permissions"
    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_id         = Column(UUID(as_uuid=True), ForeignKey("module_roles.id", ondelete="CASCADE"), nullable=False)
    permission_id   = Column(UUID(as_uuid=True), ForeignKey("submodule_permissions.id", ondelete="CASCADE"), nullable=False)
    role            = relationship("ModuleRole", back_populates="permissions")
    permission      = relationship("SubmodulePermission", back_populates="role_permissions")
    __table_args__  = (UniqueConstraint("role_id", "permission_id", name="uq_module_role_permission"),)
