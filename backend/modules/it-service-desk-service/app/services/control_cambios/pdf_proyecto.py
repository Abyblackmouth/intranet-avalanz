"""PDFs del paquete de Proyecto (Acta de Constitucion, Alcance, Resumen
ejecutivo y tecnico) con el formato de las plantillas de la organizacion:
titulo en mayusculas, nombre del proyecto entre corchetes, secciones
numeradas y 'Pagina X de Y' al pie."""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (HRFlowable, Image, KeepTogether, ListFlowable, ListItem, Paragraph,
                                SimpleDocTemplate, Spacer, Table, TableStyle)

from app.services.control_cambios.pdf_dictamen import AZUL, BORDE, FONDO, GRIS, _logo

TINTA = colors.HexColor("#0f172a")


def _st():
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=9.5, leading=13.8, textColor=colors.HexColor("#1e293b"))
    return {
        "body": body,
        "small": ParagraphStyle("s", parent=body, fontSize=8.5, leading=12, textColor=GRIS),
        "right": ParagraphStyle("r", parent=body, fontSize=8.5, leading=12, textColor=GRIS, alignment=2),
        "title": ParagraphStyle("t", parent=body, fontName="Helvetica-Bold", fontSize=17, leading=22, textColor=TINTA, alignment=TA_CENTER),
        "sub": ParagraphStyle("su", parent=body, fontSize=11, leading=15, textColor=AZUL, alignment=TA_CENTER),
        "h": ParagraphStyle("h", parent=body, fontName="Helvetica-Bold", fontSize=11, leading=15, textColor=AZUL, spaceBefore=14, spaceAfter=6),
        "h3": ParagraphStyle("h3", parent=body, fontName="Helvetica-Bold", fontSize=10, leading=14, textColor=TINTA, spaceBefore=8, spaceAfter=3),
        "label": ParagraphStyle("l", parent=body, fontSize=8.5, textColor=GRIS),
        "bold": ParagraphStyle("bo", parent=body, fontName="Helvetica-Bold"),
    }


def _p(text, style):
    return Paragraph(escape(str(text) if text not in (None, "") else "—").replace("\n", "<br/>"), style)


def _bullets(items, st):
    items = [i for i in (items or []) if str(i).strip()]
    if not items:
        return _p("—", st["small"])
    return ListFlowable([ListItem(_p(i, st["body"]), leftIndent=12) for i in items], bulletType="bullet", start="•", leftIndent=12)


def _contenido(texto, st):
    """Texto libre: las lineas que empiezan con '-' o '•' se vuelven vinetas."""
    out, buf = [], []
    for linea in (texto or "").split("\n"):
        l = linea.strip()
        if l[:1] in ("-", "•"):
            buf.append(l[1:].strip())
            continue
        if buf:
            out.append(_bullets(buf, st)); buf = []
        if l:
            out += [_p(l, st["body"]), Spacer(1, 4)]
    if buf:
        out.append(_bullets(buf, st))
    return out or [_p("—", st["small"])]


