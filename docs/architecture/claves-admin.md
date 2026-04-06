# Claves de administración del sistema

## Clave de eliminación de módulos

Esta clave se requiere para eliminar un módulo desde el panel de administración.
Solo debe ser conocida por el super administrador del sistema.

**Clave:** `TF9DX4-2JAQSJ-61FVM6-0QB1AK`

**Ubicación en código:** `frontend/app/(private)/admin/modules/page.tsx` — constante `MODULE_DELETE_KEY`

**Uso:** Se solicita en el modal de confirmación al eliminar un módulo. Solo hace soft delete en BD — el código del módulo en filesystem no se elimina.

**Importante:** Si se requiere cambiar la clave, actualizar tanto este documento como la constante en el frontend.
