# Tech Debt — Módulo Legal / Submódulo Contratos
Intranet Avalanz — `feature/legal-contract-requests`

Este archivo documenta decisiones técnicas tomadas durante el desarrollo que deben revisarse o mejorarse antes de salir a producción real, así como funcionalidades planeadas que quedaron pendientes por prioridad o bloqueo externo.

---

## 1. Templates — Configuración y administración

### Estado actual
- El HTML del template vive en el filesystem del servidor (`backend/modules/legal-service/templates/nda-mutuo/template.html`)
- Los campos del formulario viven en `fields.json` en el filesystem — **NO en BD**
- La conexión entre template y tipo de contrato es manual vía `contract_type_id` en `index.json`
- Los tipos de contrato de prueba tienen UUIDs hardcodeados (`11111111-1111-1111-1111-111111111111`)

### Lo que hay que hacer
- [ ] Migrar los campos del formulario de `fields.json` → `contract_type_fields` en BD
- [ ] Crear pantalla de admin para que el coordinador legal configure:
  - Campos del formulario (agregar, editar, reordenar, marcar como requerido)
  - Anexos obligatorios y opcionales (nombre, descripción, tipos de archivo permitidos)
  - Asignación de abogados por tipo de contrato
- [ ] El HTML del template lo sube el dev — está bien así. El coordinador solo configura campos/anexos desde la UI
- [ ] Crear tipos de contrato reales con UUIDs generados por BD (eliminar los hardcodeados de prueba)
- [ ] El `index.json` es temporal — cuando los tipos de contrato vivan completamente en BD, el catálogo de templates se consulta desde ahí

### Decisión de diseño
- **Dev controla:** HTML del template (estructura y cláusulas del contrato)
- **Coordinador controla:** campos del formulario, anexos, SLA, abogados asignados
- El HTML usa variables `{{CAMPO}}` que se sustituyen con los datos del formulario al generar el PDF

---

## 2. Datos de prueba en producción

### Estado actual
- 55+ sobres de prueba en BD con todos los estados
- Tipos de contrato con UUIDs hardcodeados
- Folios mezclan `CONT-` (histórico) y `ENV-` (actual) — en producción todos serán `ENV-YYYY-NNNN`

### Lo que hay que hacer
- [ ] Eliminar datos de prueba cuando inicie operación real:
```sql
DELETE FROM envelope_activity_logs;
DELETE FROM envelope_time_tracking;
DELETE FROM envelope_status_logs;
DELETE FROM envelope_form_snapshots;
DELETE FROM envelope_signing_tokens;
DELETE FROM envelope_signers;
DELETE FROM envelope_attachments;
DELETE FROM envelope_comments;
DELETE FROM envelopes;
DELETE FROM folio_sequences;
DELETE FROM contract_type_attachment_defs;
DELETE FROM lawyer_assignments;
DELETE FROM contract_types;
```
- [ ] Crear script de seed de producción con tipos de contrato reales definidos por el equipo legal
- [ ] Verificar que `signing_provider_config` quede en `docusign` para producción o en `email_sim` si DocuSign Go-Live aún no está aprobado

---

## 3. Generación de PDF

### Estado actual
- WeasyPrint 57.2 + pydyf 0.6.0 (versiones fijadas por compatibilidad)
- El PDF se genera desde el HTML del template con variables sustituidas
- El número de contrato en el preview dice `ENV-2026-XXXX` — no es el folio real (se asigna al enviar)
- Los márgenes del PDF en páginas 2 y 3 no son iguales a la página 1

### Lo que hay que hacer
- [ ] Corregir márgenes en páginas 2+ — WeasyPrint usa `@page` pero el `body` tiene `padding` que solo aplica en página 1
- [ ] La tabla de firmas del PDF necesita mejor formato visual
- [ ] Considerar agregar encabezado/pie de página en el PDF con número de contrato y paginación

---

## 4. DocuSign — Estado actual y pendientes

