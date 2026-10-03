# ----------------------------------------------------------------------
# Inspeccion del cargador de PowerPoint
# Lee las presentaciones de fuentes y las de ensayo (pruebas). Por
# archivo: bloques, diapositivas con titulo, con notas y tablas, y una
# muestra de las primeras diapositivas.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from pathlib import Path

from app.domain.models import BlockKind
from app.pipeline.loaders.pptx_loader import PowerPointLoader
from app.pipeline.loaders.pptx_rules import NOTES_LABEL

loader = PowerPointLoader()
rutas = sorted(Path("/fuentes").rglob("*.pptx")) + sorted(Path("/pruebas").rglob("*.pptx"))
total_bloques = 0

for ruta in rutas:
    bloques = loader.load(ruta)
    textos = [b for b in bloques if b.kind == BlockKind.TEXT]
    tablas = [b for b in bloques if b.kind == BlockKind.TABLE]
    con_titulo = sum(1 for b in textos if b.heading_path)
    con_notas = sum(1 for b in textos if NOTES_LABEL in b.text)
    largos = [len(b.text) for b in textos]
    total_bloques += len(bloques)

    origen = "ENSAYO" if str(ruta).startswith("/pruebas") else "FUENTE"
    print(f"{origen} {ruta.name} | bloques={len(bloques)} | diapositivas={len(textos)} | "
          f"con_titulo={con_titulo} | con_notas={con_notas} | tablas={len(tablas)} | "
          f"largo_prom={sum(largos) // max(len(largos), 1)}")
    for bloque in textos[:3]:
        titulo = bloque.heading_path[0] if bloque.heading_path else "(sin titulo)"
        print(f"   {bloque.location.label()} | {titulo[:50]} | {bloque.text.replace(chr(10), ' / ')[:100]}")

print(f"TEST: presentaciones={len(rutas)} | bloques={total_bloques}")
