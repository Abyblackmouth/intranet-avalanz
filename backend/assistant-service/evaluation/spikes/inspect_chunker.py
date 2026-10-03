# ----------------------------------------------------------------------
# Inspeccion del flujo de lectura completo sobre las fuentes reales
# Cargadores + fragmentador. Muestra por tipo de fragmento la cantidad,
# los tamanos y su distribucion, mas una muestra de cada tipo. Usa " ~ "
# como separador porque no aparece en los documentos.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from app.domain.models import BlockKind, Document, parse_source_path, title_from_filename
from app.pipeline.chunking.structure_chunker import StructureChunker
from app.pipeline.loaders.docx_loader import WordLoader
from app.pipeline.loaders.pdf_loader import PdfLoader
from app.pipeline.loaders.pptx_loader import PowerPointLoader
from app.pipeline.loaders.teams_transcript_loader import TeamsTranscriptLoader

FUENTES = Path("/fuentes")
# El orden importa: la transcripcion de Teams va antes que el Word general
CARGADORES = [TeamsTranscriptLoader(), WordLoader(), PdfLoader(), PowerPointLoader()]
chunker = StructureChunker()
por_tipo = defaultdict(list)
muestras = {}

for ruta in sorted(FUENTES.rglob("*")):
    if not ruta.is_file():
        continue
    cargador = next((c for c in CARGADORES if c.supports(ruta)), None)
    if cargador is None:
        continue
    relativa = str(ruta.relative_to(FUENTES))
    modulo, tema = parse_source_path(relativa)
    documento = Document(
        id=Document.id_for(relativa), relative_path=relativa, module=modulo, topic=tema,
        title=title_from_filename(ruta.name), kind=cargador.kind, checksum="",
        size_bytes=ruta.stat().st_size, modified_at=datetime.fromtimestamp(ruta.stat().st_mtime),
    )
    fragmentos = chunker.split(documento, cargador.load(ruta))
    print(f"{ruta.name} ~ fragmentos={len(fragmentos)}")
    for f in fragmentos:
        por_tipo[f.kind].append(f)
        muestras.setdefault(f.kind, f)

limite = chunker.rules.max_chars
total = 0
print("== POR TIPO ==")
for tipo, lista in por_tipo.items():
    largos = [len(f.text) for f in lista]
    rangos = {
        "<300": sum(1 for x in largos if x < 300),
        "300-800": sum(1 for x in largos if 300 <= x < 800),
        "800-1200": sum(1 for x in largos if 800 <= x < 1200),
        "1200-1500": sum(1 for x in largos if 1200 <= x <= 1500),
        ">1500": sum(1 for x in largos if x > 1500),
    }
    total += len(lista)
    print(f"{tipo.value} ~ fragmentos={len(lista)} ~ promedio={sum(largos) // len(largos)} ~ "
          f"min={min(largos)} ~ max={max(largos)} ~ rangos={rangos}")

print("== MUESTRAS ==")
for tipo, f in muestras.items():
    texto = f.text.replace("\n", " / ")[:140]
    print(f"{tipo.value} ~ {f.location.label() or 'sin ubicacion'} ~ {f.context_header[:80]} ~ {texto}")

excedidos = sum(1 for lista in por_tipo.values() for f in lista if len(f.text) > limite)
print(f"TEST: fragmentos={total} ~ excedidos={excedidos}")
