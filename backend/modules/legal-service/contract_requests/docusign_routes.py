"""
DocuSign Routes — Webhook y Polling
Separado del router principal para mantener organización.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database import get_db
from .models import Envelope, EnvelopeAttachment, EnvelopeSigner, EnvelopeActivityLog
from .service import log_activity
from . import docusign_service as ds

router = APIRouter(prefix="/envelopes", tags=["DocuSign"])


# ── Webhook DocuSign Connect ──────────────────────────────────────────────────

@router.post("/docusign/webhook", status_code=200)
async def docusign_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Webhook de DocuSign Connect.
    Recibe eventos de firma. Cuando el sobre está completado,
    descarga el PDF firmado y lo archiva en MinIO.
    Sin autenticación JWT — validado por contenido del payload.
    """
    import boto3, os, json as _json, uuid as _uuid
    from botocore.config import Config as BotoConfig
    from datetime import datetime, timezone as _tz

    try:
        body = await request.body()
        payload = _json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Payload inválido")

    print(f"[webhook] Payload recibido: {list(payload.keys())}")
    print(f"[webhook] data keys: {list(payload.get('data', {}).keys())}")
    if not ds.verify_webhook_payload(payload):
        print(f"[webhook] Payload completo: {payload}")
        raise HTTPException(status_code=400, detail="Payload no reconocido")

    event  = payload.get("event", "")
    data   = payload.get("data", {})
    ds_id  = data.get("envelopeId") or payload.get("envelopeId")
    status = data.get("envelopeSummary", {}).get("status") or payload.get("status", "")

    if event not in ("envelope-completed", "envelope_completed") and status != "completed":
        return {"received": True, "action": "ignored", "event": event}

    if not ds_id:
        return {"received": True, "action": "ignored", "reason": "no envelopeId"}

    return await _process_completed_envelope(db, ds_id)


# ── Polling interno — consulta sobres en_firmas contra DocuSign ───────────────

@router.post("/internal/docusign-poll", status_code=200)
async def docusign_poll(db: AsyncSession = Depends(get_db)):
    """
    Polling de DocuSign — llamado por cron cada 5 minutos.
    Consulta todos los sobres en estado en_firmas con docusign_envelope_id
    y verifica si DocuSign los marcó como completed.
    Sin autenticación JWT — solo accesible internamente.
    """
    # Obtener todos los sobres en_firmas con docusign_envelope_id
    result = await db.execute(
        select(Envelope).where(
            Envelope.status == "en_firmas",
            Envelope.docusign_envelope_id.isnot(None),
            Envelope.is_deleted == False,
        )
    )
    envelopes = result.scalars().all()

    if not envelopes:
        return {"checked": 0, "completed": 0}

    completed = []
    errors = []

    for envelope in envelopes:
        try:
            ds_status = await ds.get_envelope_status(envelope.docusign_envelope_id)
            if ds_status.get("status") == "completed":
                result = await _process_completed_envelope(db, envelope.docusign_envelope_id)
                if result.get("action") == "completed":
                    completed.append(envelope.folio)
        except Exception as e:
            errors.append({"folio": envelope.folio, "error": str(e)})

    return {
        "checked": len(envelopes),
        "completed": len(completed),
        "folios_completados": completed,
        "errors": errors,
    }


# ── Helper compartido — procesar sobre completado ─────────────────────────────

