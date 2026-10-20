# Manual · Usuarios de plataformas

Liga cada **usuario de Protheus** (su código, por ejemplo `000006`) con su **usuario de la Intranet**. Con eso Workflows sabe quién es el solicitante de un trámite y qué código de Protheus mandar cuando alguien aprueba.

**Quién**: super administrador. **Dónde**: Workflows → Ajustes → pestaña **Usuarios de plataformas**.

## Cómo se llena

La mayoría se llena sola: cuando Protheus manda un documento de un usuario nuevo, aparece aquí; si su correo en Protheus coincide con el de un usuario de la Intranet, queda **ligado** automáticamente. Los que no coinciden quedan **por ligar**.

## Ligar o cambiar a mano

1. Busca el renglón (código, login, nombre).
2. **Ligar** (o **Cambiar**) → busca al usuario de la Intranet por nombre o correo → guardar.
3. Para dar de alta uno que todavía no aparece: **Nuevo** → plataforma, código de Protheus, usuario de la Intranet.

El código de Protheus está en Configurador → Usuarios (campo *Código*, 6 dígitos).

## Para qué importa

| Si el usuario de Protheus está ligado | Efecto |
|---|---|
| Como **solicitante** | Recibe campanas y correos de su trámite, lo ve en su Bandeja y Seguimiento, puede reenviar el aviso al aprobador; si además es aprobador de una etapa de su propia cascada, esa etapa se omite |
| Como **aprobador** | Al aprobar, su código de Protheus viaja en el resultado (en compras se graba en `C1_NOMAPRO`) |

## Cuidado con los usuarios genéricos

Si ligas un usuario genérico de Protheus (por ejemplo `000000 Administrador`) a una persona, para Workflows **todo lo que capture ese usuario lo pidió esa persona**: le llegan los avisos de solicitante y, si es aprobadora, sus etapas se omiten. Para pruebas puede servir; en operación cada quien debe capturar con su propio usuario.
