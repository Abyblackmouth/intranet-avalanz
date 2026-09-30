"""PDFs de la etapa de Arranque. El cronograma no se genera: el PM lo sube en su formato (MS Project)."""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.control_cambios.pdf_dictamen import AZUL, BORDE, FONDO, GRIS, _logo


def _estilos():
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1e293b"))
    return {
        "body": body,
        "small": ParagraphStyle("s", parent=body, fontSize=8.5, leading=12, textColor=GRIS),
        "right": ParagraphStyle("r", parent=body, fontSize=8.5, leading=12, textColor=GRIS, alignment=2),
        "h1": ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0f172a")),
        "h2": ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=AZUL, spaceBefore=12, spaceAfter=4),
        "label": ParagraphStyle("l", parent=body, fontSize=8.5, textColor=GRIS),
        "bold": ParagraphStyle("bo", parent=body, fontName="Helvetica-Bold"),
    }


def _p(text, style):
    return Paragraph(escape(str(text) if text not in (None, "") else "—").replace("\n", "<br/>"), style)


def _grid(t, header=False):
    style = [("GRID", (0, 0), (-1, -1), 0.6, BORDE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
             ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
    style.append(("BACKGROUND", (0, 0), (-1, 0), FONDO) if header else ("BACKGROUND", (0, 0), (0, -1), FONDO))
    t.setStyle(TableStyle(style))
    return t


def _kv(rows, st, widths=(5 * cm, 12 * cm)):
    return _grid(Table([[_p(k, st["label"]), _p(v, st["body"])] for k, v in rows], colWidths=list(widths)))


def _doc(buf, titulo):
    return SimpleDocTemplate(buf, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm,
                             topMargin=1.3 * cm, bottomMargin=1.3 * cm, title=titulo)


def _encabezado(story, st, d, titulo):
    logo = _logo()
    left = Image(str(logo), width=3.4 * cm, height=1.3 * cm, kind="proportional") if logo else Paragraph("<b>Grupo Avalanz</b>", st["h2"])
    head = Table([[left, Paragraph(f'<font color="#1a4fa0"><b>{escape(d["folio"])}</b></font> · v{d["version"]}<br/>Emitido {escape(d["fecha_emision"])}', st["right"])]],
                 colWidths=[9 * cm, 8 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6), HRFlowable(width="100%", thickness=2, color=AZUL), Spacer(1, 12),
              Paragraph(titulo, st["h1"]), Spacer(1, 2), _p(d["titulo"], st["small"]), Spacer(1, 12)]


def _firmas(story, st, firmantes):
    celdas = [_p(f"{n}\n{r}", st["small"]) for n, r in firmantes]
    t = Table([celdas], colWidths=[8 * cm] * len(celdas), hAlign="CENTER")
    t.setStyle(TableStyle([*[("LINEABOVE", (i, 0), (i, 0), 0.8, colors.black) for i in range(len(celdas))],
                           ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    story.append(KeepTogether([Paragraph("Firmas", st["h2"]), Spacer(1, 30), t]))


def generar_pdf_plan_breve(d: dict) -> bytes:
    buf, st, story = io.BytesIO(), _estilos(), []
    _encabezado(story, st, d, "Plan de arranque")
    story.append(_kv([
        ("Solicitante", d["solicitante"]), ("Alcance", d["alcance"]),
        ("Prioridad", d["prioridad"]), ("Entrega comprometida", d["fecha_compromiso_label"]),
        ("Inicio de desarrollo", d["fecha_inicio_label"]), ("Responsable", d["responsable"]),
    ], st))
    story += [Paragraph("Objetivo", st["h2"]), _p(d["objetivo"], st["body"])]
    story.append(Paragraph("Entregables", st["h2"]))
    rows = [[_p("#", st["bold"]), _p("Entregable", st["bold"]), _p("Fecha", st["bold"])]]
    for i, e in enumerate(d["entregables"], 1):
        rows.append([_p(i, st["body"]), _p(e["descripcion"], st["body"]), _p(e.get("fecha_label") or "—", st["body"])])
    story.append(_grid(Table(rows, colWidths=[1.2 * cm, 12.3 * cm, 3.5 * cm]), header=True))
    if d.get("consideraciones"):
        story += [Paragraph("Consideraciones", st["h2"]), _p(d["consideraciones"], st["body"])]
    _firmas(story, st, [(d["emitido_por"], "Project Manager"), (d["solicitante_nombre"], "Solicitante (enterado)")])
    _doc(buf, f"Plan de arranque {d['folio']}").build(story)
    return buf.getvalue()
