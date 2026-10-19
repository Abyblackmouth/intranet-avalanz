# Workflows · Contexto general

## Qué es

Workflows es el módulo de la Intranet Avalanz que gobierna las **aprobaciones de documentos del ERP**. Una solicitud de compra, el alta de un cliente o cualquier documento que necesite autorización nace en la plataforma (TOTVS Protheus), viaja a la Intranet, recorre la cascada de aprobadores que corresponde según la empresa y el solicitante, y regresa a la plataforma con la decisión para que ésta la aplique (liberar la solicitud, desbloquear el cliente, etc.).

## Por qué existe

En la migración de Protheus 10 a 25 se contrató Fluig para los flujos de aprobación. En la operación resultó difícil de mantener: la cascada de aprobadores vivía en tablas de Protheus (`ZFL`) sin dinamismo, cada variante requería flujos y grupos nuevos en Fluig, la integración exigía credenciales de usuarios licenciados y las pantallas eran pobres. Workflows reemplaza a Fluig con una pieza propia de la Intranet, configurable desde pantalla y con trazabilidad completa.

## Principios que lo gobiernan

Estas decisiones están cerradas y explican casi todo el diseño:

1. **La lógica de negocio vive en la plataforma; la Intranet orquesta.** Protheus decide qué se manda y qué significa aprobar (liberar, desbloquear). La Intranet solo decide **quién** aprueba, **en qué orden**, y regresa el resultado.
2. **Integración asíncrona en dos tiempos.** La plataforma empuja el documento al guardarlo y recibe de inmediato un folio (`202`). El resultado llega después, cuando el último aprobador decide, por una llamada de la Intranet al servicio REST de la plataforma.
3. **Un solo contrato para todos los flujos.** El sobre que manda la plataforma tiene siempre la misma estructura; lo que cambia entre flujos viaja dentro de `cardData`, que la Intranet regresa intacto.
4. **La cascada de aprobadores vive en la Intranet** (submódulo Flujos), por empresa y por grupo de solicitantes. El aprobador es **una persona**, no un puesto ni un rol.
5. **Todo se configura desde pantalla**: conexiones, flujos, grupos, etapas, aprobadores, cómo se ve el documento, correos y estilos. Agregar un flujo nuevo no requiere programar en la Intranet.
6. **Nada se pierde.** Todo lo que entra y sale queda registrado antes de procesarse; si la plataforma no responde, el resultado se reintenta solo y se puede reenviar a mano. No hay tiempos de respuesta obligatorios (sin SLA); el seguimiento es por bitácora, reenvío de avisos y reasignación.
7. **La aprobación es por correo**: el aprobador recibe una liga personal, segura y de un solo uso que abre la página de aprobación sin iniciar sesión. La Bandeja de la Intranet es el respaldo.

## Cómo funciona, de punta a punta

```
Protheus                          Intranet (Workflows)                        Aprobadores
────────                          ────────────────────                        ───────────
1. El usuario graba el documento
   (solicitud, cliente…) y el
   punto de entrada lo bloquea
   y manda el sobre ───────────▶  2. Valida el contrato, guarda todo,
                                     da folio (WF-AVAL-000123) y
   ◀──────────── 202 + folio         contesta de inmediato
                                  3. Resuelve el grupo de aprobación
                                     (empresa + solicitante) y arma
                                     las etapas que aplican
                                  4. Avisa al aprobador en turno ───────────▶ 5. Abre la liga del correo,
                                                                                 revisa la hoja y los
                                                                                 documentos y decide
                                  6. Avanza a la siguiente etapa ◀──────────────
                                     (y repite 4–5) hasta cerrar
                                  7. Encola el resultado y lo manda
   8. El servicio REST del flujo ◀── (con reintentos si falla)
      aplica la decisión (libera,
      desbloquea) y contesta 200 ──▶ 9. Marca el trámite como aplicado
                                     y avisa al solicitante
```

## Submódulos

