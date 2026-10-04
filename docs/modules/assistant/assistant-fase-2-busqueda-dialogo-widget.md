# Asistente Avalanz — Fase 2: Búsqueda, diálogo y widget

Ubicación sugerida: `docs/modules/assistant/assistant-fase-2-busqueda-dialogo-widget.md`
Ramas: `feature/assistant-service` (búsqueda, widget, diálogo, contraste) y `feature/assistant-tickets` (ticket desde el chat, origen, visor de fuentes)
Fecha: 3 de octubre de 2026
Estado: **completada y en productivo**, en piloto (el asistente solo está activo en `it-service-desk` para `abraham_covarrubias@avalanz.com`)

---

## 1. Qué cubre la Fase 2

La Fase 1 dejó el conocimiento indexado. La Fase 2 lo pone en manos del usuario:

| Pieza | Qué hace | Dónde vive |
|---|---|---|
| Búsqueda híbrida | BM25 + e5-small fusionados con RRF, con el habla compensada y una señal de confianza | `assistant-service` |
| API del asistente | Disponibilidad por módulo, búsqueda y enlaces firmados a las fuentes | `assistant-service` |
| Capa de diálogo | Plática, tolerancia a errores de dedo, flujo del ticket y enrutamiento al RAG | `dialog-service` (nuevo) |
| Widget | Esfera flotante, chat con contexto persistente y tarjetas por documento | Frontend |
| Ticket desde el chat | Ticket conversacional con contexto, sugerencias, capturas y asignación en vivo | `dialog-service` + IT Service Desk + frontend |
| Origen del ticket | Marca `manual` o `asistente` en cada ticket, solo para métricas | IT Service Desk |
| Visor de fuentes | Manual en la página citada, video en el minuto citado, descarga de Word y PowerPoint | `assistant-service` + Nginx + frontend |
| Capa de contraste | Bordes y textos secundarios más legibles en pantallas brillantes, en toda la intranet | Frontend |

**Principio que se mantuvo:** todo es 100% on-premise. Ningún mensaje, documento ni ticket sale del servidor.

---

## 2. Arquitectura

```
                           Navegador (widget del asistente)
                                        |
                                avalanz-nginx (443)
          +-----------------------------+------------------------------+
          |                             |                              |
  /api/v1/dialog                 /api/v1/assistant              /internal-fuentes/
  (20 MB, dinámico)              (dinámico)                     (internal; solo por
          |                             |                        X-Accel-Redirect)
          v                             v                              |
  avalanz-dialog  --- token --->  avalanz-assistant  -- autoriza --->  +
  (256 MB)         del usuario    (RAG, 1.5 GB)                        |
     |   |                              |                     /srv/fuentes (ro, ACL)
     |   |                     avalanz-postgres-vector
     |   +--- token + X-Ticket-Origin ---> IT Service Desk (red interna)
     |                                        |   RabbitMQ -> motor de asignación
     |                                        v
     |                                 websocket-service --- evento ---> widget
     +--- intents.yaml / ticket_types.yaml (datos, no código)
```

| Servicio | Responsabilidad | No sabe de |
|---|---|---|
| `dialog-service` | Decidir qué hacer con cada mensaje: platicar, conducir el ticket o consultar el conocimiento | Embeddings, documentos |
| `assistant-service` | Recuperar conocimiento y autorizar el acceso a las fuentes | La conversación |
| IT Service Desk | Crear, asignar y notificar tickets | Que el ticket vino del chat (salvo el campo `origin`) |
| Nginx | Entregar archivos grandes con rangos | Quién tiene permiso (lo decide el asistente) |

---

## 3. Búsqueda híbrida

### Cómo funciona

1. La pregunta se vectoriza con e5-small (`query: ` como prefijo) y se busca en pgvector.
2. En paralelo, BM25 busca por palabras sobre los mismos fragmentos.
3. Cada recuperador aporta sus **20 primeros** candidatos (`depth=20`).
4. Se fusionan con **RRF** (κ = 60): cada fragmento suma `1 / (60 + posición)` por cada lista donde aparece.
5. La contribución de los fragmentos de **habla** (transcripciones) se multiplica por **0.5**.
6. Se devuelven los **5** de mayor puntuación.

### Confianza: acuerdo entre recuperadores

La confianza es el número de fragmentos que **comparten** los 5 primeros de BM25 y los 5 primeros de e5-small:

| Coincidencias | Confianza | Qué hace el widget |
|---|---|---|
| 0 | **baja** | *"No encontré una respuesta clara. Esto es lo más cercano:"* y el botón de ticket destacado |
| 1 | **media** | *"Encontré esto. Revisa si responde tu duda:"* y el enlace de ticket discreto |
| 2 o más | **alta** | *"Esto es lo que encontré:"* |

### Resultados con el banco (20 preguntas con respuesta)

| Recuperador | Recall@1 | Recall@5 | MRR | ms/pregunta |
|---|---|---|---|---|
| BM25 | 0.45 | 0.80 | 0.610 | 2 |
| e5-small ONNX fp32 | 0.40 | 0.90 | 0.593 | 53 |
| Híbrido RRF | — | 0.85 | 0.696 | 69 |
| **Híbrido, habla ×0.5 (producción)** | **0.70** | **0.95** | **0.800** | **66** |

- La confianza separa las preguntas sin respuesta con **AUC 0.91**. Con el corte en 0 coincidencias detecta 4 de 5 preguntas sin respuesta, con 2 falsas alarmas entre 20.
- **Detectar no es ordenar.** En confianza alta, el primer resultado fue el correcto en solo **7 de 12** preguntas (en media, 5 de 6), pero estuvo entre los 5 primeros en 11 de 12. Por eso el widget **nunca presenta un solo fragmento como "la respuesta"**: agrupa por documento y deja las otras secciones como atajos.
- **Costo de la fusión:** P01 (*"activo fijjo"*), que e5-small resolvía en primer lugar, sale de los 10 primeros al fusionarse con BM25.
- **Provisional:** el 0.5 del habla y los cortes de confianza se eligieron con las mismas 25 preguntas. Se validan con el conjunto v2.

En producción: latencias de **20 a 90 ms** y **899 MiB** de RAM con el modelo cargado (límite: 1.5 GiB).

---

## 4. API del asistente (`assistant-service`)

Todas las rutas, salvo la entrega de archivos, requieren el JWT de la plataforma.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/v1/assistant/availability?module=...` | `{"available": true/false}`. El widget solo aparece si es `true` |
| POST | `/api/v1/assistant/search` | `{question, module}` → `confidence`, `overlap` y 5 `results` |
| POST | `/api/v1/assistant/documents/link` | `{document, module}` → enlace firmado de 15 minutos |
| GET | `/api/v1/assistant/documents/file/{firma}` | Revisa la firma y Nginx entrega el archivo |

### Regla de acceso (`_check_access`)

El usuario debe tener el módulo en su token (o ser super admin) **y** el asistente debe estar activo para él en ese módulo (tabla `assistant_modules`). Si no, `403`. La misma regla aplica a la búsqueda y a los enlaces de documentos.

Ver la configuración de activación:

**Servidor**

```bash
docker exec -i avalanz-postgres-vector sh -c 'psql -U "$POSTGRES_USER" -d avalanz_assistant' << 'SQL'
\d assistant_modules
SELECT * FROM assistant_modules;
SQL
```

### Campos de cada resultado

| Campo | Ejemplo |
|---|---|
| `title` | `Manual autocapacitacion activo fijo v2` |
| `document` | `it-service-desk/activo-fijo/manual-autocapacitacion-activo-fijo-v2.pdf` (ruta relativa) |
| `kind` | `text`, `table` o `speech` |
| `location`, `page`, `slide`, `start_seconds` | `página 14`, `14`, `null`, `null` |
| `context` | `tema > documento > secciones` |
| `text`, `score` | Texto del fragmento y puntuación fusionada |

### Bitácora (`query_log`)

Registra las búsquedas que llegan al RAG. La plática **no** llega al RAG, así que no queda en la bitácora: se cuenta en Prometheus (sección 6.6).

---

## 5. Widget (frontend)

### Archivos

| Archivo | Contenido |
|---|---|
| `components/assistant/AssistantWidget.tsx` | Esfera, panel, mensajes, tarjetas por documento, visor de fuentes, envío al diálogo |
| `components/assistant/TicketFlow.tsx` | Pasos del ticket, contexto de la conversación, severidades, capturas, línea de asignación |
| `components/assistant/FluidOrb.tsx` + `.module.css` | La esfera fluida (CSS propio, sin WebGL) |
| `components/assistant/session.ts` | Nombre del saludo y marca de sesión, leídos del JWT |
| `store/assistantStore.ts` | Conversación persistida y borrador del ticket (en memoria) |
| `services/assistantService.ts` | Llamadas al asistente y al diálogo |
| `app/(private)/layout.tsx` | Monta `<AssistantWidget />` |

Librería de animación: **Motion** (`motion@12`, licencia MIT, sin obligación de créditos).

### Comportamiento

| Tema | Comportamiento |
|---|---|
| **Dónde aparece** | Solo en `/app/{módulo}` cuando `availability` responde `true`. En administración no aparece |
| **Esfera** | Abajo a la derecha (34 px del borde), 44 px; crece a ~52 px y se eleva al pasar el mouse; parpadea cada 15 s con el panel cerrado; sin movimiento si el sistema pide reducirlo |
| **Panel** | 380 × 560 px, se abre desde la esfera; pantalla completa en celular. `Esc` lo cierra |
| **Saludo** | Una vez por inicio de sesión: *"Hola Abraham, ¿en qué te puedo ayudar?"*. El nombre sale del correo (`abraham_covarrubias` → Abraham) |
| **Contexto** | Se conserva al cerrar, abrir y recargar (`localStorage`, clave `assistant-chat`, hasta 50 mensajes). Se borra con **reiniciar chat**, un **nuevo inicio de sesión** o **cerrar sesión** |
| **Indicador** | Tres puntos que crecen y se encogen en secuencia |
| **Resultados** | Una tarjeta **por documento** (hasta 3), sin repetidos. La sección más relevante abierta; las demás como etiquetas que cambian la tarjeta |
| **Abrir la fuente** | **Abrir en el manual** (PDF), **Ver en el video** (sesión grabada) o **Descargar** (Word y PowerPoint) |
| **Privacidad** | En los extractos de transcripciones, los nombres de quienes hablan se muestran como viñetas |

La mesa de soporte tiene `pr-20` en el pie de la tabla para que la esfera no tape la paginación. Si otra pantalla tiene botones en su esquina inferior derecha, necesita el mismo espacio.

### Visor de fuentes

| Fuente | Qué pasa |
|---|---|
| PDF | Ventana grande sobre la intranet, en la página citada (`#page=N`); enlace para abrir en pestaña nueva |
| Sesión grabada | El video, empezando en el minuto citado |
| Word y PowerPoint | Descarga con su nombre |
| Transcripción | **Nunca** se entrega |

