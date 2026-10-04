# Asistente Avalanz — Fase 0: Infraestructura

Ubicación sugerida: `docs/modules/assistant/assistant-fase-0-infraestructura.md`
Rama: `feature/assistant-service` (integrada a `develop` en `64b6092`)
Fecha: 2 de octubre de 2026 · Actualizado: 3 de octubre de 2026 (cierre de la Fase 1)
Estado: **completada y en productivo**. Las fases 1 y 2 ya se construyeron encima (ingesta, búsqueda, widget, diálogo y ticket desde el chat); ver sus manuales.

> La continuación está en `assistant-fase-1-ingesta.md`: ingesta, modelo de embeddings, esquema y operación nocturna.

---

## 1. Qué es el Asistente y qué cubre esta fase

El Asistente Avalanz es un **servicio transversal de la plataforma** que implementa un sistema RAG (*Retrieval-Augmented Generation*) con chatbot: indexa documentos de capacitación, responde preguntas citando sus fuentes, levanta un ticket en el IT Service Desk cuando no encuentra respuesta y detecta las "brechas" de conocimiento para que TI genere material nuevo.

Es un ente **separado** del futuro submódulo de Capacitación del IT Service Desk: Capacitación es donde los usuarios consultan videos y manuales (en MinIO); el Asistente es el motor de inteligencia (con su propia carpeta de fuentes y su propia base vectorial).

La **Fase 0** construye los cimientos, sin lógica de negocio todavía:

| Pieza | Qué es |
|---|---|
| Carpeta de fuentes | Donde se dejan los documentos que el RAG va a indexar |
| PostgreSQL con pgvector | Base de datos dedicada para los vectores (embeddings) |
| `assistant-service` | Esqueleto del microservicio, con arquitectura hexagonal y salud en dos niveles |
| Ruta en Nginx | `/api/v1/assistant`, con resolución dinámica |
| Métricas | Registro en Prometheus |

### Ruta completa del proyecto

| Fase | Contenido | Estado |
|---|---|---|
| **0. Cimientos** | Infraestructura de este documento | **Completada** |
| 1. Ingesta | Extracción, transcripción, fragmentación, embeddings y pgvector; ingesta nocturna | **Completada** (ver manual de la Fase 1) |
| 2. Búsqueda | Búsqueda híbrida filtrada por módulo y permisos | **Completada** (ver manual de la Fase 2) |
| 3. Respuesta | Primero sin redacción (fragmentos con sus citas, 100% on-premise); después, modelo local si el spike lo justifica | **Completada sin redacción**: fragmentos agrupados por documento y visor de la fuente. Modelo local: pendiente |
| 4. Widget | Botón flotante, activación por módulo | **Completada**, con capa de diálogo (`dialog-service`) |
| 5. Escalamiento | Ticket prellenado que el usuario confirma | **Completada**: ticket conversacional con asignación en vivo |
| 6. Brechas | Tablero de preguntas sin respuesta | Pendiente |

---

## 2. Arquitectura de la Fase 0

```
                         Internet / red corporativa
                                    |
                                    v
                     avalanz-nginx (HTTPS, 443)
                                    |
                 location ^~ /api/v1/assistant
                 (resolucion dinamica 127.0.0.11)
                                    |
                                    v
          avalanz-assistant (FastAPI, 8000, mem_limit 1g)
            |                    |                     |
            v                    v                     v
  avalanz-postgres-vector   /data/fuentes (ro)    /data/modelos (rw)
  pgvector 0.8.0 / PG 15         |                     |
  base avalanz_assistant         v                     v
                     /srv/avalanz/asistente/   /srv/avalanz/asistente/
                         fuentes/                  modelos/

  avalanz-prometheus  --->  GET /metrics del asistente (job assistant-service)
```

El asistente **no comparte** la base de datos de productivo (`avalanz-postgres`). Si el asistente o su base fallan, el IT Service Desk y el resto de la plataforma no se ven afectados.

---

## 3. Carpetas en el servidor

| Ruta | Uso | Montaje en el contenedor |
|---|---|---|
| `/srv/avalanz/asistente/fuentes/` | Documentos que el RAG indexa | `/data/fuentes` (solo lectura) |
| `/srv/avalanz/asistente/fuentes/it-service-desk/` | Fuentes del contexto IT Service Desk | — |
| `/srv/avalanz/asistente/fuentes/general/` | Conocimiento general de la plataforma (futuro) | — |
| `/srv/avalanz/asistente/modelos/` | Modelos descargados (embeddings, Whisper) | `/data/modelos` (lectura y escritura) |