| Submódulo | Qué hace | Quién lo usa |
|---|---|---|
| **Inicio** | Resumen: lo que me toca aprobar, mis trámites, y para TI los trámites sin aplicar o con error de configuración | Todos |
| **Bandeja** | Los trámites en los que participo; el aprobador decide desde aquí si no usa la liga del correo | Aprobadores y solicitantes |
| **Seguimiento** | Todos los trámites con filtros, su detalle completo, las transacciones con las plataformas y las acciones de administración (reasignar, reenviar, reprocesar) | Administrador y auditoría |
| **Flujos** | Definición de cada flujo: datos generales, grupos de aprobación por empresa, etapas y aprobadores, hoja del trámite, simulador y versiones | Administrador y diseñador |
| **Ajustes** | Ajustes del módulo (correos, folios, apariencia), conexiones con plataformas y usuarios de plataformas | Super administrador |

## Roles

Los aprobadores y solicitantes **no necesitan rol**: participan por ser parte del trámite. Los roles del módulo son para quien lo administra.

| Rol | Puede |
|---|---|
| `administrador` | Todo lo de Flujos y Seguimiento, incluidas las acciones (reasignar, reprocesar, reenviar resultados) |
| `disenador` | Crear y editar flujos, grupos, etapas y hojas |
| `auditoria` | Ver todo, sin modificar |
| Super administrador de la Intranet | Además, Ajustes y Conexiones |

## Qué ve cada quien en un trámite

| Quién | Ve |
|---|---|
| Aprobador en turno | La hoja del documento (datos, documentos, partidas, totales) y los botones Aprobar / Rechazar |
| Solicitante | La hoja, sin botones, y con quién está pendiente; puede reenviar el aviso al aprobador |
| Administrador / auditoría | La hoja, el recorrido de etapas, la bitácora, los correos enviados y las transacciones con la plataforma |

## Vocabulario

| Término | Significado |
|---|---|
| **Plataforma** | Sistema origen del documento (hoy TOTVS Protheus; el módulo está preparado para otros) |
| **Conexión** | Tarjeta en Ajustes con la URL, credenciales y token de una plataforma |
| **Flujo** | Un tipo de documento que se aprueba (`CompraDirecta`, `AltaCliente`); se identifica por su `processId` |
| **Grupo de aprobación** | Una cascada de etapas para una empresa; aplica a sus miembros o, si es *default*, a todos los demás solicitantes de esa empresa |
| **Etapa** | Un paso de la cascada con su aprobador (y suplente opcional), y opcionalmente una condición (`total > 100000`) |
| **Trámite** | Un documento concreto en aprobación; tiene folio (`WF-AVAL-000123`) |
| **Hoja** | Cómo se presenta el documento al aprobador; se configura por flujo |
| **Afectación** | Que la plataforma aplique el resultado (liberar, desbloquear) |
| **Transacción** | Cada mensaje entre la Intranet y la plataforma (entrada del sobre, salida del resultado), con sus reintentos |

## Flujos actuales

| Flujo | processId | Protheus | Al aprobar | Al rechazar |
|---|---|---|---|---|
| Solicitud de compra directa | `CompraDirecta` | `M110STTS` (interruptor) → `WFM110STTS`; regreso `WFM110RESULT` | Libera la solicitud (`C1_APROV = L`) y graba el aprobador (`C1_NOMAPRO`) | La marca rechazada (`C1_APROV = R`) |
| Alta de cliente | `AltaCliente` | `PECRMA980` bloquea al grabar; acción "Enviar a aprobación" (`CRM980MDEF` → `WFA1SEND`); regreso `WFA1RESULT` | Desbloquea el cliente (`A1_MSBLQL = 2`) y avisa a Odoo | El cliente sigue bloqueado |

## Lo que viene

- v2 de Alta de cliente: reenvío tras rechazo mostrando solo los documentos nuevos.
- Paso a producción de los flujos actuales y migración del resto de flujos de Fluig (presupuestos, contingencias, cuenta contable, bajas de activo).
- Folio por familia de empresa (hoy una sola familia, `AVAL`, configurable en Ajustes).
