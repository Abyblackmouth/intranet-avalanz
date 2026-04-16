# Politica de Roles y Permisos - Guia de Referencia

Ubicacion: `docs/architecture/`

Esta guia define las reglas de negocio que gobiernan el sistema de roles, permisos y restricciones de acceso de la plataforma Avalanz. Cualquier modulo nuevo que se construya debe respetar estas politicas.

---

## Jerarquia de roles

```
super_admin              (TI Corporativo - control total)
    admin_empresa        (TI Corporativo personal - gestion amplia con restricciones)
        Roles operativos (Gerente, Supervisor, Operador, etc.)
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

### Roles operativos

Roles del catalogo general - reutilizables en cualquier modulo. Se crean desde `/admin/roles`.

| Campo | Descripcion |
|---|---|
| name | Nombre visible (Ej. Gerente, Supervisor, Operador) |
| slug | Identificador unico auto-generado |
| scope | empresa o corporativo |
| module_id | Null = catalogo general, UUID = exclusivo de ese modulo |

- **Scope empresa** - el usuario solo ve datos de su company_id
- **Scope corporativo** - el usuario ve datos de todas las empresas (Contraloria, Auditoria, Control Interno)

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
- Asignar y revocar accesos a modulos con rol operativo
- Gestionar grupos, empresas, modulos, submodulos, roles y permisos
- Ver informacion de todas las empresas y grupos
- Acceder a todos los modulos operativos automaticamente sin asignacion explicita
- Eliminar modulos, submodulos, empresas y grupos

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
- Asignar y revocar accesos a modulos con rol operativo
- Ver todas las empresas y grupos

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

### Usuarios con rol operativo

Solo acceden a los modulos asignados explicitamente via user_module_accesses.

- Scope empresa: cross_company false, datos filtrados por company_id
- Scope corporativo: cross_company true, datos de todas las empresas

### Filtro de datos por empresa en modulos operativos

Cada modulo operativo debe filtrar sus consultas por company_id del JWT, excepto cuando cross_company es true.

---

## Tabla resumen de permisos

| Accion | super_admin | admin_empresa | Rol operativo |
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

---

## JWT - campos relevantes

El payload del access_token incluye: user_id, email, full_name, roles, modules, companies, permissions, cross_company.

cross_company es true si el usuario es super_admin o tiene al menos un rol con scope corporativo.

---

## Implementacion tecnica

Las validaciones se aplican en dos capas:

Capa 1 - Middleware (shared/middleware/jwt_validator.py): verifica token y rol minimo requerido.

Capa 2 - Logica de negocio (user_service.py): verifica reglas especificas como proteccion del usuario del sistema, restricciones de admin_empresa, y bloqueo de super_admin.

---

## Cambiar el email del usuario protegido

Editar la constante PROTECTED_SUPER_ADMIN_EMAIL en backend/admin-service/app/services/user_service.py y reiniciar admin-service.