- Dueño: `abcovarrubias`, permisos `750`. Se pueden copiar documentos sin `sudo`.
- Están **fuera del repositorio git**: los documentos y modelos nunca entran a git.
- Los modelos viven fuera de la imagen para no descargarlos de nuevo en cada reconstrucción.

### Convención de la carpeta de fuentes

La estructura de carpetas **es la metadata**: no hay que llenar formularios.

```
/srv/avalanz/asistente/fuentes/
├── it-service-desk/          <- modulo: contexto y permisos de uso
│   ├── compras/              <- tema
│   │   ├── manual-ordenes-compra.pdf
│   │   └── capacitacion-compras.mp4
│   └── inventarios/
│       └── manual-stock.pdf
└── general/
```

El primer nivel es el módulo (define en qué pantallas se usa el documento y quién puede verlo); el segundo, el tema. Nada se procesa al dejar un archivo: la indexación será nocturna (Fase 1).

---

## 4. PostgreSQL con pgvector

| Dato | Valor |
|---|---|
| Servicio en docker-compose | `postgres-vector` |
| Contenedor | `avalanz-postgres-vector` |
| Imagen | `pgvector/pgvector:0.8.0-pg15` |
| Base de datos | `avalanz_assistant` |
| Usuario | `avalanz_vector` |
| Contraseña | `POSTGRES_VECTOR_PASSWORD` en `infrastructure/docker/.env` (guardada en KeePass) |
| Volumen | `postgres-vector-data` |
| Puertos publicados | Ninguno (solo red interna de Docker) |
| Extensión | `vector` 0.8.0, activada |
| RAM en reposo | ~25 MiB |

### Por qué una base dedicada

- La base de productivo usa `postgres:15-alpine`, que no trae pgvector. Las imágenes con pgvector están basadas en Debian, que ordena el texto distinto a Alpine: cambiar la imagen sobre los mismos datos podía dejar inconsistentes los índices de texto de todas las bases de productivo.
- Aislamiento: una falla del asistente no toca las bases del IT Service Desk, Legal, etc.
- Usuario y contraseña propios: si se compromete la base vectorial, no expone las credenciales de productivo.
- Misma versión mayor (15) que productivo: el `pg_dump` del contenedor de respaldos puede respaldarla.

### Prueba de funcionamiento realizada

Distancia coseno entre `[1,2,3]` y `[1,2,4]` con el operador `<=>` de pgvector: `0.0085` (similitud 0.9915). Es la misma operación que hace un índice FAISS, ahora persistente dentro de PostgreSQL.

---

## 5. `assistant-service`

### Datos del servicio

| Dato | Valor |
|---|---|
| Ubicación | `backend/assistant-service/` (servicio de plataforma, al nivel de `notify-service`) |
| Contenedor | `avalanz-assistant` |
| Puerto interno | 8000 |
| Límite de memoria | `mem_limit: 1g` |
| Dependencia | `postgres-vector` sano (`service_healthy`) |
| Variables | `env_file: backend/assistant-service/.env` |
| RAM en reposo | ~55 MiB |

### Estructura (arquitectura hexagonal)

```
backend/assistant-service/
├── Dockerfile
├── Dockerfile.dockerignore      Excluye el .env de la imagen
├── requirements.txt
├── .env                         Secretos (NO va a git, permisos 600)
├── .env.example                 Plantilla sin valores reales (si va a git)
├── app/
│   ├── main.py                  Aplicacion, ciclo de vida, metricas y rutas
│   ├── config.py                Configuracion validada; falla rapido si falta algo
│   ├── database.py              Motor async y sesiones hacia postgres-vector
│   ├── api/                     Rutas HTTP (hoy: salud)
│   ├── domain/                  Modelos del negocio y puertos (interfaces)
│   ├── application/             Casos de uso
│   ├── pipeline/                Etapas del RAG: loaders, chunking, retrieval, prompting
│   ├── adapters/                Implementaciones concretas (pgvector, modelos, IA)
│   ├── jobs/                    Tareas nocturnas
│   └── observability/           Bitacora de consultas, metricas y costos
├── tests/
└── evaluation/                  Preguntas de referencia y metricas de calidad
```

