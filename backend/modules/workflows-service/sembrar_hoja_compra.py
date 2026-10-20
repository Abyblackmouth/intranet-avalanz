"""Siembra la hoja (v9) del flujo CompraDirecta si todavía no tiene. Se puede correr varias veces."""
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Flujo
from app.motor.hoja import normalizar

HOJA = {
    "documento": {"etiqueta": "Solicitud de compra", "numero": "numerosolicitud", "area": "Compras"},
    "tarjetas": [
        {"clave": "proveedor", "etiqueta": "Proveedor", "tipo": "texto"},
        {"clave": "codigoProveedor", "etiqueta": "Código de proveedor", "tipo": "texto"},
        {"clave": "motivoCompra", "etiqueta": "Motivo de compra", "tipo": "texto"},
        {"clave": "fechaEmision", "etiqueta": "Fecha de emisión", "tipo": "fecha"},
        {"clave": "moneda", "etiqueta": "Moneda", "tipo": "texto"},
        {"clave": "operacion", "etiqueta": "Operación", "tipo": "texto"},
        {"clave": "usuarioTotvs", "etiqueta": "Capturó en TOTVS", "tipo": "texto"},
    ],
    "adjuntos": True,
    "tablas": [{
        "clave": "items", "titulo": "Partidas",
        "columnas": [
            {"clave": "item", "etiqueta": "Item", "tipo": "texto", "alinear": "izq"},
            {"clave": "descripcion", "etiqueta": "Producto", "tipo": "texto", "alinear": "izq", "detalle": "producto"},
            {"clave": "cantidad", "etiqueta": "Cantidad", "tipo": "numero", "alinear": "der"},
            {"clave": "valorUnitario", "etiqueta": "Unitario", "tipo": "moneda", "alinear": "der"},
            {"clave": "valorTotal", "etiqueta": "Importe", "tipo": "moneda", "alinear": "der"},
            {"clave": "centroCosto", "etiqueta": "Centro de costo", "tipo": "texto", "alinear": "izq"},
            {"clave": "cuentaContable", "etiqueta": "Cuenta", "tipo": "texto", "alinear": "izq"},
        ],
        "totales": [
            {"clave": "subtotal", "etiqueta": "Subtotal", "tipo": "moneda"},
            {"clave": "impuesto", "etiqueta": "IVA 16 %", "tipo": "moneda"},
            {"clave": "total", "etiqueta": "Total", "tipo": "moneda", "destacado": True},
        ],
    }],
}


async def main():
    async with AsyncSessionLocal() as db:
        flujos = (await db.execute(select(Flujo).where(Flujo.process_id == "CompraDirecta"))).scalars().all()
        for f in flujos:
            if f.hoja:
                print(f"{f.nombre}: ya tenía hoja, no se toca")
                continue
            f.hoja = normalizar(HOJA)
            print(f"{f.nombre}: hoja sembrada")
        await db.commit()
        if not flujos:
            print("No hay flujo CompraDirecta")

asyncio.run(main())