Se cierra con la ✕, `Esc` o un clic fuera. El enlace firmado dura 15 minutos: si un video queda en pausa más tiempo, hay que cerrar y volver a abrir el visor.

---

## 6. Capa de diálogo (`dialog-service`)

### Por qué existe y por qué está aislada

La búsqueda trataba todo como pregunta: *"gracias"* devolvía fragmentos sin relación, y *"no le entiendo al manual"* devolvía ruido de otros módulos. Eso es **manejo de la conversación**, no recuperación. Vive aparte del RAG por:

1. **Responsabilidad única:** el RAG solo recupera conocimiento.
2. **Recursos independientes:** el diálogo usa ~47 MiB; un futuro modelo de conversación tendría su propio límite.
3. **Reemplazable:** el detector de intenciones es un puerto (`IntentDetector`). Hoy son reglas en YAML; mañana puede ser un clasificador (por ejemplo, entrenado con MASSIVE) sin tocar el resto.
4. **Defensa en profundidad:** reenvía el token del usuario; el RAG y el IT Service Desk vuelven a validar todo.

### Datos del servicio

| Dato | Valor |
|---|---|
| Ubicación | `backend/dialog-service/` |
| Contenedor | `avalanz-dialog`, `mem_limit: 256m` |
| Ruta en Nginx | `/api/v1/dialog` (resolución dinámica, `client_max_body_size 20m`) |
| Base de datos | Ninguna |
| Prometheus | Job `dialog-service` |

### Variables de entorno (`.env`, fuera de la imagen)

| Variable | Obligatoria | Descripción |
|---|---|---|
| `JWT_SECRET_KEY` | Sí | La misma clave que el auth-service |
| `JWT_ALGORITHM` | No (`HS256`) | |
| `ASSISTANT_URL` | No (`http://avalanz-assistant:8000`) | RAG por la red interna |
| `ASSISTANT_TIMEOUT_SECONDS` | No (`30`) | |
| `INTENTS_PATH` | No (`data/intents.yaml`) | |
| `SERVICE_DESK_URL` | Sí | IT Service Desk por la red interna |
| `SERVICE_DESK_CATALOG_BASE` | Sí | Base de los catálogos (`/api/v1/it-service-desk/actualizaciones`) |
| `TICKET_TYPES_PATH` | No (`data/ticket_types.yaml`) | |

### Estructura