**Principio:** el núcleo (dominio y casos de uso) solo conoce interfaces. Cambiar de proveedor de IA, modelo de embeddings o base vectorial es escribir un adaptador nuevo, sin tocar la lógica. Cada carpeta tiene un `__init__.py` que explica su responsabilidad.

**Formato de comentarios del código del asistente:** cada bloque, desde las importaciones, lleva un encabezado entre líneas `# ------`, con una explicación corta del qué y del por qué.

### Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | Conexión a `postgres-vector` (usuario `avalanz_vector`) |
| `JWT_SECRET_KEY` | Sí | La misma clave que el auth-service |
| `JWT_ALGORITHM` | No (`HS256`) | Algoritmo del JWT |
| `SOURCES_PATH` | No (`/data/fuentes`) | Carpeta de fuentes dentro del contenedor |
| `MODELS_PATH` | No (`/data/modelos`) | Carpeta de modelos dentro del contenedor |

- Las variables obligatorias **no tienen valor por defecto**: si falta una, el servicio no arranca y el error indica cuál.
- Toda variable nueva se declara también en `app/config.py`.

### Mejoras respecto al patrón del IT Service Desk

| Tema | IT Service Desk | Asistente |
|---|---|---|
| `.env` | Copiado dentro de la imagen | Excluido con `Dockerfile.dockerignore`; llega en tiempo de ejecución |
| Cambio en `.env` | Requiere reconstruir la imagen | Basta recrear el contenedor |
| Variables críticas | Con valores por defecto falsos | Sin valor por defecto: falla rápido |
| Memoria | Sin límite | `mem_limit: 1g` |
| Nginx | `upstream` fijo (si el contenedor está apagado, Nginx no arranca) | Resolución dinámica (si está apagado, solo su ruta da 502) |

### Salud en dos niveles

| Ruta | Tipo | Qué revisa | Respuesta |
|---|---|---|---|
| `GET /health` | Liveness | Que el proceso esté vivo | `{"service":"assistant-service","status":"ok"}` |
| `GET /health/ready` | Readiness | Base de datos, extensión pgvector y carpetas montadas | 200 si todo está bien; 503 con el detalle de qué falló |

Respuesta sana de `/health/ready`:

```json
{"status":"ok","checks":{"database":"ok","pgvector":"0.8.0","fuentes":"ok","modelos":"ok"}}
```

Las rutas de salud viven en la raíz del servicio. Las rutas de negocio irán bajo `/api/v1/assistant` a partir de la Fase 1.

---

## 6. Nginx

Bloque en `infrastructure/nginx/conf.d/intranet.conf`, antes de `location /storage/`:

```nginx
location ^~ /api/v1/assistant {
    limit_req zone=api burst=20 nodelay;
    resolver 127.0.0.11 valid=30s ipv6=off;
    set $assistant_upstream http://avalanz-assistant:8000;
    proxy_pass $assistant_upstream;
    ...
    proxy_read_timeout 120s;
    proxy_buffering off;
}
```

- **Resolución dinámica** (`resolver` + variable): Nginx busca el contenedor en cada petición mediante el DNS interno de Docker. Si el asistente está apagado, Nginx sigue arrancando y solo esta ruta responde 502. Tampoco hace falta recargar Nginx después de reconstruir el asistente.
- **`proxy_read_timeout 120s` y `proxy_buffering off`**: las respuestas del modelo tardan más y, desde la Fase 3, llegarán por partes (*streaming*).
- En el mismo cambio se corrigió el comentario `# ── Legal Service` que estaba sobre el bloque del IT Service Desk.

Prueba: una petición a `/api/v1/assistant/prueba` devuelve `{"detail":"Not Found"}` (el 404 en JSON de FastAPI). Eso confirma que Nginx enruta al asistente; si cayera en el frontend, la respuesta sería HTML.

---

## 7. Prometheus

Job agregado en `infrastructure/prometheus/prometheus.yml`, después del IT Service Desk:

```yaml
- job_name: "assistant-service"
  static_configs:
    - targets: ["avalanz-assistant:8000"]
  metrics_path: "/metrics"
  scrape_interval: 15s
```