async def _process_completed_envelope(db: AsyncSession, docusign_envelope_id: str) -> dict:
    """
    Descarga el PDF firmado de DocuSign, lo sube a MinIO,
    registra en envelope_attachments y actualiza el estado del sobre.
    """
    import boto3, os, uuid as _uuid
    from botocore.config import Config as BotoConfig
    from datetime import datetime, timezone as _tz

    # Buscar el sobre en BD
    env_result = await db.execute(
        select(Envelope).where(
            Envelope.docusign_envelope_id == docusign_envelope_id,
            Envelope.is_deleted == False
        )
    )
    envelope = env_result.scalar_one_or_none()
    if not envelope:
        return {"received": True, "action": "ignored", "reason": "envelope not found in DB"}

    # Ya completado — ignorar
    if envelope.status == "completado":
        return {"received": True, "action": "already_completed", "folio": envelope.folio}

    # Descargar PDF firmado de DocuSign
    try:
        pdf_bytes = await ds.download_signed_document(docusign_envelope_id)
    except Exception as e:
        print(f"[docusign] Error descargando PDF firmado {envelope.folio}: {e}")
        return {"received": True, "action": "error", "reason": str(e)}

    # Subir PDF firmado a MinIO
    minio_url    = os.getenv("MINIO_ENDPOINT", "http://avalanz-minio:9000")
    minio_access = os.getenv("MINIO_ACCESS_KEY", "")
    minio_secret = os.getenv("MINIO_SECRET_KEY", "")
    bucket       = "dirdoc"
    # Tomar company_slug del object_key del PDF original para consistencia
    from sqlalchemy import select as _select
    orig_att = await db.execute(
        _select(EnvelopeAttachment).where(
            EnvelopeAttachment.envelope_id == str(envelope.id),
            EnvelopeAttachment.mime_type == "application/pdf",
            EnvelopeAttachment.is_deleted == False,
        ).order_by(EnvelopeAttachment.uploaded_at.asc()).limit(1)
    )
    orig = orig_att.scalar_one_or_none()
    if orig and orig.object_key:
        company_slug = orig.object_key.split("/")[0]
    else:
        company_slug = "".join(c if c.isalnum() else "-" for c in envelope.company_name.lower())[:20].strip("-")
    file_uuid    = str(_uuid.uuid4())[:8]
    file_name    = f"{file_uuid}_{envelope.folio.lower()}_firmado.pdf"
    object_key   = f"{company_slug}/legal/envelopes/{envelope.folio}/firmado/{file_name}"

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=minio_url,
            aws_access_key_id=minio_access,
            aws_secret_access_key=minio_secret,
            config=BotoConfig(signature_version="s3v4"),
            region_name="us-east-1",
        )
        s3.put_object(Bucket=bucket, Key=object_key, Body=pdf_bytes, ContentType="application/pdf")
    except Exception as e:
        print(f"[docusign] Error subiendo PDF a MinIO {envelope.folio}: {e}")
        return {"received": True, "action": "error", "reason": f"MinIO: {e}"}

    # Registrar en envelope_attachments
    # Marcar solo el PDF del contrato como no actual (no los anexos)
    await db.execute(
        update(EnvelopeAttachment)
        .where(
            EnvelopeAttachment.envelope_id == str(envelope.id),
            EnvelopeAttachment.mime_type == "application/pdf",
            EnvelopeAttachment.is_deleted == False,
        )
        .values(is_current=False)
    )

    attachment = EnvelopeAttachment(
        id=str(_uuid.uuid4()),
        envelope_id=str(envelope.id),
        original_name=f"{envelope.folio}_contrato_firmado.pdf",
        stored_name=file_name,
        object_key=object_key,
        bucket=bucket,
        mime_type="application/pdf",
        extension="pdf",
        size_bytes=len(pdf_bytes),
        uploaded_by_user_id=str(envelope.requested_by_user_id),
        uploaded_by_name="DocuSign",
        description=f"Contrato firmado — {envelope.folio}",
        version_number=1,
        is_current=True,
        is_deleted=False,
    )
    db.add(attachment)

    # Actualizar firmantes a signed
    await db.execute(
        update(EnvelopeSigner)
        .where(EnvelopeSigner.envelope_id == str(envelope.id))
        .values(status="signed", signed_at=datetime.now(_tz.utc))
    )

    # Actualizar sobre a completado
    envelope.status       = "completado"
    envelope.completed_at = datetime.now(_tz.utc)
    envelope.sla_closed_at = datetime.now(_tz.utc)

    # Log — firmantes completaron
    await log_activity(
        db, str(envelope.id),
        action="docusign_signing_completed",
        user_id=str(envelope.requested_by_user_id),
        user_name="DocuSign",
        user_role="sistema",
        detail={"docusign_envelope_id": docusign_envelope_id, "message": "Todos los firmantes completaron la firma en DocuSign"}
    )

    # Log — PDF firmado archivado
    await log_activity(
        db, str(envelope.id),
        action="signed_document_archived",
        user_id=str(envelope.requested_by_user_id),
        user_name="DocuSign",
        user_role="sistema",
        detail={"object_key": object_key, "size_bytes": len(pdf_bytes), "message": "PDF firmado descargado de DocuSign y archivado en MinIO"}
    )

    # Log — sobre completado
    await log_activity(
        db, str(envelope.id),
        action="envelope_completed",
        user_id=str(envelope.requested_by_user_id),
        user_name="Sistema",
        user_role="sistema",
        detail={"message": f"Sobre {envelope.folio} marcado como completado automáticamente tras firma electrónica"}
    )

    await db.commit()

    print(f"[docusign] Sobre {envelope.folio} completado — PDF archivado en {object_key}")
    return {
        "received": True,
        "action": "completed",
        "folio": envelope.folio,
        "object_key": object_key,
    }
