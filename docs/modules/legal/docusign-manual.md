# DocuSign eSignature — Manual de Integración
## Intranet Avalanz · Módulo Legal · Submódulo Contratos

**Versión:** 2.0
**Fecha:** Junio 2026
**Autor:** Equipo de Desarrollo — Abraham Covarrubias
**Estado:** Integración en sandbox completada y operando en producción ✅

---

## ¿Por qué necesitamos un servicio de firma electrónica?

El flujo de contratos en Grupo Avalanz hoy involucra imprimir documentos, conseguir firmas físicas de representantes legales de dos empresas, escanear el resultado y archivarlo. Este proceso puede tardar días o semanas, especialmente cuando las partes están en distintas ciudades o países.

Con la Intranet Avalanz, el área legal genera contratos digitalmente en segundos. El último paso — la firma — es el cuello de botella que el servicio de firma electrónica resuelve: los firmantes reciben un correo, abren el documento en cualquier dispositivo, firman con un clic, y el documento queda cerrado, certificado y archivado automáticamente en la plataforma.

---

## ¿Qué es DocuSign?

DocuSign es la plataforma líder mundial de firma electrónica con más de un millón de empresas clientes en 180 países. Permite enviar documentos a firmar por correo electrónico o SMS, rastrear el estado de cada firma en tiempo real y obtener el documento firmado con validez legal.

En México, DocuSign tiene integración con proveedores de **NOM-151** — la norma oficial mexicana que certifica la autenticidad de los documentos electrónicos y les da el mismo peso legal que una firma autógrafa. Esta certificación es el puente entre la firma electrónica y el mundo legal mexicano.

---

## ¿Por qué DocuSign y no otra alternativa?

Al evaluar opciones de firma electrónica para el proyecto, consideramos los siguientes criterios:

| Criterio | DocuSign | Mifiel | Firmamex | Desarrollo propio |
|---|---|---|---|---|
| Cobertura internacional | ✅ 180 países | ⚠️ Solo México | ⚠️ Solo México | ❌ |
| NOM-151 nativa | ✅ Vía partners | ✅ Nativa | ✅ Nativa | ❌ Requiere contrato |
| API madura y documentada | ✅ Excelente | ✅ Buena | ⚠️ Limitada | N/A |
| Sandbox gratuito para desarrollo | ✅ | ✅ | ⚠️ | N/A |
| Reconocimiento de marca para firmantes | ✅ Muy alto | ⚠️ Medio | ⚠️ Bajo | ❌ |
| Tiempo de integración | Bajo | Bajo | Medio | Muy alto |

DocuSign se eligió por su API robusta, su reconocimiento global, su sandbox sin costo para desarrollo y porque Grupo Avalanz tiene contratos con contrapartes internacionales donde Mifiel o Firmamex no operan. La NOM-151 se activa a través de los proveedores certificados con los que DocuSign ya tiene integración.

---

## Cómo encaja DocuSign en el flujo de contratos

El módulo de Solicitud de Contratos de la Intranet Avalanz tiene el siguiente ciclo de vida:

```
Solicitante crea contrato
        │
        ▼
Área legal revisa y aprueba
        │
        ▼  ← DocuSign entra aquí — automáticamente al aprobar
Correo automático a firmantes
        │
        ▼
Firmantes firman desde cualquier dispositivo
        │
        ▼
DocuSign notifica a la plataforma (webhook o polling)
        │
        ▼
PDF firmado se archiva automáticamente en MinIO
        │
        ▼
Sobre marcado como "Completado" con historial completo
```

Desde la perspectiva del usuario, el proceso es completamente transparente: el abogado da clic en "Aprobar" y el sistema hace todo el resto. Los firmantes reciben un correo de DocuSign, firman, y el contrato aparece como completado en la plataforma con el PDF firmado disponible para descarga.

---

## Cuenta y acceso

### Portales

