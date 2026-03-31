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
- Endpoint interno para que el `auth-service` consulte permisos al emitir tokens

---

## Estructura

```
admin-service/
├── app/
│   ├── main.py                     → Punto de entrada, middlewares, routers, endpoint interno
│   ├── config.py                   → Configuración del servicio
│   ├── database.py                 → Motor async, sesión de BD, init/close
│   ├── routes/
│   │   ├── groups.py               → Endpoints de grupos
│   │   ├── companies.py            → Endpoints de empresas
│   │   ├── users.py                → Endpoints de usuarios y accesos
│   │   ├── modules.py              → Endpoints de módulos y submódulos
│   │   ├── roles.py                → Endpoints de roles globales y por módulo
│   │   └── permissions.py         → Endpoints de permisos globales y por submódulo
│   ├── services/
│   │   ├── group_service.py        → Lógica de negocio de grupos
│   │   ├── company_service.py      → Lógica de negocio de empresas
│   │   ├── user_service.py         → Lógica de negocio de usuarios
│   │   ├── module_service.py       → Lógica de negocio de módulos y submódulos
│   │   ├── role_service.py         → Lógica de negocio de roles
│   │   └── permission_service.py  → Lógica de negocio de permisos
│   ├── models/
│   │   └── admin_models.py        → Modelos SQLAlchemy
│   └── middleware/
├── migrations/
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
| rfc | String(20) | RFC de la empresa |
| description | Text | Descripción opcional |
| is_active | Boolean | Si la empresa está activa en el catálogo |
| is_deleted | Boolean | Soft delete |

#### users
| Columna | Tipo | Descripción |
|---|---|---|
| id | UUID | Llave primaria — mismo UUID que en auth-service |
| company_id | UUID FK | Empresa a la que pertenece |
| email | String(255) | Email único |
| full_name | String(255) | Nombre completo |
| is_active | Boolean | Si el usuario está activo |
| is_super_admin | Boolean | Bandera de super administrador global |

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
| icon | String(100) | Icono del submódulo |
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
| module_id | UUID FK | Módulo al que pertenece el rol |
| name | String(100) | Nombre del rol |
| slug | String(100) | Identificador único dentro del módulo |
| description | Text | Descripción |
| is_active | Boolean | Si el rol está activo |

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
| Eliminar empresa | No debe tener usuarios asociados |

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
4. Crea los roles del módulo
   POST /api/v1/roles/modules/{module_id}
   Ejemplos: director_legal, abogado, asistente_legal
        |
5. Asigna permisos a cada rol
   POST /api/v1/roles/modules/{module_id}/{role_id}/permissions
        |
6. Asigna usuarios al módulo con su rol
   POST /api/v1/users/{user_id}/module-access
```

---

## Filtro de datos por empresa (regla de arquitectura)

Cada módulo operativo que se construya en el futuro **debe** filtrar sus consultas por `company_id` del usuario que viene en el JWT.

```python
company_id = payload.get("company_id")
query = select(Expediente).where(Expediente.company_id == company_id)
```

**Excepción:** usuarios con rol `super_admin` pueden omitir este filtro.

---

## Endpoints

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

### Usuarios — `/api/v1/users`

| Método | Ruta | Roles | Descripción |
|---|---|---|---|
| POST | / | super_admin, admin_empresa | Crear usuario |
| GET | / | super_admin, admin_empresa | Listar usuarios |
| GET | /{user_id} | super_admin, admin_empresa | Obtener usuario |
| PATCH | /{user_id} | super_admin, admin_empresa | Actualizar usuario |
| DELETE | /{user_id} | super_admin, admin_empresa | Eliminar usuario |
| POST | /{user_id}/global-roles | super_admin | Asignar rol global |
| POST | /{user_id}/module-access | super_admin, admin_empresa | Asignar acceso a módulo |
| DELETE | /{user_id}/module-access | super_admin, admin_empresa | Revocar acceso a módulo |
| GET | /{user_id}/permissions | super_admin, admin_empresa | Ver permisos del usuario |

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
| POST | /modules/{module_id} | super_admin | Crear rol de módulo |
| GET | /modules/{module_id} | super_admin, admin_empresa | Listar roles del módulo |
| PATCH | /modules/{module_id}/{role_id} | super_admin | Actualizar rol de módulo |
| DELETE | /modules/{module_id}/{role_id} | super_admin | Eliminar rol de módulo |
| POST | /modules/{module_id}/{role_id}/permissions | super_admin | Asignar permiso a rol de módulo |

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
  "roles": ["super_admin", "legal:director_legal"],
  "modules": ["legal", "boveda"],
  "companies": ["uuid-corporativo", "uuid-dyce"],
  "permissions": []
}
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