Resultado: `assistant-service` en `up`, 14 de 14 destinos sanos.

El asistente **aún no aparece en el dashboard de Grafana**: los paneles filtran por una lista fija de 6 servicios. Se ajustará cuando tenga tráfico real.

---

## 8. Corrección relacionada: respaldos de productivo

Al preparar el respaldo de la base vectorial se encontró que el respaldo nocturno usaba una lista fija (`auth`, `admin`, `notify`): **`avalanz_it_service_desk` y `avalanz_legal` nunca se habían respaldado automáticamente**. Se corrigió en una rama aparte (`fix/backup-all-databases`, integrada a `develop` en `ae6e9c3`):

| Cambio | Detalle |
|---|---|
| Respaldo inmediato | `pg_dump -Fc` manual de `it_service_desk` (23 tablas) y `legal` (18 tablas) en `~/respaldos`, permisos `600`, legibilidad comprobada con `pg_restore -l` |
| `backup_postgres.sh` | Descubre todas las bases del servidor; si la consulta falla, usa una lista conocida y lo avisa en el correo |
| `verify_backups.sh` | Agrega `it_service_desk` y `legal`; corrige un chequeo que siempre pasaba (revisaba el `$?` de `tr`, no de `psql`); falla si una base del servidor no tiene verificación configurada |
| Prueba en vivo | 5 bases respaldadas, 5 verificadas, 0 errores, 0 bases temporales residuales |

---

## 9. Operación

