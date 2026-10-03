# Asistente Avalanz — Fase 1: Ingesta

Ubicación sugerida: `docs/modules/assistant/assistant-fase-1-ingesta.md`
Rama: `feature/assistant-service`
Fecha: 3 de octubre de 2026
Estado: **completada y en productivo** (la ingesta corre cada noche; todavía no hay búsqueda para usuarios ni widget)

> Antecedente: `assistant-fase-0-infraestructura.md` (base vectorial, servicio, Nginx y Prometheus).

---

## 1. Qué hace la Fase 1

Convierte los documentos de la carpeta de fuentes en fragmentos vectorizados dentro de pgvector, cada noche, sin intervención:

1. **Lee** cada archivo con el cargador de su formato (PDF, Word, PowerPoint o transcripción de Teams).
2. **Fragmenta** el contenido respetando su estructura (secciones, tablas, ventanas de conversación).
3. **Vectoriza** cada fragmento con `multilingual-e5-small` en ONNX, en CPU y sin PyTorch.
4. **Guarda** documentos, fragmentos y vectores en `avalanz_assistant`.
5. **Detecta cambios**: solo procesa lo nuevo o modificado y quita lo que se borró de la carpeta.

Estado del índice al cierre: **12 documentos, 801 fragmentos** (259 de texto, 43 de tabla y 499 de habla). Primera ingesta: 92 s. Reejecución sin cambios: 0.1 s.

---

## 2. Flujo

```
/srv/avalanz/asistente/fuentes/        (solo lectura)
        │
        ▼
  02:30 · crontab del servidor ── assistant_ingest_nightly.sh (candado, límite de 4 h, bitácora)
        │
        ▼
  contenedor temporal assistant-ingest (misma imagen del servicio, 2 GB, perfil jobs)
        │
        ├─ huella SHA-256 + modelo  ── ¿cambió?  no ──► se salta
        │                                        sí
        ├─ cargador por formato  ──►  bloques (texto, tabla, habla) con su ubicación
        ├─ fragmentador por estructura  ──►  fragmentos con encabezado de contexto
        ├─ e5-small ONNX fp32  ──►  vectores de 384 dimensiones
        └─ pgvector (una transacción por documento)
```

---

## 3. Operación diaria: agregar o actualizar documentos

### Convención de carpetas

```
/srv/avalanz/asistente/fuentes/
└── it-service-desk/          <- módulo: define dónde se usa y quién puede verlo
    ├── nomina/               <- tema
    │   ├── manual-autocapacitacion-nomina-v2.pdf
    │   ├── capacitacion-2026-09-07.mp4
    │   └── capacitacion-2026-09-07.transcripcion.docx
    └── ...
```

Temas actuales: `activo-fijo`, `crm-odoo-dyce`, `financiero`, `nomina`, `proyectos`, `roles`, `ventas-facturacion`.

### Reglas de gobierno de la carpeta

| Regla | Por qué |
|---|---|
| **Solo la versión vigente** de cada documento | Dos versiones hacen que el asistente cite instrucciones viejas o mezcle respuestas contradictorias |
| **No toda grabación es conocimiento** | Una sesión cancelada o de pura plática ensucia la búsqueda |
| **Nada confidencial** | Todo lo que está en `it-service-desk/` lo puede citar cualquier usuario del módulo |
| **Nombres simples**: minúsculas, guiones, sin acentos ni símbolos | Evita problemas al copiar (como el carácter `·`) y produce títulos legibles |
| **Video y transcripción con el mismo nombre base** | `<nombre>.mp4` + `<nombre>.transcripcion.docx`: la ingesta usa la transcripción y salta el video |

### Carpetas auxiliares (nunca se indexan)

| Carpeta | Uso |
|---|---|
| `/srv/avalanz/asistente/entrada/` | Bandeja de revisión antes de publicar en `fuentes/` |
| `/srv/avalanz/asistente/entrada/descartados/` | Versiones anteriores y material excluido (se conserva, no se borra) |
| `/srv/avalanz/asistente/entrada/pruebas/` | Material de ensayo para probar cargadores |

