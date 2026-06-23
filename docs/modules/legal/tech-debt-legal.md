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
- [ ] Migrar los campos del formulario de `fields.json` al filesystem → `contract_type_fields` en BD
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
- 15 sobres de prueba en BD con estados variados
- 4 tipos de contrato con UUIDs hardcodeados
- 1 anexo (INE) insertado manualmente

### Lo que hay que hacer
- [ ] Eliminar datos de prueba cuando inicie operación real:
```sql
DELETE FROM envelope_activity_logs;
DELETE FROM envelope_time_tracking;
DELETE FROM envelope_status_logs;
DELETE FROM envelope_form_snapshots;
DELETE FROM envelope_signers;
DELETE FROM envelope_attachments;
DELETE FROM envelopes;
DELETE FROM folio_sequences;
DELETE FROM contract_type_attachment_defs;
DELETE FROM lawyer_assignments;
DELETE FROM contract_type_fields;
DELETE FROM contract_types;
```
- [ ] Crear script de seed de producción con tipos de contrato reales definidos por el equipo legal
- [ ] Los folios de prueba mezclan `CONT-` y `ENV-` — en producción todos serán `ENV-YYYY-NNNN`

---

## 3. Generación de PDF

### Estado actual
- WeasyPrint 57.2 + pydyf 0.6.0 (versiones fijadas por compatibilidad)
- El PDF se genera desde el HTML del template con variables sustituidas
- El número de contrato en el preview dice `ENV-2026-XXXX` — no es el folio real
- Los márgenes del PDF en páginas 2 y 3 no son iguales a la página 1

### Lo que hay que hacer
- [ ] Corregir márgenes en páginas 2+ — WeasyPrint usa `@page` pero el `body` tiene `padding` que solo aplica en página 1
- [ ] Al enviar el sobre, generar el PDF final con el folio real y guardarlo en MinIO
- [ ] La tabla de firmas del PDF necesita mejor formato visual
- [ ] Considerar agregar encabezado/pie de página en el PDF con número de contrato y paginación

---

## 4. Subida de archivos (MinIO)

### Estado actual
- El endpoint `POST /envelopes/{id}/attachments` se llama en el submit pero **no está implementado en el backend**
- Los archivos no llegan a ningún lado — el submit falla silenciosamente

### Lo que hay que hacer
- [ ] Implementar endpoint `POST /envelopes/{id}/attachments` — recibe multipart/form-data, sube a MinIO bucket `legal-envelopes`, guarda metadatos en `envelope_attachments`
- [ ] Implementar endpoint `GET /envelopes/{id}/attachments` — lista archivos del sobre
- [ ] Implementar endpoint `GET /envelopes/{id}/attachments/{attachment_id}/download` — descarga firmada desde MinIO
- [ ] Agregar validación de `allowed_mime_types` en el backend (no solo en el frontend)
- [ ] Agregar validación de tamaño máximo de archivo
- [ ] Bucket MinIO: `legal-envelopes` — verificar que existe o crearlo

---

## 5. DocuSign — Simulación por correo

### Estado actual
- No hay integración con DocuSign
- Cuando el abogado aprueba un sobre, el estado cambia a `en_firmas` pero no pasa nada más

### Lo que hay que hacer (simulación antes de DocuSign real)
- [ ] Al aprobar un sobre, el sistema manda un correo a cada firmante con:
  - Resumen del contrato
  - Link para "confirmar firma" (endpoint interno que simula la firma)
  - Lista de documentos adjuntos
- [ ] Endpoint interno: `POST /envelopes/{id}/signers/{signer_id}/simulate-sign` — marca al firmante como `signed`
- [ ] Cuando todos los firmantes estén `signed` → sobre pasa a `completado`
- [ ] Al implementar DocuSign real, solo se cambia el servicio de correo por la llamada a la API — el flujo no cambia

### DocuSign real (cuando esté listo)
- [ ] Auth JWT con cuenta sandbox de DocuSign
- [ ] `POST /envelopes/{id}/send-to-docusign` — crea envelope en DocuSign con firmantes y PDF
- [ ] Configurar webhook de DocuSign → `POST /envelopes/docusign/webhook`
- [ ] Al recibir `envelope-completed` → descargar PDF firmado → guardar en MinIO → actualizar estado
- [ ] Guardar `docusign_envelope_id` en `envelopes`
- [ ] Registrar cada evento de DocuSign en `envelope_signers` (status, signed_at, declined_reason)

---

## 6. Firmantes

### Estado actual
- Tabla `envelope_signers` creada y migrada
- No hay endpoints CRUD para firmantes
- No hay UI para agregar firmantes en el formulario de nuevo contrato