### Estado actual ✅ — Completado
- Token JWT Grant funcionando contra sandbox
- `create_envelope()` — sobre creado y enviado a DocuSign
- PDF descargado de MinIO con boto3 (S3 API directa)
- Firmantes con anclas de posición (`*FIRMA1*`, `*NOMBRE1*`, `*FECHA_FIRMA1*`)
- Auto-construcción de firmantes desde `form_data` + `signers_definition` del `fields.json`
- `EMAIL_FIRMANTE_1` y `EMAIL_FIRMANTE_2` en el formulario del NDA Mutuo
- Correos de DocuSign llegando correctamente
- Webhook DocuSign Connect funcionando — HTTP 200
- Polling cron cada 5 minutos como respaldo
- PDF firmado descargado y archivado en MinIO automáticamente
- Solo PDFs marcados `is_current=False` — anexos no afectados
- Logs de actividad: `docusign_signing_completed`, `signed_document_archived`, `envelope_completed`
- Approve + send-for-signing encadenados en el frontend
- `docusign_routes.py` separado del router principal

### Pendiente
- [ ] **Firewall:** apertura de IPs DocuSign en firewall corporativo (ticket IT pendiente)
  - IPs sandbox NA: `54.240.115.126-137`, `161.38.201.200/29`, puerto 443 entrante
- [ ] **Go-Live DocuSign a producción** — cambiar `DOCUSIGN_BASE_URI` y `DOCUSIGN_AUTH_SERVER` en `.env`
- [ ] **Integración NOM-151** con proveedor certificado de Grupo Avalanz
- [ ] Regenerar clave privada RSA para ambiente productivo

### Nota importante sobre boto3
- boto3 ya está en `requirements.txt` — se incluirá en el próximo rebuild
- **Cada vez que se hace `docker compose up -d legal-service`** hay que reinstalar boto3 manualmente hasta que se haga el rebuild

---

## 5. Firmantes

### Estado actual ✅ — Completado
- Tabla `envelope_signers` con todos los campos DocuSign
- Endpoints CRUD implementados: `GET`, `POST`, `PATCH`, `DELETE` `/envelopes/{id}/signers`
- Solo editables cuando el sobre está en `borrador` o `pendiente_cliente`
- Auto-construcción desde `form_data` cuando no hay firmantes en BD
- `EMAIL_FIRMANTE_1` y `EMAIL_FIRMANTE_2` en el formulario

### Pendiente
- [ ] Paso de firmantes en el stepper de nuevo contrato (entre Datos y Anexos) para que el solicitante los defina manualmente si el template no los auto-construye
- [ ] Panel de firmantes en el slide-over del sobre (sección debajo de Documentos) con badge de status por firmante (pending / sent / signed / declined)
- [ ] Validar que haya al menos 1 firmante con email antes de permitir el envío a DocuSign

---

## 6. Subida de archivos (MinIO)

### Estado actual ✅ — Completado
- Endpoints `POST` y `GET /envelopes/{id}/attachments` implementados
- Bucket unificado a `dirdoc`
- Versionado de archivos implementado (`version_number`, `is_current`)
- Solo los PDFs se marcan `is_current=False` al archivar el firmado — anexos no afectados
- Renombrado de archivos en el stepper usando nombre del `attachmentDef`: `${folio}_${def.name}.${ext}`
- Versiones anteriores visibles solo para roles `!== 'solicitante'`

### Pendiente
- [ ] Agregar validación de `allowed_mime_types` en el backend (actualmente solo en frontend)
- [ ] Agregar validación de tamaño máximo de archivo configurable
- [ ] Endpoint `GET /envelopes/{id}/attachments/{attachment_id}/download` — descarga directa sin pasar por upload-service

---

## 7. Opción "Solicitar en DocuSign" para anexos

### Estado actual
- `allowed_mime_types` en `contract_type_attachment_defs` — implementado
- Falta el campo `request_in_docusign` en el modelo

