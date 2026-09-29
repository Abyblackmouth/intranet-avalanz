"""PDF del dictamen de revision de un Control de Cambios."""
import io
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import HRFlowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

AZUL = colors.HexColor("#1a4fa0")
GRIS = colors.HexColor("#64748b")
BORDE = colors.HexColor("#e2e8f0")
FONDO = colors.HexColor("#f8fafc")

RESULTADO = {
    "procede": ("Procede", "#15803d"),
    "ajuste_alcance": ("Procede con ajuste de alcance", "#b45309"),
    "no_procede": ("No procede", "#b91c1c"),
}
NIVEL = {"alto": "Alto", "medio": "Medio", "bajo": "Bajo"}
ESFUERZO = {"bajo": "Bajo (menos de 1 semana)", "medio": "Medio (1 a 3 semanas)", "alto": "Alto (mas de 3 semanas)"}


def _logo():
    static = Path(__file__).resolve().parents[2] / "static"
    if not static.exists():
        return None
    for name in ("logo.png", "logo_200.png", "logo-avalanz.png"):
        if (static / name).exists():
            return static / name
    pngs = sorted(static.glob("*.png"))
    return pngs[0] if pngs else None


def generar_pdf_dictamen(d: dict) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=1.6 * cm, bottomMargin=1.6 * cm, title=f"Dictamen {d['folio']}")
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=9.5, leading=13.5, textColor=colors.HexColor("#1e293b"))
    small = ParagraphStyle("s", parent=body, fontSize=8.5, leading=12, textColor=GRIS)
    right = ParagraphStyle("r", parent=small, alignment=2)
    h1 = ParagraphStyle("h1", parent=body, fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=colors.HexColor("#0f172a"))
    h2 = ParagraphStyle("h2", parent=body, fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=AZUL, spaceBefore=12, spaceAfter=4)
    label = ParagraphStyle("l", parent=body, fontSize=8.5, textColor=GRIS)

    def p(text, style=body):
        return Paragraph(escape(text or "—").replace("\n", "<br/>"), style)

    def tabla(rows, widths=(5 * cm, 12 * cm)):
        t = Table([[p(k, label), p(v)] for k, v in rows], colWidths=list(widths))
        t.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.6, BORDE), ("BACKGROUND", (0, 0), (0, -1), FONDO),
            ("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        return t

    story = []
    logo = _logo()
    left = Image(str(logo), width=3.4 * cm, height=1.3 * cm, kind="proportional") if logo else Paragraph("<b>Grupo Avalanz</b>", h2)
    head = Table([[left, Paragraph(f'<font color="#1a4fa0"><b>{escape(d["folio"])}</b></font><br/>Emitido {escape(d["fecha_emision"])}', right)]],
                 colWidths=[9 * cm, 8 * cm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    story += [head, Spacer(1, 6), HRFlowable(width="100%", thickness=2, color=AZUL), Spacer(1, 12)]
    story += [Paragraph("Dictamen de revisión", h1), Spacer(1, 2), p(d["titulo"], small), Spacer(1, 10)]

    res_txt, res_color = RESULTADO[d["resultado"]]
    box = Table([[Paragraph(f"<b>Resultado: {res_txt}</b>", ParagraphStyle("res", parent=body, fontSize=11, textColor=colors.HexColor(res_color)))]], colWidths=[17 * cm])
    box.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), 1.5, colors.HexColor(res_color)), ("TOPPADDING", (0, 0), (-1, -1), 7),
                             ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    story += [box, Spacer(1, 12)]

    story.append(tabla([
        ("Solicitante", d["solicitante"]), ("Alcance", d["alcance"]),
        ("Impacto en la operación", NIVEL.get(d["impacto"], d["impacto"])),
        ("Esfuerzo estimado", ESFUERZO.get(d["esfuerzo"], d["esfuerzo"])), ("Revisó", d["reviso"]),
    ]))

    story += [Paragraph("Factibilidad técnica y funcional", h2), p(d["factibilidad"])]
    if d.get("riesgos"):
        story += [Paragraph("Riesgos o dependencias", h2), p(d["riesgos"])]

    if d["resultado"] == "ajuste_alcance":
        story += [Paragraph("Ajuste de alcance", h2), tabla([
            ("Alcance original", d.get("alcance_original")), ("Alcance propuesto", d.get("alcance_propuesto")),
            ("Motivo del ajuste", d.get("motivo_ajuste")),
        ]), Spacer(1, 4), p("Este ajuste requiere la aprobación del solicitante original antes de continuar.", small)]
    if d["resultado"] == "no_procede":
        story += [Paragraph("Motivo del rechazo", h2), tabla([("Categoría", d.get("motivo_rechazo_categoria"))]),
                  Spacer(1, 4), p(d.get("motivo_rechazo"))]

    story.append(Paragraph("Sesiones de revisión", h2))
    if d.get("sesiones"):
        story.append(tabla([(f'{s["fecha"]}\n{s.get("tipo") or ""}'.strip(),
                             f'{s["notas"]}\nParticipantes: {s.get("participantes") or "—"}') for s in d["sesiones"]],
                           widths=(4 * cm, 13 * cm)))
    else:
        story.append(p("Sin sesiones registradas.", small))

    if d.get("comentarios"):
        story += [Paragraph("Comentarios para el solicitante", h2), p(d["comentarios"])]
    story += [Paragraph("Anexos", h2), p(", ".join(d.get("anexos") or []) or "Sin anexos.", small if not d.get("anexos") else body)]

    firmas = Table([[p(f'{d["reviso_nombre"]}\n{d.get("reviso_rol", "Project Manager")}', small), p(f'{d["solicitante_nombre"]}\nSolicitante (enterado)', small)]],
                   colWidths=[8 * cm, 8 * cm], hAlign="CENTER")
    firmas.setStyle(TableStyle([("LINEABOVE", (0, 0), (0, 0), 0.8, colors.black), ("LINEABOVE", (1, 0), (1, 0), 0.8, colors.black),
                                ("ALIGN", (0, 0), (-1, -1), "CENTER"), ("LEFTPADDING", (0, 0), (-1, -1), 14), ("RIGHTPADDING", (0, 0), (-1, -1), 14)]))
    story += [Spacer(1, 46), firmas]

    doc.build(story)
    return buf.getvalue()