```
backend/dialog-service/
├── data/
│   ├── intents.yaml          Intenciones de plática y de ticket (DATOS)
│   └── ticket_types.yaml     Palabras de funcional/técnico y sistema por tema (DATOS)
├── app/
│   ├── domain/               IntentMatch, puertos IntentDetector y KnowledgeClient, errores
│   ├── application/          HandleMessage: plática o conocimiento
│   ├── adapters/
│   │   ├── rule_intents.py         Reglas + tolerancia a errores de dedo
│   │   ├── ticket_classifier.py    Sugerencia de tipo y sistema
│   │   ├── assistant_client.py     RAG con el token del usuario
│   │   └── service_desk_client.py  Catálogos y alta de incidentes
│   └── api/                  /message, /ticket/*, salud
└── tests/                    70 pruebas
```

### Rutas

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/v1/dialog/message` | `{message, module}` → plática (`type: conversacion`, `reply`, `show_ticket`, `action`) o búsqueda (`type: busqueda` + los campos de la búsqueda) |
| GET | `/api/v1/dialog/ticket/catalogs` | Sistemas activos con sus módulos, y severidades |
| POST | `/api/v1/dialog/ticket/suggest` | `{text, topics}` → `reported_type`, `keywords`, `system` |
| POST | `/api/v1/dialog/ticket` | Alta multipart: `title`, `description`, `system_id`, `module_id`, `reported_type`, `severity_reported_id`, `files` (hasta 3 imágenes de 5 MB) |
| GET | `/health`, `/health/ready` | `ready` revisa intenciones cargadas y que el RAG responda |

### Cómo decide

1. Normaliza el texto: sin acentos, sin signos, minúsculas, un solo espacio.
2. Si tiene más de **8 palabras** → es pregunta.
3. Busca una **regla exacta** que abarque el mensaje **completo**, en el orden del YAML.
4. Si no hay regla y el mensaje tiene hasta **4 palabras**, lo compara con las frases de ejemplo (`difflib`); con parecido **≥ 0.85** toma esa intención (*"que reres"* → *"que eres"*, 0.94).
5. Si nada coincide → se busca en el RAG. Un mensaje que **mezcla** plática y pregunta (*"hola, ¿dónde veo los saldos?"*) se busca.

**Por qué reglas y no embeddings:** las similitudes de e5-small caen en una banda estrecha (0.84–0.91); un umbral sería frágil.

### Intenciones actuales

| Intención | Ejemplos | Efecto |
|---|---|---|
| `crear_ticket` | quiero levantar un ticket, ¿cómo levanto un reporte?, reportar un problema | Abre el flujo del ticket (`action: open_ticket_flow`) |
| `saludo` | hola, buenos días, qué tal | Respuesta |
| `despedida` | adiós, eso es todo | Respuesta |
| `agradecimiento` | gracias, ok gracias, gracias por tu ayuda | Respuesta |
| `capacidades` | ¿qué puedes hacer?, ¿quién eres?, ayuda | Se presenta con un ejemplo |
| `no_sirvio` | no me sirvió, no le entiendo al manual, no me queda claro | Ofrece el ticket (`show_ticket: true`) |
| `confirmacion` | ok, perfecto, sí | Respuesta; **si el asistente acaba de ofrecer el ticket, lo arranca** |

### Editar las intenciones (sin tocar código)

Formato de `data/intents.yaml`:

```yaml
max_words: 8
fuzzy_max_words: 4
fuzzy_threshold: 0.85
tail: '(?: (?:asistente|amigo|...))*'   # colas que no cambian la intención

intents:
  agradecimiento:              # el orden importa: gana la primera que coincide
    patterns:                  # regex sobre texto normalizado; deben abarcar TODO el mensaje
      - '(muchas |mil )?gracias'
    examples:                  # para la tolerancia a errores de dedo
      - 'gracias'
    replies:                   # se elige una al azar
      - '¡Con gusto! Si tienes otra duda, aquí estoy.'
  no_sirvio:
    show_ticket: true          # ofrece el ticket
    ...
  crear_ticket:
    action: open_ticket_flow   # le pide al widget abrir el flujo
    ...