| Portal | URL | Para qué sirve |
|---|---|---|
| Developer Console (sandbox) | https://admindemo.docusign.com | Administración de la cuenta de desarrollo |
| Apps and Keys | https://admindemo.docusign.com/apps-and-keys | Credenciales de la integración |
| Connect (Webhooks) | https://admindemo.docusign.com → Admin → Connect | Configurar webhooks de eventos |
| Sobres enviados | https://appdemo.docusign.com | Ver sobres enviados y firmarlos manualmente |
| API Explorer | https://apiexplorer.docusign.com | Probar endpoints en vivo sin código |
| Documentación oficial | https://developers.docusign.com/docs/esign-rest-api | Referencia completa de la API |

### Cuenta del proyecto

La cuenta de desarrollo de DocuSign está registrada a nombre de Grupo Avalanz — Héctor Abraham Covarrubias. El ambiente activo es **sandbox** (desarrollo). Para pasar a producción se sigue el proceso de **Go-Live** documentado más adelante.

---

## Credenciales y configuración

### Variables de entorno

Todas las credenciales de DocuSign viven en el archivo `.env` del servicio legal del backend. No deben compartirse por correo ni commitearse a git.

```env
# DocuSign eSignature — Sandbox
DOCUSIGN_INTEGRATION_KEY=027e9aa0-c59d-4e73-a731-3de935f37317
DOCUSIGN_USER_ID=9e945c43-d63f-4064-9ddb-e8ea065a447c
DOCUSIGN_ACCOUNT_ID=5dcad3a2-d1e4-4f8b-aafe-36755860504e
DOCUSIGN_BASE_URI=https://demo.docusign.net
DOCUSIGN_AUTH_SERVER=account-d.docusign.com
DOCUSIGN_PRIVATE_KEY_PATH=/app/docusign_private.pem
```

### Dónde obtener cada credencial

| Variable | Descripción | Dónde encontrarla |
|---|---|---|
| `DOCUSIGN_INTEGRATION_KEY` | Identificador único de la aplicación DocuSign | Portal → Apps and Keys → nombre de la app |
| `DOCUSIGN_USER_ID` | Identificador del usuario que "impersona" los envíos | Portal → Apps and Keys → "Identificación de usuario" |
| `DOCUSIGN_ACCOUNT_ID` | Identificador de la cuenta API | Portal → Apps and Keys → "Id de la cuenta de API" |
| `DOCUSIGN_BASE_URI` | URL base de la API (distinta en sandbox y producción) | Portal → Apps and Keys → "URI de base de la cuenta" |
| `DOCUSIGN_AUTH_SERVER` | Servidor de autenticación OAuth | Sandbox: `account-d.docusign.com` |
| `DOCUSIGN_PRIVATE_KEY_PATH` | Ruta al archivo de clave privada RSA | Generado en el portal → se guarda como archivo `.pem` |

### Clave privada RSA

La clave privada es el equivalente a una llave física — permite que el servidor se autentique con DocuSign sin que ningún usuario necesite iniciar sesión manualmente. Se genera una sola vez en el portal de DocuSign y se guarda en el servidor de producción en:

```
backend/modules/legal-service/docusign_private.pem
```

Dentro del contenedor Docker se monta en `/app/docusign_private.pem`.

> ⚠️ Este archivo **no se versiona en git**. En caso de pérdida, se puede regenerar desde el portal de DocuSign y actualizar en el servidor.

---

## Configuración inicial en DocuSign (solo la primera vez)

### 1. Crear la aplicación

1. Ir a **Apps and Keys** en el portal de desarrolladores
2. Clic en **"Add App and Integration Key"**
3. Nombre: `Intranet Avalanz`
4. Tipo: **Integración privada personalizada**
5. En **"Integración del servicio"** → **"Generar RSA"** → guardar la clave privada
6. En **"Redireccionar URIs"** → agregar `http://localhost`
7. **Guardar**

### 2. Otorgar consentimiento (una sola vez)

Abrir esta URL en el navegador con la Integration Key de la app:

```
https://account-d.docusign.com/oauth/auth?response_type=code
  &scope=signature%20impersonation
  &client_id={INTEGRATION_KEY}
  &redirect_uri=http://localhost
```

Hacer clic en **"Allow Access"**. El navegador mostrará un error al redirigir — eso es esperado. El consentimiento queda registrado permanentemente.

### 3. Configurar DocuSign Connect (webhook)