def _grid(rows, widths, st, header=True, first_col=False):
    data = [[c if not isinstance(c, str) else _p(c, st["bold"] if (header and i == 0) else st["body"]) for c in r] for i, r in enumerate(rows)]
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    style = [("GRID", (0, 0), (-1, -1), 0.6, BORDE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    if header:
        style.append(("BACKGROUND", (0, 0), (-1, 0), FONDO))
    if first_col:
        style.append(("BACKGROUND", (0, 0), (0, -1), FONDO))
    t.setStyle(TableStyle(style))
    return t


def _kv(rows, st):
    return _grid([[_p(k, st["label"]), _p(v, st["body"])] for k, v in rows], [5.5 * cm, 11.5 * cm], st, header=False, first_col=True)


def _canvas(pie):
    class _Numerado(rl_canvas.Canvas):
        def __init__(self, *a, **k):
            super().__init__(*a, **k)
            self._paginas = []

        def showPage(self):
            self._paginas.append(dict(self.__dict__))
            self._startPage()

        def save(self):
            total = len(self._paginas)
            for estado in self._paginas:
                self.__dict__.update(estado)
                self.setFont("Helvetica", 8)
                self.setFillColor(GRIS)
                self.drawString(2 * cm, 1.1 * cm, pie)
                self.drawRightString(letter[0] - 2 * cm, 1.1 * cm, f"Página {self._pageNumber} de {total}")
                rl_canvas.Canvas.showPage(self)
            rl_canvas.Canvas.save(self)
    return _Numerado


def _encabezado(story, st, d, titulo):
    logo = _logo()
    left = Image(str(logo), width=3.4 * cm, height=1.3 * cm, kind="proportional") if logo else Paragraph("<b>Grupo Avalanz</b>", st["h"])
    head = Table([[left, Paragraph(f'<font color="#1a4fa0"><b>{escape(d["folio"])}</b></font> · Versión {escape(d["version_label"])}<br/>Emitido {escape(d["fecha_emision"])}', st["right"])]],
                 colWidths=[9 * cm, 8 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6), HRFlowable(width="100%", thickness=2, color=AZUL), Spacer(1, 16),
              Paragraph(escape(titulo.upper()), st["title"]), Spacer(1, 4),
              Paragraph(f"[ {escape(d['titulo'])} ]", st["sub"]), Spacer(1, 14)]


def _build(d, nombre_doc, story):
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.3 * cm,
                            bottomMargin=1.8 * cm, title=f"{nombre_doc} {d['folio']}")
    doc.build(story, canvasmaker=_canvas(f"{d['folio']} · {nombre_doc}"))
    return buf.getvalue()


def generar_pdf_acta(d: dict) -> bytes:
    st, story = _st(), []
    _encabezado(story, st, d, "Acta de Constitución del Proyecto")

    story.append(Paragraph("1. INFORMACIÓN GENERAL DEL PROYECTO", st["h"]))
    story.append(_kv([
        ("Nombre del proyecto", d["titulo"]), ("Código / ID", d["codigo"]), ("Fecha de elaboración", d["fecha_emision"].split(" ")[0]),
        ("Versión", d["version_label"]), ("Patrocinador", d["patrocinador"]), ("Gerente del proyecto", d["gerente"]),
        ("Project Manager", d["pm"]), ("Área / Departamento", d["area"]), ("Estado", d["estado"]),
    ], st))

    story.append(Paragraph("2. OBJETIVO", st["h"]))
    story += [Paragraph("2.1 Objetivo del proyecto", st["h3"]), _p(d["objetivo"], st["body"]),
              Paragraph("2.2 Alcance (dentro del proyecto)", st["h3"]), _bullets(d["incluye"], st),
              Paragraph("2.3 Fuera del alcance (exclusiones)", st["h3"]), _bullets(d["excluye"], st)]

    story.append(Paragraph("3. STAKEHOLDERS Y ROLES", st["h"]))
    rows = [["Nombre", "Rol / Cargo", "Área", "Responsabilidad"]]
    rows += [[s.get("nombre", ""), s.get("rol", ""), s.get("area", ""), s.get("responsabilidad", "")] for s in d["stakeholders"]]
    story.append(_grid(rows, [4.6 * cm, 3.8 * cm, 3.2 * cm, 5.4 * cm], st))

    story.append(Paragraph("4. SUPUESTOS Y RESTRICCIONES", st["h"]))
    t = Table([[_p("Supuestos", st["bold"]), _p("Restricciones", st["bold"])],
               [_bullets(d["supuestos"], st), _bullets(d["restricciones"], st)]], colWidths=[8.5 * cm, 8.5 * cm])
    t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.6, BORDE), ("BACKGROUND", (0, 0), (-1, 0), FONDO), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                           ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    story.append(t)

    filas = [["Nombre", "Rol", "Firma", "Fecha"]] + [[n, r, "", "____/____/______"] for n, r in d["aprobaciones"]]
    ap = _grid(filas, [5.4 * cm, 3.6 * cm, 4.6 * cm, 3.4 * cm], st)
    ap.setStyle(TableStyle([("ROWHEIGHTS", (0, 1), (-1, -1), 1.4 * cm), ("VALIGN", (0, 1), (-1, -1), "MIDDLE")]))
    ap._argH = [None] + [1.4 * cm] * len(d["aprobaciones"])
    story.append(KeepTogether([Paragraph("5. APROBACIONES", st["h"]), ap]))
    return _build(d, "Acta de Constitución", story)


def generar_pdf_alcance(d: dict) -> bytes:
    st, story = _st(), []
    _encabezado(story, st, d, "Alcance del Proyecto")
    story.append(Paragraph("Visión general", st["h"]))
    story += _contenido(d["vision_general"], st)
    for s in d["secciones"]:
        story.append(Paragraph(escape(s["titulo"]), st["h"]))
        story += _contenido(s["contenido"], st)
    return _build(d, "Alcance del proyecto", story)


def generar_pdf_resumen(d: dict) -> bytes:
    st, story, n = _st(), [], 0
    _encabezado(story, st, d, "Resumen Ejecutivo y Técnico")

    def seccion(titulo):
        nonlocal n
        n += 1
        story.append(Paragraph(f"{n}. {titulo}", st["h"]))

    if d.get("resumen"):
        seccion("RESUMEN EJECUTIVO")
        story += _contenido(d["resumen"], st)
    if d["componentes"]:
        seccion("STACK TECNOLÓGICO")
        rows = [["Categoría", "Componente", "Tecnología", "Función específica"]]
        rows += [[c.get("categoria", ""), c.get("componente", ""), c.get("tecnologia", ""), c.get("funcion", "")] for c in d["componentes"]]
        story.append(_grid(rows, [3.2 * cm, 3.8 * cm, 3.4 * cm, 6.6 * cm], st))
    if d.get("arquitectura") or d.get("diagramas"):
        seccion("ARQUITECTURA DE ALTO NIVEL")
        story += _contenido(d.get("arquitectura"), st) if d.get("arquitectura") else []
        if d.get("diagramas"):
            story += [Spacer(1, 4), _p("Diagramas en el expediente: " + ", ".join(d["diagramas"]), st["small"])]
    if d["fases"]:
        seccion("FASES DE IMPLEMENTACIÓN")
        rows = [["Fase", "Nombre", "Componentes", "Entregable"]]
        rows += [[f.get("fase", ""), f.get("nombre", ""), f.get("componentes", ""), f.get("entregable", "")] for f in d["fases"]]
        story.append(_grid(rows, [1.6 * cm, 4.2 * cm, 6.2 * cm, 5 * cm], st))
    if d["infraestructura"]:
        seccion("REQUERIMIENTOS DE INFRAESTRUCTURA")
        rows = [["Recurso", "Especificación", "Propósito"]]
        rows += [[r.get("recurso", ""), r.get("especificacion", ""), r.get("proposito", "")] for r in d["infraestructura"]]
        story.append(_grid(rows, [4.2 * cm, 5.8 * cm, 7 * cm], st))
    return _build(d, "Resumen ejecutivo y técnico", story)
