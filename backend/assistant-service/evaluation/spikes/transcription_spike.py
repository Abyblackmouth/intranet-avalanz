# ----------------------------------------------------------------------
# Prueba aislada (spike) de transcripcion con Whisper, version 2
# Transcribe una ventana del video que empieza en la primera
# intervencion registrada por Teams y la compara contra el texto de
# Teams de esa misma ventana, sin nombres ni horas. Mide tiempo, RAM
# del proceso y WER. Uso:
#   python transcription_spike.py <video> <teams.docx> [modelo] [minutos]
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# faster-whisper transcribe en CPU (CTranslate2, sin PyTorch) y
# decode_audio extrae el audio del video a 16 kHz; python-docx lee la
# transcripcion de Teams y jiwer calcula el WER.
# ----------------------------------------------------------------------
import json
import re
import resource
import sys
import time
from pathlib import Path

import jiwer
from docx import Document
from faster_whisper import WhisperModel, decode_audio

# ----------------------------------------------------------------------
# Parametros
# Rutas dentro del contenedor de prueba, modelo y tamano de la ventana.
# ----------------------------------------------------------------------
VIDEO = Path(sys.argv[1])
REFERENCIA = Path(sys.argv[2])
MODELO = sys.argv[3] if len(sys.argv) > 3 else "small"
VENTANA_MIN = float(sys.argv[4]) if len(sys.argv) > 4 else 10.0
SALIDA = Path("/resultados")
CARPETA_MODELOS = "/modelos/whisper"
FRECUENCIA = 16000

# Parrafo de Teams: "Nombre Apellido   13:58Texto dicho"
PATRON_TEAMS = re.compile(
    r"^(?P<hablante>[^\d\n\t]+?)[ \t\n]+(?P<tiempo>\d{1,2}:\d{2}(?::\d{2})?)\s*(?P<texto>.*)$",
    re.DOTALL,
)


# ----------------------------------------------------------------------
# Conversion de una marca de Teams (m:ss o h:mm:ss) a segundos
# ----------------------------------------------------------------------
def a_segundos(marca: str) -> int:
    total = 0
    for parte in marca.split(":"):
        total = total * 60 + int(parte)
    return total


# ----------------------------------------------------------------------
# Lectura de la transcripcion de Teams
# Cada parrafo con formato de intervencion se separa en segundo,
# hablante y texto. El encabezado (titulo, fecha, duracion) no coincide
# con el patron y queda fuera solo.
# ----------------------------------------------------------------------
def leer_teams(ruta: Path) -> list[tuple[int, str, str]]:
    intervenciones = []
    for parrafo in Document(str(ruta)).paragraphs:
        m = PATRON_TEAMS.match(parrafo.text.strip())
        if m:
            intervenciones.append(
                (a_segundos(m["tiempo"]), m["hablante"].strip(), " ".join(m["texto"].split()))
            )
    return intervenciones


# ----------------------------------------------------------------------
# Normalizacion para el WER
# Minusculas, sin puntuacion y con espacios compactados: se comparan
# palabras, no formato.
# ----------------------------------------------------------------------
def normalizar(texto: str) -> str:
    texto = re.sub(r"[^\w\s]", " ", texto.lower())
    return re.sub(r"\s+", " ", texto).strip()


# ----------------------------------------------------------------------
# Formato de tiempo mm:ss
# ----------------------------------------------------------------------
def mmss(segundos: float) -> str:
    return f"{int(segundos // 60):02d}:{int(segundos % 60):02d}"


# ----------------------------------------------------------------------
# Ventana de evaluacion
# Empieza en la primera intervencion de Teams y dura VENTANA_MIN. El
# texto de referencia es solo lo que Teams registro dentro de ella.
# ----------------------------------------------------------------------
intervenciones = leer_teams(REFERENCIA)
if not intervenciones:
    muestra = [repr(x.text[:70]) for x in Document(str(REFERENCIA)).paragraphs if x.text.strip()][:6]
    print(f"TEST: ERROR formato de Teams no reconocido | muestra={' || '.join(muestra)}")
    sys.exit(1)
