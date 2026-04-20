# Admin Service — Guía de Referencia

Ubicación: `backend/admin-service/`

El `admin-service` es el servicio de administración centralizada de la plataforma Avalanz. Gestiona la estructura completa de grupos, empresas, usuarios, módulos, submódulos, roles y permisos. Es el único servicio que define quién puede acceder a qué y con qué nivel de autorización.

---

## Responsabilidades

- Gestión de grupos y empresas con habilitación/deshabilitación
- Gestión completa del ciclo de vida de usuarios
- Creación y asignación de módulos y submódulos por empresa
- Definición de roles globales y roles por módulo
- Definición y asignación de permisos globales y por submódulo
- Asignación de accesos de usuarios a módulos con su rol correspondiente
- Gestión de archivos de empleados con trazabilidad completa
- Endpoint interno para que el `auth-service` consulte permisos al emitir tokens

---

## Estructura

```
backend/admin-service/
├── alembic.ini
├── app/
│   ├── main.py                          → Punto de entrada, middlewares, routers, endpoint interno
│   ├── config.py                        → Configuración del servicio
│   ├── database.py                      → Motor async, sesión de BD, init/close
│   ├── routes/
│   │   ├── groups.py                    → Endpoints de grupos
│   │   ├── companies.py                 → Endpoints de empresas
│   │   ├── users.py                     → Endpoints de usuarios y accesos
│   │   ├── user_files.py                → Endpoints de archivos de empleados
│   │   ├── modules.py                   → Endpoints de módulos y submódulos
│   │   ├── roles.py                     → Endpoints de roles globales y por módulo
│   │   └── permissions.py              → Endpoints de permisos globales y por submódulo
│   ├── services/
│   │   ├── group_service.py             → Lógica de negocio de grupos
│   │   ├── company_service.py           → Lógica de negocio de empresas
│   │   ├── user_service.py              → Lógica de negocio de usuarios
│   │   ├── user_file_service.py         → Lógica de archivos y auditoría de empleados
│   │   ├── module_service.py            → Lógica de negocio de módulos y submódulos
│   │   ├── role_service.py              → Lógica de negocio de roles
│   │   └── permission_service.py       → Lógica de negocio de permisos
│   ├── models/
│   │   └── admin_models.py             → Modelos SQLAlchemy
│   └── middleware/
├── migrations/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       ├── 152e0764c443_initial_schema.py
│       ├── 56a1e78b4518_add_matricula_puesto_departamento.py
│       ├── 26d54d059ca9_add_lock_reason_to_users.py
│       ├── 951e0445379d_add_address_and_constancia_fields_to_.py
│       ├── d47aff39e7ad_add_description_to_submodules.py
│       ├── e3350ebe1c8e_add_scope_to_module_roles_and_.py
│       ├── e99cf1bc4cf6_add_user_files_and_audit_log.py
│       └── e1642a0e0227_add_is_locked_cache_to_users.py
├── tests/
├── Dockerfile
├── requirements.txt
└── .env
```

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Framework | FastAPI |
| Base de datos | PostgreSQL 15 (asyncpg) |
| ORM | SQLAlchemy 2.0 async |
| Migraciones | Alembic |
| JWT | python-jose |
| HTTP cliente | httpx |

---

## Modelo de datos

### Jerarquía de entidades

```
Group (Grupo Avalanz / Zignia)
└── Company (AGIM, DYCE, TODITO, CNCI, etc.)
    ├── User          → pertenece a una empresa
    │   ├── UserFile  → documentos del expediente del empleado
    │   └── UserFileAuditLog → auditoría de cada acción sobre archivos
    └── Module        → fue solicitado por una empresa
        └── Submodule → parte operativa del módulo
```

### Tablas

#### groups
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| name | String(255) | Nombre del grupo |
| slug | String(255) | Identificador URL único |
| description | Text | Descripción opcional |
| is_active | Boolean | Si el grupo está activo en el catálogo |
| is_deleted | Boolean | Soft delete |

