# 05 · Ajustes y seguridad

## Ajustes del módulo

Definidos en `services/ajustes/ajustes_service.py` (lista `AJUSTES`). El motor los lee **en el momento de actuar**, así que un cambio aplica de inmediato sin reiniciar. Cada cambio queda en `ajustes_historial` con quién y cuándo.

| Clave | Grupo | Tipo | Default | Efecto |
|---|---|---|---|---|
| `correos.decision` | Correos | opción | `esperar_afectacion` | Cuándo sale el correo de decisión al solicitante: al confirmar la plataforma, al decidir, o nunca (solo campana) |
| `correos.espera_max_min` | Correos | entero | 10 | Minutos sin confirmación de la plataforma antes de avisar "aprobada, pendiente de aplicar" |
| `correos.recibido` | Correos | sí/no | no | Acuse por correo al solicitante cuando entra el trámite (la campana se manda siempre) |
| `correos.aprobador` | Correos | sí/no | sí | Correo con liga al aprobador en turno |
| `folio.prefijo` | Trámites | texto | `WF` | Primera parte del folio |
| `folio.familia` | Trámites | texto (4) | `AVAL` | Parte de en medio; cada familia lleva su propio consecutivo |
| `tokens.vigencia_dias` | Trámites | entero | 30 | Días que sirve la liga del correo |
| `hoja.estilo` | Apariencia | opción | `flotante` | Estilo de la hoja para todos los flujos que no tengan uno propio |

Para agregar un ajuste: una entrada en `AJUSTES` (la pantalla de Ajustes lo pinta sola, agrupado por `grupo`) y leerlo con `ajustes_service.obtener(db, "clave")`.

## Conexiones

| Campo | Notas |
|---|---|
| `slug` | Identificador de la plataforma (`totvs`); lo usan los conectores y el campo `platform` del sobre |
| `url_base` | Base del REST de la plataforma (`https://avalanz.totvsmx.com:10107/rest`) |
| Autenticación de salida | `ninguna`, `basica` (usuario y contraseña) o `token` (Bearer); el secreto se guarda **cifrado con Fernet** (`FERNET_KEY` del `.env`) y nunca se regresa a la pantalla |
| Token de entrada | `wft_…`, generado por la Intranet, cifrado; es lo que la plataforma manda en `X-WF-Token`. Se puede **regenerar** (el anterior deja de servir de inmediato) |
| Reintentos | Tiempo de espera, máximo de intentos y espaciado en minutos |
| Empresas | Claves `grupo\|empresa` con su nombre (para mostrar y para elegir la empresa de un grupo de aprobación) |

## Usuarios de plataformas

`conexion_usuarios` liga el id del usuario en la plataforma con el usuario de la Intranet:

- Se crea solo cuando llega un sobre con un id nuevo; si trae correo y coincide con un usuario de la Intranet, se liga automáticamente.
- Se puede ligar o cambiar a mano en Ajustes → Usuarios de plataformas.
- Para qué sirve: reconocer al solicitante (campanas, correos, su vista del trámite, omitir su propia etapa) y mandar en el `history` el id de la plataforma de quien aprobó (en compras termina en `C1_NOMAPRO`).
- Un usuario de la Intranet puede tener varias ligas (por ejemplo, su usuario y uno genérico); al aprobar se usa la que tenga su mismo correo.

## Seguridad

| Punto | Cómo |
|---|---|
| Entrada de plataformas | `X-WF-Token` por conexión; contrato estricto (`extra=forbid`); idempotencia por `externalKey` |
| Salida a plataformas | Credenciales de la conexión, cifradas en base |
| Página pública | Token aleatorio de 32 bytes por aprobador y etapa; un solo uso; vence; se invalida al reenviar o reasignar; la decisión registra IP y navegador; `Cache-Control: no-store` y `noindex` |
| Ruta `/aprobar` | Declarada pública en `frontend/proxy.ts`; el resto de la Intranet sigue exigiendo sesión |
| Permisos | Roles del módulo (`administrador`, `disenador`, `auditoria`) y super administrador para Ajustes; el servidor recorta los datos según la vista (aprobador, solicitante, administrador) |
| Archivos | En MinIO con SHA-256; se descargan con ligas firmadas de 15 minutos a través de `/storage/` (la firma se calcula para el host y la ruta que MinIO recibe detrás de Nginx) |
| Trazabilidad | `bitacora` (cada evento con actor, fecha e IP), `correos_enviados`, `transacciones` con cuerpo y respuesta |

## Variables del `.env` (workflows-service)

`DATABASE_URL`, `JWT_SECRET_KEY` y `RABBITMQ_URL` (las mismas del resto de la plataforma), `FERNET_KEY` (propia; si se pierde, hay que recapturar los secretos de las conexiones), `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` (`dirdoc`), `MINIO_SECURE`, `MINIO_PUBLIC_URL` (`https://intranet.avalanz.com/storage`), `FRONTEND_URL`, `EMAIL_SERVICE_URL`, `NOTIFY_SERVICE_URL`, `ADMIN_SERVICE_URL`, `OUTBOX_SWEEP_SECONDS` (60). El `.env` se copia dentro de la imagen: tras cambiarlo hay que reconstruir.
