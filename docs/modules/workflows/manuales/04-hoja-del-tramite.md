# Manual · Hoja del trámite

La **hoja** es cómo ve el aprobador el documento: arriba el número, la empresa y el solicitante; luego los **datos** en tarjetas, los **archivos adjuntos** y las **tablas** (partidas, cuentas…) con sus totales. Se configura una vez por flujo.

**Quién**: administrador o diseñador. **Dónde**: Workflows → Flujos → (el flujo) → pestaña **Hoja**.

La pantalla tiene el **editor** a la izquierda y la **vista previa** a la derecha, con el último trámite real del flujo. Cambia entre *Página de aprobación* (lo que ve el aprobador al abrir la liga) y *Correo* (el aviso que le llega).

## Empezar

Clic en **Detectar campos**: llena la hoja con todo lo que trae el último trámite (cada dato como tarjeta, cada lista como tabla y subtotal/IVA/total como totales). Después solo acomodas. Necesita que el flujo ya tenga al menos un trámite.

## Documento

| Campo | Qué hace | Ejemplo |
|---|---|---|
| Estilo | Cómo se ve: Flotante, Neutro, Tinta, Arena o Clásico. *El del módulo* usa el de Ajustes → Apariencia | El del módulo |
| Etiqueta | Texto sobre el número | `Solicitud de compra` |
| Número | Qué dato se muestra como "No. …"; `folio` usa el folio de la Intranet | `numerosolicitud`, `codigo` |
| Área | Opcional, aparece junto al solicitante | `Compras` |

## Datos de la solicitud (tarjetas)

Cada renglón es una tarjeta:

| Control | Para qué |
|---|---|
| Clave | El dato que manda Protheus (se autocompleta con los del último trámite) |
| Etiqueta | Cómo se llama en pantalla: escribe `Razón social` en lugar de `razonSocial` |
| Tipo | Texto, Moneda ($1,234.00), Número, Fecha (18 oct 2026) o Porcentaje |
| Normal / Ancha | La ancha ocupa dos espacios: úsala para nombres, direcciones o motivos largos |
| Equivalencias | Traduce códigos a texto, uno por renglón: `1 = Consumidor final`, `F = Persona física`. Si llega un valor que no está en la lista, se muestra tal cual |
| ↑ ↓ ✕ | Mover o quitar |

Las tarjetas sin valor en un trámite no se muestran.

## Archivos adjuntos

Interruptor para mostrarlos. Solo aparece la sección si el trámite trae archivos; el aprobador los abre con un clic.

## Tablas

Para cada lista de datos (por ejemplo `items`):

- **Lista en cardData** y **Título** (`Partidas`).
- **Columnas**: clave, etiqueta, tipo, alineación, *+ detalle* (otro dato que se muestra en gris junto al valor, como el código del producto junto a la descripción) y equivalencias.
- **Totales**: claves del documento (`subtotal`, `impuesto`, `total`), con etiqueta, tipo y uno marcado como **destacado**.

## Guardar y probar

- **Guardar hoja**: aplica de inmediato a todos los trámites del flujo, nuevos y existentes.
- **Enviarme una prueba**: te manda el correo tal como lo recibe el aprobador.

## Consejos

- Pon arriba lo que el aprobador necesita para decidir (proveedor, motivo, razón social, RFC) y quita lo técnico (tienda, operación, usuario de captura).
- Usa equivalencias para cualquier código (`1`, `F`, `J`, `A`): el aprobador no debería tener que saber qué significan.
- Revisa la vista previa en *Página de aprobación* y prueba **Imprimir / PDF** desde una liga real: la impresión sale en hoja carta, limpia y con la tabla completa.