1. Ir a **Admin → Connect** en el portal sandbox
2. Clic en **"Add Account Configuration"**
3. Llenar:
   - **Name:** `Intranet Avalanz Legal`
   - **URL:** `https://intranet.avalanz.com/api/v1/legal/envelopes/docusign/webhook`
   - **Trigger Events:** marcar `Envelope Signed/Completed`
   - **Include Data:** marcar `Recipients`
   - **Data Format:** REST v2.1
4. Guardar — Config ID asignado: `22211442`

> Para que DocuSign Connect llegue al servidor, el firewall corporativo debe permitir tráfico entrante en puerto 443 desde las IPs de DocuSign sandbox:
> - `54.240.115.126` — `54.240.115.137`
> - `161.38.201.200/29`
> Este ticket está pendiente con IT. Mientras tanto, el polling de 5 minutos actúa como respaldo.

### 4. Verificar que funciona

```bash
docker exec avalanz-legal python3 -c "
import asyncio, sys
sys.path.insert(0, '/app')
from contract_requests.docusign_service import get_access_token
token = asyncio.run(get_access_token())
print('TOKEN OK:', token[:40], '...')
"
```

---

## Arquitectura técnica del servicio

### Ubicación en el proyecto

```
backend/modules/legal-service/
├── contract_requests/
│   ├── docusign_service.py    ← Toda la lógica de DocuSign vive aquí
│   ├── docusign_routes.py     ← Webhook + polling — separado del router principal
│   ├── signing_service.py     ← Orquestador: decide qué proveedor usar + auto-signers
│   └── routes.py              ← Endpoints HTTP generales
├── docusign_private.pem       ← Clave privada RSA (no versionar)
└── .env                       ← Credenciales (no versionar)
```

### Qué hace cada archivo

| Archivo | Responsabilidad |
|---|---|
| `docusign_service.py` | Comunicación directa con la API de DocuSign — JWT Grant, create_envelope, download, status, webhook validation |
| `docusign_routes.py` | Endpoints `/docusign/webhook` y `/internal/docusign-poll` — separados del router principal |
| `signing_service.py` | Orquestador — decide si usar email_sim o docusign, descarga PDF de MinIO, construye firmantes automáticamente |
| `routes.py` | Endpoints generales del módulo — aprobación, send-for-signing, CRUD firmantes |

### Funciones de docusign_service.py

| Función | Qué hace |
|---|---|
| `get_access_token()` | Se autentica con DocuSign vía JWT RSA-SHA256 y obtiene un token Bearer. Se renueva automáticamente con margen de 60s antes de expirar |
| `create_envelope(pdf_bytes, folio, contract_type_name, signers)` | Toma el PDF del contrato y la lista de firmantes, crea el sobre en DocuSign y lo envía. Retorna el `docusign_envelope_id` |
| `get_envelope_status(docusign_envelope_id)` | Consulta el estado actual del sobre en DocuSign |
| `download_signed_document(docusign_envelope_id)` | Descarga el PDF con las firmas usando `documentId="1"`. **Importante: NO usar `documentIdGuid` — devuelve 404** |
| `verify_webhook_payload(payload)` | Valida que el payload viene de DocuSign. Soporta formato REST v2.1 (envelopeId en `data.envelopeId`) y formato legacy (envelopeId en raíz) |

### Proveedor de firma activo

El sistema tiene un interruptor que permite cambiar entre dos modos sin tocar código:

| Modo | Cuándo usarlo |
|---|---|
| `email_sim` | Desarrollo y pruebas internas — simula el envío sin DocuSign real |
| `docusign` | Producción y pruebas de integración — usa DocuSign real |

```bash
# Consultar modo actual
GET /api/v1/legal/envelopes/signing/provider

# Cambiar a DocuSign
POST /api/v1/legal/envelopes/signing/provider
{ "provider": "docusign" }

# Cambiar a simulación
POST /api/v1/legal/envelopes/signing/provider
{ "provider": "email_sim" }
```

---

## Flujo completo de firma

### Paso 1 — El abogado aprueba

El abogado da clic en "Aprobar" en el frontend. El botón encadena automáticamente dos llamadas:

```typescript
await approveEnvelope(envelopeId)   // sobre → en_firmas
await sendForSigning(envelopeId)    // DocuSign envía correos
```