#### companies
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| group_id | UUID FK | Referencia a groups |
| nombre_comercial | String(100) | Nombre corto / comercial |
| name | String(255) | Razón social completa |
| slug | String(255) | Identificador URL único |
| rfc | String(20) | RFC de la empresa — único |
| description | Text | Descripción opcional |
| is_active | Boolean | Si la empresa está activa en el catálogo |
| is_deleted | Boolean | Soft delete |
| calle | String(255) | Nombre de vialidad del domicilio fiscal |
| num_ext | String(20) | Número exterior |
| num_int | String(20) | Número interior |
| colonia | String(150) | Colonia |
| cp | String(10) | Código postal |
| municipio | String(150) | Municipio o demarcación territorial |
| estado | String(100) | Entidad federativa |
| constancia_fecha_emision | String(50) | Fecha de emisión de la constancia SAT |
| constancia_fecha_vigencia | String(50) | Fecha de vigencia calculada (+1 mes desde emisión) |

#### users
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria — mismo UUID que en auth-service |
| company_id | UUID FK | Empresa a la que pertenece |
| email | String(255) | Email único |
| full_name | String(255) | Nombre completo |
| matricula | String(50) | Número de empleado — único, opcional |
| puesto | String(150) | Puesto o cargo del empleado — opcional |
| departamento | String(150) | Departamento del empleado — opcional |
| lock_reason | String(255) | Motivo del último bloqueo o desbloqueo — opcional |
| is_active | Boolean | Si el usuario está activo |
| is_super_admin | Boolean | Bandera de super administrador global |
| is_locked | Boolean | Cache del estado de bloqueo sincronizado desde auth-service |

> `is_locked` es una columna cache que se sincroniza automáticamente cada vez que un admin bloquea o desbloquea una cuenta desde el panel. Permite filtrar usuarios bloqueados directamente en SQL sin consultar el auth-service. Si se bloquea directamente en auth-service sin pasar por el admin-service, hay que sincronizar manualmente con `UPDATE users SET is_locked = true WHERE id = 'uuid'`.

> Para agregar más campos a esta tabla ver: `docs/architecture/agregar-campos-usuario.md`

#### user_files
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| user_id | UUID FK | Empleado al que pertenece el archivo |
| company_id | UUID FK | Empresa del empleado |
| original_name | String(255) | Nombre descriptivo — formato: `user_{matricula}_{company}_{folio}.{ext}` |
| stored_name | String(255) | Nombre físico en MinIO con UUID prefix |
| object_key | String(500) | Ruta relativa en MinIO — `admin/employees/documents/archivo.pdf` |
| bucket | String(100) | Bucket de MinIO — siempre `dirdoc` |
| mime_type | String(100) | Tipo MIME del archivo |
| extension | String(20) | Extensión del archivo |
| size_bytes | BigInteger | Tamaño en bytes |
| checksum | String(64) | Hash SHA256 para verificar integridad |
| description | Text | Descripción opcional del documento |
| is_deleted | Boolean | Soft delete — el archivo sigue en MinIO |
| deleted_at | DateTime | Fecha de eliminación |
| deleted_by | UUID | Usuario que eliminó |
| deleted_reason | String(255) | Motivo de eliminación |
| uploaded_by | UUID | Usuario que subió el archivo |
| uploaded_at | DateTime | Fecha de subida |
| last_modified_by | UUID | Último usuario que lo modificó |
| last_modified_at | DateTime | Fecha de última modificación |

#### user_file_audit_log
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| file_id | UUID FK | Referencia a user_files |
| action | String(50) | uploaded, downloaded, replaced, deleted, restored |
| performed_by | UUID | Usuario que realizó la acción |
| performed_by_name | String(255) | Nombre del usuario en el momento del evento |
| performed_by_role | String(100) | Rol del usuario en el momento del evento |
| performed_at | DateTime | Fecha y hora exacta del evento |
| ip_address | String(45) | IP desde donde se realizó la acción |
| user_agent | String(255) | Navegador o cliente |
| company_id | UUID | Empresa del usuario que realizó la acción |
| module_slug | String(100) | Módulo donde ocurrió — siempre `admin` para archivos de empleados |
| detail | JSONB | Datos extra según la acción |