### Subir un documento desde Windows

**Local (PowerShell)**

```powershell
scp "C:\ruta\al\archivo.pdf" abcovarrubias@10.12.0.51:/srv/avalanz/asistente/fuentes/it-service-desk/<tema>/<nombre-limpio>.pdf
```

Si el nombre trae caracteres especiales, cópialo antes a una carpeta temporal con un nombre simple. El documento queda disponible en el índice **la mañana siguiente**, después de la ingesta de las 02:30.

---

## 4. Formatos soportados

| Formato | Cargador | Reglas principales |
|---|---|---|
| **PDF** | `pdf_loader.py` (pdfplumber, licencia MIT) | Títulos por tamaño (16 pt sección, 13 pt subsección) y numeración; descarta portada (≥ 24 pt), índice (≥ 5 líneas con puntos guía) y encabezado/pie (letras ≤ 9 pt en franjas de 60 y 45 pt); tablas a Markdown uniendo celdas combinadas. Umbrales en `PdfLayoutRules` |
| **Word** | `docx_loader.py` | Títulos por estilo (incluido el identificador crudo del XML en documentos generados); descarta lo anterior al primer título (portada) y secciones ignoradas; viñetas con guion; tablas en su lugar |
| **PowerPoint** | `pptx_loader.py` | Un bloque por diapositiva; título del espacio de título o inferido (primer texto corto con ≥ 4 letras); orden de lectura por renglones; notas del orador al final |
| **Transcripción de Teams** | `teams_transcript_loader.py` | `<nombre>.transcripcion.docx`; una intervención por bloque con hablante, minuto de inicio y de fin; el encabezado de Teams se descarta solo |
| **Video** | — | Con transcripción de Teams: se salta. Sin transcripción: se reporta como pendiente (el adaptador de Whisper se integra cuando haga falta) |

Secciones ignoradas en todos los formatos: `contenido`, `control de versiones`, `índice`, `indice`, `tabla de contenido` (en `loaders/common.py`).

**Limitación conocida:** en PowerPoint, los diseños en columnas se leen por renglones. Las notas del orador lo compensan.

---

## 5. Fragmentación

| Parámetro | Valor | Equivalente |
|---|---|---|
| Objetivo | 1,000 caracteres | ~250 tokens |
| Máximo | 1,500 caracteres | ~375 tokens |
| Traslape al partir | 150 caracteres | ~1 oración |
| Ventana de conversación | 1,000 caracteres o 4 minutos | |

- **Texto:** se juntan bloques de la misma sección; nunca se mezclan secciones; si excede el máximo, se parte por párrafo, oración y, en último caso, palabra.
- **Tablas:** completas si caben; si no, por filas repitiendo el encabezado.
- **Habla:** ventanas de intervenciones; la siguiente repite la última intervención si es corta.
- **Encabezado de contexto:** `tema > documento > ruta de secciones`, antepuesto al texto al vectorizar.

Parámetros en `ChunkingRules` (`pipeline/chunking/structure_chunker.py`).

---

## 6. Modelo de embeddings

| Dato | Valor |
|---|---|
| Modelo | `intfloat/multilingual-e5-small` (118 M parámetros, 384 dimensiones) |
| Formato en producción | **ONNX fp32** con onnxruntime y tokenizers (sin PyTorch) |
| Ubicación | `/srv/avalanz/asistente/modelos/e5-small/` (`model.onnx`, `tokenizer.json`, `manifest.json`) |
| Prefijos | `query: ` para preguntas, `passage: ` para fragmentos |
| Adaptador | `app/adapters/onnx_embedder.py` |

### Por qué fp32 y no int8

| Versión | Tamaño | Coseno contra PyTorch | Recall@5 |
|---|---|---|---|
| ONNX fp32 | 449 MB | 1.000 | **0.90** |
| ONNX int8 | 113 MB | 0.987 | 0.70 |

Las similitudes de e5 caen en una banda muy estrecha (los candidatos de una pregunta difieren en milésimas); el error de la cuantización (~0.013) reordena los resultados. **La paridad se valida con la métrica de la tarea, no con la similitud entre vectores.**