### Paso 2 — El sistema envía a DocuSign

`signing_service._send_docusign()` ejecuta:

1. Descarga el PDF del contrato desde MinIO con boto3 (S3 API directa)
2. Busca firmantes en BD (`envelope_signers`)
   - Si no hay → **auto-construye firmantes** desde `form_data` + `signers_definition` del `fields.json`
   - Los firmantes auto-construidos se guardan en BD para futuras referencias
3. Llama a `docusign_service.create_envelope()`:
   - Obtiene token JWT
   - Envía POST `/envelopes` con PDF en base64 y configuración de firmantes con anclas
4. Guarda `docusign_envelope_id` en BD
5. DocuSign envía correos a los firmantes en orden de `routing_order`

### Paso 3 — Los firmantes firman

Los firmantes reciben un correo de DocuSign con un enlace para firmar. DocuSign maneja toda la interfaz de firma — el firmante puede usar cualquier dispositivo.

El `routing_order` controla el orden:
- Mismo número → firman al mismo tiempo (paralelo)
- Número mayor → el siguiente firmante recibe el correo solo cuando el anterior ya firmó (secuencial)

### Paso 4 — DocuSign notifica a la plataforma

Cuando todos firman, DocuSign hace un POST al webhook:

```
POST https://intranet.avalanz.com/api/v1/legal/envelopes/docusign/webhook
```

El payload REST v2.1 tiene esta estructura:
```json
{
  "event": "envelope-completed",
  "apiVersion": "v2.1",
  "data": {
    "envelopeId": "uuid-del-sobre",
    "envelopeSummary": {
      "status": "completed",
      "completedDateTime": "2026-06-25T20:19:55Z"
    }
  }
}
```

> Si el webhook no llega (firewall), el **cron cada 5 minutos** consulta el estado de todos los sobres en `en_firmas` directamente a DocuSign y los procesa.

### Paso 5 — La plataforma archiva el PDF firmado

`_process_completed_envelope()` ejecuta:

1. Marca PDFs anteriores del sobre como `is_current=False` (solo `mime_type=application/pdf` — los anexos NO se afectan)
2. Descarga el PDF firmado de DocuSign usando `documentId="1"`
3. Sube el PDF firmado a MinIO: `{company_slug}/legal/envelopes/{folio}/firmado/{uuid}_{folio}_firmado.pdf`
4. Registra en `envelope_attachments` con `is_current=True`
5. Actualiza firmantes a `status="signed"`, `signed_at=now`
6. `envelope.status = "completado"`, `sla_closed_at=now`, `completed_at=now`
7. Registra 3 logs de actividad:
   - `docusign_signing_completed`
   - `signed_document_archived`
   - `envelope_completed`

---

## Auto-construcción de firmantes desde el formulario

Cuando no se han definido firmantes manualmente en BD, el sistema los construye automáticamente desde los datos del formulario usando la `signers_definition` del `fields.json` del template.

### Campos del formulario que se usan (NDA Mutuo)

```json
// fields.json — signers_definition
[
  {
    "routing_order": 1,
    "name_field": "NOMBRE_FIRMANTE_1",
    "email_field": "EMAIL_FIRMANTE_1",
    "role_field": "CARGO_FIRMANTE_1",
    "sign_here_anchor": "*FIRMA1*",
    "full_name_anchor": "*NOMBRE1*",
    "date_signed_anchor": "*FECHA_FIRMA1*"
  },
  {
    "routing_order": 2,
    "name_field": "NOMBRE_FIRMANTE_2",
    "email_field": "EMAIL_FIRMANTE_2",
    "role_field": "CARGO_FIRMANTE_2",
    "sign_here_anchor": "*FIRMA2*",
    "full_name_anchor": "*NOMBRE2*",
    "date_signed_anchor": "*FECHA_FIRMA2*"
  }
]
```

El solicitante llena `EMAIL_FIRMANTE_1` y `EMAIL_FIRMANTE_2` en el formulario. Al momento de aprobar y enviar a DocuSign, el sistema lee esos valores y construye los firmantes automáticamente.

