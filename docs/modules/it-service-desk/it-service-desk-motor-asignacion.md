# IT Service Desk — Motor de Asignación

Documento complementario a `it-service-desk-service.md` (sección 8, resumida ahí). Aquí va el detalle completo: cómo funciona paso a paso, sus fórmulas exactas, su filosofía de diseño, el bug real que se encontró al conectar Control de Cambios, y las consideraciones técnicas pendientes para la regla nueva planeada.

---

## 1. Filosofía de diseño — por qué es una "función cerrada"

`app/motor.py` se describe literalmente en su propio docstring como una **función cerrada**: entrada y salida fijas, lógica interna reemplazable sin tocar el resto del sistema.

```python
"""Motor de asignacion automatica -- funcion cerrada.

Entrada/salida fijas segun submodulo-incidencias-motor-asignacion.md
seccion 3. La logica interna (busqueda en 3 pasos contra
system_specialists) es reemplazable por un modelo predictivo mas
adelante, sin cambiar el contrato de entrada/salida.
"""
```

**Por qué importa esto:** el día que se quiera reemplazar la búsqueda actual (3 pasos contra un catálogo) por un modelo de predicción más sofisticado (por ejemplo, algo que aprenda de patrones históricos de resolución), el cambio se hace **solo dentro de `motor.py`**, sin tocar el consumidor de RabbitMQ, sin tocar los endpoints de creación de tickets, sin tocar el frontend. Todo lo demás en el sistema solo conoce el contrato: *le doy unos datos de entrada, me regresa si encontró a alguien y a quién*.

Esta es también la razón por la que, al encontrar el bug de Control de Cambios (sección 4), la corrección **no se hizo dentro de `motor.py`** — se hizo en el punto donde se *llama* al motor, precisamente para no romper esta separación.

---

## 2. Dos piezas separadas: decidir y ejecutar

Hay una distinción importante que se mantiene estricta en el código:

| Pieza | Archivo | Responsabilidad |
|---|---|---|
| **Decidir a quién** | `motor.py` — `resolve_assignment()` | Solo consulta y regresa un resultado. No escribe nada en la base de datos. No notifica a nadie. |
| **Ejecutar la asignación** | `assignment.py` — `finalize_assignment()` | Toma una decisión ya tomada (venga de donde venga) y la aplica: cambia el estatus, genera el token de atención, notifica por correo e in-app, transmite en tiempo real |

`finalize_assignment()` es compartida entre **tres caminos distintos** que terminan necesitando exactamente lo mismo:
1. Asignación manual (un Incident Manager reasigna a mano)
2. Asignación automática (el motor, vía el consumidor de RabbitMQ)
3. Redirección desde el enlace de atención por correo (alguien recibe un ticket que no le corresponde y lo redirige a otra persona)

Esto evita que la lógica de "generar token, invalidar el anterior, notificar a todos los involucrados" se escriba tres veces y se desincronice entre los tres caminos.

---

## 3. `resolve_assignment` — la búsqueda en 3 pasos, completa

### 3.1 Firma y entrada

```python
async def resolve_assignment(
    db: AsyncSession,
    system_id: str,
    module_id: Optional[str],
    reported_type: Optional[str],
) -> Dict[str, Any]:
```

Recibe exactamente 3 datos del ticket: el sistema, el módulo (puede no tener), y si se reportó como funcional o técnico. Nada más — no recibe el ticket completo, no recibe la empresa, no recibe severidad. Esto es intencional: mantiene el contrato mínimo y explícito.

### 3.2 Traducción de `reported_type` a `team_type`

```python
TEAM_BY_REPORTED_TYPE = {
    "funcional": "especialista-funcional",
    "tecnico": "especialista-tecnico",
}
team_type = TEAM_BY_REPORTED_TYPE.get(reported_type)
```

Si `reported_type` es `None` (o cualquier valor no reconocido), `team_type` queda en `None` — y esto tiene una consecuencia importante que se explica en la sección 4.

### 3.3 La función de búsqueda interna

```python
async def _buscar(system_filter, module_filter):
    conditions = [
        SystemSpecialist.is_active == True,
        SystemSpecialist.system_id == system_filter if system_filter is not None
            else SystemSpecialist.system_id.is_(None),
        SystemSpecialist.module_id == module_filter if module_filter is not None
            else SystemSpecialist.module_id.is_(None),
    ]
    if team_type:
        conditions.append(SystemSpecialist.team_type == team_type)
    result = await db.execute(select(SystemSpecialist).where(*conditions))
    return result.scalars().first()
```

**Punto crítico a entender:** cuando `team_type` es `None` (porque `reported_type` venía vacío), la condición `if team_type:` es falsa — **la búsqueda deja de filtrar por equipo por completo**. Busca cualquier especialista activo que coincida en sistema/módulo, sin importar si es funcional o técnico. Esto es exactamente lo que causó el bug de la sección 4.

### 3.4 Los 3 pasos, en orden, deteniéndose en el primero que encuentre algo