```

**Procedimiento:**

1. Editar `backend/dialog-service/data/intents.yaml` en el servidor.
2. Agregar el caso a `tests/test_dialog.py` o `tests/test_tickets.py` (que la frase nueva se reconozca **y** que una pregunta parecida no se confunda).
3. Correr las pruebas, reconstruir y recrear:

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz && {
  S=backend/dialog-service
  docker run --rm -v "$PWD/$S":/app:ro -w /app -e PYTHONPATH=/app -e PYTHONDONTWRITEBYTECODE=1 python:3.11-slim \
    sh -c "pip install -q --root-user-action=ignore pytest==8.2.2 pyyaml==6.0.1 && python -m pytest -q -p no:cacheprovider tests | tail -1"
  cd infrastructure/docker
  docker compose build -q dialog-service && \
  docker compose run --rm --no-deps --entrypoint python dialog-service -c "from app.main import app; print('ARRANCA BIEN')" | grep -q "ARRANCA BIEN" && \
  docker compose up -d --no-deps --force-recreate dialog-service && echo "TEST: despliegue=OK"
}
```

Un error en el YAML impide que el servicio arranque: la prueba `ARRANCA BIEN` lo detecta antes de tocar el contenedor en línea.

### Métricas

| Métrica | Etiquetas |
|---|---|
| `dialog_messages_total` | `type` (`conversacion`/`busqueda`), `intent` |
| `dialog_tickets_total` | `reported_type` (`funcional`/`tecnico`) |

---

## 7. Ticket desde el chat

### Flujo

| Paso | Pregunta | Respuesta del usuario |
|---|---|---|
| Inicio | — | Botón **Levantar un ticket**, *"sí"* tras la oferta, o *"quiero levantar un ticket"* |
| Describir | *"Cuéntame brevemente qué está pasando."* | Solo si no hay contexto previo |
| Tipo | *"¿Qué tipo de problema es?"* | **Duda de uso o proceso** (funcional) / **Falla o error del sistema** (técnico); la sugerida marcada |
| Sistema | *"¿En qué sistema?"* | Botones (buscador si hay más de 8); el sugerido primero |
| Módulo | *"¿Qué módulo?"* | Botones + *"No sé"*; se omite si el sistema no tiene módulos |
| Severidad | *"¿Qué tan grave es? Elige la severidad:"* | Etiquetas de color: **S1 Crítica** (rojo), **S2 Alta** (naranja), **S3 Media** (ámbar), **S4 Baja** (verde) |
| Capturas | *"¿Quieres agregar capturas de pantalla?..."* | `Ctrl + V`, arrastrar o elegir archivo; hasta 3 imágenes de 5 MB |
| Resumen | *"Revisa el ticket antes de enviarlo:"* | Título y descripción editables; **Enviar ticket** / **Cancelar** |
| Envío | Tres puntos con *"Generando ticket..."* | — |
| Resultado | *"Listo, se generó el ticket INC-…. Revisa tu correo: te llegó la confirmación."* | Línea viva: *"Buscando a quién asignarlo..."* → ✓ *"Asignado a Nombre Apellido"*; si en 20 s no llega (backlog), desaparece |

Escribir **"cancelar"** en cualquier paso cancela el ticket. El borrador vive en memoria: sobrevive a cerrar y abrir el panel, pero no a recargar la página.

### Contexto de la conversación

- Ventana: hasta **8 mensajes** hacia atrás, sin pasar de un ticket anterior.
- Cuentan las preguntas con búsqueda o con oferta de ticket; **no** la plática (*"hola"*, *"sí"*).
- **Título:** la primera pregunta del tema. **Descripción:**

```
Lo que pregunté al asistente:
- no se como dar de baja un activo
- no le entiendo al manual

Documentos que me mostró:
- Manual autocapacitacion activo fijo v2 (8.1 Baja de un activo · página 14)

Levantado desde el Asistente Avalanz.
```

- Las búsquedas de confianza **baja** no aportan documentos ni temas (suelen ser ruido).

### Sugerencias (`data/ticket_types.yaml`)

| Sugerencia | Cómo |
|---|---|
| Tipo | Palabras clave: `error`, `no carga`, `lento`, `acceso`... → técnico; `como`, `donde`, `proceso`, `reporte`... → funcional |
| Sistema | Por el **tema** de los documentos mostrados (`systems_by_topic`): `activo-fijo`, `financiero`, `nomina`, `proyectos`, `ventas-facturacion` → **TOTVS**; `crm-odoo-dyce` → **CRM Odoo DYCE**. O si la pregunta menciona el sistema |
| Módulo | Si su nombre coincide con el tema (`activo-fijo` → *Activo Fijo*) |

**Al agregar un tema nuevo a la carpeta de fuentes, agregarlo también a `systems_by_topic`** con el nombre exacto del sistema en el catálogo del IT Service Desk.

### Creación y asignación

