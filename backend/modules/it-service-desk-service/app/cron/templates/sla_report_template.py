"""Plantilla HTML del reporte diario de SLA -- diseno propio, aprobado
con datos de muestra antes de conectarse a datos reales. No se envuelve
en base.html (se manda via /api/v1/email/raw-html).

v2: columnas reordenadas (Asignado a al final), folio sin salto de
linea, encabezado reducido, severidad/horas mas angostas para dar
espacio al titulo -- iteracion de diseno hecha directamente contra
capturas reales de Outlook Web."""

SEV_COLORS = {
    "S1": ("#fef2f2", "#b91c1c", "#dc2626"),
    "S2": ("#eff6ff", "#1a4fa0", "#1a4fa0"),
    "S3": ("#fff7ed", "#c2410c", "#f97316"),
    "S4": ("#f0fdf4", "#166534", "#22c55e"),
}


def _sev_badge(code: str) -> str:
    bg, tc, bc = SEV_COLORS.get(code, ("#f1f5f9", "#475569", "#94a3b8"))
    return (
        f'<span style="display:inline-block;padding:2px 7px;background-color:{bg};'
        f'color:{tc};border:1px solid {bc};font-family:Arial,Helvetica,sans-serif;'
        f'font-size:11px;font-weight:bold;">{code}</span>'
    )


def _ticket_row(folio: str, title: str, assigned_name: str, sev_code: str, hours_text: str, hours_color: str, is_last: bool) -> str:
    border = "" if is_last else "border-bottom:1px solid #e2e8f0;"
    title_safe = (title[:55] + "...") if len(title) > 55 else title
    return f'''
                <tr>
                  <td style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;color:#1e293b;white-space:nowrap;{border}">{folio}</td>
                  <td style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1e293b;{border}">{title_safe}</td>
                  <td class="hide-mobile" style="padding:10px;{border}">{_sev_badge(sev_code)}</td>
                  <td style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:{hours_color};font-weight:bold;text-align:right;white-space:nowrap;{border}">{hours_text}</td>
                  <td class="hide-mobile" style="padding:10px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#475569;{border}">{assigned_name}</td>
                </tr>'''


def _tabla_seccion(titulo: str, header_derecha: str, border_color: str, tickets: list) -> str:
    if not tickets:
        return ""
    filas = "".join(
        _ticket_row(t["folio"], t["title"], t["assigned_name"], t["sev_code"], t["hours_text"], t["hours_color"], i == len(tickets) - 1)
        for i, t in enumerate(tickets)
    )
    return f'''
          <tr>
            <td class="px-mobile" style="padding:24px 40px 4px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-left:4px solid {border_color};padding-left:10px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#0f172a;text-transform:uppercase;letter-spacing:0.03em;">{titulo}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding:8px 40px 0;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border:1.5px solid #cbd5e1;">
                <tr style="background-color:#f1f5f9;">
                  <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1;white-space:nowrap;">Folio</td>
                  <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1;">Titulo</td>
                  <td class="hide-mobile" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1;width:48px;">Sev.</td>
                  <td style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1;width:65px;text-align:right;white-space:nowrap;">{header_derecha}</td>
                  <td class="hide-mobile" style="padding:8px 10px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#64748b;text-transform:uppercase;border-bottom:1.5px solid #cbd5e1;width:120px;">Asignado a</td>
                </tr>{filas}
              </table>
            </td>
          </tr>'''


