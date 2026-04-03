# Política de Roles y Permisos — Guía de Referencia

Ubicación: `docs/architecture/`

Esta guía define las reglas de negocio que gobiernan el sistema de roles, permisos y restricciones de acceso de la plataforma Avalanz. Cualquier módulo nuevo que se construya debe respetar estas políticas.

---

## Jerarquía de roles globales

```
super_admin
    └── admin_empresa
            └── Roles de módulo (director_legal, abogado, gestor_boveda, etc.)
```

Los roles globales aplican a toda la plataforma. Los roles de módulo aplican únicamente dentro del contexto de su módulo.

---

## Roles globales

| Rol | Slug | Descripción |
|---|---|---|
| Super Administrador | super_admin | Acceso total a toda la plataforma sin restricciones |
| Administrador de Empresa | admin_empresa | Gestión dentro de su empresa — alcance limitado |

---

## Usuario protegido del sistema

Existe un usuario de sistema que **no puede ser modificado, bloqueado ni eliminado bajo ninguna circunstancia**. Este usuario garantiza que siempre exista al menos un super administrador activo en la plataforma.

La protección se aplica por email — si el email del super admin inicial cambia en el futuro, debe actualizarse la constante `PROTECTED_SUPER_ADMIN_EMAIL` en `backend/admin-service/app/services/user_service.py`.

Este usuario no puede ser:
- Editado por nadie (ni por otros super admins)
- Bloqueado
- Eliminado

Este usuario siempre tiene:
- Rol `super_admin` permanente
- Badge "Protegido" visible en la tabla de usuarios
- Opciones de editar, bloquear y eliminar ocultas en el menú de acciones

---

## Reglas del rol super_admin

Un super admin puede:
- Crear, editar y eliminar cualquier usuario (excepto el usuario protegido)
- Bloquear y desbloquear cualquier cuenta (excepto el usuario protegido)
- Asignar y revocar roles globales
- Asignar y revocar accesos a módulos
- Gestionar grupos, empresas, módulos, submódulos, roles y permisos
- Ver información de todas las empresas y grupos
- Acceder a todos los módulos operativos sin necesidad de asignación explícita

Un super admin no puede:
- Modificar al usuario protegido del sistema

---

## Reglas del rol admin_empresa

Un admin_empresa puede:
- Ver usuarios de su propia empresa únicamente
- Crear usuarios dentro de su empresa (pendiente de activación — ver nota)
- Asignar accesos a módulos dentro de su empresa

Un admin_empresa no puede:
- Editar, bloquear ni eliminar usuarios (deshabilitado por política actual)
- Ver usuarios de otras empresas
- Gestionar grupos, empresas, módulos globales ni roles globales
- Modificar nombre completo ni matrícula de ningún usuario

> **Nota:** Las capacidades de edición del `admin_empresa` están deshabilitadas por decisión de diseño. Se habilitarán selectivamente en el módulo de roles cuando se defina el alcance exacto.

---

## Bloqueo de cuentas

### Bloqueo manual (por administrador)

Solo un `super_admin` puede bloquear o desbloquear cuentas manualmente. El motivo es obligatorio en ambas acciones. El motivo se sobreescribe cada vez — no hay historial de motivos.

El campo `lock_reason` se guarda en el `admin-service`. El estado `is_locked` se guarda en el `auth-service`. Ambos se actualizan en la misma operación.

### Bloqueo automático (por intentos fallidos)

El `auth-service` bloquea automáticamente una cuenta después de `MAX_FAILED_ATTEMPTS` intentos fallidos consecutivos (por defecto 5). Este bloqueo solo puede revertirse manualmente por un super admin.

---

## Acceso a módulos

### Usuarios con rol super_admin

Un super admin tiene acceso implícito a todos los módulos y submódulos de la plataforma sin necesidad de asignación explícita. Esto se aplica en el JWT al emitir el token — el payload incluye automáticamente todos los módulos activos.

> Esta funcionalidad está pendiente de implementación en el auth-service. Actualmente el super admin debe ser asignado manualmente a los módulos que necesite.

### Usuarios con rol de módulo

Un usuario con rol de módulo solo accede a los módulos que le fueron asignados explícitamente. El acceso se define en la tabla `user_module_accesses` con su rol correspondiente dentro del módulo.

### Filtro de datos por empresa

Dentro de cada módulo operativo, los datos siempre se filtran por `company_id` del usuario autenticado:

```python
company_id = payload.get("company_id")
query = select(Expediente).where(Expediente.company_id == company_id)
```

La única excepción son los usuarios con rol `super_admin` que pueden ver datos de todas las empresas.

---

## Implementación técnica de las restricciones

Las validaciones de roles se aplican en dos capas:

**Capa 1 — Middleware de rutas** (`shared/middleware/jwt_validator.py`):
Verifica que el token sea válido y que el usuario tenga el rol requerido para acceder al endpoint.

**Capa 2 — Lógica de negocio** (`user_service.py`):
Verifica reglas adicionales como la protección del usuario del sistema y el alcance por empresa.

```python
# Constante de protección en user_service.py
PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com"

# Verificación en cada operación sensible
if user.email == PROTECTED_SUPER_ADMIN_EMAIL:
    raise ForbiddenException("Este usuario no puede ser modificado")
```

---

## Tabla resumen de permisos

| Acción | super_admin | admin_empresa | Usuario normal |
|---|---|---|---|
| Ver usuarios de su empresa | Si | Si | No |
| Ver usuarios de otras empresas | Si | No | No |
| Crear usuario | Si | Si* | No |
| Editar usuario | Si | No | No |
| Bloquear / Desbloquear | Si | No | No |
| Eliminar usuario | Si | No | No |
| Asignar rol global | Si | No | No |
| Asignar acceso a módulo | Si | Si* | No |
| Gestionar grupos y empresas | Si | No | No |
| Gestionar módulos y roles | Si | No | No |
| Acceso a todos los módulos | Si** | No | No |
| Modificar usuario protegido | Nadie | Nadie | Nadie |

*Pendiente de activación
**Pendiente de implementación automática en JWT

---

## Cambiar el email del usuario protegido

Si en el futuro se necesita cambiar el email del usuario protegido del sistema, editar la constante en el servicio y reiniciar:

```python
# backend/admin-service/app/services/user_service.py
PROTECTED_SUPER_ADMIN_EMAIL = "nuevo_email@avalanz.com"
```

```bash
docker cp backend/admin-service/app/services/user_service.py avalanz-admin:/app/app/services/user_service.py
docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.dev.yml restart admin-service
```
