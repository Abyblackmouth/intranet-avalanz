"""Hoja del tramite en version correo (Jinja2, estilos en linea, tablas para maquetar).
Los clientes de correo (Outlook incluido) no soportan CSS moderno: misma informacion
y misma paleta que la pantalla (v9), en un formato que sobrevive a cualquier bandeja."""
from typing import Any, Dict

from jinja2 import Environment, BaseLoader, select_autoescape

_ENV = Environment(loader=BaseLoader(), autoescape=select_autoescape(default=True, default_for_string=True))

_PLANTILLA = _ENV.from_string("""
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <tr><td style="padding:0 0 12px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <td style="vertical-align:top">
          <div style="font-size:12px;color:#64748b">Workflows · {{ h.cabecera.flujo }}</div>
          <div style="font-size:20px;font-weight:800;margin-top:4px">{{ h.cabecera.empresa }}</div>
          <div style="font-size:13px;color:#64748b;margin-top:2px">Solicitado por <b style="color:#334155">{{ h.cabecera.solicitado_por }}</b>{% if h.cabecera.area %} · {{ h.cabecera.area }}{% endif %} · Grupo {{ h.cabecera.grupo }} · Filial {{ h.cabecera.filial }}</div>
        </td>
        <td style="vertical-align:top;text-align:right;white-space:nowrap">
          <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#64748b;font-weight:bold">{{ h.cabecera.etiqueta }}</div>
          <div style="font-size:24px;font-weight:800;font-family:Consolas,monospace">No. {{ h.cabecera.numero }}</div>
          <div style="font-size:11px;color:#64748b">Folio {{ h.cabecera.folio }}{% if h.cabecera.fecha %} · {{ h.cabecera.fecha }}{% endif %}</div>
        </td>
      </tr>
    </table>
  </td></tr>
  <tr><td style="padding:8px 12px;background:#e8f0fb;border:1px solid #c7d6ec;border-radius:8px;font-size:13px;font-weight:bold;color:{{ tono }}">● {{ h.estatus.texto }}</td></tr>
  {% if h.tarjetas %}
  <tr><td style="padding:12px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #c7d6ec;background:#f6f9fe">
      <tr><td colspan="2" style="padding:6px 12px;background:#e8f0fb;border-bottom:1px solid #c7d6ec;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#1a4fa0">Datos de la solicitud</td></tr>
      {% for fila in h.tarjetas|batch(2) %}<tr>
        {% for t in fila %}<td width="50%" style="padding:7px 12px;vertical-align:top;border-bottom:1px solid #e3eaf5">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.5px">{{ t.etiqueta }}</div>
          <div style="font-size:13px;font-weight:bold;margin-top:1px">{{ t.valor }}</div>
        </td>{% endfor %}{% if fila|length == 1 %}<td width="50%" style="border-bottom:1px solid #e3eaf5"></td>{% endif %}
      </tr>{% endfor %}
    </table>
  </td></tr>{% endif %}
  {% if h.adjuntos %}
  <tr><td style="padding:12px 0 0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #c7d6ec;background:#f6f9fe">
      <tr><td style="padding:6px 12px;background:#e8f0fb;border-bottom:1px solid #c7d6ec;font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#1a4fa0">Archivos adjuntos ({{ h.adjuntos|length }})</td></tr>
      <tr><td style="padding:8px 12px;font-size:13px">{% for a in h.adjuntos %}<span style="display:inline-block;margin:0 6px 6px 0;padding:4px 8px;border:1px solid #c7d6ec;border-radius:6px;background:#fff"><b style="color:{{ colores.get(a.ext, '#64748b') }};font-size:10px">{{ a.ext|upper }}</b> {{ a.nombre }}</span>{% endfor %}</td></tr>
    </table>
  </td></tr>{% endif %}
  {% for t in h.tablas %}
  <tr><td style="padding:12px 0 0">
    <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:#1a4fa0;padding:0 0 6px">{{ t.titulo }} ({{ t.filas|length }})</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #c7d6ec;font-size:12px">
      <tr>{% for c in t.columnas %}<th style="background:#e8f0fb;color:#1a4fa0;padding:6px 8px;border-bottom:1px solid #c7d6ec;border-right:1px solid #dbe5f3;font-size:10px;text-transform:uppercase;letter-spacing:.5px;text-align:{{ al[c.alinear] }}">{{ c.etiqueta }}</th>{% endfor %}</tr>
      {% for f in t.filas[:40] %}<tr>{% for cel in f %}<td style="padding:6px 8px;border-bottom:1px solid #e3eaf5;border-right:1px solid #eef2f9;text-align:{{ al[t.columnas[loop.index0].alinear] }}">{{ cel.valor }}{% if cel.detalle %} <span style="color:#64748b;font-size:11px">{{ cel.detalle }}</span>{% endif %}</td>{% endfor %}</tr>{% endfor %}
      {% if t.filas|length > 40 %}<tr><td colspan="{{ t.columnas|length }}" style="padding:6px 8px;color:#64748b">… y {{ t.filas|length - 40 }} renglones más en la Intranet</td></tr>{% endif %}
      {% for tot in t.totales %}<tr>
        <td colspan="{{ t.col_total }}" style="padding:6px 8px;text-align:right;{% if tot.destacado %}background:#e8f0fb;font-weight:bold;color:#1a4fa0;font-size:14px{% else %}background:#fafcff{% endif %}">{{ tot.etiqueta }}</td>
        <td style="padding:6px 8px;text-align:right;{% if tot.destacado %}background:#e8f0fb;font-weight:bold;color:#1a4fa0;font-size:14px{% else %}background:#fafcff{% endif %}">{{ tot.valor }}</td>
        {% if t.columnas|length - t.col_total - 1 > 0 %}<td colspan="{{ t.columnas|length - t.col_total - 1 }}" style="{% if tot.destacado %}background:#e8f0fb{% else %}background:#fafcff{% endif %}"></td>{% endif %}
      </tr>{% endfor %}
    </table>
  </td></tr>{% endfor %}
</table>
""")

_TONO = {"turno": "#1a4fa0", "ok": "#16a34a", "no": "#dc2626", "aviso": "#d97706", "neutro": "#475569"}
_COLORES = {"pdf": "#dc2626", "xls": "#16a34a", "csv": "#16a34a", "doc": "#2563eb", "jpg": "#a21caf", "png": "#a21caf", "xml": "#d97706", "zip": "#475569"}
_AL = {"izq": "left", "centro": "center", "der": "right"}


def html(hoja: Dict[str, Any]) -> str:
    return _PLANTILLA.render(h=hoja, tono=_TONO.get(hoja["estatus"]["tono"], "#1a4fa0"), colores=_COLORES, al=_AL)
