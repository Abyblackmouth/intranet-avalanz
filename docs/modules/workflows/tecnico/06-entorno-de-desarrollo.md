# 06 · Entorno de desarrollo

## Dónde vive cada cosa

| Pieza | Desarrollo |
|---|---|
| Intranet | Servidor `int-avz` (`10.12.0.51`), repo en `~/intranet-avalanz`, rama `feature/workflows-service` |
| Contenedores | `avalanz-workflows`, `avalanz-postgres`, `avalanz-rabbitmq`, `avalanz-minio` (compose en `infrastructure/docker/`) |
| Frontend | PM2 `intranet-frontend`; se compila con `bash frontend/deploy-frontend.sh` |
| Protheus | Ambiente `DESARROLLO` en TOTVS Cloud; SmartClient web `https://avalanz.totvsmx.com:10105/webapp/`; REST `https://avalanz.totvsmx.com:10107/rest/` |
| Fuentes Protheus | VS Code + extensión TOTVS, carpetas `AVALANZ\INTRANET\…` |

Forma de trabajo: el trabajo diario se hace en el servidor; la laptop se sincroniza al cerrar una rama e integrarla a `develop`. Diagnóstico de solo lectura antes de cambiar; código y commits en inglés, comentarios y documentación en español.

## Despliegue de cambios

Cada paso del módulo se entregó como un `.tar.gz` y un script `pasoNN_*.sh` que:

1. Verifica que se corre en `int-avz`, en la rama correcta y con el árbol limpio.
2. Extrae los archivos y comprueba que sean los nuevos.
3. Construye la imagen y hace una **prueba de humo** (`from app.main import app`) antes de tocar el contenedor en línea; si falla, regresa todo.
4. Recrea el contenedor y verifica que quede `running` sin reinicios.
5. Si hay migración: `alembic revision --autogenerate` y `alembic upgrade head` dentro del contenedor, y copia la migración al repo.
6. Si hay frontend: compila hasta 3 veces (la descarga de Google Fonts falla a veces).
7. Hace commit y push.

Los scripts no usan `exit` (en una terminal interactiva cerraría la sesión SSH).

Para cambios chicos se usaron parches en línea con Python que buscan un ancla exacta y fallan si no la encuentran.

## Migraciones

```bash
docker exec avalanz-workflows bash -c "cd /app && alembic revision --autogenerate -m 'mensaje'"
docker exec avalanz-workflows bash -c "cd /app && alembic upgrade head"
docker cp avalanz-workflows:/app/migrations/versions/. backend/modules/workflows-service/migrations/versions/
```

## Pruebas

**Conectividad Protheus → Intranet**: `U_WFPING` desde el SmartClient (como opción de menú temporal en SIGACOM, tipo "Función del usuario", programa `WFPING` sin `U_`). Debe decir "OK: la Intranet responde y el token es válido".

**Conectividad Intranet → Protheus**: Ajustes → Conexiones → *Probar conexión*.

**Sobre de prueba sin Protheus** (`~/prueba_envio.sh` en el servidor): simula a Protheus mandando una solicitud de compra; el solicitante sale de `~/.wf_prueba` (`REQUESTER_ID=000099` para que no seas tú y no se omita tu etapa):

```bash
WF_TOKEN="<token de entrada>" bash ~/prueba_envio.sh 45000
```

No aprobar esos trámites: el documento no existe en Protheus y el resultado quedará abandonado.

**Simulador**: Flujos → Simular, con empresa, solicitante y `cardData` de prueba.

**Consultas útiles**

```bash
# Últimos trámites
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_workflows -At -c "select folio, process_id, status, afectacion from instancias order by created_at desc limit 5;"
# Transacciones de un trámite
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_workflows -At -c "select t.direccion, t.estado, t.intento, t.respuesta_status, left(coalesce(t.error,t.respuesta_body),200) from transacciones t join instancias i on i.id=t.instancia_id where i.folio='WF-AVAL-000009' order by t.created_at;"
# Correos de un trámite
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_workflows -At -c "select c.plantilla, c.destinatario_email, c.resultado from correos_enviados c join instancias i on i.id=c.instancia_id where i.folio='WF-AVAL-000009';"
# Errores del servicio
docker logs avalanz-workflows --since 15m 2>&1 | grep -v metrics | grep -i -A20 "error\|traceback"
```

## Solución de problemas

| Síntoma | Causa | Qué hacer |
|---|---|---|
| Protheus sigue mandando a Fluig | `MV_XWFON` en `N`, o `GetMV` sin `AllTrim` (los parámetros vienen con espacios) | Revisar el parámetro y que el interruptor use `AllTrim` |
| "El cuerpo no es JSON válido" | Acentos en Windows-1252 | El sobre debe ir con `EncodeUTF8` (ya en `WFINTRA`) |
| "processId … desconocido" | El flujo no está dado de alta o el processId no coincide | Crear el flujo en la Intranet con el mismo processId |
| Mensajes de Protheus con `Ã³` | Fuente guardado en UTF-8 | Guardar en Windows-1252 y recompilar |
| No viajan documentos | Llave de `AC9_CODENT` distinta a la esperada | `U_WFFILES` busca con y sin sucursal; ver las líneas `WFFILES -` del console.log |
| Resultado `abandonado` con 404 HTML | El WSRESTFUL no está publicado | Compilar y **reiniciar el servicio REST**; verificar en `/rest/` |
| Resultado `abandonado` "no encontrado" | El documento no existe en esa empresa/filial | Revisar `companyGroup`/`tenantId` y la llave |
| Etapas "omitidas" sin querer | El solicitante está ligado al mismo usuario que aprueba | Capturar con otro usuario o quitar la liga en Usuarios de plataformas |
| Error 500 al aprobar | Ver el traceback en `docker logs` | — |
| Descarga con `SignatureDoesNotMatch` | Liga firmada para otro host o ruta | La firma debe hacerse para `https://intranet.avalanz.com/{bucket}/{key}` e insertar `/storage` después (ya corregido en `archivos.url_firmada`) |
| La liga pide iniciar sesión | `/aprobar` fuera de las rutas públicas | Revisar `publicRoutes` en `frontend/proxy.ts` |
| Build del frontend falla con `next/font/google` | Descarga intermitente de Google Fonts | Reintentar (el script lo hace 3 veces); pendiente servir las fuentes localmente |
| Error `-107` / `10048` en el console.log de Protheus | Del Application Monitor y de un segundo intento de abrir el puerto REST | Ruido; no afecta a Workflows |

## Pendientes técnicos

- Servir las fuentes del frontend localmente (`next/font/local`).
- Revisar `client_max_body_size` de Nginx para `/api/v1/workflows` antes de expedientes grandes.
- Folio por familia de empresa (ligando las empresas de la conexión con las de la Intranet).
- v2 de Alta de cliente: reenvío tras rechazo comparando huellas de documentos.
- Integrar la rama a `develop` y sincronizar la laptop.
