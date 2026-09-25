# IT Service Desk — Roles y Perfiles

Documento complementario a `it-service-desk-service.md` (sección 15, resumida ahí). Aquí va el detalle completo: por qué existe cada rol, qué puede y no puede hacer, y cómo se conecta con el motor de asignación y con Control de Cambios.

---

## 1. Dónde viven los roles (no aquí)

Los roles de este módulo **no se definen ni se administran en este servicio** — viven en `admin-service`, tabla `module_roles`, igual que los de cualquier otro módulo de la plataforma (Legal, Bóveda, etc.). `it-service-desk-service` no tiene tabla de roles propia; solo **lee** el rol ya resuelto desde el JWT y actúa en consecuencia.

Cada rol de módulo viaja en el JWT con el prefijo del módulo: `it-service-desk:{slug}` — por ejemplo `it-service-desk:incident-manager`. Cada microservicio normaliza ese prefijo antes de comparar (ver `politica-roles-permisos.md` para el patrón general de la plataforma).

### 1.1 Scope — qué tanto ve cada rol

`module_roles` tiene una columna `scope` con dos valores posibles:

| Scope | Qué significa |
|---|---|
| `empresa` | El usuario ve solo los tickets de su propia `company_id` |
| `corporativo` | El usuario ve tickets de todas las empresas del grupo |

La mayoría de los roles de este módulo son `corporativo` — tiene sentido dado que Incident Manager, Project Manager, y los especialistas dan soporte técnico/funcional cruzando empresas del mismo grupo, no por empresa aislada. La única excepción es **Jefe Empresa** (ver sección 2.6), que por diseño solo ve lo de su propia empresa.

---

## 2. Los 8 roles configurados (tabla real, `admin-service`)

| Rol | Slug | Scope | ID (referencia) |
|---|---|---|---|
| Incident Manager | `incident-manager` | corporativo | `58a3dc65-e30d-4333-a819-0608bab13ab5` |
| Project Manager | `project-manager` | corporativo | `3fc78b72-d121-457c-86c2-75f32cfe76ed` |
| Especialista Funcional | `especialista-funcional` | corporativo | `41ad6113-3d19-4997-83a3-7439ec204ca8` |
| Especialista Técnico | `especialista-tecnico` | corporativo | `e16e6fc6-fc80-4362-b596-2b21fbc6d073` |
| Técnico | `tecnico` | corporativo | `3a8bcfe8-7f5f-4432-ba30-10509908a5f1` |
| Jefe Empresa | `jefe-empresa` | empresa | `22c1f777-7cc2-4173-9c4f-16e89f0361c5` |
| Comité Directivo | `comite-directivo` | corporativo | `1f280b17-216c-48ba-b097-f0f38f37f6ae` |
| Auditoría | `auditoria` | corporativo | `fa24a456-d871-46c5-aa23-505d4ef7d430` |

A continuación, cada uno con su contexto de negocio, qué puede hacer hoy en el código real, y qué le falta.

### 2.1 Incident Manager — la máxima autoridad operativa

**Por qué existe:** el documento de proceso original (Verus) define un único punto de contacto obligatorio para toda incidencia — alguien que reciba, clasifique la severidad, canalice al equipo correcto y dé seguimiento a los tiempos de SLA hasta el cierre formal. Sin ese punto único, cada incidencia terminaría gestionándose de forma distinta según quién la atienda, perdiendo consistencia y trazabilidad.

**Qué puede hacer, verificado en código:**
- Reasignar tickets sin restricción (`PATCH /incidencias/{id}/asignar`)
- Validar/ajustar la severidad que propuso el solicitante (`PATCH /incidencias/{id}/severidad`)
- Configurar el catálogo de especialistas que alimenta el motor (`/actualizaciones/especialistas`)
- Es uno de los destinatarios automáticos de notificación cuando el motor no encuentra especialista (`motor_sin_especialista` — ver `it-service-desk-service.md` sección 8)
- Puede además **activarse a sí mismo** como Especialista Funcional o Técnico (ver sección 3) — es decir, un Incident Manager no está limitado solo a supervisar, también puede atender tickets directamente si el catálogo de especialistas no cubre un caso.