> `performed_by_name` y `performed_by_role` se guardan directamente en el log para preservar el estado exacto del usuario en el momento del evento, independientemente de cambios posteriores en su perfil o rol.

#### modules
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| company_id | UUID FK | Empresa que solicitó el módulo |
| name | String(255) | Nombre del módulo |
| slug | String(255) | Identificador URL único |
| description | Text | Descripción opcional |
| icon | String(100) | Icono del módulo para el menú |
| order | Integer | Orden de aparición en el menú |
| is_active | Boolean | Si el módulo está activo |

#### submodules
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| module_id | UUID FK | Módulo al que pertenece |
| name | String(255) | Nombre del submódulo |
| slug | String(255) | Identificador único dentro del módulo |
| description | Text | Descripción opcional |
| icon | String(100) | Icono del submódulo (slug de Lucide) |
| order | Integer | Orden de aparición |
| is_active | Boolean | Si el submódulo está activo |

#### global_roles
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| name | String(100) | Nombre del rol |
| slug | String(100) | Identificador único |
| description | Text | Descripción |
| is_active | Boolean | Si el rol está activo |

#### module_roles
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| module_id | UUID FK | Modulo al que pertenece — nullable, null = catalogo general |
| name | String(100) | Nombre del rol (Ej. Gerente, Supervisor, Operador) |
| slug | String(100) | Identificador unico |
| description | Text | Descripcion |
| scope | String(20) | empresa o corporativo — default empresa |
| is_active | Boolean | Si el rol esta activo |

Scope empresa: el usuario ve solo datos de su company_id.
Scope corporativo: el usuario ve datos de todas las empresas (Contraloria, Auditoria).
module_id null: rol del catalogo general, asignable a cualquier modulo.

#### global_permissions
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| name | String(100) | Nombre del permiso |
| slug | String(100) | Identificador único |
| description | Text | Descripción |
| category | String(100) | Categoría de agrupación |

#### submodule_permissions
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria |
| submodule_id | UUID FK | Submódulo al que pertenece |
| name | String(100) | Nombre del permiso |
| slug | String(100) | Identificador único dentro del submódulo |
| description | Text | Descripción |

#### user_global_roles (pivote)
| Columna | Tipo | Descripción |
|---|---|---|
| user_id | UUID FK | Referencia a users |
| role_id | UUID FK | Referencia a global_roles |

#### user_module_accesses (pivote clave)
| Columna | Tipo | Descripción |
|---|---|---|
| user_id | UUID FK | Referencia a users |
| module_id | UUID FK | Referencia a modules |
| role_id | UUID FK | Rol del usuario dentro del módulo |
| is_active | Boolean | Si el acceso está activo |

#### global_role_permissions (pivote)
| Columna | Tipo | Descripción |
|---|---|---|
| role_id | UUID FK | Referencia a global_roles |
| permission_id | UUID FK | Referencia a global_permissions |

#### module_role_permissions (pivote)
| Columna | Tipo | Descripción |
|---|---|---|
| role_id | UUID FK | Referencia a module_roles |
| permission_id | UUID FK | Referencia a submodule_permissions |

---

## Respuesta serializada de usuario

El `_serialize_user` en `user_service.py` combina datos de tres fuentes:

| Campo | Fuente |
|---|---|
| user_id, email, full_name, matricula, puesto, departamento | admin-service BD |
| company_name | JOIN con tabla companies — nombre_comercial |
| company_razon_social | JOIN con tabla companies — name (razón social completa) |
| company_rfc | JOIN con tabla companies — rfc |
| roles | JOIN con user_global_roles + global_roles. Si no tiene rol global, incluye nombre del rol operativo asignado |
| module_accesses | Consulta a user_module_accesses con module_name, role_name y submodules. Super admin obtiene todos los módulos activos con role_name "Super Administrador" |
| is_locked, is_2fa_configured, last_login_at | auth-service (endpoint interno batch-info) |

