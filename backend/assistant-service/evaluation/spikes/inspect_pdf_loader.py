# ----------------------------------------------------------------------
# Inspeccion del cargador de PDF sobre las fuentes reales
# Muestra por documento cuantos bloques, tablas y secciones extrajo, y
# verifica que no se hayan colado encabezados ni lineas de indice.
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
from pathlib import Path

from app.domain.models import BlockKind
from app.pipeline.loaders.pdf_loader import PdfLoader

loader = PdfLoader()
total_bloques = total_tablas = total_residuos = 0

for ruta in sorted(Path("/fuentes").rglob("*.pdf")):
    bloques = loader.load(ruta)
    tablas = [b for b in bloques if b.kind == BlockKind.TABLE]
    textos = [b for b in bloques if b.kind == BlockKind.TEXT]
    paginas = sorted({b.location.page for b in bloques})
    secciones = list(dict.fromkeys(" > ".join(b.heading_path) for b in bloques if b.heading_path))
    largos = [len(b.text) for b in textos]

    # Residuos: encabezados repetidos o lineas de indice que no se filtraron
    residuos = sum(1 for b in bloques
                   if "Manual de Autocapacitación —" in b.text or "......" in b.text
                   or (b.heading_path and b.heading_path[0].lower() in ("contenido", "control de versiones")))

    total_bloques += len(bloques)
    total_tablas += len(tablas)
    total_residuos += residuos

    print(f"{ruta.name} | bloques={len(bloques)} | texto={len(textos)} | tablas={len(tablas)} | "
          f"paginas={paginas[0]}-{paginas[-1]} | secciones={len(secciones)} | "
          f"largo_prom={sum(largos) // max(len(largos), 1)} | largo_max={max(largos, default=0)} | residuos={residuos}")
    for seccion in secciones[:4]:
        print(f"   SECCION: {seccion[:110]}")
    if textos:
        print(f"   PRIMER_TEXTO p{textos[0].location.page}: {textos[0].text[:130]}")
    if tablas:
        print(f"   PRIMERA_TABLA p{tablas[0].location.page}: {tablas[0].text.splitlines()[0][:130]}")

print(f"TEST: bloques={total_bloques} | tablas={total_tablas} | residuos={total_residuos}")