**Relación con Control de Cambios:** comparte el mismo alcance que Project Manager sobre CDC — no hay una autoridad separada para CDC, es deliberado (ver sección 5).

### 2.2 Project Manager — seguimiento y priorización, sin ejecutar

**Por qué existe:** el proceso distingue entre "quién resuelve el día a día" (Incident Manager) y "quién ve el panorama completo y decide prioridades de negocio" (Project Manager) — evalúa si algo debe escalarse a Dirección, y es quien reporta al Comité Directivo.

**Qué puede hacer:** ve todo (scope corporativo), pero **no reasigna** — su descripción en el catálogo lo deja explícito ("No reasigna"). Esto es intencional: separa la responsabilidad de "decidir prioridad" de la de "ejecutar la asignación técnica", evitando que una misma persona controle ambos lados sin supervisión cruzada.

**Relación con Control de Cambios:** su descripción en el catálogo ya dice *"prioriza Controles de Cambio"* — de los 8 roles, es el único cuya descripción menciona CDC explícitamente por nombre. Encaja con la decisión tomada: el Project Manager es quien recibirá los tickets de CDC al salir de Backlog (pendiente de construir, ver sección 5.2).

### 2.3 Especialista Funcional / Especialista Técnico — quienes ejecutan

**Por qué existen dos, no uno:** el proceso separa fallas de **configuración y procesos de negocio** (funcional — parametrización del ERP, reglas de negocio) de fallas de **infraestructura** (técnico — bases de datos, integraciones, desempeño). Son naturalezas de problema distintas que requieren habilidades distintas, así que el motor de asignación (`reported_type`: `funcional` / `tecnico`) los trata como dos "equipos" separados desde el modelo de datos.

**Cómo se alimentan del motor:** cada uno tiene su propio `team_type` en `system_specialists` (`especialista-funcional` / `especialista-tecnico`). El motor busca en 3 pasos (módulo exacto → sistema completo → especialista general) **dentro del team_type correspondiente al `reported_type` del ticket** — un ticket reportado como técnico nunca cae en un especialista funcional, y viceversa.

**Especialista Técnico incluye proveedores externos** — su descripción lo dice explícitamente ("Incluye proveedores externos"), reconociendo que parte del soporte técnico de sistemas como TOTVS puede recaer en soporte de Nivel 3 del propio fabricante, no solo en personal interno.

### 2.4 "Técnico" — rol separado de "Especialista Técnico" (revisar)

