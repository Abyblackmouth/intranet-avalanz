"""Formulario del solicitante: formatos disponibles, datos para llenar el formato y
vista previa ya llena. El envio (ticket, PDF y firma) llega en el siguiente paso."""
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.mesa_de_soporte import AccCuenta, AccFormato, TicketSystem
from app.routes.control_accesos.configuracion import _config_completa, _formato
from app.routes.mesa_de_soporte.mesa_de_soporte import _get_requester_profile, get_current_user
from app.services.control_accesos.motor.documento import contexto_solicitud, ordenar_familias, renderizar

router = APIRouter(prefix="/control-accesos")
FOLIO_PREVIO = "ACC-XXXX-000000"


def _uid(user: dict) -> str:
    return str(user.get("user_id") or user.get("sub") or user.get("id"))


async def _movimiento(db: AsyncSession, formato_id: str, user_id: str) -> tuple[str, AccCuenta | None]:
    """Si el usuario ya tiene cuenta vigente en ese sistema, su solicitud es una Modificacion."""
    cuenta = (await db.execute(select(AccCuenta).where(AccCuenta.formato_id == formato_id, AccCuenta.usuario_id == user_id))).scalar_one_or_none()
    return ("modificacion", cuenta) if cuenta and cuenta.estado != "baja" else ("alta", cuenta)


async def _usuario(user: dict) -> dict:
    p = await _get_requester_profile(_uid(user))
    return {"nombre": (p.get("full_name") or "").upper(), "matricula": p.get("matricula") or "", "puesto": (p.get("puesto") or "").upper(),
            "departamento": (p.get("departamento") or "").upper(), "empresa": p.get("company_razon_social") or p.get("company_name") or "",
            "grupo": p.get("family_name") or "", "correo": p.get("email") or ""}


async def _ajustes_firma(db: AsyncSession) -> tuple[str, bool]:
    ajustes = dict((await db.execute(text("SELECT key, value FROM incidencias_settings WHERE key LIKE 'acc.%'"))).all())
    metodo = ajustes.get("acc.metodo_firma", "manual")
    return metodo, metodo == "docusign" and ajustes.get("acc.docusign_ambiente", "pruebas") == "pruebas"


async def _formato_activo(db: AsyncSession, formato_id: str) -> AccFormato:
    f = await _formato(db, formato_id)
    if not f.activo:
        raise HTTPException(status_code=404, detail="Este formato no está disponible")
    return f


@router.get("/formatos")
async def formatos_disponibles(db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    filas = (await db.execute(
        select(AccFormato, TicketSystem.name).join(TicketSystem, TicketSystem.id == AccFormato.system_id)
        .where(AccFormato.activo == True).order_by(AccFormato.orden, AccFormato.nombre)
    )).all()
    res = []
    for f, sistema in filas:
        movimiento, _ = await _movimiento(db, f.id, _uid(user))
        res.append({"id": f.id, "nombre": f.nombre, "sistema": sistema, "movimiento": movimiento})
    return res


@router.get("/formatos/{formato_id}/formulario")
async def formulario(formato_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato_activo(db, formato_id)
    config = await _config_completa(db, f)
    catalogo = {c["id"]: c for c in config["catalogo_empresas"]}
    familias: dict[str, dict] = {}
    for cid in config["empresas_elegidas"]:
        c = catalogo.get(cid)
        if not c or not c.get("operando"):
            continue
        fam = c.get("familia") or {}
        fid = fam.get("id") or "__sin__"
        familias.setdefault(fid, {"id": fid, "nombre": fam.get("nombre") or "SIN FAMILIA", "empresas": []})["empresas"].append(
            {"id": c["id"], "nombre": c["nombre_comercial"], "razon_social": c["razon_social"]})
    movimiento, cuenta = await _movimiento(db, f.id, _uid(user))
    return {
        "formato": {"id": f.id, "nombre": f.nombre, "sistema": config["formato"]["sistema"]},
        "usuario": await _usuario(user),
        "movimiento": movimiento,
        "familias": ordenar_familias(list(familias.values()), f.presentacion or {}),
        "modulos": [{"id": m["id"], "nombre": m["nombre"], "exclusivo_admin": m["exclusivo_admin"],
                     "perfiles": [p["nombre"] for p in m["perfiles"]], "rutinas": [r["nombre"] for r in m["rutinas"] if r["activo"]]}
                    for m in config["modulos"] if m["activo"]],
        "previos": (cuenta.accesos or None) if movimiento == "modificacion" and cuenta else None,
    }


@router.post("/formatos/{formato_id}/vista-previa", response_class=HTMLResponse)
async def vista_previa_solicitud(formato_id: str, datos: dict = Body(...), db: AsyncSession = Depends(get_db), user: dict = Depends(get_current_user)):
    f = await _formato_activo(db, formato_id)
    config = await _config_completa(db, f)
    movimiento, _ = await _movimiento(db, f.id, _uid(user))
    metodo, prueba = await _ajustes_firma(db)
    fecha = datetime.now(ZoneInfo("America/Monterrey")).strftime("%d/%m/%Y")
    ctx = contexto_solicitud(config, datos, await _usuario(user), movimiento, FOLIO_PREVIO, fecha, metodo, prueba)
    return HTMLResponse(renderizar(f.clave, ctx))