### Estado general

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && {
  # Estado de los dos contenedores del asistente
  ASIS=$(docker inspect -f '{{.State.Status}} reinicios={{.RestartCount}}' avalanz-assistant 2>/dev/null || echo "no_existe")
  VEC=$(docker inspect -f '{{.State.Health.Status}}' avalanz-postgres-vector 2>/dev/null || echo "no_existe")
  # Salud de trabajo del asistente
  READY=$(docker exec avalanz-assistant python -c "import urllib.request,urllib.error
try: print(urllib.request.urlopen('http://127.0.0.1:8000/health/ready',timeout=5).read().decode())
except urllib.error.HTTPError as e: print(e.read().decode())" 2>/dev/null)
  # Consumo de memoria contra su limite
  RAM=$(docker stats --no-stream --format '{{.MemUsage}}' avalanz-assistant 2>/dev/null)
  echo "TEST: asistente=$ASIS | postgres_vector=$VEC | ram=$RAM | ready=$READY"
}
```

### Logs

**Servidor**

```bash
docker logs avalanz-assistant --since 30m 2>&1 | grep -v /metrics | tail -40
docker logs avalanz-postgres-vector --since 30m 2>&1 | tail -20
```

### Reiniciar o aplicar cambios

| Situación | Comando (desde `infrastructure/docker`) |
|---|---|
| Cambió el `.env` del asistente | `docker compose up -d --no-deps --force-recreate assistant-service` |
| Cambió el código | Construir, probar y recrear (ver abajo) |
| Reinicio simple | `docker restart avalanz-assistant` |

Despliegue seguro de cambios de código:

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/infrastructure/docker && {
  # Construye la imagen nueva sin tocar el contenedor en linea
  docker compose build -q assistant-service
  # Prueba la aplicacion en un contenedor identico al real
  if docker compose run --rm --no-deps --entrypoint python assistant-service -c "from app.main import app; print('ARRANCA BIEN')" 2>&1 | grep -q "ARRANCA BIEN"; then
    docker compose up -d --no-deps --force-recreate assistant-service
    echo "TEST: despliegue=OK"
  else
    echo "TEST: ERROR no arranca, el contenedor en linea no se toco"
  fi
}
```

No hace falta recargar Nginx: la resolución es dinámica.

### Consultar la base vectorial

**Servidor**

```bash
docker exec -it avalanz-postgres-vector sh -c 'psql -U "$POSTGRES_USER" -d avalanz_assistant'
```

### Ver la contraseña de la base vectorial (en privado)

**Servidor**

```bash
grep '^POSTGRES_VECTOR_PASSWORD=' ~/intranet-avalanz/infrastructure/docker/.env
```

---

## 10. Reversión completa de la Fase 0

Solo si se decide retirar el asistente. **Borrar el volumen elimina los datos vectoriales de forma permanente.**

1. Detener y quitar los contenedores: `docker compose stop assistant-service postgres-vector && docker compose rm -f assistant-service postgres-vector`
2. Quitar los bloques de `docker-compose.yml`, `intranet.conf` y `prometheus.yml` (o revertir los commits de la rama).
3. Validar con `docker exec avalanz-nginx nginx -t`, recargar Nginx y enviar `HUP` a Prometheus.
4. Opcional: `docker volume rm docker_postgres-vector-data` y borrar `/srv/avalanz/asistente/`.

---

## 11. Decisiones de arquitectura de la Fase 0

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | Asistente como servicio de plataforma (`backend/assistant-service`) | Submódulo del IT Service Desk | Debe crecer a toda la plataforma; aísla memoria y fallas del servicio en productivo |
| 2 | PostgreSQL dedicado con pgvector | Cambiar la imagen de productivo | Riesgo de inconsistencia en índices de texto (Alpine vs. Debian) y aislamiento de fallas |
| 3 | PostgreSQL 15 | PostgreSQL 16 o 17 | Compatibilidad con el `pg_dump` de los respaldos existentes |
| 4 | Carpeta del servidor como fuente del RAG | MinIO | Más simple de operar: se copian archivos y listo; la estructura de carpetas es la metadata |
| 5 | Arquitectura hexagonal | Un servicio monolítico por archivos | Cambiar proveedores sin tocar la lógica; cada pieza se prueba por separado |
| 6 | Resolución dinámica en Nginx | `upstream` fijo | Un servicio nuevo no debe poder impedir que Nginx arranque |
| 7 | `mem_limit: 1g` | Sin límite | Un consumo excesivo detiene solo al asistente, no a la plataforma |
| 8 | `.env` fuera de la imagen | Copiarlo como en los demás servicios | Los secretos no viven en la imagen; los cambios de configuración no requieren reconstruir |
| 9 | Indexación nocturna (Fase 1) | Procesar al subir el archivo | Regla de negocio: nada pesado en horario laboral |
| 10 | ~~Generación de respuestas por API (Fase 3)~~ **Reemplazada:** el asistente arranca sin redacción (opción A, 100% on-premise) y se evalúa un modelo local en CPU | API externa (queda como respaldo documentado) | Mantiene el principio on-premise del Acta sin excepciones |

Cada una se desarrollará en su propio registro de decisión (ADR) en `docs/modules/assistant/decisiones/`.

---

## 12. Pendientes que deja la Fase 0

| Pendiente | Estado |
|---|---|
| Respaldo y verificación de `avalanz_assistant` | **Resuelto en la Fase 1.** Se respalda cada noche con credenciales propias y se verifica restaurándola en su propio servidor |
| Ajustar `mem_limit` con el consumo real de la ingesta | **Resuelto en la Fase 1.** La ingesta corre en el contenedor aparte `assistant-ingest` con 2 GB; el servicio conserva 1 GB |
| Incluir el asistente en los paneles de Grafana | Pendiente, cuando tenga tráfico real |
| Contenedor con usuario sin privilegios (hoy corre como root, igual que los demás) | Pendiente, endurecimiento posterior |
| ~~Aprobación de la API de IA~~ | **Ya no aplica:** se decidió arrancar sin redacción (opción A) |

### Hallazgos de plataforma encontrados durante la fase (para el tbt)

- `alerts.yml` de Prometheus no está montado en el contenedor: sus reglas de alerta no se evalúan.
- `app/config.py` del IT Service Desk tiene una contraseña de RabbitMQ como valor por defecto, subida a GitHub.
- Existe `location /storage/` con upstream de MinIO: verificar si el pendiente de MinIO expuesto en el puerto 9000 ya quedó resuelto.

---

## 13. Commits de la fase

| Commit | Descripción |
|---|---|
| `f97382b` | PostgreSQL dedicado con pgvector |
| `ae6e9c3` (develop) | Corrección de respaldos (rama `fix/backup-all-databases`) |
| `4ea69d7` | Esqueleto de `assistant-service` |
| (rama) | Ruta en Nginx y job de Prometheus |
| `64b6092` (develop) | Integración de la Fase 0 a `develop` |
| `c41362f` (develop) | Integración de cargadores, fragmentador, adaptador ONNX, esquema y respaldos |