- El `dialog-service` crea el incidente **con el token del usuario**: queda a su nombre y aplica sus permisos. La empresa sale del token.
- El motor asigna en segundo plano (RabbitMQ). Al asignar, `_broadcast_ticket_update` emite `it_service_desk.ticket_updated` con `assigned_to_name`.
- **Cambio en el IT Service Desk:** el **solicitante** se agregó a los destinatarios de los eventos de sus tickets. Efecto adicional: su tabla de la mesa de soporte también se actualiza en vivo.
- Si la asignación llega antes que la respuesta del alta, el widget la recuerda y la muestra igual.

### Origen del ticket (métricas)

| Pieza | Detalle |
|---|---|
| Columna | `incidents.origin`, `String(20)`, `'manual'` por defecto |
| Migración | `40fa18bd0ed6` (sobre `b7a1c3e9d2f4`), escrita a mano |
| Quién marca `asistente` | Solo el `dialog-service`, con `X-Ticket-Origin: asistente` por la red interna |
| Protección | Nginx borra `X-Ticket-Origin` en las rutas del IT Service Desk (`proxy_set_header X-Ticket-Origin "";`) |
| Visible en pantalla | **No** |

**Servidor**

```bash
docker exec -i avalanz-postgres sh -c 'psql -U "$POSTGRES_USER" -d avalanz_it_service_desk -tA' << 'SQL'
SELECT origin || ' = ' || count(*) FROM incidents GROUP BY origin;
SQL
```

Primer ticket del sistema: **INC-CORP-000001**, creado desde el chat, asignado por el motor y notificado en vivo (prueba; cerrarlo).

---

## 8. Visor de fuentes: enlaces firmados y Nginx

### Cómo funciona

1. El widget pide `POST /documents/link` con la sesión normal. Se aplica `_check_access`.
2. La ruta se valida: empieza con el módulo, sin `..`, dentro de la carpeta de fuentes y existe.
3. Se decide qué entregar: PDF → ver; `X.transcripcion.docx` → `X.mp4` (o `.webm`, `.m4v`); `.docx`, `.pptx`, `.xlsx` → descargar.
4. Se firma un enlace de **15 minutos** con una clave **derivada** de la JWT (`sha256(JWT_SECRET_KEY + ":assistant-document-links")`): nunca sirve como token de sesión.
5. `GET /documents/file/{firma}` revisa la firma, **rechaza transcripciones** y responde `X-Accel-Redirect: /internal-fuentes/...`.
6. Nginx entrega el archivo con **rangos** (el video se pide por pedazos para saltar al minuto).

### Cambios en Nginx y en el servidor

| Cambio | Detalle |
|---|---|
| Ruta interna | `location /internal-fuentes/ { internal; alias /srv/fuentes/; }` junto al bloque del asistente |
| Volumen | `/srv/avalanz/asistente/fuentes:/srv/fuentes:ro` en el servicio `nginx` del docker-compose |
| Permisos | Paquete `acl` instalado; `setfacl -R -m u:101:rX` y la ACL por defecto (`-d`) para archivos nuevos. Solo el usuario de Nginx (uid 101) gana lectura |
| `X-Frame-Options` | `SAMEORIGIN`: el PDF se puede mostrar dentro del visor |

Pruebas: PDF **200**; video **206** con 1,024 bytes; Word **200** como descarga; `..` **404**; firma inventada **403**; `/internal-fuentes/...` pedido directo **404**.

**Si se agregan archivos nuevos y el visor da 403:** revisar que la ACL se haya heredado.

**Servidor**

```bash
getfacl -p /srv/avalanz/asistente/fuentes/it-service-desk/<tema>/<archivo> | grep "user:101"
# Si no aparece, reaplicar:
setfacl -R -m u:101:rX /srv/avalanz/asistente/fuentes && setfacl -R -d -m u:101:rX /srv/avalanz/asistente/fuentes
```

---

## 9. Capa de contraste

`frontend/app/contraste.css`, importada en `globals.css` justo después de Tailwind. Solo cambia **bordes y textos**, nunca los fondos (`bg-slate-*`), que usan los mismos tonos.

| Clase | Usos | Antes | Ahora | Contraste contra blanco |
|---|---|---|---|---|
| `border-slate-100` | 87 | `#f1f5f9` | `#e2e8f0` | 1.10 → 1.23 |
| `border-slate-200` | 262 | `#e2e8f0` | `#cbd5e1` | 1.23 → 1.48 |
| `border-slate-300` | 269 | `#cbd5e1` | `#b8c4d4` | 1.48 → 1.77 |
| `text-slate-300` | 36 | `#cbd5e1` | `#94a3b8` | 1.48 → 2.56 |
| `text-slate-400` (y placeholders) | 488 | `#94a3b8` | `#7b8aa1` | 2.56 → 3.50 |