Existe un octavo rol llamado simplemente **"Técnico"** (`tecnico`), con la descripción genérica *"Técnico de soporte para el módulo de IT Service Desk"` — distinto del rol `especialista-tecnico` ya descrito arriba. No se encontró ninguna referencia a este slug (`it-service-desk:tecnico`) en el código de frontend ni backend revisado durante esta sesión ni la anterior — a diferencia de `especialista-tecnico`, que sí se usa activamente (botón de activación, filtro del motor).

**Esto es una bandera a resolver, no una decisión tomada:** puede ser (a) un rol creado por error o duplicado durante la configuración inicial del módulo, (b) un rol pensado para un propósito distinto que nunca se conectó al código, o (c) un remanente de una versión anterior del diseño de roles. Vale la pena confirmar con el dueño del proyecto si se debe desactivar, renombrar, o si tiene un uso planeado que todavía no se construye.

### 2.5 Comité Directivo — solo lectura de KPIs

**Por qué existe:** el proceso define un nivel de visibilidad ejecutiva — quienes deciden a nivel dirección necesitan ver el desempeño agregado del servicio (cumplimiento de SLA, volumen, tendencias) sin necesitar ni querer operar tickets individuales.

**Qué puede hacer:** su descripción es explícita y restrictiva — *"Solo visualización de KPIs agregados"*. No aparece en ningún flujo de creación, asignación o resolución en el código revisado. Es, en esencia, un rol de consumo del dashboard (`GET /estadisticas`), no de operación.

### 2.6 Jefe Empresa — el único rol con scope `empresa`

**Por qué existe, y por qué es distinto a los demás:** es el único rol de los 8 que **no** es corporativo — ve solo lo de su propia empresa, no del grupo completo. Su descripción real en el catálogo es: *"Ve todo lo de su propia empresa. Dictamina Controles de Cambio y da Vo.Bo. de Roles y Perfiles."*

**⚠️ Bandera importante — contradice una decisión explícita tomada durante la construcción de CDC:** esta descripción coincide casi textualmente con el concepto de **"Champion"** del documento Verus original (la persona por empresa/sistema que dictamina factibilidad de un Control de Cambios) — un rol que **se decidió explícitamente NO crear** durante la sesión donde se construyó CDC. La decisión tomada entonces fue: ningún rol nuevo, Incident Manager y Project Manager comparten el mismo alcance sobre CDC sin necesitar un "Jefe Empresa" que dictamine.

Esto deja dos posibilidades, sin resolver todavía:
1. El rol "Jefe Empresa" ya existía en el catálogo **desde antes** de esa decisión (posiblemente configurado junto con el resto del catálogo inicial, antes de que CDC se diseñara a detalle), y su descripción quedó desactualizada — en ese caso, la descripción debería corregirse para no prometer una función que el código no implementa.
2. El rol sí tiene un propósito real pendiente de conectar (dictaminar CDC y dar Vo.Bo. de Solicitud de Accesos), y la decisión de "sin rol nuevo" tomada para CDC debería revisarse contra este rol ya existente antes de seguir construyendo las fases siguientes.

**Recomendación:** aclarar esto con el dueño del proyecto antes de construir la Fase 2 (En revisión) de CDC — si el plan real es que "Jefe Empresa" SÍ dictamine CDC (contradiciendo lo decidido), cambia por completo el diseño de la Fase 2 que se planeó para mañana.

### 2.7 Auditoría — solo trazabilidad, ni KPIs ni operación

**Por qué existe:** el proceso reconoce controles internos y segregación de funciones como requisito — alguien debe poder revisar qué pasó con un folio (quién hizo qué y cuándo) sin poder alterar nada ni ver métricas de negocio agregadas.

**Qué puede hacer:** su descripción es la más restrictiva de las ocho — *"Solo trazabilidad - bitácora de acciones sobre folios. No ve KPIs."* Esto mapea directo a la tabla `incident_activity_log` (ver `it-service-desk-service.md` sección 14) — Auditoría es, en esencia, el consumidor natural de esa bitácora, aunque no se encontró un endpoint específico de "solo lectura de bitácora" filtrado para este rol en el código revisado — hoy la bitácora se expone como parte del detalle del ticket, no como una vista propia de auditoría.

---

## 3. El mecanismo "Activarme como especialista general"

Es un botón de autoservicio, visible solo si el propio JWT del usuario ya trae el rol correspondiente:

```typescript
const isEspecialistaFuncional = roles.includes('it-service-desk:especialista-funcional')
const isEspecialistaTecnico = roles.includes('it-service-desk:especialista-tecnico')
```

Es decir: **tener el rol de módulo es el requisito para ver el botón** — el botón en sí no otorga el rol, solo activa/desactiva la participación de esa persona en el motor de asignación como especialista "general" (catch-all, sin sistema ni módulo específico).

### 3.1 Qué hace exactamente al activarlo

No existe un endpoint dedicado para esto — reutiliza directamente el CRUD genérico de especialistas (`POST` / `PATCH /actualizaciones/especialistas`), apuntándose a sí mismo:

```typescript
// Al activar:
createSpecialist({
  system_id: null, module_id: null,       // "general" -- sin sistema ni modulo especifico
  team_type: 'especialista-funcional',    // o 'especialista-tecnico'
  specialist_user_id: user.user_id,       // se apunta a si mismo
  is_active: true,
})

