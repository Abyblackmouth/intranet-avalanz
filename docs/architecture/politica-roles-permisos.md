# Politica de Roles y Permisos - Guia de Referencia

Ubicacion: `docs/architecture/`

Esta guia define las reglas de negocio que gobiernan el sistema de roles, permisos y restricciones de acceso de la plataforma Avalanz. Cualquier modulo nuevo que se construya debe respetar estas politicas.

---

## Jerarquia de roles

```
super_admin              (TI Corporativo - control total)
    admin_empresa        (TI Corporativo personal - gestion amplia con restricciones)
        Roles de modulo  (abogado, coordinador_legal, gerente, supervisor, etc.)
            Permisos de submodulo (leer, crear, editar, eliminar)
```

---

## Tipos de roles

### Roles globales

Aplican a toda la plataforma. Solo existen dos y estan hardcodeados en el sistema.

| Rol | Slug | Quien lo usa |
|---|---|---|
| Super Administrador | super_admin | TI Corporativo - control total sin restricciones |
| Administrador de Empresa | admin_empresa | Personal de TI - gestion amplia con restricciones |

### Roles de modulo

Roles del catalogo general - reutilizables y asignables a cualquier modulo. Se crean desde `/admin/roles`.

| Campo | Descripcion |
|---|---|
| name | Nombre visible (Ej. Abogado, Coordinador Legal, Gerente) |
| slug | Identificador unico auto-generado |
| scope | empresa o corporativo |
| module_id | Null = catalogo general, UUID = exclusivo de ese modulo |

- **Scope empresa** - el usuario solo ve datos de su company_id
- **Scope corporativo** - el usuario ve datos de todas las empresas (Contraloria, Auditoria, Control Interno)

#### Roles de modulo configurados actualmente

| Modulo | Nombre | Slug | Scope |
|---|---|---|---|
| Legal | Abogado | abogado | empresa |
| Legal | Coordinador Legal | coordinador_legal | empresa |

---

## Prefijos de roles en el JWT

**Regla critica:** Los roles de modulo viajan en el JWT con el prefijo `{modulo}:{slug}` para evitar colisiones entre modulos con roles del mismo nombre.

```
Rol global:    "super_admin"             → sin prefijo
Rol global:    "admin_empresa"           → sin prefijo
Rol de modulo: "legal:abogado"           → prefijo = slug del modulo
Rol de modulo: "legal:coordinador_legal" → prefijo = slug del modulo
```

### Por que prefijos

Si en el futuro el modulo de Boveda tiene un rol "supervisor" y el modulo Legal tambien tiene uno, el JWT podria incluir ambos sin ambiguedad: `["boveda:supervisor", "legal:supervisor"]`.

### Normalizacion obligatoria en backend

Todo microservicio que compare roles del JWT **debe** normalizar el prefijo antes de comparar. El helper `get_flat_roles` debe implementarse en el `routes.py` de cada servicio:

```python
def get_flat_roles(user: dict) -> list:
    """Normaliza roles de modulo quitando el prefijo {modulo}: para comparaciones."""
    return [r.split(":")[-1] for r in user.get("roles", [])]
```

Uso correcto:
```python
# CORRECTO
user_roles = get_flat_roles(user)
is_privileged = any(r in user_roles for r in ["super_admin", "coordinador_legal"])

# INCORRECTO - falla con roles de modulo
user_roles = user.get("roles", [])
is_privileged = "coordinador_legal" in user_roles  # nunca sera True
```

### Normalizacion obligatoria en frontend

```typescript
// En resolveLegalRole o cualquier funcion que compare roles
const flat = roles.map(r => r.includes(':') ? r.split(':')[1] : r)
if (flat.includes('coordinador_legal')) return 'coordinador_legal'
```

### require_roles en microservicios

La funcion `require_roles` de cada microservicio debe normalizar internamente:

```python
def require_roles(*roles: str):
    from fastapi import Depends
    def dependency(payload = Depends(_validator.get_current_user())) -> dict:
        user_roles = [r.split(":")[-1] for r in payload.get("roles", [])]
        if not any(role in roles for role in user_roles):
            raise ForbiddenException(f"Se requiere uno de: {', '.join(roles)}")
        return payload
    return dependency
```

---

## Usuario protegido del sistema

Existe un usuario que no puede ser modificado, bloqueado ni eliminado bajo ninguna circunstancia.

- Email: admin@avalanz.com
- Constante: PROTECTED_SUPER_ADMIN_EMAIL en backend/admin-service/app/services/user_service.py
- Badge Protegido visible en la tabla de usuarios
- Opciones de editar, bloquear y eliminar ocultas en el menu de acciones

---

## Reglas del rol super_admin

Puede:
- Crear, editar y eliminar cualquier usuario (excepto el protegido)
- Bloquear y desbloquear cualquier cuenta incluyendo otros super_admin (excepto el protegido)
- Modificar matricula / numero de empleado
- Asignar y revocar roles globales
- Asignar y revocar accesos a modulos con rol de modulo
- Gestionar grupos, empresas, modulos, submodulos, roles y permisos
- Ver informacion de todas las empresas y grupos
- Acceder a todos los modulos operativos automaticamente sin asignacion explicita
- Eliminar modulos, submodulos, empresas y grupos
- Cambiar el proveedor de firma en el modulo Legal

No puede:
- Modificar al usuario protegido del sistema

---

## Reglas del rol admin_empresa

