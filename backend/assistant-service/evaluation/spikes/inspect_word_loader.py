# ----------------------------------------------------------------------
# Inspeccion del cargador de Word sobre las fuentes reales
# Por documento: bloques, tablas, secciones, primer texto y primera
# tabla. Residuo: texto de portada o de una seccion ignorada.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from pathlib import Path

from app.domain.models import BlockKind
from app.pipeline.loaders.common import is_ignored_title
from app.pipeline.loaders.docx_loader import WordLoader

loader = WordLoader()
total_bloques = total_tablas = total_residuos = 0

for ruta in sorted(Path("/fuentes").rglob("*.docx")):
    if not loader.supports(ruta):
        continue
    bloques = loader.load(ruta)
    tablas = [b for b in bloques if b.kind == BlockKind.TABLE]
    textos = [b for b in bloques if b.kind == BlockKind.TEXT]
    secciones = list(dict.fromkeys(" > ".join(b.heading_path) for b in bloques if b.heading_path))
    largos = [len(b.text) for b in textos]
    residuos = sum(1 for b in bloques
                   if not b.heading_path
                   or any(is_ignored_title(h) for h in b.heading_path)
                   or "MANUAL DE CAPACITACIÓN" in b.text.upper())

    total_bloques += len(bloques)
    total_tablas += len(tablas)
    total_residuos += residuos

    print(f"{ruta.name} | bloques={len(bloques)} | texto={len(textos)} | tablas={len(tablas)} | "
          f"secciones={len(secciones)} | largo_prom={sum(largos) // max(len(largos), 1)} | "
          f"largo_max={max(largos, default=0)} | residuos={residuos}")
    for seccion in secciones[:4]:
        print(f"   SECCION: {seccion[:110]}")
    if textos:
        print(f"   PRIMER_TEXTO: {textos[0].text[:130]}")
    if tablas:
        print(f"   PRIMERA_TABLA: {tablas[0].text.splitlines()[0][:130]}")

print(f"TEST: bloques={total_bloques} | tablas={total_tablas} | residuos={total_residuos}")
