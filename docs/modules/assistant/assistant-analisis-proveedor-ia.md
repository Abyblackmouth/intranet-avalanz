# Asistente Avalanz — Análisis del proveedor de IA (Fase 3)

Ubicación sugerida: `docs/modules/assistant/assistant-analisis-proveedor-ia.md`
Fecha: 3 de octubre de 2026
Estado: **archivado como respaldo (opción C)**

> **Decisión del 3 de octubre de 2026:** el asistente **no usa API externa**. Arranca sin redacción (opción A): presenta los fragmentos recuperados con sus citas, 100% on-premise, cumpliendo el principio del Acta sin excepciones. En paralelo se evalúa un modelo de lenguaje local en CPU (opción B). Este análisis se conserva por si algún día A y B no alcanzan: las secciones de privacidad, costo y criterios de evaluación siguen vigentes como referencia.

---

## 1. Qué se decide

En la Fase 3 el asistente genera la respuesta final a partir de los fragmentos que encontró la búsqueda. Esa generación la hace un **modelo de lenguaje por API externa**, porque el servidor no tiene GPU y tiene 7.8 GB de RAM: un modelo local útil no cabe ni respondería a tiempo.

Este documento reúne lo necesario para elegir proveedor y modelo: qué información sale del servidor, cuánto cuesta, qué riesgos hay y cómo se decide con datos.

**Lo que NO se decide aquí:** los embeddings y la transcripción siguen siendo **locales** (Fase 1). La API solo interviene al redactar la respuesta.

---

## 2. Qué información sale del servidor en cada pregunta

| Sale | No sale |
|---|---|
| La pregunta del usuario | Los documentos completos |
| Los 5 fragmentos más relevantes (unos 4,000 caracteres) | La base de datos ni los vectores |
| Las instrucciones del asistente (system prompt) | El nombre, correo o empresa del usuario |
| Los últimos turnos de la conversación (para entender preguntas de seguimiento) | Fragmentos de módulos a los que el usuario no tiene acceso (se filtran antes, en la búsqueda) |

### Medidas de privacidad propuestas

1. **Sin identidad del usuario.** La API recibe texto, nunca quién pregunta.
2. **Hablantes anonimizados.** Las transcripciones traen nombres de personas en cada intervención. Antes de enviar un fragmento de habla, los nombres se sustituyen por un rol genérico ("Instructor", "Participante 1"). En la búsqueda interna los nombres se conservan; solo se ocultan hacia afuera.
3. **Mínimo necesario.** Solo los fragmentos que responden la pregunta, nunca documentos completos.
4. **Bitácora local.** Cada consulta enviada queda registrada en el servidor (qué se envió, a qué modelo y cuánto costó), para poder auditar.

### Puntos a verificar en el contrato del proveedor elegido

- Que los datos enviados por API **no se usen para entrenar** modelos.
- **Retención:** cuánto tiempo guarda el proveedor las peticiones, y si existe opción de retención cero.
- **Residencia de datos:** en qué región se procesan. Algunos proveedores cobran un recargo por región dedicada.

Estos tres puntos cambian con el tiempo y entre planes: se confirman en los términos vigentes del proveedor al momento de contratar.

### Consideración de gobierno

El Acta de Constitución define la plataforma como **on-premise, sin nube pública**. El asistente sigue siendo on-premise (servicio, base vectorial, documentos y modelos de embeddings viven en el servidor), pero la generación de respuestas usa un **servicio externo**. Esa excepción debe quedar documentada en su ADR, con las medidas de privacidad de esta sección.

---

## 3. Consumo estimado por pregunta

Calculado con los tamaños reales medidos en la Fase 1 (fragmentos de 550 a 830 caracteres en promedio; en español, unos 4 caracteres por token).

| Concepto | Tokens aproximados |
|---|---|
| Instrucciones del asistente | 600 |
| 5 fragmentos con su encabezado de contexto | 1,250 |
| Pregunta y conversación reciente | 500 |
| **Entrada total** | **~2,500** |
| **Respuesta generada** | **~350** |

A esto se suma, desde la Fase 2, una llamada pequeña para **reescribir preguntas de seguimiento** (~500 de entrada y ~50 de salida), que puede hacerse con el modelo más económico.

---

## 4. Costo estimado

Precios de lista por millón de tokens (entrada / salida), consultados el 3 de octubre de 2026. **Cambian con frecuencia: se confirman en la página oficial del proveedor antes de decidir.**

| Modelo | Entrada | Salida | Costo por pregunta |
|---|---|---|---|
| Anthropic Claude Haiku 4.5 | $1 | $5 | ~$0.004 USD |
| Anthropic Claude Sonnet 5.5 | $2 | $10 | ~$0.009 USD |
| Anthropic Claude Opus 5.5 | $4 | $20 | ~$0.017 USD |

Costo mensual, con 20 días hábiles:

| Escenario | Preguntas al día | Al mes | Haiku 4.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|---|---|
| Piloto (un grupo de usuarios) | 50 | 1,000 | ~$4 USD | ~$9 USD | ~$17 USD |
| IT Service Desk completo | 200 | 4,000 | ~$17 USD | ~$34 USD | ~$68 USD |
| Varios módulos abiertos | 1,000 | 20,000 | ~$85 USD | ~$170 USD | ~$340 USD |

**Otros proveedores** (OpenAI, Google y otros) tienen escalas de precio comparables, con modelos económicos por debajo de $1 por millón de tokens de entrada y modelos de gama media alrededor de $2. Las fuentes consultadas no coinciden entre sí en los precios vigentes de octubre de 2026, así que no se tabulan aquí: se consultan en sus páginas oficiales al momento de evaluar.

### Formas de reducir el costo

- **Caché de instrucciones:** las instrucciones del asistente son iguales en cada pregunta; los proveedores cobran una fracción del precio cuando se reutilizan.
- **Procesos por lotes:** el etiquetado nocturno del tablero de brechas no necesita respuesta inmediata; las APIs por lotes cuestan alrededor de la mitad.
- **Modelo por tarea:** el modelo económico para reescribir preguntas y etiquetar brechas; el de mejor calidad solo para la respuesta final.

**Conclusión de costo:** incluso en el escenario más alto, el costo mensual es bajo comparado con el tiempo de los especialistas que el asistente puede ahorrar. El costo **no** es el factor decisivo; la calidad de las respuestas sí.

---

## 5. Criterios de decisión

| Criterio | Cómo se mide | Peso |
|---|---|---|
| **Fidelidad** | La respuesta solo dice lo que está en los fragmentos; no inventa | Alto |
| **Saber decir "no sé"** | En las 5 preguntas sin respuesta del conjunto de evaluación, no inventa y ofrece el ticket | Alto |
| **Citas correctas** | Cita el documento y la ubicación de donde sacó la información | Alto |
| **Calidad en español** | Redacción clara y terminología correcta de TOTVS | Medio |
| **Latencia** | Tiempo hasta la primera palabra de la respuesta | Medio |
| **Costo** | Sección 4 | Bajo |
| **Privacidad y contrato** | Sección 2 | Requisito (no se compensa con lo demás) |

### Método

1. Se usa el mismo conjunto de preguntas (`evaluation/datasets/preguntas-v1.xlsx`), que ya trae la **respuesta esperada** de cada pregunta.
2. Cada modelo candidato responde las 25 preguntas con los mismos fragmentos.
3. Se califica cada respuesta en fidelidad, "no sé" correcto y citas. La calificación puede apoyarse en un modelo evaluador, pero una muestra se revisa a mano para validar el criterio.
4. Se elige la mejor relación entre calidad y costo, y se documenta en un ADR con los números.

**Recomendación de método:** evaluar al menos **dos proveedores distintos** y **dos niveles de modelo** (uno económico y uno de gama media). Gracias al puerto `LLMProvider` (arquitectura hexagonal), cambiar de proveedor es escribir un adaptador, sin tocar el resto del sistema, así que la decisión no queda amarrada.

**Nota de transparencia:** este análisis fue preparado con apoyo de un modelo de Anthropic. Por eso se recomienda comparar con datos contra al menos otro proveedor, en lugar de tomar como base cualquier preferencia de quien redactó el documento.

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El proveedor cambia precios o retira un modelo | Puerto `LLMProvider`: se cambia de modelo o de proveedor con un adaptador nuevo |
| La API no responde (caída o límite de uso) | El asistente muestra los fragmentos encontrados con sus citas y ofrece el ticket, sin respuesta redactada |
| Costo inesperado por uso excesivo | Límite de preguntas por usuario por día y alerta de gasto mensual en la bitácora |
| El modelo inventa información | Instrucción de responder solo con los fragmentos, umbral de similitud para el "no sé", citas obligatorias y evaluación con preguntas sin respuesta |
| Instrucciones maliciosas dentro de un documento (*prompt injection*) | Los fragmentos se envían marcados como datos, nunca como instrucciones; las instrucciones del asistente prevalecen |
| Datos personales en las transcripciones | Hablantes anonimizados antes de enviar (sección 2) |

---

## 7. Pendientes para cerrar la decisión

- [ ] Confirmar precios vigentes en las páginas oficiales de los proveedores candidatos.
- [ ] Revisar términos de uso de datos, retención y residencia de cada proveedor.
- [ ] Crear cuentas de prueba con límite de gasto.
- [ ] Correr la evaluación de la sección 5 (después de la Fase 2).
- [ ] Escribir el ADR con la decisión y la excepción al principio on-premise.

---

## Fuentes de precios consultadas

- Anthropic, documentación de precios: https://platform.claude.com/docs/en/about-claude/pricing
- Anthropic, ficha de Claude Sonnet 5.5: https://platform.claude.com/docs/en/models/sonnet-5-5/overview
- Precio de Claude Opus 5.5 tomado de fuentes secundarias (por ejemplo, https://www.sentra.app/articles/claude-api-pricing); confirmar en la página oficial.