Puede:
- Ver todos los usuarios de todas las empresas
- Crear usuarios en cualquier empresa
- Editar usuarios (campos basicos: nombre, email, puesto, departamento)
- Bloquear y desbloquear usuarios que NO sean super_admin
- Resetear contrasenas de cualquier usuario
- Asignar y revocar accesos a modulos con rol de modulo
- Ver todas las empresas y grupos
- Cambiar el proveedor de firma en el modulo Legal

No puede:
- Modificar matricula / numero de empleado
- Bloquear o desbloquear a un super_admin
- Eliminar usuarios
- Gestionar empresas (crear/editar/eliminar)
- Gestionar grupos (crear/editar/eliminar)
- Eliminar modulos o submodulos
- Gestionar roles globales ni permisos globales
- Asignar roles globales a usuarios

---

## Bloqueo de cuentas

### Bloqueo manual (por administrador)

super_admin y admin_empresa pueden bloquear y desbloquear cuentas. El motivo es obligatorio.

Restriccion: admin_empresa no puede bloquear ni desbloquear a un super_admin.

El campo lock_reason se guarda en el admin-service. El estado is_locked se guarda en el auth-service.

### Bloqueo automatico (por intentos fallidos)

El auth-service bloquea automaticamente una cuenta despues de MAX_FAILED_ATTEMPTS intentos fallidos (por defecto 3).
Solo un super_admin puede revertir este bloqueo, o el usuario puede recuperar su contrasena via /reset-password.

---

## Acceso a modulos

### Usuarios con rol super_admin

Acceso implicito a todos los modulos activos sin asignacion explicita. JWT incluye cross_company: true.

### Usuarios con rol de modulo

Solo acceden a los modulos asignados explicitamente via user_module_accesses.

- Scope empresa: cross_company false, datos filtrados por company_id
- Scope corporativo: cross_company true, datos de todas las empresas

### Usuarios con multiples empresas o super_admin

Cuando un usuario tiene acceso a mas de una empresa o es super_admin, el modulo Legal muestra una pantalla de seleccion de empresa antes del formulario de nuevo contrato. La empresa seleccionada se usa para:
- Asignar el `company_id` al sobre
- Construir la ruta en MinIO (`company_slug/legal/envelopes/...`)

### Filtro de datos por empresa en modulos operativos

Cada modulo operativo debe filtrar sus consultas por company_id del JWT, excepto cuando cross_company es true.

```python
flat_roles = get_flat_roles(user)
is_privileged = any(r in flat_roles for r in ["super_admin", "coordinador_legal", "director"])
if not is_privileged:
    if "abogado" in flat_roles:
        # abogado solo ve sus sobres asignados
        lawyer_id = user["user_id"]
    else:
        # solicitante solo ve sobres de su empresa
        company_id = user.get("companies", [""])[0]
```

---

## Tabla resumen de permisos

| Accion | super_admin | admin_empresa | Rol de modulo |
|---|---|---|---|
| Ver todos los usuarios | Si | Si | No |
| Crear usuario | Si | Si | No |
| Editar usuario (campos basicos) | Si | Si | No |
| Modificar matricula | Si | No | No |
| Resetear contrasena | Si | Si | No |
| Bloquear / Desbloquear usuario normal | Si | Si | No |
| Bloquear / Desbloquear super_admin | Si | No | No |
| Eliminar usuario | Si | No | No |
| Asignar rol global | Si | No | No |
| Asignar acceso a modulo | Si | Si | No |
| Gestionar empresas y grupos | Si | No | No |
| Crear y editar modulos y submodulos | Si | No | No |
| Eliminar modulos y submodulos | Si | No | No |
| Gestionar roles y permisos | Si | No | No |
| Ver panel de administracion | Si | Si | No |
| Acceso a modulos operativos | Si (todos) | Por asignacion | Por asignacion |
| Ver datos de todas las empresas | Si | Si (panel admin) | Solo scope corporativo |
| Modificar usuario protegido | No | No | No |
| Cambiar proveedor de firma (Legal) | Si | Si | No |

---

## JWT - campos relevantes

El payload del access_token incluye:

| Campo | Descripcion |
|---|---|
| user_id | UUID del usuario |
| email | Email |
| full_name | Nombre completo |
| roles | Array de roles — globales sin prefijo, de modulo con prefijo `{modulo}:{slug}` |
| modules | Array de modulos con sus submodulos |
| companies | Array de UUIDs de empresas asignadas |
| permissions | Array de permisos |
| cross_company | true si super_admin o tiene rol con scope corporativo |

Ejemplo de payload para un coordinador legal:
```json
{
  "user_id": "uuid",
  "roles": ["legal:coordinador_legal"],
  "modules": [{"slug": "legal", "icon": "scale", "submodules": [...]}],
  "companies": ["uuid-empresa"],
  "cross_company": false
}
```

cross_company es true si el usuario es super_admin o tiene al menos un rol con scope corporativo.

---

## Implementacion tecnica

Las validaciones se aplican en dos capas:

**Capa 1 — Middleware** (`shared/middleware/jwt_validator.py`): verifica token y rol minimo requerido. Cada microservicio sobrescribe `require_roles` para normalizar prefijos de modulo.

**Capa 2 — Logica de negocio** (service.py de cada modulo): verifica reglas especificas como proteccion del usuario del sistema, restricciones de admin_empresa, visibilidad por rol en modulos operativos.

---

## Cambiar el email del usuario protegido

Editar la constante PROTECTED_SUPER_ADMIN_EMAIL en backend/admin-service/app/services/user_service.py y reiniciar admin-service.