Para agregar un nuevo tipo de contrato con auto-construcción de firmantes:
1. Agregar `EMAIL_FIRMANTE_N` al `fields.json` del template
2. Definir `signers_definition` con `name_field`, `email_field`, `role_field` apuntando a los campos del formulario
3. Insertar las anclas invisibles en el `template.html`

---

## Gestión de firmantes (CRUD)

Los firmantes se gestionan en `envelope_signers`. Solo se pueden agregar/editar cuando el sobre está en `borrador` o `pendiente_cliente`.

### Agregar firmante

```
POST /api/v1/legal/envelopes/{envelope_id}/signers
```

```json
{
  "name": "Juan Pérez López",
  "email": "juan@empresa.com",
  "signer_type": "internal",
  "role_in_document": "Representante Legal Parte A",
  "routing_order": 1,
  "sign_here_anchor": "*FIRMA1*",
  "full_name_anchor": "*NOMBRE1*",
  "date_signed_anchor": "*FECHA_FIRMA1*"
}
```

| Campo | Descripción |
|---|---|
| `routing_order` | Orden de firma. Mismo número = firman simultáneamente. Mayor = firma después |
| `sign_here_anchor` | Texto invisible en el PDF donde DocuSign coloca la firma |
| `full_name_anchor` | Texto invisible donde DocuSign imprime el nombre |
| `date_signed_anchor` | Texto invisible donde DocuSign imprime la fecha |

Los demás endpoints del CRUD: `GET`, `PATCH`, `DELETE` en la misma ruta base.

### Anclas de firma en los templates

```html
<!-- template.html — texto invisible color blanco sobre fondo blanco -->
<!-- Parte A -->
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE1*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA1*</span>
<!-- Parte B -->
<span style="color:#ffffff;font-size:1px;line-height:0;">*FIRMA2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*NOMBRE2*</span>
<span style="color:#ffffff;font-size:1px;line-height:0;">*FECHA_FIRMA2*</span>
```

DocuSign escanea el PDF y coloca automáticamente los campos de firma donde encuentra estas anclas.

---

## Integración con MinIO

Antes de enviar el sobre a DocuSign, el sistema descarga el PDF del contrato directamente de MinIO usando boto3 (SDK S3 compatible con MinIO), sin pasar por el upload-service.

### Por qué acceso directo a MinIO

El upload-service requiere autenticación JWT para generar URLs de descarga. Desde el backend legal-service, es más eficiente usar la API S3 directa que fluye dentro de la red Docker.

### Cómo funciona

```python
s3 = boto3.client(
    "s3",
    endpoint_url="http://avalanz-minio:9000",
    aws_access_key_id=MINIO_ACCESS_KEY,
    aws_secret_access_key=MINIO_SECRET_KEY,
    config=Config(signature_version="s3v4"),
    region_name="us-east-1",
)
pdf_bytes = s3.get_object(Bucket="dirdoc", Key=object_key)["Body"].read()
```

### Rutas en MinIO

```
dirdoc/{company_slug}/legal/envelopes/{folio}/{uuid}_{folio}_contrato.pdf    ← contrato original
dirdoc/{company_slug}/legal/envelopes/{folio}/firmado/{uuid}_{folio}_firmado.pdf ← PDF firmado
```

El `company_slug` se obtiene del primer segmento del `object_key` del PDF original para garantizar consistencia.

> Para más información sobre MinIO, estructura de buckets y rutas, ver `minio.md`.

---

## Polling y resiliencia

El sistema implementa dos mecanismos complementarios para garantizar que ningún sobre completado quede sin procesar:

### Webhook DocuSign Connect (primario)

- DocuSign hace POST al webhook cuando todos firman
- Procesamiento en segundos
- Requiere que el firewall corporativo permita las IPs de DocuSign (pendiente con IT)

### Polling cron (respaldo)

- Corre cada 5 minutos via cron con `docker exec`
- Consulta el status de todos los sobres `en_firmas` directamente a DocuSign
- Procesa los que estén `completed` automáticamente

```bash
# Ver crontabs activos
crontab -l

# Ejecutar polling manualmente
docker exec avalanz-legal curl -s -X POST \
  "http://localhost:8000/api/v1/legal/envelopes/internal/docusign-poll" | python3 -m json.tool
```

