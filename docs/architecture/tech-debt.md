# Tech Debt & UX Pendientes

Este archivo documenta mejoras pendientes que no son fallas críticas pero impactan la experiencia o el rendimiento. Se atienden cuando no hay features activas en desarrollo.

---

## Integración API Comunidad Avalanz

### Contexto
Comunidad Avalanz es el sistema de RRHH del grupo. Expone una API REST con filtros dinámicos LoopBack 4 que permite consultar empleados por matrícula, nombre, empresa y otras propiedades. La respuesta viene **encriptada en AES-256 (Base64)** dentro de la propiedad `data`. La clave de descifrado ya está en posesión del desarrollador.

---

### Pendiente 1 — Autocompletado en formulario de creación de usuario

**Archivo principal:** `frontend/components/admin/users/UserForm.tsx`
**Estado:** Pendiente — API disponible, clave AES-256 en posesión.

**Flujo esperado:**
1. El admin ingresa el número de matrícula (`enrollment`) en el formulario de creación
2. El frontend consulta la API de Comunidad Avalanz filtrando por `enrollment`
3. Si **encuentra** al empleado → autocompleta los campos del formulario automáticamente (todos editables antes de guardar)
4. Si **no encuentra** → deja todos los campos vacíos y editables para captura manual — no bloquea la creación

**Campos que se autocompletarán desde la API:**

| Campo formulario | Campo API Comunidad | Notas |
|---|---|---|
| `full_name` | `firstName + middleName + lastName` | Concatenar con espacio, ignorar middleName si es null o vacío |
| `email` | `email` | Directo |
| `departamento` | `department.name` | Viene de la relación `department` |
| `phone` | `phone` | Campo nuevo a agregar a la BD |
| `photo_url` | `photoProfileUrl` | Campo nuevo a agregar a la BD — puede llegar vacío |
| `date_admission` | `dateAdmission` | Campo nuevo a agregar a la BD — puede llegar como `1970-01-01` (inválido), validar |
| `comunidad_id` | `uuid` | Campo nuevo a agregar a la BD — UUID de Comunidad Avalanz para sincronización futura |

**Campos que NO se autocompletarán desde la API** (el admin los asigna manualmente):
- `company_id` — la empresa en la intranet no necesariamente coincide con `companyId` de Comunidad
- `puesto` — viene como `jobPositionId` (solo ID), no como texto legible
- `global_role_id` — es decisión del admin, no de Comunidad Avalanz
- `module_accesses` — igual, decisión del admin

**Filtro a enviar a la API:**
```json
{
  "where": { "enrollment": "526245" },
  "fields": {
    "firstName": true,
    "middleName": true,
    "lastName": true,
    "email": true,
    "phone": true,
    "photoProfileUrl": true,
    "dateAdmission": true,
    "uuid": true,
    "departmentId": true
  },
  "include": [
    {
      "relation": "department",
      "scope": { "fields": { "id": true, "name": true } }
    }
  ]
}
```

**UX del autocompletado:**
- Mostrar un spinner junto al campo de matrícula mientras se consulta
- Si encuentra: mostrar un banner verde sutil "Empleado encontrado en Comunidad Avalanz" y rellenar campos
- Si no encuentra: mostrar un banner amarillo sutil "Empleado no encontrado — captura manual" y habilitar todos los campos
- Los campos autocompletados deben ser editables — el admin puede corregir antes de guardar
- Si `photoProfileUrl` viene vacío o con URL inválida, usar iniciales como avatar (comportamiento actual)
- Si `dateAdmission` viene como `1970-01-01T00:00:00.000Z`, tratarla como nula

---

### Pendiente 2 — Nuevos campos en `avalanz_admin.users`

**Estado:** Pendiente — requiere migración Alembic antes de implementar el autocompletado.

Los siguientes campos deben agregarse a la tabla `users` del `avalanz_admin`:

| Campo | Tipo BD | Nullable | Descripción |
|---|---|---|---|
| `phone` | `VARCHAR(20)` | Sí | Teléfono del empleado — para directorio y futuras notificaciones SMS |
| `photo_url` | `VARCHAR(500)` | Sí | URL del avatar del empleado desde Comunidad Avalanz |
| `date_admission` | `DATE` | Sí | Fecha de ingreso al grupo — para reportes de antigüedad |
| `comunidad_id` | `VARCHAR(100)` | Sí | UUID del empleado en Comunidad Avalanz — vínculo para sincronización futura |

**Pasos de implementación:**

1. Agregar columnas al modelo SQLAlchemy en `backend/admin-service/app/models/admin_models.py`
2. Generar migración Alembic: `docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'add comunidad fields to users'"`
3. Verificar que Alembic no genere `pass` — si lo hace, escribir el `op.add_column` manualmente
4. Aplicar migración: `docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"`
5. Actualizar `user_service.py` — agregar los 4 campos en `create_user`, `update_user` y `_serialize_user`
6. Actualizar `users.py` (routes) — agregar campos en `CreateUserRequest` y `UpdateUserRequest`
7. Actualizar `user.types.ts` en el frontend — agregar los 4 campos opcionales en `UserRow`, `CreateUserPayload` y `UpdateUserPayload`
8. Actualizar `UserForm.tsx` — implementar el autocompletado
9. Actualizar `UserEditForm.tsx` — mostrar y editar `phone` y `photo_url` (los demás son de solo lectura)
10. Copiar archivos modificados al contenedor y reiniciar admin-service

