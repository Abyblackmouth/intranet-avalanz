# Manual · Seguimiento

Para **administradores** y **auditoría** del módulo (los demás usuarios ven aquí solo los trámites donde participan).

**Dónde**: Workflows → Seguimiento. Dos pestañas: **Trámites** y **Transacciones con las plataformas**.

## Trámites

Lista de todos los trámites con buscador (folio, solicitante, empresa, clave externa) y filtros por estatus y por flujo. Si filtras por un flujo, aparecen sus columnas propias (las del resumen del flujo).

| Estatus | Significa |
|---|---|
| En aprobación | Recorriendo sus etapas |
| Aprobada / Rechazada | Ya se decidió |
| Sustituida | Protheus mandó una modificación del mismo documento; nació otro trámite |
| Error de configuración | No había grupo de aprobación para esa empresa |

Junto al estatus, la **afectación**: *Plataforma: pendiente* (se está mandando el resultado), *aplicada* (Protheus confirmó) o *sin respuesta* (falló y se está reintentando).

### El detalle del trámite

Clic en el folio. Arriba el **riel** con las etapas (verde aprobada, azul en turno, gris pendiente, rojo rechazada, punteada omitida) y debajo las pestañas:

| Pestaña | Contenido |
|---|---|
| Solicitud | La hoja del documento, igual que la ve el aprobador |
| Aprobación | Etapa en turno, aprobador y desde cuándo, y las acciones |
| Historial | Cada evento: recibido, en turno, avisos, decisiones, resultado, con fecha y quién |
| Correos y plataforma | Cada correo enviado y su resultado; cada transacción con la plataforma |

### Acciones

| Acción | Cuándo usarla |
|---|---|
| **Reenviar aviso** | El aprobador dice que no le llegó el correo. Manda una liga nueva e invalida la anterior. (También la puede usar el solicitante.) |
| **Reasignar aprobador** | El aprobador no está (vacaciones, baja). Pide el nuevo aprobador y el motivo; el nuevo recibe el aviso |
| **Reprocesar** | Un trámite en *error de configuración*, después de crear el grupo que faltaba en Flujos |

## Transacciones con las plataformas

Cada mensaje entre la Intranet y Protheus: la **entrada** del documento y la **salida** del resultado.

| Estado | Significa |
|---|---|
| Recibido | Entró el documento |
| Pendiente / Error | El resultado se está mandando; en error se reintenta solo (1, 5, 15, 60, 240 minutos) |
| Enviado | Protheus lo aplicó (se ve su respuesta) |
| Abandonado | No se pudo aplicar y ya no se reintenta (por ejemplo, el servicio no existía o el documento no se encontró) |

- **JSON** muestra exactamente lo que se mandó y lo que respondió Protheus.
- **Reenviar ahora** (en error o abandonado) lo intenta de inmediato; úsalo cuando se haya corregido la causa (por ejemplo, después de reiniciar el servicio REST de Protheus).

Cuando un resultado se abandona o Protheus no confirma a tiempo, los administradores del módulo reciben un aviso.