---

## Reglas de negocio para habilitar / deshabilitar

### Grupos
| Acción | Restricción |
|---|---|
| Deshabilitar grupo | Todas sus empresas deben estar deshabilitadas primero |
| Habilitar grupo | Sin restricciones |
| Eliminar grupo | No debe tener ninguna empresa asociada |

### Empresas
| Acción | Restricción |
|---|---|
| Deshabilitar empresa | Todos sus usuarios deben estar desactivados primero |
| Habilitar empresa | Su grupo debe estar activo |
| Eliminar empresa | Debe estar inactiva primero + no debe tener usuarios asociados |

**Trazabilidad de eliminación:** La cadena obligatoria es: desactivar usuarios → desactivar empresa → eliminar empresa. No se puede saltar ningún paso.

### Módulos y submódulos
| Acción | Restricción |
|---|---|
| Eliminar módulo | Requiere clave de confirmación (`claves-admin.md`) — solo hace soft delete |
| Super admin | Recibe todos los módulos activos automáticamente en el JWT |
| JWT módulos | Formato: `{ slug, icon, submodules: [{ slug, icon, name }] }` |
| Código en filesystem | No se elimina al hacer soft delete — debe eliminarse manualmente vía git |

---

## Flujo de configuración de un módulo nuevo

```
1. super_admin crea el módulo
   POST /api/v1/modules/
        |
2. Crea los submódulos
   POST /api/v1/modules/{module_id}/submodules
        |
3. Crea los permisos por submódulo
   POST /api/v1/permissions/submodules/{submodule_id}
   Ejemplos: leer, crear, editar, eliminar
        |
4. Crea o asigna roles operativos del catalogo al modulo
   POST /api/v1/roles/operational  (crear nuevo rol en el catalogo)
   GET  /api/v1/roles/operational  (listar catalogo existente)
        |
5. Asigna permisos a cada rol operativo
   POST /api/v1/roles/operational/{role_id}/permissions
        |
6. Asigna usuarios al módulo con su rol
   POST /api/v1/users/{user_id}/module-access
```

---

## Flujo de creación de usuario

```
1. Frontend POST /api/v1/users/
        |
2. admin-service crea el usuario en su BD
        |
3. admin-service llama a auth-service POST /api/v1/auth/internal/users
   para crear las credenciales (contraseña temporal)
        |
4. email-service envía correo de bienvenida con link a /change-password?user_id=xxx
        |
5. Usuario recibe correo con contraseña temporal
        |
6. En primer login: cambia contraseña → configura 2FA → accede
```

---

## Filtro de datos por empresa (regla de arquitectura)

Cada módulo operativo que se construya en el futuro **debe** filtrar sus consultas por `company_id` del usuario que viene en el JWT.

```python
company_id = payload.get("company_id")
cross_company = payload.get("cross_company", False)

if cross_company:
    query = select(Expediente)
else:
    query = select(Expediente).where(Expediente.company_id == company_id)
```

**Excepción:** usuarios con `cross_company: true` (super_admin o scope corporativo) pueden ver datos de todas las empresas.

---

## Nginx — Rutas expuestas

| Ruta | Servicio |
|---|---|
| /api/v1/users/ | admin-service |
| /api/v1/companies/ | admin-service |
| /api/v1/groups/ | admin-service |
| /api/v1/modules/ | admin-service |
| /api/v1/roles/ | admin-service |
| /api/v1/permissions/ | admin-service |

> Si agregas nuevos prefijos de ruta, agrégalos también en Nginx y reinicia el contenedor.

---

## Endpoints