Ver guía completa de referencia en: `docs/architecture/agregar-campos-usuario.md`

---

### Pendiente 3 — Descifrado AES-256 de la respuesta

**Estado:** Pendiente — clave en posesión del desarrollador.

La API retorna la respuesta encriptada en AES-256 (Base64) dentro de la propiedad `data`. El descifrado debe hacerse **en el backend** (admin-service), nunca exponer la clave en el frontend.

**Arquitectura recomendada:**
- Crear un endpoint interno en el `admin-service`: `GET /internal/comunidad/user?enrollment=526245`
- El admin-service consulta la API de Comunidad Avalanz, descifra la respuesta con la clave AES, y retorna los campos necesarios ya limpios al frontend
- La clave AES se guarda como variable de entorno en el `admin-service`: `COMUNIDAD_AES_KEY`
- El frontend nunca tiene acceso directo a la API de Comunidad Avalanz ni a la clave

**Variable de entorno a agregar en `backend/admin-service/.env`:**
```bash
COMUNIDAD_API_URL=https://comunidadavalanz.com.mx/api/intranet
COMUNIDAD_AES_KEY=<clave_en_posesion_del_desarrollador>
```

---

### Pendiente 4 — Patrón de filtros LoopBack 4 para módulos operativos

**Estado:** Pendiente — aplicar cuando se desarrollen Bóveda, Legal y demás módulos operativos.

La API de Comunidad Avalanz usa filtros LoopBack 4. Este mismo patrón debe usarse como estándar en los buscadores de empleados dentro de los módulos operativos.

**Filtros disponibles:**

| Filtro | Descripción |
|---|---|
| `limit` / `skip` | Paginación |
| `order` | Ordenamiento — ej. `["lastName ASC"]` |
| `fields` | Selección de campos — solo pedir lo necesario |
| `where` | Filtrado — soporta `ilike`, `or`, `and`, operadores de comparación |
| `include` | Relaciones — `company`, `department`, `jobPosition`, `jobCategory` |

**Patrón de búsqueda por nombre completo (múltiples términos):**
```json
{
  "where": {
    "and": [
      {
        "or": [
          { "firstName": { "ilike": "%juan%" } },
          { "middleName": { "ilike": "%juan%" } },
          { "lastName": { "ilike": "%juan%" } }
        ]
      },
      {
        "or": [
          { "firstName": { "ilike": "%perez%" } },
          { "middleName": { "ilike": "%perez%" } },
          { "lastName": { "ilike": "%perez%" } }
        ]
      }
    ]
  }
}
```

**Patrón de búsqueda por matrícula exacta:**
```json
{ "where": { "enrollment": "526245" } }
```

**Relaciones disponibles con sus campos útiles:**
```json
{
  "include": [
    { "relation": "company", "scope": { "fields": { "id": true, "name": true } } },
    { "relation": "department", "scope": { "fields": { "id": true, "name": true } } },
    { "relation": "jobPosition", "scope": { "fields": { "id": true, "name": true } } },
    { "relation": "jobCategory", "scope": { "fields": { "id": true, "name": true } } }
  ]
}
```

**Nota importante:** El filtro se envía como query param URL-encoded:
```typescript
const url = `/api/intranet/users?filter=${encodeURIComponent(JSON.stringify(filterObject))}`
```

---

## Seguridad — pendientes

### SPF + DKIM en Office 365
**Estado:** Pendiente con el admin del tenant de Office 365.
**Cambio requerido:**
- Verificar que el registro SPF de `avalanz.com` incluya `spf.protection.outlook.com`
- Activar DKIM en Exchange Admin Center para el dominio `avalanz.com`
**Impacto:** Correos del sistema van a no deseados en destinatarios externos.

### Notificación de login desde IP nueva
**Descripción:** El sistema ya registra la IP de cada login. Falta enviar correo de alerta cuando un usuario accede desde una IP que nunca ha usado antes.
**Cambio requerido:** En auth-service, comparar la IP del login actual contra el historial. Si es nueva, enviar correo via email-service con fecha, hora e IP.
**Impacto:** Seguridad — alerta temprana ante accesos no autorizados.

### Cloudflare como proxy (largo plazo)
**Descripción:** El rate limiting de Nginx protege contra atacantes con una sola IP pero no contra botnets o ataques volumétricos a nivel de red.
**Cambio requerido:** Cambiar los DNS para que apunten a Cloudflare en lugar de la IP pública directamente. Plan gratuito absorbe ataques volumétricos y ofrece WAF básico.
**Impacto:** Seguridad DDoS — protección ante ataques distribuidos.