```
Paso 1 -- Módulo exacto (el más específico)
    Solo si module_id fue proporcionado.
    _buscar(system_id, module_id)

Paso 2 -- Sistema completo
    _buscar(system_id, module_id=None)

Paso 3 -- Especialista general del equipo (catch-all)
    _buscar(system_id=None, module_id=None)

Si ninguno encuentra nada: {"encontrado": False}
```

Cada paso es estrictamente más genérico que el anterior. La idea de negocio detrás: si existe alguien que domina específicamente el módulo de Contabilidad dentro de TOTVS, se prefiere sobre alguien que solo domina TOTVS en general; y si no hay nadie ni para el módulo ni para el sistema completo, se recurre al especialista de respaldo del equipo (activado vía el botón "Activarme como especialista general" — ver `it-service-desk-roles-y-perfiles.md` sección 3).

### 3.5 Formato de salida

```python
{"encontrado": True, "equipo_asignado": specialist.team_type, "usuario_asignado": specialist.specialist_user_id}
# o
{"encontrado": False}
```

---

## 4. El bug real encontrado al conectar Control de Cambios (ya corregido)

### 4.1 Qué pasó

Al crear el primer ticket de CDC y dejar que pasara por el motor (con `system_id=None, module_id=None, reported_type=None`, ya que CDC no tiene ninguno de estos tres campos poblados), el motor **sí encontró un resultado** en el Paso 3 — asignó el ticket a un especialista funcional de **Incidente**, alguien sin ninguna relación con Control de Cambios.

### 4.2 Por qué pasó, exactamente

1. `reported_type = None` → `team_type = None` (sección 3.2)
2. Con `team_type = None`, la condición `if team_type:` en `_buscar()` es falsa → la búsqueda **ignora el filtro de equipo** (sección 3.3)
3. `system_id = None, module_id = None` en la entrada coincide exactamente con los renglones "generales" (catch-all) que ya existían en `system_specialists` para el respaldo de Incidente
4. Resultado: el Paso 3 encontró coincidencia, y el motor asignó CDC a un especialista de Incidente, sin que nadie lo hubiera querido así

### 4.3 Por qué no era un bug de `motor.py` en sí

Es importante ser precisos aquí: el motor **hizo exactamente lo que su contrato dice que debe hacer** — buscar una coincidencia con los datos que se le dieron. El problema no estaba en la lógica de búsqueda, sino en **llamarlo con datos que nunca debieron entrar a esa búsqueda en primer lugar**. Un ticket sin sistema, sin módulo y sin tipo reportado simplemente no es candidato para este mecanismo de especialistas — que fue diseñado exclusivamente pensando en Incidente.

### 4.4 La corrección — en el punto de llamada, no en el motor

Se aplicó en `rabbitmq.py`, dentro de `_process_message` (el consumidor):

```python
# El motor busca especialista por system_id/reported_type -- CDC y
# ACC no tienen esos campos (None), y una coincidencia accidental
# con un "especialista general" de Incidente los asignaria a la
# persona equivocada. Para cualquier tipo que no sea incidente, se
# salta la busqueda por completo y se va directo a "sin especialista".
if incident.ticket_type == "incidente":
    assignment = await resolve_assignment(
        db, incident.system_id, incident.module_id, incident.reported_type
    )
else:
    assignment = {"encontrado": False}
```

Esto mantiene `motor.py` sin ningún cambio — sigue siendo la misma función cerrada, con el mismo contrato. La decisión de "quién debe siquiera preguntarle algo" vive fuera de él, donde corresponde.

---

## 5. El flujo completo, de principio a fin

```
1. POST /incidencias  o  POST /control-cambios
        │
        ▼
2. Se crea el ticket con status = en_backlog (SIEMPRE, sin importar el tipo)
   Se hace commit
        │
        ▼
3. _broadcast_ticket_update(incident, event_type="...ticket_created")
   -- el usuario ya ve su ticket en tiempo real en tabla/Kanban
        │
        ▼
4. publish_incident_created(incident_id)
   -- mensaje a la cola "incidencias.motor.asignacion" (RabbitMQ)
   -- si RabbitMQ no responde, esto se ignora silenciosamente (try/except) --
      el ticket ya se guardo bien, solo se queda en backlog para asignacion manual
        │
        ▼
5. El consumidor (corriendo en background, dentro del mismo proceso de
   Uvicorn, arrancado en el evento startup de FastAPI) recibe el mensaje
        │
        ▼
6. Verifica: ¿el ticket sigue en en_backlog?
   Si alguien ya lo asigno manualmente mientras el mensaje viajaba -> no hace nada
        │
        ▼
7. ¿ticket_type == "incidente"?
   Si -> resolve_assignment(system_id, module_id, reported_type)
   No -> {"encontrado": False} directo, sin consultar system_specialists
        │
        ├── encontrado=True ──► finalize_assignment(...)
        │                          - status = "asignado"
        │                          - genera token de atencion (30 dias)
        │                          - notifica por correo + in-app al asignado
        │                          - broadcast de tiempo real
        │
        └── encontrado=False ──► log "motor_sin_especialista" en la bitacora
                                   - se queda en en_backlog
                                   - notifica in-app a todos los Incident Managers
                                     (via GET /internal/users/by-module-role
                                      hacia admin-service)
```