### Lo que hay que hacer
- [ ] Migración: agregar `request_in_docusign boolean` a `contract_type_attachment_defs`
- [ ] Cuando `request_in_docusign = true` → el anexo no se pide al cliente en el formulario — DocuSign lo solicita al firmante durante la firma
- [ ] Cuando DocuSign devuelva el anexo firmado, inactivar la versión anterior del mismo tipo antes de registrar la nueva
- [ ] Coordinador puede activar/desactivar esta opción por anexo desde la UI de admin

---

## 8. Notificaciones push y actualización en tiempo real

### Estado actual
- No hay notificaciones push implementadas para el módulo legal
- La tabla de contratos no se actualiza automáticamente — requiere recarga manual de página
- El proyecto ya tiene un `websocket-service` disponible

### Notificaciones push — Lo que hay que hacer

- [ ] Notificar al solicitante cuando el abogado aprueba su sobre
- [ ] Notificar al solicitante cuando el sobre entra en firmas
- [ ] Notificar a todas las partes cuando el sobre es completado y el PDF firmado está disponible
- [ ] Notificar al abogado cuando se le asigna un nuevo sobre
- [ ] Notificar al solicitante cuando se solicitan correcciones

### Actualización automática de tabla — Lo que hay que hacer

La tabla de contratos debe actualizarse sin recargar la página cuando:
- Un sobre cambia de estado
- DocuSign completa un sobre (webhook o polling detectan la firma)
- Se asigna un abogado

**Opciones de implementación:**

| Opción | Descripción | Complejidad |
|---|---|---|
| **Polling frontend** | El frontend pregunta cada 30s si hubo cambios | Baja — implementar primero |
| **WebSocket** | Conexión persistente — el servidor empuja cambios al cliente | Media — usar `websocket-service` existente |

**Plan recomendado:**
1. Implementar primero polling simple en el frontend (intervalo de 30 segundos) para `ContractRequestsTable.tsx`
2. Cuando el backend detecte un cambio de estado (webhook DocuSign, aprobación, etc.), emitir evento al `websocket-service`
3. El frontend escucha el evento y refresca la tabla sin recargar la página

**Consideraciones importantes para el polling frontend:**
- Solo hacer polling cuando la pestaña está activa (`document.visibilityState === 'visible'`)
- Cancelar el polling cuando el componente se desmonta
- No hacer polling si hay un error de red — esperar antes de reintentar
- El polling no debe interferir con acciones del usuario en curso

```typescript
// Patrón básico de polling en ContractRequestsTable.tsx
useEffect(() => {
  const interval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      onRefresh()
    }
  }, 30000) // cada 30 segundos
  return () => clearInterval(interval)
}, [onRefresh])
```

---

## 9. Intercompañía (v2)

### Estado actual
- Campos `is_intercompany` y `counterparty_company_id` en `envelopes` — implementados en BD
- No hay flujo ni UI para contratos intercompañía

### Lo que hay que hacer
- [ ] Cuando `is_intercompany = true` → nuevo estado `pendiente_aprobacion_contraparte` antes de `pendiente_legal`
- [ ] La Empresa B (contraparte interna) recibe notificación y debe aprobar antes de que llegue a legal
- [ ] Si Empresa B rechaza → sobre cerrado, Empresa A notificada
- [ ] UI para que Empresa B vea y apruebe/rechace sobres intercompañía
- [ ] Solo aplica cuando la contraparte es una empresa del catálogo de Avalanz

---

## 10. Trazabilidad por abogado

### Estado actual
- Datos en `envelope_time_tracking` y `envelope_activity_logs`
- No hay endpoint ni UI para ver trazabilidad por abogado

### Lo que hay que hacer
- [ ] Endpoint: `GET /envelopes/reports/lawyer/{lawyer_id}` — sobres manejados, tiempos promedio, rechazos, correcciones
- [ ] Pantalla frontend — seleccionar abogado y ver su historial
- [ ] Métricas útiles: tiempo promedio de respuesta, % rechazos, sobres atrasados, carga actual

---

## 11. UI — Fixes pendientes

