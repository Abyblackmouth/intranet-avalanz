"""
Signing service — abstraction layer for envelope signing.
Supports two providers: email_sim and docusign.
Switch via signing_provider_config table (id=1).
"""
import secrets
import httpx
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models import EnvelopeSigningToken, SigningProviderConfig, Envelope, EnvelopeSigner


async def get_signing_provider(db: AsyncSession) -> str:
    """Returns the active signing provider: email_sim or docusign."""
    result = await db.execute(select(SigningProviderConfig).where(SigningProviderConfig.id == 1))
    config = result.scalar_one_or_none()
    return config.provider if config else "email_sim"


async def set_signing_provider(db: AsyncSession, provider: str, updated_by: str) -> None:
    """Updates the signing provider. Only super_admin or admin_empresa can call this."""
    result = await db.execute(select(SigningProviderConfig).where(SigningProviderConfig.id == 1))
    config = result.scalar_one_or_none()
    if config:
        config.provider = provider
        config.updated_by = updated_by
        config.updated_at = datetime.utcnow()
    await db.commit()


async def send_for_signing(db: AsyncSession, envelope_id: str, frontend_url: str, email_service_url: str) -> dict:
    """
    Sends envelope for signing using the active provider.
    Returns: {"provider": "email_sim"|"docusign", "status": "sent", "details": {...}}
    """
    provider = await get_signing_provider(db)

    if provider == "email_sim":
        return await _send_email_sim(db, envelope_id, frontend_url, email_service_url)
    elif provider == "docusign":
        return await _send_docusign(db, envelope_id)
    else:
        raise ValueError(f"Unknown signing provider: {provider}")


# ── Email Simulation Provider ─────────────────────────────────────────────────

async def _send_email_sim(db: AsyncSession, envelope_id: str, frontend_url: str, email_service_url: str) -> dict:
    """Sends signing request emails with unique confirmation links."""

    # Get envelope
    env_result = await db.execute(select(Envelope).where(Envelope.id == envelope_id))
    envelope = env_result.scalar_one_or_none()
    if not envelope:
        raise ValueError(f"Envelope {envelope_id} not found")

    # Get signers
    signers_result = await db.execute(
        select(EnvelopeSigner)
        .where(EnvelopeSigner.envelope_id == envelope_id)
        .order_by(EnvelopeSigner.routing_order)
    )
    signers = signers_result.scalars().all()

    if not signers:
        raise ValueError(f"Envelope {envelope_id} has no signers defined")

    tokens_created = []

    for signer in signers:
        # Generate unique token
        token = secrets.token_urlsafe(48)
        expires_at = datetime.utcnow() + timedelta(days=7)

        # Save token
        signing_token = EnvelopeSigningToken(
            envelope_id=envelope_id,
            signer_id=str(signer.id),
            signer_name=signer.name,
            signer_email=signer.email,
            token=token,
            status="pending",
            expires_at=expires_at,
        )
        db.add(signing_token)

        # Build confirmation URL
        confirm_url = f"{frontend_url}/firmar/{token}"

        # Send email via email-service
        html_content = f"""
        <h2 style="color: #1a4fa0; margin-bottom: 16px;">Solicitud de Firma Electrónica</h2>
        <p>Estimado/a <strong>{signer.name}</strong>,</p>
        <p>Se te ha solicitado firmar el siguiente documento:</p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr style="background:#f8fafc;">
            <td style="padding:8px 12px; font-weight:bold; color:#64748b; width:40%;">Folio</td>
            <td style="padding:8px 12px; color:#0f172a;">{envelope.folio}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:bold; color:#64748b;">Tipo de contrato</td>
            <td style="padding:8px 12px; color:#0f172a;">{envelope.contract_type_name}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="padding:8px 12px; font-weight:bold; color:#64748b;">Solicitante</td>
            <td style="padding:8px 12px; color:#0f172a;">{envelope.requested_by_name}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px; font-weight:bold; color:#64748b;">Tu rol</td>
            <td style="padding:8px 12px; color:#0f172a;">{signer.role_in_document or 'Firmante'}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="padding:8px 12px; font-weight:bold; color:#64748b;">Válido hasta</td>
            <td style="padding:8px 12px; color:#0f172a;">{expires_at.strftime('%d/%m/%Y')}</td>
          </tr>
        </table>
        <p>Para revisar y firmar el documento, haz clic en el botón:</p>
        <div style="margin: 24px 0; text-align: center;">
          <a href="{confirm_url}" style="background:#1a4fa0; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:bold; display:inline-block;">
            Revisar y Firmar Documento
          </a>
        </div>
        <p style="color:#64748b; font-size:13px;">O copia este enlace en tu navegador:<br>
        <span style="color:#1a4fa0;">{confirm_url}</span></p>
        <p style="color:#94a3b8; font-size:12px; margin-top:24px;">
          Este enlace es de uso personal e intransferible. Expira el {expires_at.strftime('%d/%m/%Y')}.
          Si no esperabas este correo, ignóralo.
        </p>
        """

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    f"{email_service_url}/api/v1/email/module",
                    json={
                        "to_email": signer.email,
                        "full_name": signer.name,
                        "subject": f"Solicitud de firma — {envelope.folio} — {envelope.contract_type_name}",
                        "html_content": html_content,
                    }
                )
        except Exception as e:
            print(f"Warning: Could not send email to {signer.email}: {e}")

        tokens_created.append({
            "signer_name": signer.name,
            "signer_email": signer.email,
            "token": token,
            "expires_at": expires_at.isoformat(),
        })

    await db.commit()

    return {
        "provider": "email_sim",
        "status": "sent",
        "signers_notified": len(tokens_created),
        "details": tokens_created,
    }


