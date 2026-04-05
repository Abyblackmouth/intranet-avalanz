# Tech Debt & UX Pendientes

Este archivo documenta mejoras pendientes que no son fallas críticas pero impactan la experiencia o el rendimiento. Se atienden cuando no hay features activas en desarrollo.

---

## Frontend

### Autocomplete de Chrome en campo de búsqueda de usuarios
**Archivo:** `frontend/app/(private)/admin/users/page.tsx`
**Descripción:** Chrome autocompleta el campo de búsqueda con credenciales guardadas al abrir modales que contienen inputs de contraseña. `autoComplete="off"` y `type="search"` no lo resuelven — Chrome los ignora. Requiere un componente de input personalizado que bloquee el comportamiento de forma más agresiva.
**Impacto:** UX — el filtro de búsqueda se llena con el email del admin al abrir el modal de reset de contraseña.

---

## Backend

### Mensaje de cuenta bloqueada no diferencia tipo de bloqueo
**Archivo:** `backend/auth-service/app/services/auth_service.py`
**Descripción:** Cuando una cuenta está bloqueada, el mensaje de error es genérico sin importar si fue bloqueada manualmente por un admin o automáticamente por intentos fallidos.
**Cambio requerido:**
- Bloqueo manual → `"Tu cuenta ha sido bloqueada. Contacta al administrador."`
- Bloqueo por intentos fallidos → `"Cuenta bloqueada por múltiples intentos fallidos. Contacta al administrador."`
**Impacto:** UX — el usuario no sabe por qué fue bloqueado ni qué hacer.

---

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.

### Hover en opciones del menú de 3 puntos
**Archivo:** `frontend/components/admin/users/UserTable.tsx`
**Descripción:** Las opciones del menú de acciones (3 puntos) no tienen hover visible al pasar el mouse. El usuario no puede distinguir visualmente sobre qué opción está posicionado.
**Cambio requerido:** Agregar fondo gris (`hover:bg-slate-100`) en el componente `MenuItem` para opciones no peligrosas, y `hover:bg-red-50` para las peligrosas ya lo tiene.
**Impacto:** UX — falta feedback visual de posición del cursor.

### Navegación hacia atrás en flujo de cambio de contraseña
**Archivo:** `frontend/app/(auth)/change-password/page.tsx`
**Descripción:** Al presionar el botón de atrás del navegador durante el flujo de cambio de contraseña temporal, el usuario puede acceder al dashboard sin haber completado el cambio. Esto ocurre porque el middleware solo valida que exista un token, no que el flujo de primer login esté completo.
**Cambio requerido:** Verificar `is_temp_password` en el AuthProvider o middleware y forzar la redirección a `/change-password` si el usuario tiene contraseña temporal activa.
**Impacto:** Seguridad — usuario puede acceder al sistema sin cambiar su contraseña temporal.

### Editar empresa del usuario desde el formulario de edición
**Archivo:** `frontend/components/admin/users/UserEditForm.tsx`
**Descripción:** El formulario de edición de usuario no incluye el campo de empresa (`company_id`). El super admin debería poder reasignar un usuario a una empresa diferente desde este formulario.
**Cambio requerido:** Agregar selector de empresa (solo empresas activas) en `UserEditForm.tsx` y pasar `company_id` en el payload de `UpdateUserRequest`. Verificar que el backend en `update_user` de `user_service.py` acepte y procese el campo `company_id`.
**Impacto:** UX — el super admin no puede cambiar la empresa de un usuario sin eliminarlo y recrearlo.