### Tabla de sobres
- [ ] Altura fija para 8 filas — evitar layout shift cuando hay pocos registros
- [ ] Alineación de headers con registros en algunas columnas

### Slide-over de detalle
- [ ] Panel de firmantes con status badge por firmante (pending / sent / signed / declined)
- [ ] Checklist de correcciones cuando el abogado solicita cambios
- [ ] Timeline visual del historial de estados
- [ ] Versiones anteriores de documentos visibles en el slide-over (actualmente se filtran)

### Stepper de nuevo contrato
- [ ] Paso de firmantes entre Datos y Anexos
- [ ] Precargar firmantes sugeridos desde `signers_definition` del `fields.json`

### KPIs
- [ ] El contador "Sobres activos" puede incluir completados — verificar filtro

---

## 12. Seguridad y producción

### Lo que hay que hacer antes de go-live
- [ ] Validar filtros de visibilidad: solicitante solo ve su empresa, abogado solo ve los asignados a él
- [ ] Rate limiting en endpoints de subida de archivos
- [ ] Reporte SLA diario por correo (cron 11 AM) — notificar a abogados y coordinador
- [ ] Panel KPIs para coordinador y director
- [ ] Verificar que `docusign_private.pem` está en `.gitignore`

---

## 13. Rebuild de imagen Docker

### Estado actual
- El contenedor `avalanz-legal` se levanta desde imagen vieja
- Cambios en `routes.py`, `models.py`, `signing_service.py`, `docusign_service.py`, `docusign_routes.py` se aplican via `docker cp`
- boto3 ya está en `requirements.txt` pero el contenedor actual lo tiene instalado manualmente
- La clave privada DocuSign (`docusign_private.pem`) se copia manualmente

### Lo que hay que hacer
- [ ] Hacer rebuild completo de la imagen:
  ```bash
  cd ~/intranet-avalanz/infrastructure/docker
  docker compose build --no-cache legal-service
  docker compose up -d legal-service
  # Luego copiar docusign_private.pem que no está en el repo
  docker cp ~/intranet-avalanz/backend/modules/legal-service/docusign_private.pem avalanz-legal:/app/docusign_private.pem
  ```
- [ ] Después del rebuild ya no será necesario el `docker cp` manual ni reinstalar boto3
- [ ] `docusign_private.pem` debe copiarse siempre manualmente después de cada rebuild (no está en el repo por seguridad)

---

## Prioridad sugerida

| # | Item | Prioridad | Estado |
|---|---|---|---|
| 1 | Panel de firmantes en slide-over | 🔴 Alta | Pendiente |
| 2 | Notificaciones push módulo legal | 🔴 Alta | Pendiente |
| 3 | Auto-refresh tabla sin recargar (polling 30s) | 🔴 Alta | Pendiente |
| 4 | Apertura IPs DocuSign en firewall (IT) | 🟡 Media | Ticket pendiente |
| 5 | Rebuild imagen Docker permanente | 🟡 Media | Pendiente |
| 6 | Paso de firmantes en stepper | 🟡 Media | Pendiente |
| 7 | Correcciones de PDF (márgenes) | 🟡 Media | Pendiente |
| 8 | Reporte SLA diario por correo | 🟡 Media | Pendiente |
| 9 | Panel KPIs coordinador y director | 🟡 Media | Pendiente |
| 10 | Migrar campos de fields.json a BD | 🟡 Media | Pendiente |
| 11 | UI de configuración de templates | 🟡 Media | Pendiente |
| 12 | request_in_docusign en anexos | 🟡 Media | Pendiente |
| 13 | Trazabilidad por abogado | 🟡 Media | Pendiente |
| 14 | Fixes de UI (tabla, slide-over timeline) | 🟢 Baja | Pendiente |
| 15 | Intercompañía | 🟢 Baja | V2 |
| 16 | NOM-151 | 🟢 Baja | Post Go-Live |
| 17 | Go-Live DocuSign producción | 🟢 Baja | Post aprobación presupuesto |
| 18 | Limpieza de datos de prueba | 🟢 Baja | Al momento de go-live |