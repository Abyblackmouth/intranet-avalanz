"""Cierre de una solicitud de acceso cuando su sobre de DocuSign se completa (o se declina)."""
import logging
import os
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.models.mesa_de_soporte import AccCuenta, AccSolicitud, Incident, IncidentActivityLog, IncidentAttachment
from app.services.control_accesos.firma import docusign as ds

log = logging.getLogger("control_accesos")
BUCKET = "dirdoc"


def _guardar_en_minio(datos: bytes, key: str) -> None:
    import boto3
    from botocore.config import Config
    ep = os.getenv("MINIO_ENDPOINT", "")
    s3 = boto3.client("s3", endpoint_url=ep if ep.startswith("http") else f"http://{ep}",
                      aws_access_key_id=os.getenv("MINIO_ACCESS_KEY"), aws_secret_access_key=os.getenv("MINIO_SECRET_KEY"),
                      config=Config(signature_version="s3v4"), region_name="us-east-1")
    s3.put_object(Bucket=BUCKET, Key=key, Body=datos, ContentType="application/pdf")


async def procesar_sobre(db, envelope_id: str, avisar, perfil_de, broadcast) -> dict:
    """Si el sobre es nuestro y ya se completó, cierra la solicitud. Idempotente."""
    fila = (await db.execute(select(AccSolicitud, Incident).join(Incident, Incident.id == AccSolicitud.incident_id)
                             .where(AccSolicitud.docusign_envelope_id == envelope_id))).first()
    if not fila:
        return {"accion": "ignorado", "motivo": "el sobre no es de una solicitud de acceso"}
    sol, inc = fila
    if sol.estado_firma in ("firmado", "declinado"):
        return {"accion": "ya_procesado", "folio": inc.folio}
    st = (await ds.estado(envelope_id)).get("status", "")
    ahora = datetime.now(timezone.utc)

    if st in ("declined", "voided"):
        sol.estado_firma = "declinado"
        inc.status, inc.closed_at = "rechazado", ahora
        db.add(IncidentActivityLog(incident_id=inc.id, action="firma_declinada", performed_by=inc.requester_id,
                                   performed_by_name="DocuSign", performed_by_role="sistema", performed_at=ahora,
                                   company_id=inc.company_id, module_slug="it-service-desk", detail={"estado_docusign": st}))
        await db.commit()
        await db.refresh(inc)
        await broadcast(inc)
        await avisar(inc, f"La firma de tu solicitud {inc.folio} se canceló",
                     "Alguno de los firmantes declinó la firma en DocuSign o el sobre se anuló. Si aún necesitas el acceso, levanta una solicitud nueva.",
                     [], "warning")
        return {"accion": "declinado", "folio": inc.folio}
    if st != "completed":
        return {"accion": "pendiente", "estado": st, "folio": inc.folio}

    usuario = (await ds.valores_de_texto(envelope_id)).get("usuario_asignado", "").strip()
    pdf = await ds.descargar_firmado(envelope_id)
    perfil = await perfil_de(inc.requester_id)
    sello = ahora.astimezone(ZoneInfo("America/Monterrey"))
    key = f"{perfil.get('company_slug') or 'general'}/control-de-accesos/{inc.folio}/FIRMADO_{inc.folio}_{sello.strftime('%Y%m%d_%H%M%S')}.pdf"
    _guardar_en_minio(pdf, key)

    f_admin = None
    try:
        from app.models.mesa_de_soporte import AccFormato
        f_admin = (await db.execute(select(AccFormato.admin_user_id).where(AccFormato.id == sol.formato_id))).scalar_one_or_none()
    except Exception:
        pass
    db.add(IncidentAttachment(incident_id=inc.id, attachment_type="evidencia_resolucion", object_key=key, bucket=BUCKET,
                              mime_type="application/pdf", size_bytes=len(pdf), uploaded_by=f_admin or inc.requester_id))
    sol.estado_firma, sol.firmado_object_key, sol.usuario_asignado, sol.fecha_alta = "firmado", key, usuario or None, sello.date()
    from app.services.control_accesos import contrasena as _pw
    pw_final = _pw.leer(sol)
    _pw.borrar(sol)   # se entrega en el correo final y no se queda guardada

    cuenta = (await db.execute(select(AccCuenta).where(AccCuenta.id == sol.cuenta_id))).scalar_one_or_none() if sol.cuenta_id else None
    if cuenta:
        cap = (sol.datos or {}).get("captura", {})
        cuenta.estado = "activa"   # solo el registro de la intranet: el usuario en el sistema lo crea TI a mano
        cuenta.accesos = {"empresas": cap.get("empresas", []), "modulos": cap.get("modulos", []),
                          "usuario_asignado": usuario, "actualizado": ahora.isoformat(), "folio": inc.folio}
        for campo in ("usuario_asignado", "usuario_sistema"):
            if hasattr(cuenta, campo):
                setattr(cuenta, campo, usuario or None)

    await registrar_en_expediente(db, sol, inc, pdf, key, usuario)
    inc.status, inc.resolved_at = "terminado", ahora
    db.add(IncidentActivityLog(incident_id=inc.id, action="firmada_por_todos", performed_by=f_admin or inc.requester_id,
                               performed_by_name="DocuSign", performed_by_role="sistema", performed_at=ahora,
                               company_id=inc.company_id, module_slug="it-service-desk",
                               detail={"usuario_asignado": usuario, "documento": key}))
    await db.commit()
    await db.refresh(inc)
    await broadcast(inc)
    await avisar(inc, f"Tu acceso de la solicitud {inc.folio} quedó registrado",
                 f"Todos firmaron tu solicitud y TI te asignó tu usuario: {usuario or '(sin capturar)'}."
                 + (" Tu contraseña es temporal: el sistema te pedirá cambiarla en tu primer inicio de sesión." if pw_final else ""),
                 [{"label": "Usuario asignado", "value": usuario or "—", "mono": True}]
                 + ([{"label": "Contraseña temporal", "value": pw_final, "mono": True}] if pw_final else []), "success")
    log.info("Solicitud %s firmada por todos; usuario asignado %s", inc.folio, usuario)
    return {"accion": "terminado", "folio": inc.folio, "usuario_asignado": usuario}



