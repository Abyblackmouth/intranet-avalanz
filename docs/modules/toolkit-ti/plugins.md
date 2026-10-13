# Plugins de Toolkit TI

Guía para escribir, probar y desplegar plugins del módulo **Toolkit TI** de la Intranet Avalanz.

Un **plugin** es una utilería de TI que la intranet ejecuta por ti: recibe datos (un Excel, un mes, una empresa), hace su trabajo y entrega un resultado descargable (otro Excel, un CSV, un PDF). Cada plugin aparece solo en **Toolkit TI → Plugins**, con su formulario armado a partir de su ficha, su botón **Ejecutar**, su registro y su historial.

---

## 1. Estructura del servicio

```
backend/modules/toolkit-ti-service/
├── app/
│   ├── motor/                     ← Cómo se descubren y ejecutan los plugins. No se toca al crear uno.
│   │   ├── registro.py            ←   Descubre los plugins y valida su ficha
│   │   ├── ejecutor.py            ←   Corre UN plugin en un proceso aparte
│   │   └── servicio.py            ←   Límites, almacenamiento, historial y limpieza
│   │
│   ├── kit/                       ← Funciones compartidas que usan los plugins
│   │   ├── excel.py               ←   Leer, dar formato y escribir Excel
│   │   ├── archivos.py            ←   Nombres seguros, CSV, ZIP
│   │   └── fechas.py              ←   Meses, periodos, días hábiles
│   │
│   ├── plugins/                   ← SOLO plugins
│   │   ├── _plantilla.py          ←   Plantilla comentada (empieza con _: no se carga)
│   │   ├── ejemplo_resumen_excel.py
│   │   └── excel_layout_sat/      ←   Plugin que creció: una carpeta
│   │       ├── __init__.py        ←     FICHA y ejecutar() (lo único que el motor busca)
│   │       ├── validar.py
│   │       ├── transformar.py
│   │       └── recursos/          ←     Archivos fijos del plugin
│   │           ├── mapeo_columnas.csv
│   │           └── plantilla_sat.xlsx
│   │
│   ├── routes/  models/  auth.py  config.py  database.py  main.py
│
├── tests/
│   └── plugins/
│       ├── muestras/              ← Archivos de prueba SIN datos reales
│       └── test_excel_layout_sat.py
└── migrations/
```

**Regla de oro:** cada carpeta tiene un solo propósito. Si algo no es un plugin, no va en `plugins/`. Si algo lo usan dos o más plugins, va en `kit/`.

> **Estado actual:** el motor hoy vive en `app/plugins/__init__.py` (registro), `app/plugins_runner.py` (ejecutor) y `app/services/plugins/plugins_service.py` (servicio). Moverlo a `app/motor/` es un reacomodo sin cambios de comportamiento, pendiente de hacer.

---

## 2. Un archivo o una carpeta

| Forma | Cuándo | Ejemplo |
|---|---|---|
| **Un archivo** `plugins/<slug>.py` | La lógica cabe cómoda en unas decenas o pocos cientos de líneas y no necesita archivos fijos | `ejemplo_resumen_excel.py` |
| **Una carpeta** `plugins/<slug>/` | La lógica conviene separarla en partes, o el plugin necesita archivos fijos (plantillas, catálogos, logotipos) | `excel_layout_sat/` |

En una carpeta, el motor solo busca `__init__.py`: ahí van `FICHA` y `ejecutar()`. Las demás piezas se importan desde ahí. Los archivos fijos van en `recursos/` y se leen así:

```python
from pathlib import Path
RECURSOS = Path(__file__).parent / "recursos"
mapeo = (RECURSOS / "mapeo_columnas.csv").read_text()
```

---

## 3. Cómo se llaman

El nombre del archivo o carpeta es el **slug** del plugin: lo que se ve en la fila de la pantalla, en el historial y en las rutas de almacenamiento.

- En **minúsculas**, con **guion bajo**, sin acentos ni espacios: `excel_layout_sat`, no `Excel Layout SAT`.
- **Empieza con el área o el origen**, para que se ordenen solos: `excel_…`, `azure_…`, `totvs_…`, `microsoft_…`.
- Dice **qué hace**, no cómo: `totvs_conciliacion_banco`, no `script_nuevo_2`.
- **No se renombra** una vez en uso: el historial y los resultados guardados quedan ligados al slug.

---

## 4. La ficha

Cada plugin declara un diccionario `FICHA`. Con él, la pantalla arma su fila y su formulario.

```python
FICHA = {
    "nombre": "Layout de nómina para el SAT",
    "descripcion": "Convierte el Excel de nómina al formato que pide el SAT.",
    "tipo": "manual",               # manual | programado | correo
    "grupo": "Excel y layouts",     # agrupa los plugins en la pantalla
    "parametros": [ ... ],          # ver sección 5
    "tiempo_maximo": 120,           # segundos; si se pasa, se detiene
}
```