Si el webhook está funcionando y el polling detecta que el sobre ya está `completado` en BD, lo ignora correctamente.

---

## Consumo desde el frontend

```typescript
// legalService.ts

// Aprobar el sobre (cambia status a en_firmas)
export const approveEnvelope = (envelopeId: string) =>
  api.post(`/api/v1/legal/envelopes/${envelopeId}/approve`)

// Enviar a firma — usa el proveedor activo (docusign o email_sim)
export const sendForSigning = (envelopeId: string) =>
  api.post(`/api/v1/legal/envelopes/${envelopeId}/send-for-signing`)

// CRUD de firmantes
export const getSigners    = (id: string) => api.get(`/api/v1/legal/envelopes/${id}/signers`)
export const createSigner  = (id: string, data: SignerPayload) => api.post(`/api/v1/legal/envelopes/${id}/signers`, data)
export const updateSigner  = (id: string, sid: string, data: Partial<SignerPayload>) => api.patch(`/api/v1/legal/envelopes/${id}/signers/${sid}`, data)
export const deleteSigner  = (id: string, sid: string) => api.delete(`/api/v1/legal/envelopes/${id}/signers/${sid}`)

// Proveedor de firma
export const getSigningProvider = () => api.get('/api/v1/legal/envelopes/signing/provider')
export const setSigningProvider = (provider: 'docusign' | 'email_sim') =>
  api.post('/api/v1/legal/envelopes/signing/provider', { provider })
```

En el componente `ContractRequestsTable.tsx`, el botón "Aprobar" encadena ambos pasos automáticamente en `handleApprove`:

```typescript
const handleApprove = async () => {
  setActing(true)
  try {
    await approveEnvelope(envelopeId)   // sobre → en_firmas
    await sendForSigning(envelopeId)    // DocuSign envía correos automáticamente
    onRefresh()
    onClose()
  } catch (e) {
    console.error(e)
  } finally {
    setActing(false)
  }
}
```

---

## Hoja de ruta

| Fase | Tarea | Estado |
|---|---|---|
| ✅ | Cuenta sandbox y credenciales configuradas | Completado |
| ✅ | Autenticación JWT Grant funcionando | Completado |
| ✅ | `create_envelope` — sobre enviado a DocuSign | Completado |
| ✅ | Descarga de PDF desde MinIO con boto3 | Completado |
| ✅ | Firmantes con anclas de posición | Completado |
| ✅ | Auto-construcción de firmantes desde formulario | Completado |
| ✅ | Webhook DocuSign Connect — HTTP 200, procesando eventos | Completado |
| ✅ | Polling cron cada 5 minutos como respaldo | Completado |
| ✅ | Descarga y archivo automático del PDF firmado en MinIO | Completado |
| ✅ | Versionado de documentos — PDF sin firma queda como versión anterior | Completado |
| ✅ | Logs de actividad automáticos (3 eventos DocuSign) | Completado |
| ✅ | Prueba end-to-end completa en sandbox | Completado |
| ⏳ | Apertura de IPs DocuSign en firewall corporativo (ticket IT) | Pendiente |
| ⏳ | Panel de firmantes con status badge en slide-over | Pendiente |
| ⬜ | Go-Live a producción | Futuro |
| ⬜ | Integración NOM-151 con proveedor certificado | Futuro |

---

## Go-Live (paso a producción)

Cuando la integración esté validada en sandbox, el paso a producción requiere:

1. Solicitar el proceso de **Go-Live** desde el portal de DocuSign
2. Promover la Integration Key de sandbox a producción
3. Actualizar las variables de entorno en `.env`:

```env
DOCUSIGN_BASE_URI=https://na2.docusign.net    # servidor asignado por DocuSign
DOCUSIGN_AUTH_SERVER=account.docusign.com      # sin el "-d"
```

4. Regenerar la clave privada RSA para el ambiente productivo y copiarla al servidor
5. Reconfigurar DocuSign Connect apuntando a la URL de producción
6. Activar la integración NOM-151 con el proveedor certificado de Grupo Avalanz

Guía oficial de Go-Live: https://developers.docusign.com/docs/esign-rest-api/go-live