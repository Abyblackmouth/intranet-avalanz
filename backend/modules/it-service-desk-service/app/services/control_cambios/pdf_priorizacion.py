"""PDF de la etapa de priorizacion de un Control de Cambios."""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.control_cambios.pdf_dictamen import AZUL, BORDE, FONDO, GRIS, _logo


def generar_pdf_priorizacion(d: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=1.3 * cm, bottomMargin=1.3 * cm, title=f"Priorizacion {d['folio']}")
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1e293b"))
    small = ParagraphStyle("s", parent=body, fontSize=8.5, leading=12, textColor=GRIS)
    right = ParagraphStyle("r", parent=small, alignment=2)
    h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=AZUL, spaceBefore=12, spaceAfter=4)
    label = ParagraphStyle("l", parent=body, fontSize=8.5, textColor=GRIS)
    bold = ParagraphStyle("bo", parent=body, fontName="Helvetica-Bold")

    def p(text, style=body):
        return Paragraph(escape(text or "—").replace("\n", "<br/>"), style)

    def grid(t, header=False):
        style = [("GRID", (0, 0), (-1, -1), 0.6, BORDE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                 ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]
        style.append(("BACKGROUND", (0, 0), (-1, 0), FONDO) if header else ("BACKGROUND", (0, 0), (0, -1), FONDO))
        t.setStyle(TableStyle(style))
        return t

    story = []
    logo = _logo()
    left = Image(str(logo), width=3.4 * cm, height=1.3 * cm, kind="proportional") if logo else Paragraph("<b>Grupo Avalanz</b>", h2)
    head = Table([[left, Paragraph(f'<font color="#1a4fa0"><b>{escape(d["folio"])}</b></font><br/>Emitido {escape(d["fecha_emision"])}', right)]],
                 colWidths=[9 * cm, 8 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6), HRFlowable(width="100%", thickness=2, color=AZUL), Spacer(1, 12)]
    story += [Paragraph("Priorización", h1), Spacer(1, 2), p(d["titulo"], small), Spacer(1, 10)]

    box = Table([[Paragraph(f'<b>Prioridad {escape(d["prioridad_codigo"])} · {escape(d["urgencia_label"])}   |   Entrega comprometida: {escape(d["fecha_compromiso_label"])}</b>',
                            ParagraphStyle("res", parent=body, fontSize=11, textColor=AZUL))]], colWidths=[17 * cm])
    box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1.5, AZUL), ("TOPPADDING", (0, 0), (-1, -1), 7),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    story += [box, Spacer(1, 12)]

    story.append(grid(Table([[p(k, label), p(v)] for k, v in [
        ("Se gestiona como", d.get("clasificacion_label")),
        ("Solicitante", d["solicitante"]), ("Alcance", d["alcance"]),
        ("Desarrolla", d["desarrolla_label"]), ("Responsable", d.get("responsable_desarrollo")),
        ("Priorizó", d["reviso"]),
    ]], colWidths=[5 * cm, 12 * cm])))

    story.append(Paragraph("Datos del solicitante y definición de Gerencia de Proyectos", h2))
    rows = [[p("Dato", bold), p("Indicó el solicitante", bold), p("Definido", bold), p("Resultado", bold)]]
    for nombre, sol, fin, est in d["comparativo"]:
        rows.append([p(nombre), p(sol), p(fin), p("Confirmado" if est == "confirmado" else "Ajustado por el PM")])
    story.append(grid(Table(rows, colWidths=[4 * cm, 4.5 * cm, 4.5 * cm, 4 * cm]), header=True))

    if d.get("gobierno"):
        story.append(Paragraph("Roles de gobierno del proyecto", h2))
        story.append(grid(Table([[p(k, label), p(v)] for k, v in d["gobierno"]], colWidths=[5 * cm, 12 * cm])))

    if d.get("notas_comite"):
        story += [Paragraph("Notas para el Comité Directivo", h2), p(d["notas_comite"])]
    story += [Paragraph("Anexos", h2), p(", ".join(d.get("anexos") or []) or "Sin anexos.", small if not d.get("anexos") else body)]

    firmas = Table([[p(f'{d["reviso_nombre"]}\n{d["reviso_rol"]}', small), p(f'{d["solicitante_nombre"]}\nSolicitante (enterado)', small)]],
                   colWidths=[8 * cm, 8 * cm], hAlign="CENTER")
    firmas.setStyle(TableStyle([("LINEABOVE", (0, 0), (0, 0), 0.8, colors.black), ("LINEABOVE", (1, 0), (1, 0), 0.8, colors.black),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    # Titulo + lineas de firma en un solo bloque: nunca se parte entre paginas
    story.append(KeepTogether([Paragraph("Firmas", h2), Spacer(1, 30), firmas]))
    doc.build(story)
    return buf.getvalue()