### Usuarios — `/api/v1/users`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | / | super_admin, admin_empresa | Crear usuario |
| GET | / | super_admin, admin_empresa | Listar usuarios |
| GET | /{user_id} | super_admin, admin_empresa | Obtener usuario con module_accesses |
| PATCH | /{user_id} | super_admin, admin_empresa | Actualizar usuario |
| DELETE | /{user_id} | super_admin, admin_empresa | Eliminar usuario |
| POST | /{user_id}/global-roles | super_admin | Asignar rol global |
| DELETE | /{user_id}/global-roles | super_admin | Remover rol global |
| POST | /{user_id}/module-access | super_admin, admin_empresa | Asignar acceso a módulo |
| DELETE | /{user_id}/module-access | super_admin, admin_empresa | Revocar acceso a módulo |
| GET | /{user_id}/permissions | super_admin, admin_empresa | Ver permisos del usuario |
| GET | /{user_id}/sessions | super_admin, admin_empresa | Sesiones activas del usuario |
| GET | /{user_id}/login-history | super_admin, admin_empresa | Historial de login del usuario |
| POST | /{user_id}/lock | super_admin, admin_empresa | Bloquear o desbloquear cuenta (admin_empresa no puede bloquear super_admin) |
| POST | /{user_id}/reset-password | super_admin, admin_empresa | Resetear contraseña del usuario |

### Query parameters de listado — `GET /api/v1/users/`

| Parámetro | Tipo | Descripción |
|---|---|---|
| page | int | Número de página (default: 1) |
| per_page | int | Resultados por página (default: 20, max: 100) |
| search | string | Buscar por nombre, email o matrícula |
| company_id | UUID | Filtrar por empresa |
| is_active | bool | Filtrar por estado activo/inactivo |
| is_locked | bool | Filtrar por estado bloqueado — usa columna cache local |

> Al filtrar `is_active=true` el frontend también envía `is_locked=false` para excluir usuarios bloqueados del resultado de activos.

### Campos de creación de usuario (CreateUserRequest)

```python
class CreateUserRequest(BaseModel):
    company_id: str             # requerido
    email: EmailStr             # requerido
    full_name: str              # requerido
    matricula: Optional[str]    # opcional — número de empleado
    puesto: Optional[str]       # opcional — cargo
    departamento: Optional[str] # opcional — área
    is_super_admin: bool = False
    global_role_id: Optional[str]           # opcional — rol global a asignar
    module_accesses: Optional[List[dict]]   # opcional — lista de {module_id, role_id}
```

### Campos de actualización (UpdateUserRequest)

```python
class UpdateUserRequest(BaseModel):
    company_id: Optional[str]   # solo super_admin puede cambiar empresa
    full_name: Optional[str]
    email: Optional[EmailStr]
    matricula: Optional[str]    # solo super_admin puede modificar
    puesto: Optional[str]
    departamento: Optional[str]
    is_active: Optional[bool]
```

### Archivos de usuario — `/api/v1/users/{user_id}/files`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | /{user_id}/files | super_admin, admin_empresa | Subir archivo al expediente del empleado |
| GET | /{user_id}/files | super_admin, admin_empresa | Listar archivos activos del empleado |
| GET | /{user_id}/files/{file_id}/download | super_admin, admin_empresa | Obtener URL firmada de descarga (15 min) |
| DELETE | /{user_id}/files/{file_id} | super_admin, admin_empresa | Soft delete del archivo |
| GET | /{user_id}/files/{file_id}/audit | super_admin, admin_empresa | Ver auditoría completa del archivo |

#### POST /{user_id}/files — multipart/form-data

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| file | File | Si | Archivo a subir |
| company_slug | string | Si | Slug de la empresa del empleado |
| description | string | No | Descripción del documento |

El nombre del archivo se genera automáticamente: `user_{matricula}_{company_slug}_{folio}.{ext}`

Todos los archivos de empleados se guardan en MinIO bajo: `dirdoc/admin/employees/documents/`

#### Acciones registradas en auditoría

| Acción | Cuándo |
|---|---|
| uploaded | Al subir el archivo |
| downloaded | Al generar URL firmada de descarga |
| deleted | Al hacer soft delete |