# ── DocuSign Provider (placeholder) ──────────────────────────────────────────

async def _send_docusign(db: AsyncSession, envelope_id: str) -> dict:
    """DocuSign provider — to be implemented when credentials are available."""
    raise NotImplementedError(
        "DocuSign provider not yet implemented. "
        "Switch to email_sim provider while DocuSign integration is being configured."
    )


# ── Confirm signature (email_sim) ─────────────────────────────────────────────

async def confirm_signature(db: AsyncSession, token: str) -> dict:
    """
    Confirms a signature from the email link.
    Checks if all signers have signed — if so, marks envelope as completed.
    """
    # Find token
    result = await db.execute(
        select(EnvelopeSigningToken).where(EnvelopeSigningToken.token == token)
    )
    signing_token = result.scalar_one_or_none()

    if not signing_token:
        raise ValueError("Token inválido o no encontrado")

    if signing_token.status == "signed":
        return {"status": "already_signed", "message": "Este documento ya fue firmado anteriormente"}

    now = datetime.now(timezone.utc)
    if signing_token.status == "expired" or signing_token.expires_at < now:
        signing_token.status = "expired"
        await db.commit()
        raise ValueError("Este enlace ha expirado. Contacta al área legal para obtener uno nuevo")

    # Mark as signed
    signing_token.status = "signed"
    signing_token.signed_at = datetime.now(timezone.utc)

    # Update signer status if linked
    if signing_token.signer_id:
        signer_result = await db.execute(
            select(EnvelopeSigner).where(EnvelopeSigner.id == signing_token.signer_id)
        )
        signer = signer_result.scalar_one_or_none()
        if signer:
            signer.status = "signed"
            signer.signed_at = datetime.utcnow()

    await db.commit()

    # Check if all signers have signed
    all_tokens_result = await db.execute(
        select(EnvelopeSigningToken)
        .where(EnvelopeSigningToken.envelope_id == signing_token.envelope_id)
    )
    all_tokens = all_tokens_result.scalars().all()
    all_signed = all(t.status == "signed" for t in all_tokens)

    if all_signed:
        # Mark envelope as completed
        env_result = await db.execute(
            select(Envelope).where(Envelope.id == signing_token.envelope_id)
        )
        envelope = env_result.scalar_one_or_none()
        if envelope and envelope.status not in ("completado", "rechazado"):
            envelope.status = "completado"
            envelope.completed_at = datetime.now(timezone.utc)
            envelope.sla_closed_at = datetime.now(timezone.utc)
            await db.commit()

    return {
        "status": "signed",
        "envelope_id": signing_token.envelope_id,
        "signer_name": signing_token.signer_name,
        "all_signed": all_signed,
        "message": "Firma registrada exitosamente" + (" — Todos los firmantes han firmado" if all_signed else ""),
    }