### Volver a exportar el modelo

Solo si se borra la carpeta del modelo o se cambia de modelo. Corre en un contenedor temporal con PyTorch:

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/backend/assistant-service && {
  # Exporta el modelo a ONNX fp32 e int8 en la carpeta de modelos
  docker run --rm --cpus 2 --memory 4g -v "$PWD":/app:ro -w /app \
    -v /srv/avalanz/asistente/modelos:/modelos -e PYTHONPATH=/app -e HF_HOME=/modelos/hf \
    python:3.11-slim sh -c "pip install -q --root-user-action=ignore --index-url https://download.pytorch.org/whl/cpu torch==2.3.1 && pip install -q --root-user-action=ignore -r evaluation/requirements-eval.txt && python -m tools.export_onnx_embedder intfloat/multilingual-e5-small /modelos/e5-small" 2>&1 | grep '^EXPORTADO'
}
```

---

## 7. Base vectorial

### Esquema (migración `0001`)

| Tabla | Contenido clave |
|---|---|
| `documents` | `relative_path` (único), `module`, `topic`, `title`, `kind`, `checksum`, `embedding_model`, `chunk_count`, `indexed_at` |
| `chunks` | `text`, `context_header`, `kind`, `ordinal`, `page`, `slide`, `start_seconds`, `end_seconds`, `speaker`, `module`, `embedding vector(384)`, `search_vector` (tsvector generado en español) |

| Índice | Uso |
|---|---|
| `ix_chunks_embedding` (HNSW, coseno) | Búsqueda por similitud |
| `ix_chunks_search` (GIN) | Búsqueda por palabras (Fase 2, híbrida) |
| `ix_chunks_module`, `ix_documents_module` | Filtro por módulo y permisos |

Borrar un documento borra sus fragmentos (`ON DELETE CASCADE`).

### Migraciones

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/infrastructure/docker && {
  # Aplica migraciones pendientes con la imagen del servicio
  docker compose run --rm --no-deps --entrypoint alembic assistant-service upgrade head 2>&1 | tail -2
  docker exec avalanz-postgres-vector sh -c 'psql -U "$POSTGRES_USER" -d avalanz_assistant -tAc "SELECT version_num FROM alembic_version"'
}
```

Cambiar de modelo de embeddings (otra dimensión) requiere una migración nueva y reindexar todo: la ingesta lo detecta sola por la columna `embedding_model`.

---

## 8. Ingesta

### Reglas

| Situación | Qué hace |
|---|---|
| Archivo nuevo | Lo indexa |
| Huella o modelo distintos | Reemplaza el documento completo (una transacción) |
| Sin cambios | Lo salta |
| Borrado de la carpeta | Lo quita del índice con sus fragmentos |
| Error al procesar | Lo reporta, sigue con los demás y **conserva su versión anterior** |
| Video sin transcripción | Lo reporta como pendiente |

### Ejecución manual

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/infrastructure/docker && {
  # Ingesta bajo demanda en el contenedor temporal (sin terminal, como en cron)
  docker compose run --rm -T assistant-ingest < /dev/null 2>&1 | grep -E '^(INGESTA|FALLIDO)'
}
```

Reporte de ejemplo:

```
INGESTA: nuevos=0 | actualizados=0 | sin_cambios=12 | eliminados=0 | fallidos=0 | videos_sin_transcripcion=0 | fragmentos=0 | segundos=0.1
```

---

## 9. Programación nocturna

| Dato | Valor |
|---|---|
| Crontab | `30 2 * * * /home/abcovarrubias/intranet-avalanz/infrastructure/host/assistant_ingest_nightly.sh` |
| Candado | `/tmp/assistant_ingest.lock` (una ingesta a la vez) |
| Límite | 4 horas (termina antes de las 06:30; lo pendiente sigue la noche siguiente) |
| Bitácora | `/srv/avalanz/asistente/logs/ingesta-AAAA-MM-DD.log`, 30 días de retención |

Estados de cierre en la bitácora: `ok`, `con_fallidos`, `limite_de_tiempo`, `error_<código>`.

Por qué en el crontab del servidor y no en el contenedor de cron: el contenedor de cron no puede lanzar otros contenedores (y no debe poder, por seguridad).

### Revisar la ingesta de anoche

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && {
  # Resultado y estado de la ultima ingesta
  LOG=$(ls -t /srv/avalanz/asistente/logs/ingesta-*.log 2>/dev/null | head -1)
  echo "BITACORA: $LOG"
  grep -E '^(INGESTA|FALLIDO)|fin estado=' "$LOG" | tail -4
}
```