### Grupos — `/api/v1/groups`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | / | super_admin | Crear grupo |
| GET | / | super_admin, admin_empresa | Listar grupos |
| GET | /{group_id} | super_admin, admin_empresa | Obtener grupo |
| PATCH | /{group_id} | super_admin | Actualizar grupo |
| PATCH | /{group_id}/enable | super_admin | Habilitar grupo |
| PATCH | /{group_id}/disable | super_admin | Deshabilitar grupo |
| DELETE | /{group_id} | super_admin | Eliminar grupo |

### Empresas — `/api/v1/companies`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | / | super_admin | Crear empresa |
| GET | / | super_admin, admin_empresa | Listar empresas |
| GET | /{company_id} | super_admin, admin_empresa | Obtener empresa |
| PATCH | /{company_id} | super_admin | Actualizar empresa |
| PATCH | /{company_id}/enable | super_admin | Habilitar empresa |
| PATCH | /{company_id}/disable | super_admin | Deshabilitar empresa |
| DELETE | /{company_id} | super_admin | Eliminar empresa |

### Módulos — `/api/v1/modules`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | / | super_admin | Crear módulo |
| GET | / | Cualquiera | Listar módulos |
| GET | /{module_id} | Cualquiera | Obtener módulo con submódulos |
| PATCH | /{module_id} | super_admin | Actualizar módulo |
| DELETE | /{module_id} | super_admin | Eliminar módulo |
| POST | /{module_id}/submodules | super_admin | Crear submódulo |
| PATCH | /{module_id}/submodules/{submodule_id} | super_admin | Actualizar submódulo |
| DELETE | /{module_id}/submodules/{submodule_id} | super_admin | Eliminar submódulo |

### Roles — `/api/v1/roles`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | /global | super_admin | Crear rol global |
| GET | /global | super_admin, admin_empresa | Listar roles globales |
| PATCH | /global/{role_id} | super_admin | Actualizar rol global |
| DELETE | /global/{role_id} | super_admin | Eliminar rol global |
| POST | /global/{role_id}/permissions | super_admin | Asignar permiso a rol global |
| DELETE | /global/{role_id}/permissions/{permission_id} | super_admin | Remover permiso de rol global |
| POST | /operational | super_admin | Crear rol operativo del catalogo |
| GET | /operational | super_admin, admin_empresa | Listar roles operativos (filtros: scope, module_id) |
| PATCH | /operational/{role_id} | super_admin | Actualizar rol operativo |
| DELETE | /operational/{role_id} | super_admin | Eliminar rol operativo |
| POST | /operational/{role_id}/permissions | super_admin | Asignar permiso a rol operativo |
| DELETE | /operational/{role_id}/permissions/{permission_id} | super_admin | Remover permiso de rol operativo |

### Permisos — `/api/v1/permissions`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | /global | super_admin | Crear permiso global |
| GET | /global | super_admin, admin_empresa | Listar permisos globales |
| PATCH | /global/{permission_id} | super_admin | Actualizar permiso global |
| DELETE | /global/{permission_id} | super_admin | Eliminar permiso global |
| POST | /submodules/{submodule_id} | super_admin | Crear permiso de submódulo |
| GET | /submodules/{submodule_id} | super_admin, admin_empresa | Listar permisos del submódulo |
| PATCH | /submodules/{submodule_id}/{permission_id} | super_admin | Actualizar permiso |
| DELETE | /submodules/{submodule_id}/{permission_id} | super_admin | Eliminar permiso |
| GET | /modules/{module_id}/tree | super_admin, admin_empresa | Árbol completo de permisos |

---

## Endpoint interno

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | /internal/users/{user_id}/permissions | No | Consultado por auth-service al emitir JWT |

```json
{
  "roles": ["super_admin"],
  "modules": [{"slug": "boveda", "icon": "archive", "submodules": [...]}],
  "companies": ["uuid-corporativo"],
  "permissions": [],
  "cross_company": true
}
```