| Campo | Obligatorio | Para qué |
|---|---|---|
| `nombre` | Sí | Nombre visible en la pantalla |
| `descripcion` | No | Qué hace, en una o dos frases |
| `tipo` | No (`manual`) | `manual`: se ejecuta con el botón. `programado` y `correo`: se muestran con su color; por ahora también se ejecutan a mano (ver sección 11) |
| `grupo` | No (`General`) | Sección de la pantalla donde aparece |
| `parametros` | No | Lo que el plugin pide antes de ejecutarse |
| `tiempo_maximo` | No (120) | Segundos antes de detenerlo |

Si la ficha tiene un error, el plugin **no se carga** y la pantalla muestra el aviso en rojo arriba de la lista. Los demás plugins siguen funcionando.

---

## 5. Etiquetas en la pantalla

Cada plugin se muestra como un bloque al estilo Swagger: **todo el bloque toma el color de su tipo**, con un fondo muy suave y un borde delgado del mismo color, y una etiqueta cuadrada a la izquierda.

### Etiqueta de tipo

Sale del campo `tipo` de la ficha.

| Etiqueta | `tipo` | Color | Qué significa |
|---|---|---|---|
| **MANUAL** | `manual` | Azul de la intranet `#1A4FA0` | Se ejecuta cuando alguien da **Ejecutar** |
| **PROGRAMADO** | `programado` | Morado `#7C3AED` | Corre solo, por horario (por ejemplo, cada mes). Por ahora también se ejecuta a mano |
| **CORREO** | `correo` | Verde azulado `#0E7490` | Se dispara al llegar un correo que cumple una regla. Por ahora también se ejecuta a mano |

### Etiqueta de estado de una ejecución

Aparece en el resultado y en el historial.

| Etiqueta | Color | Qué significa |
|---|---|---|
| **EN CURSO** | Ámbar | El plugin está corriendo; el registro se va actualizando |
| **OK** | Verde | Terminó bien; sus archivos se pueden descargar |
| **ERROR** | Rojo | Falló, se pasó de su tiempo máximo o el servicio se reinició; el mensaje explica qué pasó |

### Otras señales

| Señal | Dónde | Qué indica |
|---|---|---|
| **Punto** verde, rojo o ámbar con fecha | En la fila del plugin | Cómo le fue en su **última ejecución** y cuándo |
| **Bloque gris** | Toda la fila | El plugin está **desactivado**: no se puede ejecutar hasta prenderlo con su interruptor |
| **Aviso rojo** arriba de la lista | Encima de los grupos | Un plugin tiene un **error en su ficha** y no se cargó |
| **Grupo** (encabezado con número) | Arriba de cada conjunto | Sale del campo `grupo` de la ficha |

---

## 6. Parámetros

```python
"parametros": [
    {"nombre": "archivo", "tipo": "archivo", "extensiones": [".xlsx"], "requerido": True,
     "ayuda": "Excel exportado de nómina"},
    {"nombre": "empresa", "tipo": "opcion", "opciones": ["AGIM", "DIAGNOSIS", "SPPEL"], "requerido": True},
    {"nombre": "periodo", "tipo": "texto", "ayuda": "Ej. Quincena 20"},
    {"nombre": "incluir_bajas", "tipo": "booleano"},
]
```

| Tipo | Qué ve el usuario | Qué recibe `ejecutar()` |
|---|---|---|
| `archivo` | Botón para elegir o arrastrar; acepta `extensiones` | En `archivos[nombre]`, un `Path` al archivo |
| `texto` | Campo de texto | `str` |
| `numero` | Campo numérico | número |
| `fecha` | Selector de fecha | `"AAAA-MM-DD"` |
| `mes` | Selector de mes | `"AAAA-MM"` |
| `opcion` | Lista desplegable con `opciones` | `str` |
| `booleano` | Interruptor | `True` / `False` |

Todos aceptan `"requerido": True` (el botón Ejecutar no se activa sin él) y `"ayuda"` (texto bajo el nombre). El motor valida los requeridos y las extensiones antes de ejecutar.

---

## 7. La función `ejecutar`

```python
def ejecutar(params: dict, archivos: dict, salida: Path, log) -> None:
    ...
```

| Argumento | Qué es |
|---|---|
| `params` | Los valores capturados, por nombre de parámetro |
| `archivos` | Los archivos subidos: `{nombre_del_parametro: Path}` |
| `salida` | Carpeta donde dejar los resultados. **Todo lo que quede ahí se puede descargar** |
| `log` | `log("texto")` escribe una línea en el registro que ve el usuario |

Cómo termina:
- **Bien:** la función termina sin error. Los archivos en `salida` quedan guardados para descargar.
- **Con error:** lanza una excepción con un mensaje claro. Ese mensaje es el que ve el usuario, así que escríbelo para él:

```python
if "RFC" not in columnas:
    raise ValueError("Al Excel le falta la columna RFC")
```

---

## 8. El kit

Funciones compartidas para no repetir lo mismo en cada plugin. Se importan así:

```python
from app.kit.excel import leer_tabla, escribir_tabla
from app.kit.archivos import nombre_seguro
```

Qué va en el kit:
- Algo que **ya usan dos o más plugins**, o que claramente usarán.
- Cosas **genéricas**: dar formato a un encabezado, leer una hoja como tabla, armar un nombre de archivo seguro, calcular la quincena de una fecha.

Qué **no** va en el kit:
- Lógica de **un solo plugin**: se queda en su archivo o carpeta. Si después otro plugin la necesita, ahí se mueve al kit.

Funciones iniciales previstas:

| Módulo | Funciones |
|---|---|
| `kit/excel.py` | `leer_tabla(path, hoja)`, `escribir_tabla(path, filas, encabezados)`, `encabezado_avalanz(hoja)` (azul de la intranet, negritas), `ajustar_anchos(hoja)` |
| `kit/archivos.py` | `nombre_seguro(texto)`, `a_csv(filas, path)`, `comprimir(paths, zip)` |
| `kit/fechas.py` | `mes_anterior(aaaa_mm)`, `quincena(fecha)`, `dias_habiles(desde, hasta)` |

---

## 9. Cómo corre un plugin

1. El usuario llena los parámetros y da **Ejecutar**.
2. El motor valida los requeridos y las extensiones, y guarda las entradas en una carpeta de trabajo temporal.
3. El plugin corre **en un proceso aparte**, con **límite de tiempo** (`tiempo_maximo`) y de **memoria** (1 GB). Si se cuelga o truena, no afecta al servicio ni a los demás plugins.
4. La pantalla muestra el registro mientras corre y, al terminar, los archivos para descargar.
5. Las entradas y los resultados se guardan en el almacenamiento (`toolkit-ti/plugins/<slug>/<ejecución>/…`), con **nombres seguros**: caracteres como `( )` o acentos se cambian por `_`, porque rompen la liga de descarga.
6. La ejecución queda en el **historial**: quién la corrió, cuándo, cuánto tardó, su registro y su resultado.

---

## 10. Permisos

| Rol | Ve plugins e historial | Ejecuta | Activa o desactiva |
|---|---|---|---|
| Super admin | Sí | Sí | Sí |
| `toolkit-ti:dueno` | Sí | Sí | Sí |
| `toolkit-ti:colaborador` | Sí | Sí | Sí |
| `toolkit-ti:lector` | Sí | No | No |

Un plugin **desactivado** se ve en gris y no se puede ejecutar.

---

## 11. Pendientes del motor

- **Programados:** ejecución por horario (por ejemplo, el día 3 de cada mes a las 8:00).
- **Por correo:** ejecución al llegar un correo que cumpla una regla (remitente, asunto).
- **Limpieza del historial:** conservar las últimas 30 ejecuciones de cada plugin con menos de 90 días (ajustable por plugin en su ficha), borrando también sus archivos.
- **Reacomodo:** mover el motor a `app/motor/` y crear `app/kit/`.

---

## 12. Buenas prácticas

- **Sin credenciales en el código.** Si un plugin necesita una llave o contraseña, va en el `.env` del servicio y se lee con `app.config`.
- **Valida la entrada al principio** y falla con un mensaje claro: es mejor "Falta la columna RFC" que un error de Python a la mitad.
- **Usa `log()` para contar lo que pasa:** cuántas filas leíste, cuántas descartaste y por qué, qué archivo generaste.
- **Nombra bien el resultado:** `layout_sat_AGIM_q20.xlsx` dice más que `resultado.xlsx`.
- **No modifiques los archivos de entrada:** escribe siempre en `salida`.
- **Sin datos reales en las pruebas:** las muestras de `tests/plugins/muestras/` son inventadas.

---

## 13. Crear un plugin, paso a paso

1. Copia `app/plugins/_plantilla.py` con su slug (por ejemplo, `excel_layout_sat.py`), o crea su carpeta si va a crecer.
2. Llena la `FICHA` y escribe `ejecutar()`. Usa el `kit` para lo genérico.
3. Agrega su prueba en `tests/plugins/`, con un archivo de muestra sin datos reales.
4. Haz commit en la rama `feature/…` del cambio.
5. Reconstruye y levanta el servicio:
   ```bash
   cd infrastructure/docker
   docker compose build -q toolkit-ti-service
   docker compose up -d --force-recreate toolkit-ti-service
   ```
6. Entra a **Toolkit TI → Plugins**: el plugin aparece solo. Pruébalo con el archivo de muestra.