---

## 10. Respaldos

- `avalanz_assistant` se respalda cada noche a la 01:00 junto con las 5 bases de productivo, con credenciales propias (`VECTOR_DB_*` en el servicio de cron).
- La verificación semanal restaura cada respaldo **en su propio servidor** (el de productivo no tiene pgvector) y revisa las tablas `documents` y `chunks`.
- Corrección incluida: el respaldo validaba el estado de la tubería (el de `gzip`); un respaldo vacío se reportaba como exitoso. Ahora se valida el contenido del volcado.

---

## 11. Evaluación

| Elemento | Ubicación |
|---|---|
| Preguntas de usuarios con su verdad de referencia | `evaluation/datasets/preguntas-v1.xlsx` (25: 20 con respuesta, 5 sin respuesta) |
| Banco de evaluación | `evaluation/retrieval_benchmark.py` |
| Reglas de relevancia | `evaluation/relevance.py` (PDF ±2 páginas, sección de Word, diapositiva) |
| Resultados | `evaluation/results/*.json` |

| Recuperador | Recall@5 | MRR | RAM | Por pregunta |
|---|---|---|---|---|
| BM25 | 0.80 | 0.610 | 216 MB | 2 ms |
| **e5-small (ONNX fp32, producción)** | **0.90** | 0.593 | 1,556 MB* | 53 ms |
| e5-base | 0.75 | 0.612 | 2,499 MB | 128 ms |
| bge-m3 | 0.80 | 0.585 | 3,913 MB | 372 ms |

\* Incluye leer y vectorizar todo el corpus por lotes. Ninguna diferencia es estadísticamente significativa con 20 preguntas (McNemar, p ≥ 0.25). La unión de BM25 y e5-small llegaría a 0.95: motiva la búsqueda híbrida de la Fase 2.

### Repetir el banco con el modelo de producción

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/backend/assistant-service && {
  # Banco con el adaptador de produccion, sin PyTorch
  docker run --rm --cpus 2 --memory 4g -v "$PWD":/app:ro -w /app \
    -v "$PWD/evaluation/results":/app/evaluation/results \
    -v /srv/avalanz/asistente/fuentes:/fuentes:ro -v /srv/avalanz/asistente/modelos:/modelos:ro \
    -e PYTHONPATH=/app python:3.11-slim sh -c "pip install -q --root-user-action=ignore pdfplumber==0.11.4 python-docx==1.1.2 python-pptx==1.0.2 openpyxl==3.1.2 numpy==1.26.4 onnxruntime==1.18.1 tokenizers==0.19.1 && python -m evaluation.retrieval_benchmark --retriever e5-small-onnx" 2>&1 | grep '^TEST'
}
```

---

## 12. Pruebas automáticas

63 pruebas: dominio, reglas de PDF, Word, PowerPoint y Teams, fragmentador, relevancia, pooling de embeddings y caso de uso de ingesta (con piezas de juguete, sin base ni modelo).

**Servidor**

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz/backend/assistant-service && {
  # Todas las pruebas en un contenedor temporal
  docker run --rm --cpus 1 --memory 1g -v "$PWD":/app:ro -w /app -e PYTHONPATH=/app -e PYTHONDONTWRITEBYTECODE=1 \
    python:3.11-slim sh -c "pip install -q --root-user-action=ignore pdfplumber==0.11.4 python-docx==1.1.2 python-pptx==1.0.2 pytest==8.2.2 numpy==1.26.4 && python -m pytest -q -p no:cacheprovider tests | tail -1"
}
```

---