---

## Infraestructura — pendientes

### rsync al servidor secundario de backups
**Descripción:** El acta del proyecto define dos servidores: principal y secundario dedicado a backups. El cron actual ejecuta `pg_dump` localmente pero no transfiere nada al servidor secundario.
**Cambio requerido:**
- Configurar acceso SSH sin contraseña entre servidor principal y servidor secundario
- Agregar job al cron que ejecute `rsync` diario de los backups de PostgreSQL al servidor secundario
- Agregar job al cron que ejecute `rsync` o `mc mirror` de MinIO (bucket `dirdoc`) al servidor secundario
- Definir retención en el servidor secundario (mínimo 30 días)
**Impacto:** Crítico — sin esto el servidor secundario definido en el acta no cumple ninguna función.

### Scripts de verificación de integridad de backups
**Descripción:** Un backup que nunca se ha probado no garantiza recuperación.
**Cambio requerido:**
- Script semanal que restaure el backup más reciente de PostgreSQL en una BD temporal y verifique que las tablas principales existen y tienen registros
- Script que verifique el checksum de los archivos de backup contra el registro generado al momento del dump
- Notificación por correo si la verificación falla
**Archivo:** `infrastructure/cron/`
**Impacto:** Operación — sin verificación no hay certeza de que los backups sean utilizables ante un desastre.

### Centralización de logs con Rsyslog + logrotate
**Descripción:** Actualmente los logs de cada microservicio viven dentro de su contenedor Docker. En producción esto hace imposible diagnosticar problemas sin entrar a cada contenedor por separado.
**Cambio requerido:**
- Configurar Rsyslog en el servidor para recolectar logs de todos los contenedores
- Configurar logrotate para comprimir y rotar logs con retención de 90 días
**Impacto:** Operación — sin logs centralizados el diagnóstico en producción es ciego.

---

## Trazabilidad — pendientes

### Auditoría de acciones administrativas
**Descripción:** Se registra quién sube y baja archivos de empleados pero no hay log de acciones críticas del panel como crear usuario, cambiar rol, eliminar empresa, bloquear cuenta, etc.
**Cambio requerido:** Crear tabla `admin_audit_log` en el admin-service con: acción, entidad afectada, `performed_by`, `performed_at`, `ip_address`, detalle JSON.
**Impacto:** Trazabilidad — sin esto no se puede auditar quién hizo qué en el panel de administración.

### Política de retención de logs de auditoría
**Descripción:** Definir cuánto tiempo se guardan los logs de login, historial de accesos y auditoría de archivos. Actualmente el cron limpia historial de login a 90 días y sesiones revocadas a 30 días.
**Pendiente:** Confirmar con el área legal si esos tiempos cumplen con los requisitos de cumplimiento del grupo.

---

## Frontend

### Hover en módulos del sidebar
**Archivo:** `frontend/components/layout/Sidebar.tsx`
**Descripción:** El hover en los módulos del sidebar no funciona visualmente aunque el código es idéntico al commit donde sí funcionaba. El `hover:bg-slate-100` está en el `div` exterior pero no se renderiza. Posible bug de Tailwind v4.
**Impacto:** UX — sin feedback visual al pasar el mouse por los módulos.

### Performance del frontend en desarrollo — Next.js Turbopack lento en WSL2
**Archivo:** `frontend/next.config.ts`
**Descripción:** Next.js con Turbopack detecta el filesystem de WSL2 como lento (benchmark >200ms).
**Impacto:** DX — el desarrollo es más lento de lo esperado en WSL2.

### TypeScript — role_id no existe en tipo GlobalRole y ModuleRole en UserForm
**Archivo:** `frontend/components/admin/users/UserForm.tsx`
**Cambio requerido:** Actualizar los tipos en `role.types.ts` para asegurar consistencia en el nombre del campo ID.
**Impacto:** TypeScript — no bloquea el build de producción pero genera errores en `tsc --noEmit`.

### TypeScript — pages de rutas dinámicas [id] no son módulos válidos
**Archivos:** `frontend/app/(private)/admin/companies/[id]/page.tsx`, `groups/[id]/page.tsx`, `modules/[id]/page.tsx`, `users/[id]/page.tsx`
**Cambio requerido:** Verificar que cada página dinámica tenga `export default function Page({ params }: { params: { id: string } })`.
**Impacto:** TypeScript — no bloquea el build pero genera ruido en el output de `tsc --noEmit`.

---

## Scaffold automático

### Auto-commit del scaffold falla silenciosamente
**Descripción:** El scaffold-server genera los archivos correctamente pero el auto-commit via gitCommit() puede fallar sin reportar error visible. Los archivos se crean pero no se pushean al repo automáticamente.
**Cambio requerido:** Agregar logging detallado al flujo gitCommit() en `scripts/scaffold-server.js` y enviar notificación si el commit falla.
**Impacto:** Operación — al crear un módulo desde el panel los archivos están en el servidor pero no en el repo.

---

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.