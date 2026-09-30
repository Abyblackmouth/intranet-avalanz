"""Logo de Avalanz para los documentos, recortado automaticamente.

El PNG original trae mucho margen (el dibujo ocupa ~60% del alto), asi que en
los documentos se veia chico. Aqui se recorta al dibujo real una sola vez por
arranque. Si algo falla, se usa el original."""
import io
from functools import lru_cache
from pathlib import Path

LOGO_ORIGINAL = Path(__file__).resolve().parents[1] / "static" / "logo_avalanz.png"
LOGO_RECORTADO = Path("/tmp/logo_avalanz_recortado.png")
MARGEN = 0.02   # margen minimo alrededor del dibujo, como fraccion del lado mayor


@lru_cache(maxsize=1)
def logo_recortado_bytes() -> bytes:
    try:
        from PIL import Image, ImageChops
        im = Image.open(LOGO_ORIGINAL).convert("RGBA")
        dibujo = Image.eval(im.convert("L"), lambda v: 255 if v < 245 else 0)       # no casi blanco
        visible = im.split()[3].point(lambda a: 255 if a > 10 else 0)             # no transparente
        caja = ImageChops.multiply(dibujo, visible).getbbox()
        if caja:
            m = int(max(im.size) * MARGEN)
            caja = (max(0, caja[0] - m), max(0, caja[1] - m), min(im.width, caja[2] + m), min(im.height, caja[3] + m))
            im = im.crop(caja)
        salida = io.BytesIO()
        im.save(salida, format="PNG", optimize=True)
        return salida.getvalue()
    except Exception:
        return LOGO_ORIGINAL.read_bytes()


@lru_cache(maxsize=1)
def logo_recortado_path() -> str:
    """Ruta a un archivo con el logo recortado, para reportlab."""
    try:
        LOGO_RECORTADO.write_bytes(logo_recortado_bytes())
        return str(LOGO_RECORTADO)
    except Exception:
        return str(LOGO_ORIGINAL)