---

## Comunicación con otros servicios

| Servicio | Tipo | Endpoint | Propósito |
|---|---|---|---|
| auth-service | HTTP interno | POST /api/v1/auth/internal/users | Crear credenciales al crear usuario |
| auth-service | HTTP interno | GET /api/v1/auth/internal/users/{id}/info | Obtener is_locked, is_2fa_configured, is_temp_password, last_login_at |
| auth-service | HTTP interno | POST /api/v1/auth/internal/users/batch-info | Obtener datos de auth para múltiples usuarios en un query |
| auth-service | HTTP interno | POST /api/v1/auth/internal/users/{id}/reset-password | Resetear contraseña del usuario |
| auth-service | HTTP interno | POST /api/v1/auth/internal/users/{id}/lock | Bloquear o desbloquear cuenta |
| auth-service | HTTP interno | POST /api/v1/auth/internal/users/{id}/revoke-sessions | Revocar todas las sesiones del usuario y enviar correo de notificación |
| upload-service | HTTP interno | POST /api/v1/upload/ | Subir archivo de empleado a MinIO |
| upload-service | HTTP interno | GET /api/v1/upload/signed-url | Obtener URL firmada para descarga |

> Todas las URLs internas usan el formato completo con puerto: `http://auth-service:8000/...`, `http://upload-service:8000/...`

---

## Alembic — Migraciones

Ver guía completa en: `docs/architecture/alembic-guia.md`

```bash
# Generar migración
docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'descripcion'"

# Aplicar migraciones
docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"

# Ver estado actual
docker exec avalanz-admin bash -c "cd /app && alembic current"

# Revertir última migración
docker exec avalanz-admin bash -c "cd /app && alembic downgrade -1"
```

---

## Datos iniciales (seeder)

### Grupos
| Nombre | Slug |
|---|---|
| Grupo Avalanz | grupo-avalanz |
| Zignia | zignia |

### Empresas activas — Grupo Avalanz (muestra)
| Nombre Comercial | RFC |
|---|---|
| AVALANZ | AVA0802203FA |
| AGIMTY | AGI0906221A5 |
| AGIM | AGI060913DT2 |
| CNCI | UCM960906C20 |
| TODITO CARD | TCA050929BM8 |
| HORIZONTE | HMU120801KZ6 |
| ... y más | ... |

### Roles globales base
| Slug | Descripción |
|---|---|
| super_admin | Acceso total a toda la plataforma |
| admin_empresa | Gestión dentro de su empresa |

### Super admin inicial
- Email: configurable via `SUPER_ADMIN_EMAIL` en variables de entorno
- Empresa asignada: AVALANZ SA DE CV
- Sin contraseña temporal — acceso directo con `SUPER_ADMIN_PASSWORD`

---

## Scope de administración

| Rol | Alcance |
|---|---|
| super_admin | Toda la plataforma, todos los grupos, todas las empresas |
| admin_empresa | Solo usuarios y accesos de su propia empresa |
| Usuario normal | Solo ve sus módulos asignados |

---

## Configuración (.env)

| Variable | Descripción | Default |
|---|---|---|
| DB_NAME | Base de datos del servicio | avalanz_admin |
| TEMP_PASSWORD_LENGTH | Longitud de contraseña temporal | 12 |
| TEMP_PASSWORD_EXPIRE_HOURS | Validez de contraseña temporal | 24 |
| DEFAULT_PAGE_SIZE | Tamaño de página por defecto | 20 |
| MAX_PAGE_SIZE | Tamaño máximo de página | 100 |

---

## Instalación y arranque local

```bash
cd backend/admin-service

python -m venv venv
source venv/bin/activate

pip install -r requirements.txt

cp .env.example .env

uvicorn app.main:app --reload --port 8002
```

El servicio queda disponible en `http://localhost:8002`
La documentación interactiva en `http://localhost:8002/docs` (solo en DEBUG=True)