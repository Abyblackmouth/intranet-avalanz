"""Generacion de graficas estaticas (PNG) para incrustar en correos --
los correos no pueden ejecutar JS/graficas interactivas, asi que esto
genera la imagen ya renderizada en el servidor con matplotlib, en
nuestros colores institucionales."""

import io
from datetime import date

import matplotlib
matplotlib.use("Agg")  # sin display -- server-side puro
import matplotlib.pyplot as plt
import matplotlib.dates as mdates


def generar_histograma_volumen(datos: list) -> bytes:
    """datos: lista de {"fecha": "YYYY-MM-DD", "cantidad": int}, ya
    ordenada cronologicamente (normalmente ultimos 7 dias).
    Regresa los bytes de un PNG listo para incrustar via CID."""
    fechas = [date.fromisoformat(d["fecha"]) for d in datos]
    cantidades = [d["cantidad"] for d in datos]

    fig, ax = plt.subplots(figsize=(6.2, 2.8), dpi=150)
    fig.patch.set_facecolor("#ffffff")
    ax.set_facecolor("#ffffff")

    ax.bar(fechas, cantidades, color="#1a4fa0", width=0.6, zorder=3)

    ax.set_title("Volumen diario de tickets — últimos 7 días", fontsize=11, fontweight="bold", color="#0f172a", pad=12)
    ax.grid(axis="y", color="#e2e8f0", linewidth=0.8, zorder=0)
    ax.set_axisbelow(True)

    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")

    ax.xaxis.set_major_formatter(mdates.DateFormatter("%d-%b"))
    ax.tick_params(axis="x", colors="#64748b", labelsize=9)
    ax.tick_params(axis="y", colors="#64748b", labelsize=9)

    max_val = max(cantidades) if cantidades else 0
    for f, c in zip(fechas, cantidades):
        if c > 0:
            ax.text(f, c + max(max_val * 0.03, 0.15), str(c), ha="center", va="bottom", fontsize=9, color="#1a4fa0", fontweight="bold")

    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf.read()