### Lo que hay que hacer
- [ ] Endpoints CRUD: `GET`, `POST`, `PATCH`, `DELETE` `/envelopes/{id}/signers`
- [ ] Agregar paso de firmantes en el stepper de nuevo contrato (después de Datos, antes de Anexos)
- [ ] El solicitante define: nombre, email, cargo, orden de firma, documentos a solicitar (INE, pasaporte, poder notarial)
- [ ] Validar que haya al menos 1 firmante antes de permitir el envío
- [ ] Panel de firmantes en el slide-over del sobre (para que el abogado lo vea)

---

## 7. Opción "Solicitar en DocuSign" para anexos

### Estado actual
- `allowed_mime_types` en `contract_type_attachment_defs` — implementado
- Falta el campo `request_in_docusign` en el modelo (está en el DBML pero no en la BD)

### Lo que hay que hacer
- [ ] Migración: agregar `request_in_docusign boolean` a `contract_type_attachment_defs`
- [ ] Cuando `request_in_docusign = true` → el anexo no se pide al cliente en el formulario — DocuSign lo solicita al firmante
- [ ] Coordinador/Admin puede activar/desactivar esta opción por anexo desde la UI de admin

---

## 8. Intercompañía (v2)

### Estado actual
- Campos `is_intercompany` y `counterparty_company_id` en `envelopes` — implementados
- No hay flujo ni UI para contratos intercompañía

### Lo que hay que hacer
- [ ] Cuando `is_intercompany = true` → nuevo estado `pendiente_aprobacion_contraparte` antes de `pendiente_legal`
- [ ] La Empresa B (contraparte interna) recibe notificación y debe aprobar antes de que llegue a legal
- [ ] Si Empresa B rechaza → sobre cerrado, Empresa A notificada
- [ ] Si Empresa B aprueba → flujo normal a `pendiente_legal`
- [ ] UI para que Empresa B vea y apruebe/rechace sobres intercompañía
- [ ] Solo aplica cuando la contraparte es una empresa del catálogo de Avalanz

---

## 9. Trazabilidad por abogado

### Estado actual
- Datos en `envelope_time_tracking` y `envelope_activity_logs`
- No hay endpoint ni UI para ver trazabilidad por abogado

### Lo que hay que hacer
- [ ] Endpoint: `GET /envelopes/reports/lawyer/{lawyer_id}` — sobres manejados, tiempos promedio, rechazos, correcciones
- [ ] Pantalla frontend en módulo legal — seleccionar abogado y ver su historial
- [ ] Métricas útiles: tiempo promedio de respuesta, % rechazos, sobres atrasados, carga actual

---

## 10. UI — Fixes pendientes

### Tabla de sobres
- [ ] Altura fija para 8 filas — evitar layout shift cuando hay pocos registros
- [ ] Alineación de headers con registros (columna Empresa desalineada)
- [ ] Paginación invisible cuando hay pocos registros

### Slide-over de detalle
- [ ] Mostrar anexos del sobre
- [ ] Mostrar firmantes del sobre
- [ ] Checklist de correcciones cuando el abogado solicita cambios
- [ ] Timeline visual del historial de estados

### KPIs
- [ ] El contador "Sobres activos" cuenta todos incluyendo completados — filtrar solo los abiertos

---

## 11. Seguridad y producción

### Lo que hay que hacer antes de go-live
- [ ] Validar que el solicitante solo puede ver sus propios sobres (filtro por `company_id`)
- [ ] Validar que el abogado solo ve sobres asignados a su tipo de contrato
- [ ] Rate limiting en endpoints de subida de archivos
- [ ] Tamaño máximo de archivo configurable
- [ ] Logs de auditoría completos en `envelope_activity_logs` para cada acción
- [ ] Reporte SLA diario por correo (cron 11 AM) — notificar a abogados y coordinador
- [ ] Panel KPIs para coordinador y director

---

## Prioridad sugerida

| # | Item | Prioridad | Bloqueante |
|---|---|---|---|
| 1 | Endpoint subida de archivos a MinIO | 🔴 Alta | Submit del contrato no funciona sin esto |
| 2 | Endpoints CRUD firmantes | 🔴 Alta | Necesario para DocuSign |
| 3 | Simulación DocuSign por correo | 🔴 Alta | Desbloquea el flujo completo |
| 4 | Migrar campos de fields.json a BD | 🟡 Media | Necesario para UI de configuración |
| 5 | Correcciones de PDF (márgenes) | 🟡 Media | Cosmético pero importante para legal |
| 6 | UI de configuración de templates | 🟡 Media | Permite al coordinador administrar sin dev |
| 7 | request_in_docusign en anexos | 🟡 Media | Funcionalidad solicitada por equipo legal |
| 8 | Trazabilidad por abogado | 🟡 Media | Solicitado por equipo legal |
| 9 | Fixes de UI (tabla, slide-over) | 🟢 Baja | Cosmético |
| 10 | Intercompañía | 🟢 Baja | V2 — no bloquea flujo base |
| 11 | Limpieza de datos de prueba | 🟢 Baja | Al momento de go-live |
