# Tech Debt & Pendientes — IT Service Desk

Ubicación sugerida: `docs/modules/it-service-desk/`

Este documento consolida en un solo lugar los **hallazgos, brechas y pendientes** del módulo IT Service Desk (Incidentes, Control de Cambios y Solicitud de Accesos) que hoy están dispersos entre los demás documentos del módulo. No son fallas críticas que impidan operar — el módulo está en productivo desde el 1 de octubre de 2026 — pero conviene tenerlos a la vista y atenderlos cuando no haya una feature activa en desarrollo.

Cada item indica su **fuente** (el documento y sección de donde proviene) para poder rastrearlo. Se revisa y se limpia al inicio de cada sprint.

> Convención de estado: **Abierto** (pendiente), **En progreso**, **Resuelto — verificar** (parece hecho en el código pero falta confirmar/tachar en los docs).

---

## 0. Documentación — consistencia

### Confirmar y tachar el pendiente "actualizar los 3 documentos"
**Estado:** Resuelto — verificar.
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (pendiente #2) vs. contenido real de `it-service-desk-motor-asignacion.md`, `it-service-desk-roles-y-perfiles.md`, `it-service-desk-base-de-datos.md`.
**Descripción:** El contexto de sesión lista como pendiente inmediato "actualizar los otros 3 documentos (motor, roles, base de datos), completos, sin condensar". Al leerlos, los tres ya traen el contenido de septiembre-octubre: la regla `resolve_cdc_assignment` construida (motor §10), el botón "Activarme como: Project Manager" como hecho (roles §5.2), y la migración `ARRAY → system_id/module_id` FK `5c0967de0571` (base-datos §4). Parece que ya se actualizaron después de escribir ese pendiente.
**Cambio requerido:** Verificar que los tres estén efectivamente al día y, de ser así, tachar el pendiente #2 del contexto para que no se vuelva a arrastrar.
**Impacto:** Documentación — evita retrabajo y confusión sobre qué falta realmente.

### Inconsistencia del id de PM2 del frontend
**Estado:** Abierto (cosmético).
**Fuente:** `contexto-sesion-it-service-desk.md` §2 (id 1 desde el reinicio del 2 oct 2026) vs. referencias previas que lo citan como id 2.
**Descripción:** El proceso de PM2 `intranet-frontend` aparece como **id 1** en el contexto nuevo y como **id 2** en notas/memorias previas.
**Cambio requerido:** Unificar la referencia en toda la documentación (el id de PM2 puede cambiar al recrear el proceso; vale la pena no fijarlo o aclarar que es volátil).
**Impacto:** Documentación — menor.

---

## 1. Base de datos y rendimiento

### 🟡 Índices faltantes en `incidents`
**Estado:** Abierto — hallazgo documentado, no aplicado.
**Fuente:** `it-service-desk-base-de-datos.md` §3.4 y §8.1.
**Descripción:** `incidents` solo tiene índices sobre PK (`id`) y `folio`. No existe índice sobre `ticket_type`, `status`, `company_id`, `requester_id` ni `assigned_to_user_id` — justo las columnas que más se filtran: el listado ordena por `created_at`, el dashboard filtra por rango de fechas y `ticket_type`, y el Kanban agrupa por `status`. Con el volumen actual (~98 renglones) no se nota, pero es una brecha real conforme crezca, especialmente ahora que `ticket_type` es columna de filtro activo desde que CDC comparte la tabla.
**Cambio requerido:** Evaluar y agregar índices sobre `ticket_type`, `status`, `company_id` (y posiblemente `assigned_to_user_id`) mediante su propia migración Alembic. No se aplicó durante la sesión de revisión por ser una decisión que amerita su propia migración.
**Impacto:** Rendimiento — latencia creciente del listado, dashboard y Kanban a mayor volumen de tickets.

### `is_sla_breached` nunca se actualiza
**Estado:** Abierto (columna muerta).
**Fuente:** `it-service-desk-service.md` §7.2.
**Descripción:** La columna `is_sla_breached` de `incidents` no se actualiza en ningún lado. Los relojes de la tabla, el dashboard y el Excel calculan el estado del SLA con las **fechas reales** (límite contra revisión o resolución), no con ese campo.
**Cambio requerido:** Decidir entre (a) eliminar la columna si nunca se va a poblar, o (b) poblarla consistentemente si algún consumidor la necesita. Documentar la decisión.
**Impacto:** Claridad del modelo — una columna que aparenta significar algo pero está siempre vacía induce a error a quien escriba consultas nuevas.

---

## 2. Control de Cambios (CDC)

### Fase 2 "En revisión" — lógica post-asignación
**Estado:** Abierto.
**Fuente:** `it-service-desk-roles-y-perfiles.md` §5.2 (#3); `it-service-desk-motor-asignacion.md` §10.
**Descripción:** El CDC ya llega correctamente a `en_revision` asignado (vía `resolve_cdc_assignment`), pero falta qué pasa **una vez que la persona asignada empieza a trabajarlo**: documentos que se agregan, cuándo pasa a Aprobado/Rechazado, etc. La etiqueta visible debe leerse como "En revisión por Gerencia de Proyectos", sin rol nuevo.
**Cambio requerido:** Construir el flujo de la etapa "En revisión" (acciones, transición a Aprobado/Rechazado, documentos de la etapa).
**Impacto:** Funcional — el ciclo de CDC queda incompleto en esa transición.

### CDC — pendientes heredados
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §17 (#16); `contexto-sesion-it-service-desk.md` §5 (#18).
**Descripción:** Varios pendientes acumulados del ciclo de CDC:
- Guardado automático (autosave) en **dictamen** y **priorización**.
- Catálogo "**Quién lo desarrolla**".
- **Ventana de instalación** en Paso a producción (ventana, reversa, aviso) — explícitamente diferido.
- Aprobación de **ajuste de alcance** y flujo de **Modificación**.
- **Cancelación** del CDC.
- **Responsable por RT** durante el desarrollo.
**Cambio requerido:** Priorizar y construir cada uno por separado.
**Impacto:** Funcional/UX — robustez del ciclo de CDC.

### Logo en el PDF del CDC
**Estado:** Abierto.
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#16).
**Descripción:** Falta colocar el logo en el PDF del CDC (`app/services/logo.py` → `control_cambios.py`).
**Impacto:** Presentación del documento generado.

---

## 3. Control de Accesos (ACC)

### Firma manual — prueba de punta a punta
**Estado:** Abierto (implementado, sin probar end-to-end).
**Fuente:** `it-service-desk-control-accesos-firma-manual.md` (Pendiente); `it-service-desk-service.md` §17 (#7); `contexto-sesion-it-service-desk.md` §5 (#3).
**Descripción:** La firma manual (liga + hoja de "Liberación de TI" con firma guardada y huella SHA-256) está implementada y desplegada pero **no se ha probado completa**.
**Cambio requerido:** Prueba end-to-end en el servidor: subir la firma de TI, aprobar con método `manual`, subir el escaneo desde la liga en una ventana de **incógnito** (confirmar que no pide sesión) y liberar.
**Impacto:** Funcional — método alterno de firma sin validar en producción.

### Reenviar la liga de firma manual si vence
**Estado:** Abierto.
**Fuente:** `it-service-desk-control-accesos-firma-manual.md` (Pendiente); `contexto-sesion-it-service-desk.md` §5 (#13).
**Descripción:** La liga de subida vence a los 15 días. Hoy, si vence, la única salida es levantar una solicitud nueva.
**Cambio requerido:** Opción para **reenviar** la liga (nuevo token y vencimiento) sin rehacer la solicitud.
**Impacto:** UX — fricción cuando el solicitante se tarda en recabar firmas.

### DocuSign en producción
**Estado:** Abierto.
**Fuente:** `it-service-desk-control-accesos-docusign.md` (Paso a producción); `it-service-desk-service.md` §17 (#8); `contexto-sesion-it-service-desk.md` §5 (#8).
**Descripción:** DocuSign apunta al **ambiente de pruebas** (`demo.docusign.net`, leyenda "DOCUMENTO DE PRUEBA · SIN VALIDEZ"). Falta pasar a producción para firmas con validez.
**Cambio requerido:** Cargar credenciales de producción (`DOCUSIGN_*` en el `.env`, declaradas en `config.py`), montar la llave de producción si es distinta, reconstruir el servicio, poner `acc.docusign_ambiente = produccion` en Ajustes y hacer una solicitud real de prueba de punta a punta.
**Impacto:** Legal/operativo — hasta entonces las firmas no tienen validez.

### Formato Detecno
**Estado:** Abierto.
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#14).
**Descripción:** Falta el formato de acceso de **Detecno** (`formatos/detecno/`), siguiendo el patrón de plantilla por sistema que ya usa TOTVS 25.
**Impacto:** Cobertura — accesos de ese sistema no se pueden solicitar aún.

### ABC de accesos — baja de accesos
**Estado:** Abierto.
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#15).
**Descripción:** El ciclo de accesos cubre Alta y Modificación; falta el flujo de **baja** de un acceso.
**Impacto:** Funcional — no se puede retirar formalmente un acceso desde el módulo.

---

## 4. Incidentes

### RCA (Root Cause Analysis) — captura y recordatorio
**Estado:** Abierto (columnas ya existen).
**Fuente:** `it-service-desk-service.md` §1.7 y §17 (#9); `contexto-sesion-it-service-desk.md` §5 (#17).
**Descripción:** Para toda incidencia S1 (y S2 cuando el Incident Manager lo considere) se debe documentar un análisis de causa raíz dentro de los 5 días hábiles posteriores al cierre. El modelo `Incident` ya tiene `rca_text` y `rca_due_date`, y el tablero de SLA permite marcar `rca_mandatory` por severidad, pero **el flujo de captura y recordatorio no está construido**.
**Cambio requerido:** Construir la captura del RCA y su recordatorio (fecha límite + aviso).
**Impacto:** Cumplimiento del proceso — trazabilidad de causa raíz.

---

## 5. Roles y usuarios

### Ligar a los 11 técnicos externos a sus sistemas
**Estado:** Abierto (configuración operativa, no código).
**Fuente:** `contexto-sesion-it-service-desk.md` §4 y §5 (#1).
**Descripción:** Se dieron de alta 11 técnicos externos (TOTVS ×7, Detecno ×2, CEM Odoo DYCE ×1, Exertus ×1), empresa AVALANZ, rol `Tecnico`. Falta **ligarlos** a sus sistemas/módulos en IT Service Desk → Actualizaciones → Especialistas (cada uno en el equipo que atiende; si atiende ambos tipos, ligarlo en los dos). Desde octubre el motor ya asigna a los técnicos ligados.
**Cambio requerido:** Dar de alta cada técnico como especialista ligado en `system_specialists` con su `team_type`.
**Impacto:** Operativo — hasta ligarlos, sus tickets caen en el especialista general.

### Rol "Técnico" en `system_specialists`
**Estado:** Resuelto — verificar.
**Fuente:** `it-service-desk-roles-y-perfiles.md` §2.4 y §6 (#1) vs. `it-service-desk-service.md` §8.2 y `contexto-sesion-it-service-desk.md` §4.
**Descripción:** `roles-y-perfiles.md` (texto más antiguo) dice que la mecánica del rol "Técnico" en el sistema de especialistas "sigue pendiente de construir". En cambio `service.md` §8.2 y el contexto afirman que **desde octubre el motor ya acepta el rol Técnico** (ligado a un sistema/módulo recibe sus tickets automáticamente). Parece resuelto en código y desactualizado solo en `roles-y-perfiles.md`.
**Cambio requerido:** Confirmar en código y actualizar `roles-y-perfiles.md` §2.4/§6 para que concuerde.
**Impacto:** Documentación — inconsistencia entre documentos.

### Alcance de Auditoría — sin vista propia de bitácora
**Estado:** Abierto.
**Fuente:** `it-service-desk-roles-y-perfiles.md` §2.7 y §6 (#3); `it-service-desk-service.md` §17 (#10).
**Descripción:** El rol Auditoría ("solo trazabilidad, no KPIs") hoy ve el **contenido completo** del ticket, no una vista filtrada de solo bitácora (`incident_activity_log`). No hay un endpoint dedicado de "solo lectura de bitácora" para este rol.
**Cambio requerido:** Confirmar el alcance deseado de Auditoría y, si procede, construir una vista/endpoint de solo bitácora.
**Impacto:** Segregación de funciones — Auditoría ve más de lo que su rol describe.

### Descripción desactualizada de "Jefe Empresa"
**Estado:** Abierto (cosmético, no funcional).
**Fuente:** `it-service-desk-roles-y-perfiles.md` §2.6 y §6 (#2); `it-service-desk-service.md` §17 (#10); `contexto-sesion-it-service-desk.md` §5 (#10).
**Descripción:** La descripción del rol en `admin-service` (`module_roles`) dice "Dictamina Controles de Cambio y da Vo.Bo. de Roles y Perfiles". Confirmado con el dueño del proyecto que ese rol **solo** crea sus propios tickets y ve todos los de su empresa — no interviene ni dictamina CDC.
**Cambio requerido:** Corregir la descripción en `admin-service` (tabla `module_roles`) para que refleje lo real.
**Impacto:** Claridad — la descripción no corresponde a la capacidad real del rol.

### Bajas con fecha y motivo + marca de bloqueado en buscadores
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §17 (#11); `contexto-sesion-it-service-desk.md` §5 (#11).
**Descripción:** Registrar las bajas con **fecha y motivo** ("Dar de baja" en lugar de "Desactivar") y **marcar a los bloqueados** en los buscadores. Recordatorio de negocio: *bloqueado ≠ baja* — los bloqueados siguen recibiendo tickets; solo las bajas (inactivos) se excluyen del motor.
**Cambio requerido:** UI y backend para baja con fecha/motivo; indicador visual de bloqueado en los buscadores.
**Impacto:** Trazabilidad/operación.

### Lista de usuarios — mostrar accesos con su módulo
**Estado:** Abierto.
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#12).
**Descripción:** En la lista de usuarios, los solicitantes aparecen como "Sin rol". Falta mostrar los accesos con su módulo correspondiente.
**Impacto:** UX de administración.

---

## 6. Seguridad

### Proteger la consulta interna de DocuSign de Legal
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §17 (#12); `contexto-sesion-it-service-desk.md` §5 (#6).
**Descripción:** El endpoint `/legal/envelopes/internal/docusign-poll` de **Legal** es hoy llamable desde internet. (El equivalente de IT Service Desk, `/control-accesos/internal/docusign-poll`, ya rechaza todo lo que no venga de `127.0.0.1`.)
**Cambio requerido:** Restringir el endpoint de Legal igual que el de IT Service Desk (solo `127.0.0.1` / red interna).
**Impacto:** Seguridad — endpoint interno expuesto.

### Revisar escáneres/robots que llegan a la intranet
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §11 y §17 (#12); `contexto-sesion-it-service-desk.md` §5 (#7).
**Descripción:** Como sitio público (`intranet.avalanz.com`, IP 200.23.37.225), recibe escaneos automáticos de robots. Conviene revisar qué buscan (`docker logs avalanz-nginx`).
**Cambio requerido:** Revisión de logs y, si aplica, reglas de bloqueo adicionales.
**Impacto:** Seguridad — visibilidad de la superficie de ataque.

### Tokens de sesión en logs de Nginx (heredado)
**Estado:** Abierto (plataforma).
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#19).
**Descripción:** Pendiente heredado de plataforma: tokens de sesión apareciendo en los logs de Nginx.
**Cambio requerido:** Dejar de registrar tokens en los logs.
**Impacto:** Seguridad — fuga de tokens en logs.

### Restablecimiento de contraseña siempre envía correo (heredado)
**Estado:** Abierto (plataforma).
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#19).
**Descripción:** Pendiente heredado de plataforma relacionado con el flujo de restablecimiento de contraseña.
**Impacto:** UX/seguridad — fuera del alcance directo de este módulo pero anotado para no perderlo.

---

## 7. Frontend / UX

### Responsivo de 13" en Dashboard y demás pantallas
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §17 (#13); `contexto-sesion-it-service-desk.md` §5 (#4).
**Descripción:** El criterio responsivo para laptops de 13"-15" (`max-[1440px]:`, sidebar recogido, filas en un renglón, márgenes angostos) ya se aplicó a la tabla/tableros, pero falta llevarlo al **Dashboard de métricas** y a las demás pantallas. Regla firme: nunca fijar anchos que afecten a las pantallas grandes.
**Cambio requerido:** Aplicar el criterio `max-[1440px]:` al dashboard y pantallas restantes.
**Impacto:** UX en laptops pequeñas.

### Aviso de versión nueva
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §16 y §17 (#14); `contexto-sesion-it-service-desk.md` §5 (#5).
**Descripción:** Tras un despliegue del frontend, las pestañas abiertas pueden mostrar "This page couldn't load" (`Failed to find Server Action`). Hoy se resuelve recargando.
**Cambio requerido:** Mostrar un aviso in-app ("Hay una versión nueva: recarga la página") para evitar el mensaje en inglés.
**Impacto:** UX — evita confusión tras cada despliegue.

---

## 8. Infraestructura y operación

### Unificar la zona horaria de los contenedores a `America/Monterrey`
**Estado:** Abierto.
**Fuente:** `it-service-desk-service.md` §14.3 y §17 (#15); `contexto-sesion-it-service-desk.md` §5 (#20).
**Descripción:** Los contenedores corren en UTC (este servicio, email-service y Legal; admin y auth en CST). Toda hora que se **muestra** se convierte a `America/Monterrey` con `TZ_MTY`; la base guarda en UTC. Se busca unificar la zona horaria de los contenedores, pero solo **después** de revisar todo `datetime` sin zona para no romper cálculos.
**Cambio requerido:** Auditar `datetime` sin zona, luego unificar TZ de los contenedores.
**Impacto:** Operación — reduce el riesgo de horas "6 horas adelantadas" por formateo sin convertir.

### Paneles "No data" en Grafana (heredado)
**Estado:** Abierto (plataforma).
**Fuente:** `contexto-sesion-it-service-desk.md` §5 (#19).
**Descripción:** Paneles de Grafana mostrando "No data".
**Impacto:** Monitoreo.

---

## 9. Limpieza de código / cosmético

### Comentario `# Legal Service` sobre el bloque de IT Service Desk en Nginx
**Estado:** Abierto (cosmético).
**Fuente:** `it-service-desk-service.md` §11 y §17 (#18); `contexto-sesion-it-service-desk.md` §5 (#21).
**Descripción:** El bloque de IT Service Desk en `intranet.conf` está precedido por el comentario `# ── Legal Service ──` (copy/paste). No afecta el funcionamiento.
**Cambio requerido:** Corregir el comentario cuando se vuelva a tocar ese archivo.
**Impacto:** Legibilidad de la configuración.

### Renombrado gradual de "incidencias" / "mesa de soporte"
**Estado:** Abierto (sin prisa, por decisión del dueño del proyecto).
**Fuente:** `it-service-desk-service.md` §17 (#17) y encabezado del documento.
**Descripción:** El nombre interno del código conserva referencias a "mesa de soporte" e "incidencias" por herencia histórica, cuando ya aplican a los 3 tipos de ticket. Se renombra **gradualmente**, conforme se toca cada archivo, no de golpe.
**Cambio requerido:** Renombrar archivos/variables internas al tocarlas, sin un refactor masivo.
**Impacto:** Mantenibilidad/claridad.

### (Resuelto) Ruta duplicada de severidad
**Estado:** Resuelto — anotado como lección.
**Fuente:** `it-service-desk-service.md` §9.1.
**Descripción:** Existían **dos** rutas `PATCH /incidencias/{id}/severidad` (la vieja `validate_severity` y la nueva). FastAPI usa la primera registrada, así que la nueva nunca respondía (el cambio se guardaba, pero sin recálculo ni aviso). Ya se eliminó la vieja.
**Lección para el futuro:** Antes de agregar una ruta, verificar que no exista otra con la misma dirección.
**Impacto:** Ninguno (ya resuelto) — se conserva como recordatorio.

---

## Notas

- Los items de este archivo **no bloquean** el avance de features ni la operación en productivo.
- Mantener sincronizado con los pendientes de `it-service-desk-service.md` §17 y de `contexto-sesion-it-service-desk.md` §5: cuando un item se resuelva, tacharlo en los tres lugares.
- Revisar y limpiar este archivo al inicio de cada sprint.