async def registrar_cuenta(db, sol, usuario: str, folio: str) -> None:
    """Registro de la cuenta en la intranet (el usuario en el sistema lo crea TI a mano)."""
    cuenta = (await db.execute(select(AccCuenta).where(AccCuenta.id == sol.cuenta_id))).scalar_one_or_none() if sol.cuenta_id else None
    if not cuenta:
        return
    cap = (sol.datos or {}).get("captura", {})
    cuenta.estado = "activa"
    cuenta.accesos = {"empresas": cap.get("empresas", []), "modulos": cap.get("modulos", []), "usuario_asignado": usuario,
                      "actualizado": datetime.now(timezone.utc).isoformat(), "folio": folio}
    for campo in ("usuario_asignado", "usuario_sistema"):
        if hasattr(cuenta, campo):
            setattr(cuenta, campo, usuario or None)



async def registrar_en_expediente(db, sol, inc, documento: bytes, key: str, usuario: str) -> None:
    """El formato firmado, en Usuarios -> Documentos del solicitante (misma referencia en MinIO, sin duplicarlo).
    Nombre: ALTA|MOD_{FORMATO}_{MATRICULA}_{FOLIO}_{FECHA}.pdf, para leerlo como línea de tiempo."""
    import hashlib
    import httpx
    from app.models.mesa_de_soporte import AccFormato
    try:
        f = (await db.execute(select(AccFormato).where(AccFormato.id == sol.formato_id))).scalar_one_or_none()
        snap = sol.datos or {}
        matricula = (snap.get("usuario") or {}).get("matricula") or "SINMAT"
        mov = "MOD" if sol.movimiento == "modificacion" else "ALTA"
        fecha = (sol.fecha_alta or datetime.now(timezone.utc).astimezone(ZoneInfo("America/Monterrey")).date()).isoformat()
        clave = (f.clave if f else "FORMATO").upper()
        nombre = f"{mov}_{clave}_{matricula}_{inc.folio}_{fecha}.pdf"
        descripcion = f"{'Modificación' if mov == 'MOD' else 'Alta'} de usuario · {f.nombre if f else ''} · usuario {usuario or '—'}"
        cuerpo = {"original_name": nombre, "object_key": key, "bucket": "dirdoc", "mime_type": "application/pdf",
                  "size_bytes": len(documento), "checksum": hashlib.sha256(documento).hexdigest(), "description": descripcion,
                  "uploaded_by": str((f.admin_user_id if f and f.admin_user_id else inc.requester_id)),
                  "uploaded_by_name": "Control de accesos", "origen": "it-service-desk",
                  "referencia": inc.folio, "uploaded_at": datetime.now(timezone.utc).isoformat()}
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.post(f"http://admin-service:8000/internal/users/{inc.requester_id}/files", json=cuerpo)
            r.raise_for_status()
        log.info("Formato %s registrado en el expediente como %s", inc.folio, nombre)
    except Exception as e:
        log.warning("No se pudo registrar %s en el expediente del empleado: %s", inc.folio, e)