inicio_s = intervenciones[0][0]
fin_s = inicio_s + VENTANA_MIN * 60
en_ventana = [i for i in intervenciones if inicio_s <= i[0] < fin_s]
referencia = " ".join(texto for _, _, texto in en_ventana)
hablantes = sorted({hablante for _, hablante, _ in en_ventana})

# ----------------------------------------------------------------------
# Carga del modelo
# int8 reduce memoria y acelera en CPU; cpu_threads coincide con los
# nucleos asignados al contenedor.
# ----------------------------------------------------------------------
inicio = time.perf_counter()
modelo = WhisperModel(MODELO, device="cpu", compute_type="int8",
                      cpu_threads=2, download_root=CARPETA_MODELOS)
carga_s = time.perf_counter() - inicio

# ----------------------------------------------------------------------
# Audio de la ventana
# Se decodifica el audio completo a 16 kHz y se recorta la ventana; el
# audio completo se libera de inmediato.
# ----------------------------------------------------------------------
audio = decode_audio(str(VIDEO), sampling_rate=FRECUENCIA)
duracion_total_min = len(audio) / FRECUENCIA / 60
fragmento = audio[int(inicio_s * FRECUENCIA):int(fin_s * FRECUENCIA)]
del audio
ventana_s = len(fragmento) / FRECUENCIA

# ----------------------------------------------------------------------
# Transcripcion de la ventana
# transcribe() regresa un generador: el trabajo real ocurre al
# convertirlo en lista. vad_filter omite los silencios.
# ----------------------------------------------------------------------
inicio = time.perf_counter()
segmentos, _ = modelo.transcribe(fragmento, language="es",
                                 beam_size=5, vad_filter=True)
segmentos = list(segmentos)
transcripcion_s = time.perf_counter() - inicio

# ----------------------------------------------------------------------
# Metricas
# Factor contra la ventana y contra los segundos con voz; RAM maxima del
# proceso (ru_maxrss viene en KB en Linux); WER contra Teams sin nombres
# ni horas.
# ----------------------------------------------------------------------
voz_s = sum(s.end - s.start for s in segmentos)
hipotesis = " ".join(s.text for s in segmentos)
wer = jiwer.wer(normalizar(referencia), normalizar(hipotesis))
ram_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

# ----------------------------------------------------------------------
# Resultados
# Transcripcion con horas reales del video y resumen en JSON.
# ----------------------------------------------------------------------
lineas = [f"[{mmss(inicio_s + s.start)} - {mmss(inicio_s + s.end)}] {s.text.strip()}"
          for s in segmentos]
nombre = f"{VIDEO.stem}.v2-{MODELO}"
(SALIDA / f"{nombre}.txt").write_text("\n".join(lineas), encoding="utf-8")

resumen = {
    "modelo": MODELO,
    "video_total_min": round(duracion_total_min, 1),
    "ventana": f"{mmss(inicio_s)}-{mmss(inicio_s + ventana_s)}",
    "voz_min": round(voz_s / 60, 2),
    "carga_modelo_s": round(carga_s, 1),
    "transcripcion_min": round(transcripcion_s / 60, 2),
    "factor_ventana": round(transcripcion_s / ventana_s, 2),
    "factor_voz": round(transcripcion_s / voz_s, 2) if voz_s else None,
    "ram_proceso_mb": round(ram_mb),
    "wer": round(wer, 3),
    "palabras_teams": len(normalizar(referencia).split()),
    "palabras_whisper": len(normalizar(hipotesis).split()),
    "hablantes": hablantes,
}
(SALIDA / f"{nombre}.json").write_text(
    json.dumps(resumen, ensure_ascii=False, indent=2), encoding="utf-8")

print(f"TEST: video={resumen['video_total_min']}min | ventana={resumen['ventana']} | "
      f"voz={resumen['voz_min']}min | transcripcion={resumen['transcripcion_min']}min | "
      f"factor_ventana={resumen['factor_ventana']}x | factor_voz={resumen['factor_voz']}x | "
      f"ram={resumen['ram_proceso_mb']}MB | wer={resumen['wer']} | "
      f"palabras={resumen['palabras_teams']}/{resumen['palabras_whisper']} | "
      f"hablantes={len(hablantes)}")
