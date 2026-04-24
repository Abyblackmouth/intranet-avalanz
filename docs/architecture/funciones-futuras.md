# Funciones Futuras — No Dejar Pasar

Este archivo documenta funcionalidades estratégicas que deben implementarse en fases posteriores. No son parte del cascarón base pero son críticas para la operación a largo plazo.

---

## Módulo de Configuración SMTP

**Prioridad:** Alta — antes de ir a producción con módulos operativos
**Descripción:** Gestionar la configuración del servidor de correo desde la UI sin tocar código ni variables de entorno.

**Funcionalidades:**
- Ingresar host, puerto, usuario, contraseña y remitente desde un panel de configuración
- Botón de prueba que envía un correo de test y muestra el resultado
- Guardar configuración en BD (reemplaza variables de entorno del email-service)
- Soporte para múltiples proveedores: Gmail, Outlook, SMTP corporativo, Postfix

**Impacto si no se hace:** El cambio de servidor de correo requiere acceso al servidor y reinicio del contenedor — no apto para operación sin soporte técnico.

---

## Módulo de Workflows

**Prioridad:** Media — requerido antes de activar módulos operativos con procesos de autorización
**Descripción:** Motor de flujos de trabajo configurable desde la UI, sin necesidad de modificar código para ajustar reglas de negocio.

**Casos de uso identificados:**
- Legal: contrato pasa por niveles de autorización (asistente → abogado → director)
- Bóveda: documento requiere validación antes de publicarse
- Cualquier módulo futuro que tenga procesos de aprobación multinivel

**Funcionalidades:**
- Definir etapas de un workflow (nombre, responsable por rol, tiempo límite)
- Configurar acciones por etapa: aprobar, rechazar, escalar
- Disparar correos automáticos al cambiar de etapa
- Escalamiento automático si no hay respuesta en X días
- Historial de movimientos por documento o entidad

**Dependencias:** Módulo de configuración SMTP debe estar listo primero.

---

## Jaeger — Rastreo Distribuido

**Prioridad:** Baja — V2, cuando haya módulos operativos activos
**Descripción:** Rastreo distribuido de peticiones entre microservicios para diagnóstico de latencia y errores en cadenas de llamadas.

**Casos de uso:**
- Rastrear una petición desde el frontend hasta el servicio que la procesa pasando por múltiples microservicios
- Identificar qué servicio introduce latencia en flujos complejos (ej. creación de usuario → auth → email → notify)
- Correlacionar errores distribuidos que no son visibles en los logs de un solo servicio

**Por qué no ahora:** Con solo el cascarón base el volumen de tráfico distribuido no justifica la complejidad. Tiene sentido cuando Bóveda y Legal estén activos y haya flujos reales multi-servicio.

**Stack:** Jaeger + OpenTelemetry en cada microservicio FastAPI.

---

## Notas
- Jaeger, el módulo SMTP y los workflows son V2 — no bloquean el cascarón base.
- El email-service actual usa variables de entorno. Cuando se implemente el módulo SMTP, la configuración migrará a BD sin cambiar la interfaz del servicio.
- Los workflows deben diseñarse de forma genérica para que cualquier módulo futuro pueda usarlos.
