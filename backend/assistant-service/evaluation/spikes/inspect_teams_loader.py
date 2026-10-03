# ----------------------------------------------------------------------
# Inspeccion del cargador de transcripciones sobre las fuentes reales
# Por archivo: intervenciones, hablantes, palabras, ultimo minuto y los
# parrafos que no se reconocieron (deberian ser solo el encabezado).
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from pathlib import Path

from docx import Document

from app.pipeline.loaders.teams_transcript_loader import TeamsTranscriptLoader
from app.pipeline.loaders.transcript_rules import parse_teams_paragraph

loader = TeamsTranscriptLoader()
total_intervenciones = total_no_reconocidos = 0

for ruta in sorted(Path("/fuentes").rglob("*.transcripcion.docx")):
    bloques = loader.load(ruta)
    parrafos = [p.text.strip() for p in Document(str(ruta)).paragraphs if p.text.strip()]
    no_reconocidos = [p for p in parrafos if parse_teams_paragraph(p) is None]
    hablantes = {b.speaker for b in bloques}
    palabras = sum(len(b.text.split()) for b in bloques)
    ultima = bloques[-1].location.label() if bloques else "-"

    total_intervenciones += len(bloques)
    total_no_reconocidos += len(no_reconocidos)

    print(f"{ruta.name} | intervenciones={len(bloques)} | hablantes={len(hablantes)} | "
          f"palabras={palabras} | ultima={ultima} | no_reconocidos={len(no_reconocidos)}")
    for parrafo in no_reconocidos[:5]:
        print(f"   NO_RECONOCIDO: {parrafo[:90]!r}")
    for bloque in bloques[:2]:
        print(f"   {bloque.location.label()} | {bloque.speaker}: {bloque.text[:80]}")

print(f"TEST: intervenciones={total_intervenciones} | no_reconocidos={total_no_reconocidos}")
