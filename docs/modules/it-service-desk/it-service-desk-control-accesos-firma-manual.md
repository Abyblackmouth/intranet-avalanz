# Control de accesos · Firma manual

**Módulo:** IT Service Desk · Control de accesos
**Estado:** implementado y desplegado · **pendiente de prueba completa de punta a punta**
**Última actualización:** octubre 2026

---

## Resumen

Alternativa a DocuSign para cuando las firmas se recaban en papel. El **solicitante** imprime el formato, recaba las firmas, lo escanea y lo sube con una **liga segura**. TI revisa el escaneo, captura el **usuario asignado** y **libera** el acceso: la intranet arma el documento final con el escaneo más una hoja de **"Liberación de TI"** que lleva la firma guardada del encargado de TI.

Se activa con el ajuste `acc.metodo_firma = manual`. Comparte con DocuSign la revisión de TI, el almacén en MinIO, el registro de la cuenta y el expediente del empleado.

---

## Flujo

| Paso | Quién | Qué pasa | Estatus · `estado_firma` |
|---|---|---|---|
| 1 | Solicitante | Envía la solicitud. A TI le llega el correo con el PDF adjunto. | `en_revision` |
| 2 | TI | **Aprueba** (con jefe administrativo opcional) o **rechaza** en el panel. | — |
| 3 | Sistema | Genera el formato y le manda al solicitante el **PDF adjunto**, la **liga** (vigencia de 15 días) y las instrucciones de quiénes firman. | `en_firma` · `por_firmar` |
| 4 | Solicitante | Imprime, recaba las firmas (la suya, la de su jefe directo y, si aplica, la del jefe administrativo), escanea y **sube** el documento con la liga. | `en_firma` · `por_liberar` |
| 5 | Sistema | Une los archivos en un PDF, lo adjunta al ticket y le avisa a TI (correo con el escaneo adjunto y campana). | — |
| 6 | TI | Revisa las firmas, crea el usuario en el sistema destino con la **contraseña temporal**, captura el **usuario asignado** y da **Liberar acceso**. | `terminado` · `firmado` |
| 7 | Sistema | Arma el documento final, lo guarda, registra la cuenta y el expediente, y le manda al solicitante el documento con su usuario y contraseña. | — |

Mientras no se libere, el solicitante **puede volver a subir** el documento (por ejemplo, si le faltó una firma); el nuevo reemplaza al anterior.

---

## La firma del encargado de TI

- Se sube en **IT Service Desk → Actualizaciones → Control de accesos → Firma del encargado de TI**, una por formato.
- Formato: **PNG** (ideal, con fondo transparente) o JPG, hasta 2 MB.
- Se guarda **privada** en MinIO: `control-de-accesos/firmas/{formato_id}/{aleatorio}.png`, y su referencia en `acc_formatos.presentacion.firma_admin`.
- Solo el encargado de TI del formato o un Incident Manager la ven y la cambian.
- **Sin firma guardada no se puede liberar**: el botón Liberar avisa que primero se suba.
- La limpieza de datos de prueba **no la borra**.

---

## La liga segura

- Ruta pública: `{FRONTEND_URL}/subir-firmado/{token}` (no pide iniciar sesión, como la de "atender ticket").
- El token se genera con `secrets.token_urlsafe(32)` y se guarda en `acc_solicitudes.datos.subida`, con su vencimiento (15 días).
- La página muestra el folio, el formato, el solicitante y **quiénes deben firmar**, y deja de aceptar documentos si venció o si la solicitud ya cambió de estado.
- El middleware del frontend la marca como pública, igual que `/atender`.

### La subida

- Acepta **PDF, JPG o PNG**: hasta 10 archivos y 25 MB en total.
- Las fotos se convierten en páginas de PDF (una foto por hoja A4, con Gotenberg) y todo se une con `pypdf` en un solo documento.
- Se guarda en `{empresa}/control-de-accesos/{folio}/ESCANEO_{folio}_{fecha}_{hora}.pdf` y se adjunta al ticket como **evidencia del reporte**.
- Se calcula su **huella SHA-256**, que después va en la hoja de liberación.

---

## La liberación

En el panel del ticket, cuando el escaneo ya está arriba:

1. **Contraseña temporal**, ya generada (1 mayúscula, 4 minúsculas, 4 números y 1 símbolo, sin caracteres que se confunden), con **Copiar** y **Generar otra**. TI la pega en el sistema destino al crear el usuario.
2. **Usuario asignado**.
3. **Liberar acceso**.

El sistema arma el **documento final**: el escaneo **más una hoja de "Liberación de TI"** con:
- Folio, formato, solicitante y movimiento (Alta o Modificación).
- **Usuario asignado** y **fecha de alta**.
- Fecha y hora de la liberación (hora de Monterrey) y **quién liberó**.
- La **firma guardada** del encargado de TI.
- La **huella SHA-256 del escaneo**: cualquier cambio a esas páginas cambia la huella.

Se agrega como hoja aparte (y no encima del recuadro de TI del escaneo) porque cada escaneo viene con distinta escala, inclinación y márgenes; así la firma siempre queda bien y la huella liga la firma al documento exacto.

El documento final se guarda como `FIRMADO_{folio}_{fecha}_{hora}.pdf`, se adjunta como **evidencia de resolución**, se registra en el **expediente del empleado** (`ALTA|MOD_{FORMATO}_{MATRICULA}_{FOLIO}_{FECHA}.pdf`) y se le manda al solicitante con su usuario y su contraseña temporal. La contraseña **no se guarda** en ningún lado.

---

## Rutas

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /control-accesos/solicitudes/{id}/aprobar` | Encargado de TI, asignado o Incident Manager | Con el método `manual`: genera el PDF, la liga y el correo |
| `GET /control-accesos/subida/{token}` | Público, con la liga | Datos de la solicitud y si todavía acepta documentos |
| `POST /control-accesos/subida/{token}` | Público, con la liga | Recibe el escaneo (campo `archivos`) |
| `POST /control-accesos/solicitudes/{id}/liberar` | Encargado de TI o Incident Manager | Arma el documento final y cierra el ticket |
| `GET` / `POST /control-accesos/formatos/{id}/firma-ti` | Encargado de TI o Incident Manager | Ver y subir la firma |

---

## Seguridad

- La liga es aleatoria, vence y solo sirve mientras la solicitud está en firma.
- La firma de TI vive privada en MinIO y solo se estampa al liberar, por quien libera; cada liberación queda en la bitácora (`liberada_por_ti`, con la huella).
- La contraseña temporal solo viaja en el correo al solicitante.
- **Valor legal:** una imagen de firma tiene menos peso que la firma de DocuSign o una firma con certificado (e.firma). Para un formato interno de accesos es razonable, pero conviene que Legal lo conozca.

---

## Pendiente

- **Prueba completa de punta a punta** en el servidor: subir la firma de TI, aprobar con método manual, subir un escaneo desde la liga (en una ventana de incógnito, para confirmar que no pide sesión) y liberar.
- Opción para **reenviar la liga** si vence.

---

## Solución de problemas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| Liberar dice "Sube tu firma…" | No hay firma guardada para el formato | Subirla en Actualizaciones → Control de accesos |
| La liga pide iniciar sesión | La ruta no está marcada como pública en el middleware | Agregar `/subir-firmado` junto a `/atender` en `middleware.ts` |
| "La liga venció" | Pasaron 15 días | Pendiente: reenviar la liga (hoy, nueva solicitud) |
| "Los archivos pesan más de 25 MB" | Escaneos muy pesados | Escanear en menor resolución o en PDF |