---

## 6. Resiliencia — qué pasa si algo falla

| Punto de falla | Qué pasa |
|---|---|
| RabbitMQ no disponible al crear el ticket | La creación **no falla** — el ticket ya se guardó, el publish se envuelve en try/except silencioso. Se queda en backlog para asignación manual, nada se pierde. |
| El consumidor truena por cualquier excepción | `main.py` lo relanza automáticamente 5 segundos después, indefinidamente (`_run_consumer_forever`) — no requiere reiniciar el contenedor a mano. |
| `admin-service` no responde al pedir perfil del asignado | `_get_user_profile` regresa `{}` — el correo simplemente no se envía (se verifica `profile.get("email")` antes), pero la asignación en base de datos ya se aplicó igual. |
| `email-service` o `notify-service` no responden | Ambas llamadas de notificación están envueltas en try/except silencioso — la asignación en sí no depende de que la notificación tenga éxito. |

El principio general en todo el flujo: **la asignación de datos (base de datos) nunca depende de que la capa de notificación tenga éxito.** Se aplica primero lo que importa (estatus, token, bitácora, commit), y las notificaciones son un "mejor esfuerzo" después.

---

## 7. `finalize_assignment` en detalle

### 7.1 Qué hace, en orden

1. Determina si es una asignación nueva o una **reasignación** (`incident.assigned_to_user_id is not None` antes de aplicar el cambio)
2. Si es reasignación: invalida cualquier token de atención anterior sin usar (`_invalidate_previous_tokens`) — evita que dos personas puedan atender el mismo ticket a la vez con un link viejo
3. Aplica el cambio: `assigned_team`, `assigned_to_user_id`, `assigned_at`, y **`status = "asignado"` fijo**
4. Genera un nuevo token de atención (válido 30 días — `RESOLUTION_TOKEN_VALID_DAYS`)
5. Registra en `incident_activity_log` con el `action` que le pasó el llamador (`motor_asigno`, `asignacion_manual`, `reasignacion_manual`, etc.)
6. Hace commit
7. Notifica por correo (con el link de atención sin necesidad de login) e in-app a quien quedó asignado
8. Si fue reasignación: también notifica al **solicitante original** quién quedó a cargo ahora — transparencia explícita
9. Transmite en tiempo real (`_broadcast_ticket_update`)

### 7.2 ⚠️ Consideración técnica para la regla nueva de CDC (planeada, no construida)

`finalize_assignment` fija `incident.status = "asignado"` de forma dura, sin parámetro — es un valor pensado exclusivamente para el vocabulario de estatus de Incidente. La regla nueva planeada para CDC (backlog → Project Manager, cambiando a `en_revision`) **no puede reusar esta función tal cual** sin modificarla, porque pondría el estatus equivocado.

Dos caminos posibles a evaluar cuando se construya (sin decidir todavía cuál):
- **Parametrizar** `finalize_assignment` para aceptar el estatus destino como argumento, con `"asignado"` como default (no rompe los 3 caminos que ya la usan)
- Escribir una función paralela, más pequeña, específica para la transición de CDC, que reutilice partes de esta (notificación, bitácora) sin heredar el estatus fijo

Vale la pena decidir esto explícitamente al construir el punto 3 de los pendientes (la regla nueva del motor), no asumir uno u otro por default.

---

## 8. Tablas involucradas (referencia cruzada — detalle completo en `it-service-desk-service.md` sección 7)

| Tabla | Rol en el motor |
|---|---|
| `system_specialists` | El catálogo que consulta `resolve_assignment` — a quién le toca cada sistema/módulo/equipo. Los renglones con `system_id` y `module_id` en `NULL` son los especialistas "generales" (Paso 3). |
| `incidents` | Se lee (`system_id`, `module_id`, `reported_type`, `ticket_type`, `status`) y se escribe (`assigned_team`, `assigned_to_user_id`, `assigned_at`, `status`). |
| `incident_activity_log` | Registra cada intento del motor, exitoso o no (`motor_asigno` / `motor_sin_especialista`), con el actor `SYSTEM_ACTOR_ID` cuando fue automático. |
| `incident_resolution_tokens` | Un token nuevo por cada asignación/reasignación — los anteriores se invalidan en una reasignación. |

---

## 9. Preguntas para resolver antes de construir la regla nueva de CDC (mañana)

1. ¿`finalize_assignment` se parametriza o se crea una función paralela? (sección 7.2)
2. ¿El botón "Activarme como: Project Manager" escribe en una tabla nueva, o se agrega una columna/mecanismo distinto ya que `system_specialists` no aplica a CDC? (ver `it-service-desk-roles-y-perfiles.md` sección 3.2)
3. Pendiente de aclarar con el dueño del proyecto: el rol "Jefe Empresa" ya configurado describe "dictaminar Controles de Cambio" — si eso participa en esta regla nueva, cambia a quién debe asignar el motor al salir de backlog (ver `it-service-desk-roles-y-perfiles.md` sección 2.6).