def build_sla_report_html(full_name: str, fecha_texto: str, vencidos: list, por_vencer: list, frontend_url: str, histograma_cid: str = None) -> str:
    """vencidos / por_vencer: listas de dicts con folio, title, assigned_name,
    sev_code, hours_text (ej. '48.5 h'), hours_color (hex).
    histograma_cid: content-id de la imagen del histograma ya adjunta al
    correo (ver chart_generator.py) -- si se manda, se agrega esa seccion."""
    total_riesgo = len(vencidos) + len(por_vencer)
    seccion_vencidos = _tabla_seccion("Vencidos — requieren atencion inmediata", "Vencido hace", "#dc2626", vencidos)
    seccion_por_vencer = _tabla_seccion("Por vencer — dentro de las proximas 2 horas", "Vence en", "#f97316", por_vencer)
    seccion_histograma = ""
    if histograma_cid:
        seccion_histograma = f'''
          <tr>
            <td class="px-mobile" style="padding:24px 40px 4px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="border-left:4px solid #1a4fa0;padding-left:10px;">
                    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#0f172a;text-transform:uppercase;letter-spacing:0.03em;">Tendencia de volumen</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:12px 40px 4px;">
              <img src="cid:{histograma_cid}" alt="Volumen diario de tickets" width="560" style="max-width:100%;height:auto;display:block;border:1px solid #e2e8f0;" />
            </td>
          </tr>'''

    return f'''<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Solicitudes de tickets vencidos</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    body,table,td,a{{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}}
    table,td{{mso-table-lspace:0pt;mso-table-rspace:0pt;}}
    img{{-ms-interpolation-mode:bicubic;border:0;outline:none;text-decoration:none;}}
    body{{margin:0!important;padding:0!important;background-color:#f1f5f9;}}
    @media only screen and (max-width:640px){{
      .container{{width:100%!important;}}
      .stack{{display:block!important;width:100%!important;}}
      .kpi-cell{{display:block!important;width:100%!important;padding-bottom:12px!important;padding-left:0!important;padding-right:0!important;}}
      .hide-mobile{{display:none!important;}}
      .px-mobile{{padding-left:16px!important;padding-right:16px!important;}}
    }}
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="640" class="container" style="max-width:640px;width:100%;background-color:#ffffff;border:1.5px solid #94a3b8;border-radius:0;">
          <tr><td style="background-color:#1a4fa0;height:6px;line-height:6px;font-size:1px;">&nbsp;</td></tr>
          <tr>
            <td align="center" style="padding:28px 40px 18px;background-color:#ffffff;border-bottom:2px solid #cbd5e1;">
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:31px;font-weight:bold;color:#1a4fa0;letter-spacing:1px;text-transform:uppercase;">IT Service Desk</p>
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding:28px 40px 8px;font-family:Arial,Helvetica,sans-serif;">
              <h2 style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#0f172a;line-height:1.3;">Solicitudes de tickets vencidos</h2>
              <p style="margin:0;font-size:13px;color:#64748b;">{fecha_texto} &middot; Hola <strong style="color:#334155;">{full_name}</strong>, aqui esta el corte de hoy.</p>
            </td>
          </tr>
          <tr>
            <td class="px-mobile" style="padding:20px 40px 8px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td class="kpi-cell stack" width="33%" style="padding-right:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fef2f2;border:2px solid #dc2626;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#b91c1c;text-transform:uppercase;letter-spacing:0.05em;">Vencidos</p>
                        <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;color:#b91c1c;line-height:1;">{len(vencidos)}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td class="kpi-cell stack" width="33%" style="padding-right:8px;padding-left:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fff7ed;border:2px solid #f97316;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#c2410c;text-transform:uppercase;letter-spacing:0.05em;">Por vencer (2h)</p>
                        <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;color:#c2410c;line-height:1;">{len(por_vencer)}</p>
                      </td></tr>
                    </table>
                  </td>
                  <td class="kpi-cell stack" width="33%" style="padding-left:8px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#fef2f2;border:2px solid #dc2626;">
                      <tr><td style="padding:14px 16px;text-align:center;">
                        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#b91c1c;text-transform:uppercase;letter-spacing:0.05em;">Total en riesgo</p>
                        <p style="margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:28px;font-weight:bold;color:#b91c1c;line-height:1;">{total_riesgo}</p>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          {seccion_histograma}
          {seccion_vencidos}
          {seccion_por_vencer}
          <tr>
            <td align="center" style="padding:28px 40px 8px;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center">
                    <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="{frontend_url}/app/it-service-desk/mesa-de-soporte" style="height:42px;v-text-anchor:middle;width:220px;" arcsize="10%" strokecolor="#1a4fa0" fillcolor="#1a4fa0"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;">Ver Mesa de Soporte</center></v:roundrect><![endif]-->
                    <!--[if !mso]><!-->
                    <a href="{frontend_url}/app/it-service-desk/mesa-de-soporte" style="background-color:#1a4fa0;color:#ffffff;display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;line-height:42px;text-align:center;text-decoration:none;padding:0 28px;min-width:180px;">Ver Mesa de Soporte</a>
                    <!--<![endif]-->
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 40px;background-color:#f1f5f9;border-top:2px solid #cbd5e1;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#64748b;line-height:1.5;">
              <p style="margin:0 0 2px;">Reporte automatico diario &middot; recibes esto por tu rol en IT Service Desk.</p>
              <p style="margin:0;">&copy; 2026 AVALANZ. Todos los derechos reservados.</p>
            </td>
          </tr>
          <tr><td style="background-color:#1a4fa0;height:6px;line-height:6px;font-size:1px;">&nbsp;</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'''