## 13. Diagnóstico de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Un documento nuevo no aparece | La ingesta no ha corrido o falló ese archivo | Revisar la bitácora de anoche; buscar líneas `FALLIDO` |
| `fallidos` mayor a 0 | Archivo dañado, formato no previsto o ruta fuera de la convención | Ver la traza en la bitácora; corregir el archivo o moverlo a `entrada/` |
| Estado `limite_de_tiempo` | Mucho material nuevo en una noche | Normal: la siguiente noche continúa. Si se repite, revisar volumen |
| Código 137 en la bitácora | El contenedor de ingesta se quedó sin memoria | Subir `mem_limit` de `assistant-ingest` o bajar `batch_size` |
| Error de conexión a la base | `avalanz-postgres-vector` caído | `docker inspect -f '{{.State.Health.Status}}' avalanz-postgres-vector` |
| No encuentra el modelo | Falta `/srv/avalanz/asistente/modelos/e5-small/model.onnx` | Volver a exportar (sección 6) |
| El script se queda congelado al correrlo a mano | `docker compose run` con terminal dentro de `timeout` | Ya corregido con `-T` y `< /dev/null`; no quitar esas opciones |

---

## 14. Decisiones de la Fase 1

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| pdfplumber para PDF | PyMuPDF | Licencia MIT frente a AGPL |
| Reglas de extracción calibradas con mediciones | Valores supuestos | Tamaños, franjas e índice medidos en los manuales reales |
| Transcripción de Teams cuando existe; Whisper como respaldo | Siempre Whisper | Teams trae hablantes y tiempos; Whisper en CPU es viable (RTF 0.14) para videos sin transcripción |
| e5-small | e5-base, bge-m3 | Mejor Recall@5 al menor costo (sin diferencias significativas) |
| ONNX fp32 | ONNX int8, PyTorch | int8 bajó Recall@5 a 0.70; PyTorch agrega más de 1 GB a la imagen |
| Ingesta en contenedor aparte (2 GB) | Dentro del servicio (1 GB) | El servicio que atiende usuarios se queda ligero |
| Crontab del servidor | Contenedor de cron | El contenedor de cron no debe poder lanzar contenedores |
| Asistente sin API externa (opción A) | API de IA externa | Principio on-premise del Acta sin excepciones |

---

## 15. Pendientes que deja la Fase 1

| Pendiente | Cuándo |
|---|---|
| API de búsqueda híbrida (vectores + palabras con RRF), filtrada por módulo y permisos | Fase 2 |
| Compensar el desbalance de transcripciones (22–35% de los primeros resultados) | Fase 2 |
| Señal para el "no sé" (el umbral fijo no sirve con e5) | Fase 2 |
| Medir la RAM del servicio en línea al vectorizar una pregunta | Fase 2 |
| Spike de modelo de lenguaje local en CPU (opción B) | Antes de la Fase 3 |
| Adaptador de Whisper por bloques de audio | Cuando llegue un video sin transcripción |
| Conjunto de evaluación v2 (≥ 100 preguntas, incluidas sesiones grabadas) | Continuo |
| Alerta por correo si la ingesta nocturna falla | Fase 2 |

---

## 16. Commits de la fase

| Commit | Descripción |
|---|---|
| `9bf4471` | Spike de transcripción con Whisper |
| — | Modelos y puertos del dominio |
| `721b7a6` | Cargador de PDF |
| `86012dc` | Cargador de transcripciones de Teams |
| `2676cf1` | Cargador de Word y utilidades comunes |
| `2ae088f` | Cargador de PowerPoint |
| `5bd484f` | Fragmentador por estructura |
| `0e9a8f7` | Conjunto de preguntas de evaluación v1 |
| `905738f` | Adaptador ONNX de e5-small |
| `8c65e40` | Banco de evaluación y resultados |
| `7d2e6ce` | Migraciones de la base vectorial |
| — | Respaldo y verificación de la base vectorial |
| `c41362f` (develop) | Integración intermedia a `develop` |
| `e86f56b` | Ingesta con almacenamiento en pgvector |
| `9fef5f5` | Programación nocturna a las 02:30 |
