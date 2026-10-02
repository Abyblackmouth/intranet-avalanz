# Control de accesos · Firma con DocuSign

**Módulo:** IT Service Desk · Control de accesos
**Estado:** en productivo, probado de punta a punta en el ambiente de pruebas de DocuSign
**Última actualización:** octubre 2026

---

## Resumen

Una solicitud de acceso (por ejemplo, a ERP TOTVS 25) se firma electrónicamente con DocuSign. TI revisa primero la solicitud; solo al aprobarla se genera el formato y se manda el sobre. Los firmantes firman en orden y, al final, TI captura el **usuario asignado** dentro de DocuSign. Cuando TI firma, el sobre se completa y la intranet cierra el ticket sola.

El método de firma se elige con el ajuste `acc.metodo_firma` (`docusign` o `manual`). Este documento cubre DocuSign; la firma manual está en `control-accesos-firma-manual.md`. Las dos conviven y comparten el almacén en MinIO, el registro de la cuenta y el expediente del empleado.

---

## Flujo

| Paso | Quién | Qué pasa | Estatus del ticket |
|---|---|---|---|
| 1 | Solicitante | Llena el formulario de 7 etapas y lo envía. Se crea el ticket `ACC-{familia}-{n}` con el PDF de la solicitud como evidencia. A TI le llega un correo con el PDF adjunto. | `en_revision` |
| 2 | TI | En el panel del ticket, sección **Revisión de TI**: **Aprobar y enviar a firma** (con jefe administrativo opcional) o **Rechazar** (con motivo). | — |
| 3 | Sistema | Al aprobar, genera el formato con anclas y manda el sobre. Le avisa al solicitante. | `en_firma` |
| 4 | Firmantes | Firman en orden: usuario → jefe directo → jefe administrativo (si aplica) → TI. | `en_firma` |
| 5 | TI | Antes de firmar, guarda la **contraseña temporal** en el panel. En DocuSign captura el **usuario asignado** (campo obligatorio) y firma. | `en_firma` |
| 6 | Sistema | Webhook (o consulta de respaldo): descarga el PDF firmado, lo guarda, cierra el ticket, registra la cuenta, agrega el formato al expediente y le manda al solicitante su usuario y contraseña. | `terminado` |

**Rechazo:** el ticket termina como `rechazado`, con el motivo, y se le avisa al solicitante. Si necesita el acceso, levanta una solicitud nueva.
**Firma declinada o sobre anulado en DocuSign:** el ticket termina como `rechazado` y se le avisa al solicitante.

---

## Configuración

### Variables de entorno (`.env` del IT Service Desk)

Las mismas credenciales que Legal (una sola cuenta de DocuSign):

| Variable | Uso |
|---|---|
| `DOCUSIGN_INTEGRATION_KEY` | Llave de integración de la app |
| `DOCUSIGN_USER_ID` | Usuario que firma el JWT (impersonación) |
| `DOCUSIGN_ACCOUNT_ID` | Cuenta de DocuSign |
| `DOCUSIGN_BASE_URI` | `https://demo.docusign.net` en pruebas; la URI de producción para firmas con validez |
| `DOCUSIGN_AUTH_SERVER` | `account-d.docusign.com` en pruebas; `account.docusign.com` en producción |
| `DOCUSIGN_PRIVATE_KEY_PATH` | `/app/docusign_private.pem` |
| `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY` | Para guardar los PDF firmados (mismas que Legal) |

**Importante:** la configuración del servicio (`app/config.py`) **no acepta variables desconocidas**. Las variables `DOCUSIGN_*` y `MINIO_*` están declaradas ahí con valores por defecto vacíos. Si se agrega una variable nueva al `.env`, hay que declararla también en `config.py`, o el servicio no arranca (`Extra inputs are not permitted`).

Los `.env` **no se suben a Git**. Al montar otro servidor hay que copiarlos a mano.

### Llave privada

La llave vive en `backend/modules/legal-service/docusign_private.pem` (ignorada por Git con `*.pem`) y se **monta en solo lectura** en el contenedor del IT Service Desk desde `docker-compose.yml`:

```yaml
it-service-desk-service:
  volumes:
    - ../../backend/modules/legal-service/docusign_private.pem:/app/docusign_private.pem:ro
```

Así hay una sola llave para los dos módulos.

### Ajustes del módulo (IT Service Desk → Ajustes)

| Ajuste | Valor |
|---|---|
| `acc.metodo_firma` | `docusign` |
| `acc.docusign_ambiente` | `pruebas` (el PDF lleva la leyenda "DOCUMENTO DE PRUEBA · SIN VALIDEZ") o `produccion` |

### Tarea programada

Consulta de respaldo cada 5 minutos, por si un aviso de DocuSign no llega:

```
*/5 * * * * docker exec avalanz-it-service-desk python -c "import httpx; httpx.post('http://127.0.0.1:8000/api/v1/it-service-desk/control-accesos/internal/docusign-poll', timeout=120)" >/dev/null 2>&1
```

---

## Componentes

| Archivo | Responsabilidad |
|---|---|
| `app/services/control_accesos/firma/docusign.py` | Cliente de DocuSign: token JWT (con caché), crear sobre, estado, valores de los campos de texto y descarga del PDF combinado |
| `app/services/control_accesos/firma/cierre.py` | `procesar_sobre()`: cierre al completarse o declinarse; `registrar_cuenta()` y `registrar_en_expediente()`, compartidos con la firma manual |
| `app/services/control_accesos/firma/almacen.py` | Leer y guardar en MinIO (bucket `dirdoc`) |
| `app/services/control_accesos/motor/documento.py` | Contexto del formato (`contexto_solicitud`), render Jinja y PDF con Gotenberg (`html_a_pdf`) |
| `app/routes/control_accesos/solicitudes.py` | Rutas de revisión, webhook, consulta, contraseña temporal y resumen |

### Rutas

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `POST /control-accesos/solicitudes/{id}/aprobar` | Encargado de TI del formato, el asignado o un Incident Manager | Arma el PDF con anclas y manda el sobre |
| `POST /control-accesos/solicitudes/{id}/rechazar` | Los mismos | Termina el ticket como `rechazado`, con motivo |
| `POST /control-accesos/solicitudes/{id}/contrasena-temporal` | Encargado de TI | Guarda la contraseña para el correo de cierre |
| `POST /control-accesos/docusign/webhook` | DocuSign (público) | Procesa solo sobres propios; responde 200 si el aviso es legible |
| `POST /control-accesos/internal/docusign-poll` | Solo desde dentro del contenedor (`127.0.0.1`) | Revisa los sobres en firma |
| `GET /control-accesos/solicitudes/{id}/resumen` | Solicitante, asignado o Incident Manager | Resumen por secciones con el estado de la firma |

---

## El sobre

### Firmantes y orden

1. **Usuario** (correo del perfil del solicitante) → ancla `/f1/`
2. **Jefe directo** (capturado en la etapa 1) → ancla `/f2/`
3. **Jefe administrativo** (solo si TI lo indicó al aprobar) → ancla `/f3/`
4. **TI** (encargado del formato) → ancla `/f4/`, con:
   - **Usuario asignado**: campo de texto **obligatorio** (`usuario_asignado`), ancla `/ua/`
   - **Fecha de alta**: fecha de firma automática, ancla `/fa/`

### Anclas

El formato (`formatos/totvs25/template.html`) lleva las anclas como texto blanco de 2 pt dentro de cada línea de firma y de los campos de TI. Solo se incluyen cuando `anclas=True` (el PDF que va a DocuSign); la vista previa y el PDF de evidencia no las llevan. Si el jefe administrativo no aplica, su firma no aparece y la fila queda con dos firmas (`.firmas.dos`).

### Avisos de DocuSign