Las reglas van en `@layer utilities`, así las variantes (`hover:border-[#1a4fa0]`) siguen ganando. **Revertir:** quitar la línea `@import "./contraste.css";`. **Subir al estándar WCAG completo (4.5:1):** cambiar `#7b8aa1` por `#66758b` (se pierde algo de jerarquía entre `slate-400` y `slate-500`).

---

## 10. Operación

### Estado de los servicios del asistente

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && {
  for c in avalanz-assistant avalanz-dialog avalanz-postgres-vector; do
    echo "$c: $(docker inspect -f '{{.State.Status}}' $c) | $(docker stats --no-stream --format '{{.MemUsage}}' $c)"
  done
  docker exec avalanz-dialog python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=5).read().decode())"
}
```

### Logs

**Servidor**

```bash
docker logs avalanz-dialog --since 30m 2>&1 | grep -v /metrics | tail -30
docker logs avalanz-assistant --since 30m 2>&1 | grep -v /metrics | tail -30
docker logs avalanz-nginx --since 30m 2>&1 | grep -E "/api/v1/(dialog|assistant)" | awk '{print $9, $7}' | tail -20
```

### Probar la API con un token de prueba

**Servidor**

```bash
TOKEN=$(docker exec avalanz-assistant python -c "
import time
from jose import jwt
from app.config import settings
now = int(time.time())
print(jwt.encode({'user_id': 'prueba-asistente', 'email': 'abraham_covarrubias@avalanz.com', 'is_super_admin': False,
                  'roles': [], 'modules': [{'slug': 'it-service-desk'}], 'companies': [], 'type': 'access',
                  'iat': now, 'exp': now + 300}, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM))")
curl -sk --resolve intranet.avalanz.com:443:127.0.0.1 -X POST https://intranet.avalanz.com/api/v1/dialog/message \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"message":"¿dónde veo los saldos bancarios?","module":"it-service-desk"}' | python3 -m json.tool | head -30
```

### Despliegues

| Qué cambió | Cómo |
|---|---|
| `intents.yaml` o `ticket_types.yaml` | Pruebas + build + recrear `dialog-service` (sección 6) |
| Código del `assistant-service` | Build, prueba `ARRANCA BIEN`, recrear (patrón de la Fase 0) |
| Frontend | `npm run build`; solo si termina bien, `pm2 restart intranet-frontend` |
| Nginx (`intranet.conf`) | `docker exec avalanz-nginx nginx -t` y `nginx -s reload` |
| Volúmenes de Nginx | Recrear Nginx (**corta la intranet unos segundos**; fuera de horario) |

---

## 11. Pruebas

| Prueba | Resultado |
|---|---|
| Automáticas del RAG | 71 aprobadas |
| Automáticas del diálogo | 70 aprobadas |
| *"¡Muchas gracias!"*, *"que reres ?"*, *"grasias"* | Plática, sin tocar el RAG |
| *"hola, ¿dónde veo los saldos bancarios?"* | Búsqueda: Financiero, página 20 |
| *"que es ppd"* | Búsqueda (no se confunde con plática) |
| *"no me sirvió"*, *"no le entiendo al manual"* | Plática con ticket ofrecido |
| Sin token | 401 |
| Catálogos | 18 sistemas, 63 módulos, S1–S4 |
| Ticket real desde el chat | INC-CORP-000001, asignado, origen `asistente` |
| Enlaces de documentos | Ver sección 8 |

---

## 12. Diagnóstico de problemas

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| La esfera no aparece | `availability` en `false` | Módulo en el token del usuario y activación en `assistant_modules` |
| *"gracias"* devuelve resultados de búsqueda | La frase no coincide con ninguna regla | Agregarla a `intents.yaml` (con su prueba) |
| Una pregunta real se toma como plática | Regla demasiado amplia o tolerancia | Ajustar el patrón o `fuzzy_threshold` |
| *"No pude cargar los catálogos"* | IT Service Desk caído o `SERVICE_DESK_*` mal configurado | `docker logs avalanz-dialog`; `/health` del IT Service Desk |
| El ticket falla con imágenes | Imagen > 5 MB, no es imagen, más de 3, o `413` de Nginx | `client_max_body_size 20m` en `/api/v1/dialog` |
| La línea *"Buscando a quién asignarlo"* no cambia | Ticket en backlog (normal) o el WebSocket no llega | Estado del ticket; conexión WS (`Header.tsx`) |
| El visor da 403 | ACL no heredada o archivo nuevo sin permiso | Sección 8 |
| *"El video no está disponible"* | El video no se llama igual que su transcripción | Convención `X.transcripcion.docx` ↔ `X.mp4` |
| El sistema sugerido no aparece | Tema sin entrada en `systems_by_topic` o nombre distinto al catálogo | `ticket_types.yaml` |
| La esfera tapa botones | Pantalla con controles en la esquina inferior derecha | Darle `pr-20` al contenedor |

---

## 13. Decisiones de la Fase 2

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | RRF con habla ×0.5 | Fusión directa | La directa perdía Recall@5 por las transcripciones |
| 2 | Confianza por acuerdo BM25–e5 | Umbral de similitud | AUC 0.91 contra 0.82; sin costo extra |
| 3 | Tarjetas por documento, sin respuesta única | Mostrar el primer fragmento como respuesta | En confianza alta, el primero acierta 7 de 12 |
| 4 | `dialog-service` aparte | Plática dentro del RAG | Responsabilidad única, recursos y reemplazo independientes |
| 5 | Reglas en YAML + `difflib` | Umbral con embeddings | Banda estrecha de similitudes de e5 |
| 6 | Ticket con el token del usuario | Cuenta de servicio | Queda a su nombre; sin permisos especiales |
| 7 | Asignación asíncrona por WebSocket | Esperar la asignación (consultar 8 s) | Respuesta inmediata; reutiliza el tiempo real existente |
| 8 | Origen marcado por red interna; Nginx borra el encabezado | Campo de formulario | No se puede falsificar desde el navegador |
| 9 | Enlaces firmados + `X-Accel-Redirect` | Servir archivos desde Python o con cookies | `<video>`/`<iframe>` no mandan el token; Nginx sirve rangos |
| 10 | Word y PowerPoint se descargan | Convertir a PDF con LibreOffice | Decisión del usuario; evita ~400 MB de LibreOffice |
| 11 | ACL para el usuario de Nginx | `chmod o+r` | Lectura solo para Nginx, no para cualquier usuario |
| 12 | Capa de contraste por clases | Redefinir las variables de color | Las variables también pintan 280 fondos |
| 13 | Esfera propia en CSS | Componente de RareUI (WebGL) | Licencia con crédito obligatorio; más ligera |

---

## 14. Pendientes

| Pendiente | Prioridad |
|---|---|
| Cerrar el ticket de prueba INC-CORP-000001 | Inmediata |
| Integrar `feature/assistant-tickets` a `develop` | Inmediata |
| Conjunto de evaluación v2 (≥ 100 preguntas, con preguntas de sesiones grabadas) para validar habla ×0.5 y los niveles de confianza | Alta |
| Retención de la bitácora `query_log` (por ejemplo, 12 meses) | Alta |
| Evaluar falsos positivos del detector con MASSIVE (es-ES) | Media |
| Respuestas verificadas a partir de tickets resueltos (anonimizados) | Media |
| Paneles de Grafana para `dialog_messages_total` y `dialog_tickets_total` | Media |
| Títulos legibles de los documentos y barra de desplazamiento discreta en el widget | Baja |
| Tablero de brechas (preguntas sin respuesta y tickets nacidos en el chat) | Fase 6 |
| Spike de modelo generativo local en CPU | Futuro |
| Alerta por correo si la ingesta nocturna falla | Pendiente de la Fase 1 |

---

## 15. Commits de la fase

| Commit | Descripción |
|---|---|
| `177e9ef` | API de búsqueda, adaptadores BM25/pgvector y bitácora |
| `8d20da4` | Widget flotante |
| `183bad1` | Esfera más pequeña, con profundidad y parpadeo |
| `a4ccf01` | Resultados agrupados por documento |
| `b0976b4` | `dialog-service` delante del asistente |
| `d1e567b` | El widget usa el `dialog-service` |
| `8eff360` | Tolerancia a errores de dedo |
| `c898b12` (develop) | Integración: búsqueda, widget y `dialog-service` |
| `45ffc0d` | Capa de contraste |
| `a886046` (develop) | Integración: contraste |
| `9789159` | Backend del ticket desde el chat (y solicitante en los eventos) |
| `ff2ef89` | Flujo del ticket en el widget |
| `fe9262b` | Origen del ticket para métricas |
| `fdbe5ee` | Contexto de la conversación, *"sí"* tras la oferta y sistema por tema |
| `9de7dcd` | Enlaces firmados a las fuentes |
| (rama) | Etiquetas de severidad en color y visor de fuentes en el widget |
