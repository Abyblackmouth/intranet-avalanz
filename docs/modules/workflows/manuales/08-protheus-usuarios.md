# Manual · Protheus (capturistas)

Cómo se mandan documentos a aprobación desde Protheus. Las aprobaciones se hacen en la Intranet; en Protheus solo se captura y se envía.

## Solicitud de compra

1. Compras → Solicitudes de compra → **Incluir**, captura como siempre y graba.
2. Escribe el **motivo de la solicitud** cuando lo pida (obligatorio).
3. Aparece **"Solicitud enviada a aprobación"** con el folio de la Intranet (`WF-AVAL-…`).
4. La solicitud queda **bloqueada** hasta que se apruebe. Cuando se aprueba se libera sola; si se rechaza, queda rechazada y te llega el motivo por correo.

Si al grabar sale **"No se pudo enviar a aprobación"**, la solicitud se guardó pero no salió: avisa a TI con el motivo que muestra.

Los documentos que la solicitud tenga en el Banco de Conocimiento viajan con ella.

## Alta de cliente

1. Facturación → Clientes → **Incluir**, captura y graba.
2. Aparece **"Cliente bloqueado"**: el cliente se guardó y quedó bloqueado (Estatus = 1) hasta que se apruebe. Así no se puede usar en pedidos ni facturas.
3. Con el cliente seleccionado en la lista: **Otras acciones → Conocimiento** y adjunta sus documentos (constancia de situación fiscal, comprobante de domicilio, identificación…). Puedes adjuntar varios.
4. Cuando ya estén todos: **Otras acciones → Enviar a aprobación** → confirma.
5. Aparece **"Cliente enviado a aprobación"** con el folio y el número de documentos.
6. Cuando se aprueba, el cliente se **desbloquea solo** (Estatus = 2 - Activo) y queda activo también en Odoo. Si se rechaza, sigue bloqueado y te llega el motivo por correo: corrige lo que haga falta y vuelve a enviarlo.

Mensajes posibles:

| Mensaje | Qué hacer |
|---|---|
| Faltan documentos | Adjunta al menos uno en Conocimiento y vuelve a enviar |
| El cliente está activo… ¿Deseas continuar? | El cliente no estaba bloqueado; si lo envías, se bloquea hasta que se apruebe |
| No se pudo enviar a aprobación | Intenta en unos minutos; si sigue, avisa a TI con el motivo |

Adjuntar documentos **no** manda nada por sí solo: el envío es siempre con *Enviar a aprobación*.

## Para TI: activar o desactivar un flujo en Protheus

| Flujo | Parámetro | S | N |
|---|---|---|---|
| Solicitud de compra | `MV_XWFON` | Va a la Intranet | Va a Fluig (como antes) |
| Alta de cliente | `MV_XWFA1ON` | Bloquea al grabar y habilita *Enviar a aprobación* | Sin cambios respecto a antes |