- Cada sobre lleva su propio `eventNotification` hacia `{FRONTEND_URL}/api/v1/it-service-desk/control-accesos/docusign/webhook`, con acuse de recibo (DocuSign reintenta si falla).
- Lleva los campos personalizados `folio_avalanz` y `origen = it-service-desk`.
- Los avisos de la cuenta (DocuSign Connect) siguen llegando también al webhook de Legal, que **ignora** los sobres que no encuentra en su base.

---

## El cierre (`procesar_sobre`)

Es **idempotente**: si el sobre ya se procesó, no hace nada.

Al completarse:
1. Lee el **usuario asignado** de los campos de texto del sobre.
2. Descarga el **PDF combinado** firmado y lo guarda en MinIO:
   `{empresa}/control-de-accesos/{folio}/FIRMADO_{folio}_{fecha}_{hora}.pdf`
3. Lo adjunta al ticket como **evidencia de resolución**.
4. Marca la solicitud (`estado_firma = firmado`, `usuario_asignado`, `fecha_alta`, `firmado_object_key`).
5. Registra la **cuenta** como activa, con sus accesos (solo es el registro de la intranet: el usuario en el sistema destino lo crea TI a mano).
6. Agrega el formato al **expediente del empleado** (Usuarios → Documentos), sin volver a subirlo:
   `ALTA|MOD_{FORMATO}_{MATRICULA}_{FOLIO}_{FECHA}.pdf`
7. Pasa el ticket a `terminado`, deja la bitácora `firmada_por_todos` y avisa en vivo a la Mesa de Soporte.
8. Le manda al solicitante su **usuario asignado** y la **contraseña temporal** (si TI la guardó), y la borra de la base.

---

## Contraseña temporal

- Se genera en el panel: 1 mayúscula, 4 minúsculas, 4 números y 1 símbolo (`* # ! $`), sin caracteres que se confunden. Ejemplo: `Kmrtv4829*`.
- TI la copia, la pega en el sistema destino al crear el usuario (marcando cambio obligatorio en el primer inicio) y da **Guardar para el correo final** antes de firmar.
- Se guarda en `acc_solicitudes.datos.entrega` **solo hasta** el correo de cierre, y ahí se borra.
- Validación: de 8 a 24 caracteres, con mayúscula, minúscula y número o símbolo.

---

## Paso a firmas con validez (producción de DocuSign)

1. En el `.env` del IT Service Desk, cambiar las variables `DOCUSIGN_*` por las de la cuenta de producción (las mismas que use Legal en producción).
2. Si la cuenta de producción usa otra llave, montar la nueva en el `docker-compose.yml`.
3. Reconstruir el servicio con `docker compose up -d --build --force-recreate it-service-desk-service`.
4. En Ajustes, poner `acc.docusign_ambiente = produccion` (quita la leyenda de prueba).
5. Hacer una solicitud real de prueba de punta a punta.

Los sobres del ambiente de pruebas no se pueden borrar de DocuSign; la cuenta de producción arranca vacía.

---

## Solución de problemas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| El servicio no arranca: `Extra inputs are not permitted` | Hay una variable en el `.env` que no está declarada en `config.py` | Declararla en `config.py` |
| Aprobar dice que el método está en `manual` | El ajuste `acc.metodo_firma` | Cambiarlo a `docusign` en Ajustes |
| `503 DocuSign no está configurado` | Faltan variables o la llave no está montada | Revisar `.env` y el volumen del `.pem` |
| `502 DocuSign no aceptó el sobre` | Error de DocuSign (correo inválido, ancla faltante, etc.) | `docker logs avalanz-it-service-desk \| grep -i docusign` |
| El ticket no se cierra después de que TI firma | El aviso no llegó | Esperar la consulta de respaldo (5 min) o forzarla con el comando de la tarea programada |
| La Mesa de Soporte no se actualiza sola | Pestaña abierta desde antes de un despliegue | Recargar con Ctrl + Shift + R |

Comprobar la conexión con DocuSign:

```bash
docker exec avalanz-it-service-desk python -c "import asyncio; from app.services.control_accesos.firma import docusign as ds; print(ds.configurado()); asyncio.run(ds.token()); print('TOKEN OK')"
```