// Al desactivar:
updateSpecialist(currentRow.id, { ...mismos_campos, is_active: false })
```

Esto escribe directamente en `system_specialists` con `system_id` y `module_id` en `NULL` — exactamente los renglones que el motor usa como **Paso 3** de su búsqueda (el respaldo final, "especialista general del equipo" — ver `it-service-desk-service.md` sección 8.2). Activar el botón, en la práctica, es decirle al motor: *"si nadie más específico califica, asígname a mí"*.

### 3.2 Por qué esto importa para el diseño del botón de Project Manager (pendiente)

El plan para mañana incluye un botón equivalente para Project Manager (y, condicionalmente, para Incident Manager) — pero **este mecanismo tal cual no aplica directamente a CDC**, porque:
- CDC no tiene `reported_type` (funcional/técnico) — no hay un "team_type" al que apuntar.
- CDC ya se decidió que **se salta por completo** la búsqueda `resolve_assignment` (ver `it-service-desk-service.md` sección 8.4) — no pasa por `system_specialists` en absoluto.

Esto significa que el botón de Project Manager necesitará su **propio mecanismo** (una tabla o campo distinto, o una regla nueva del motor que no dependa de `system_specialists`), no una copia directa de este patrón. Vale la pena tenerlo claro antes de empezar a construirlo, para no intentar reusar una estructura que no encaja.

---

## 4. Cómo se resuelven los roles al emitir el JWT (contexto de la plataforma, no de este servicio)

Aunque la lógica vive en `admin-service` y `auth-service`, vale la pena tenerlo presente aquí porque afecta directamente cómo este servicio interpreta cada request:

```
Usuario hace login
      │
      ▼
auth-service llama a admin-service: GET /internal/users/{user_id}/permissions
      │
      ▼
admin-service resuelve: roles globales + roles por módulo (via user_module_accesses)
      │
      ▼
auth-service arma el JWT con roles en formato "{modulo}:{slug}"
      │
      ▼
Este servicio (u otro cualquiera) valida el JWT con JWTValidator (shared/middleware)
y compara contra "it-service-desk:{slug}" segun el endpoint
```

Un usuario puede tener **más de un rol de módulo** simultáneamente (por ejemplo, ser Incident Manager y además tener activado el botón de Especialista Funcional) — no son mutuamente excluyentes en el modelo actual.

---

## 5. Roles y Control de Cambios — estado actual y lo que falta

### 5.1 Decisión ya tomada (vigente)

Ningún rol nuevo para CDC. Incident Manager y Project Manager comparten el mismo alcance sobre tickets de tipo `control_cambio` — mismos permisos, sin una autoridad separada tipo "Champion". La etiqueta visible al usuario durante la etapa "En revisión" debe leerse como *"En revisión por Gerencia de Proyectos"*, sin implicar un rol técnico nuevo en el sistema de permisos.

### 5.2 Pendiente de construir (orden acordado)

1. Botón "Activarme como: Project Manager" — mecanismo propio, no reutiliza `system_specialists` (ver sección 3.2)
2. Regla nueva del motor: al procesar un CDC en backlog, asigna automático al Project Manager (e Incident Manager, si tiene el botón activado) y cambia el estatus a `en_revision`
3. Lógica de la Fase 2 ("En revisión") en sí, una vez resuelto lo anterior

### 5.3 Pendiente de aclarar antes de construir lo anterior

La contradicción de la sección 2.6 (rol "Jefe Empresa" ya configurado para "dictaminar Controles de Cambio") debe resolverse **antes** de construir la Fase 2 — si ese rol sí participa, cambia el diseño de a quién asigna el motor al salir de backlog.

---

## 6. Resumen de banderas abiertas (para no perder de vista)

| # | Bandera | Dónde se detectó | Acción sugerida |
|---|---|---|---|
| 1 | Rol "Técnico" (`tecnico`) sin uso encontrado en código, separado de "Especialista Técnico" | Catálogo `module_roles` | Confirmar con el dueño si se desactiva, renombra, o tiene uso planeado |
| 2 | Rol "Jefe Empresa" describe dictaminar CDC — contradice la decisión de "sin rol nuevo" para CDC | Catálogo `module_roles`, descripción textual | Aclarar antes de construir Fase 2 de CDC |
| 3 | Auditoría no tiene un endpoint propio de bitácora — hoy la trazabilidad solo se ve dentro del detalle de cada ticket | Revisión de endpoints en `mesa_de_soporte.py` | Evaluar si se necesita una vista dedicada para este rol |
