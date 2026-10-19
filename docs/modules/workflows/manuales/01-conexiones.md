# Manual · Conexiones

Una **conexión** es la tarjeta que le dice a Workflows cómo hablar con una plataforma (hoy, TOTVS Protheus): a qué dirección mandar los resultados, con qué credenciales, y qué token debe presentar la plataforma cuando manda un documento. Hay una por plataforma y por ambiente (por ejemplo, *TOTVS Protheus 25 – Desarrollo* y *TOTVS Protheus 25 – Producción*).

**Quién**: super administrador de la Intranet. **Dónde**: Workflows → Ajustes → pestaña **Conexiones**.

## Dar de alta una conexión

1. Clic en **Nueva conexión**.
2. Llena los datos:

| Campo | Qué poner | Ejemplo |
|---|---|---|
| Título | Nombre para reconocerla | `TOTVS Protheus 25 - Desarrollo` |
| Slug | Identificador corto de la plataforma; **para TOTVS siempre `totvs`** | `totvs` |
| URL base | Dirección del servicio REST de la plataforma, sin barra final | `https://avalanz.totvsmx.com:10107/rest` |
| Autenticación hacia la plataforma | *Ninguna*, *Usuario y contraseña* o *Token*. Para Protheus: **Usuario y contraseña** de un usuario con acceso al REST | Usuario de integración |
| Tiempo de espera, intentos y espaciado | Deja los valores por defecto (20 s · 5 intentos · 1, 5, 15, 60, 240 min) | — |

3. **Guardar**. La tarjeta aparece con su **token de entrada** (`wft_…`).
4. Clic en **Probar conexión**. Respuestas buenas: `HTTP 200`, `401` o `404` (quiere decir que llegó al servidor). "Sin respuesta" o "No se pudo conectar" quiere decir que la red no deja pasar: hay que abrir el puerto en el firewall.

Recomendación: usa un **usuario de integración** de Protheus, no el tuyo ni `admin`. Si cambias tu contraseña o se da de baja tu usuario, la integración no se cae.

## Empresas de la plataforma

En la parte de abajo de la tarjeta, agrega cada empresa con su **clave** `grupo|empresa` tal como la manda Protheus (por ejemplo `02|01`) y su **nombre**. Sirven para elegir la empresa al crear grupos de aprobación y para mostrar el nombre en pantalla. Puedes desactivar una empresa con su interruptor.

## Token de entrada

Es la "contraseña" que Protheus presenta al mandar un documento. Se copia con el botón de copiar (el ojo lo muestra) y se pone en el parámetro `MV_XWFTOKEN` de Protheus.

- **Regenerar** crea uno nuevo y el anterior deja de servir **de inmediato**: hay que actualizar `MV_XWFTOKEN` en Protheus en ese momento.
- La contraseña y el token se guardan cifrados; la pantalla nunca muestra la contraseña.

## Editar, desactivar y eliminar

- **Editar** cambia URL, autenticación o reintentos (para cambiar la contraseña, escribe la nueva; si dejas el campo vacío, se conserva la actual).
- El interruptor **Activa** detiene la conexión: los envíos de la plataforma se rechazan y los resultados no salen (quedan en la cola).
- **Eliminar** solo si no tiene flujos.

## Del lado de Protheus

En el Configurador de Protheus (parámetros, sucursal en blanco):

| Parámetro | Valor |
|---|---|
| `MV_XWFURL` | `https://intranet.avalanz.com/api/v1/workflows` |
| `MV_XWFTOKEN` | El token de entrada de esta tarjeta |

Prueba desde Protheus con la opción **WF Ping Intranet** (función `WFPING`): debe decir "OK: la Intranet responde y el token es válido".
