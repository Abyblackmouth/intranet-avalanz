"""Logica compartida de asignacion -- la usan tanto el motor automatico
(rabbitmq.py) como el endpoint de asignacion manual, para que el token
de atencion y las notificaciones nunca queden duplicados ni se olviden
en uno de los dos caminos."""
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.models.mesa_de_soporte import Incident, IncidentActivityLog, IncidentResolutionToken

RESOLUTION_TOKEN_VALID_DAYS = 30


async def _get_user_profile(user_id: str) -> dict:
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(f"http://admin-service:8000/internal/users/{user_id}/profile")
        return resp.json() if resp.status_code == 200 else {}


async def _invalidate_previous_tokens(db: AsyncSession, incident_id: str) -> None:
    """Al reasignar, cualquier token de atencion previo (sin usar) para
    este ticket deja de servir -- evita que dos personas puedan atender
    el mismo ticket a la vez."""
    result = await db.execute(
        select(IncidentResolutionToken).where(
            IncidentResolutionToken.incident_id == incident_id,
            IncidentResolutionToken.used_at.is_(None),
        )
    )
    for tok in result.scalars().all():
        tok.used_at = datetime.now(timezone.utc)


async def _create_resolution_token(db: AsyncSession, incident_id: str, user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    db.add(IncidentResolutionToken(
        incident_id=incident_id,
        token=token,
        created_for_user_id=user_id,
        expires_at=datetime.now(timezone.utc) + timedelta(days=RESOLUTION_TOKEN_VALID_DAYS),
    ))
    return token


async def _notify_assignment(
    to_email: str, full_name: str, folio: str, title: str, token: str,
    is_reassignment: bool, reason: Optional[str] = None,
) -> None:
    """Notificacion 2 (se asigna) o 3 (se reasigna) -- incluye la liga
    de un solo uso para atender el ticket sin iniciar sesion. Si hay un
    motivo (ej. "no me corresponde, se redirige"), se incluye para que
    quien lo recibe sepa por que le llego."""
    attend_url = f"{config.FRONTEND_URL}/atender/{token}"
    subject = f"Se te ha reasignado el ticket #{folio}" if is_reassignment else f"Se te ha asignado el ticket #{folio}"
    fields = [{"label": "Folio", "value": folio, "mono": True}, {"label": "Titulo", "value": title, "mono": False}]
    if reason:
        fields.append({"label": "Motivo", "value": reason, "mono": False})
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": full_name,
                    "subject": subject,
                    "message": "Puedes atenderlo directo desde el boton, sin necesidad de iniciar sesion.", "fields": fields,
                    "action_label": "Atender ticket",
                    "action_url": attend_url,
                    "alert_type": "info",
                },
            )
    except Exception:
        pass


async def _notify_inapp(user_id: str, title: str, body: str, notif_type: str = "info", data: dict = None) -> None:
    """Notificacion in-app (campana + toast en tiempo real) via notify-service.
    Complementa al correo -- alguien con la app abierta la ve al instante,
    sin necesitar revisar su bandeja de entrada. Usa /internal/bulk (con una
    sola persona en la lista) porque esa es la ruta pensada para llamadas
    servicio-a-servicio sin JWT -- la ruta POST / normal exige un usuario
    logueado, que no tenemos en este contexto interno."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://notify-service:8000/api/v1/notifications/internal/bulk",
                json={
                    "user_ids": [user_id], "type": notif_type, "title": title,
                    "body": body, "data": data or {}, "module_slug": "it-service-desk",
                },
            )
    except Exception:
        pass


async def _notify_requester_of_reassignment(to_email: str, requester_name: str, folio: str, new_assignee_name: str) -> None:
    """Parte de la notificacion 3: el solicitante se entera de quien
    quedo a cargo ahora, con transparencia."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                "http://email-service:8000/api/v1/email/system-notification",
                json={
                    "to_email": to_email,
                    "full_name": requester_name,
                    "subject": f"Tu ticket #{folio} fue reasignado",
                    "message": "", "fields": [{"label": "Folio", "value": folio, "mono": True}, {"label": "Ahora a cargo de", "value": new_assignee_name, "mono": False}],
                    "alert_type": "info",
                },
            )
    except Exception:
        pass


async def finalize_assignment(
    db: AsyncSession,
    incident: Incident,
    assigned_team: str,
    assigned_to_user_id: str,
    actor_id: str,
    actor_name: str,
    actor_role: str,
    action: str,
    reason: Optional[str] = None,
) -> None:
    """Aplica la asignacion (manual, automatica, o redireccion desde el
    enlace de atencion). Si el ticket ya tenia a alguien asignado, se
    trata como reasignacion: se invalida el token anterior y se avisa
    tambien al solicitante quien quedo a cargo. Si hay un motivo (ej.
    redireccion por no corresponder), se incluye en bitacora y correo."""
    is_reassignment = incident.assigned_to_user_id is not None

    if is_reassignment:
        await _invalidate_previous_tokens(db, incident.id)
        if action == "asignacion_manual":
            action = "reasignacion_manual"

    incident.assigned_team = assigned_team
    incident.assigned_to_user_id = assigned_to_user_id
    incident.assigned_at = datetime.now(timezone.utc)
    incident.status = "asignado"

    token = await _create_resolution_token(db, incident.id, assigned_to_user_id)

    detail = {"equipo_asignado": assigned_team, "usuario_asignado": assigned_to_user_id, "es_reasignacion": is_reassignment}
    if reason:
        detail["motivo"] = reason

    db.add(IncidentActivityLog(
        incident_id=incident.id,
        action=action,
        performed_by=actor_id,
        performed_by_name=actor_name,
        performed_by_role=actor_role,
        module_slug="it-service-desk",
        detail=detail,
    ))
    await db.commit()

    profile = await _get_user_profile(assigned_to_user_id)
    if profile.get("email"):
        await _notify_assignment(profile["email"], profile.get("full_name", ""), incident.folio, incident.title, token, is_reassignment, reason)

    titulo_inapp = f"Ticket #{incident.folio} reasignado" if is_reassignment else f"Ticket #{incident.folio} asignado"
    cuerpo_inapp = f"{incident.title}" + (f" — Motivo: {reason}" if reason else "")
    await _notify_inapp(
        assigned_to_user_id, titulo_inapp, cuerpo_inapp, "info",
        {"incident_id": str(incident.id), "folio": incident.folio},
    )

    if is_reassignment:
        requester_profile = await _get_user_profile(incident.requester_id)
        if requester_profile.get("email"):
            await _notify_requester_of_reassignment(
                requester_profile["email"], incident.requester_name, incident.folio, profile.get("full_name", "")
            )
        if incident.requester_id:
            await _notify_inapp(
                incident.requester_id, f"Tu ticket #{incident.folio} fue reasignado",
                f"Ahora está a cargo de {profile.get('full_name', '')}", "info",
                {"incident_id": str(incident.id), "folio": incident.folio},
            )

    # Tiempo real -- cubre asignacion manual, reasignacion, y redireccion
    # desde el enlace de atencion (todas pasan por aqui)
    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    await _broadcast_ticket_update(incident)


async def finalize_cdc_assignment(
    db: AsyncSession,
    incident: Incident,
    assigned_to_user_id: str,
    via: str,
    actor_id: str,
    actor_name: str,
) -> None:
    """Aplica la asignacion automatica de un Control de Cambios al salir
    de backlog -- version simplificada de finalize_assignment: cambia a
    en_revision (no "asignado", que es vocabulario de Incidente), y no
    genera token de atencion por correo (ese flujo aun no existe para CDC).
    Separada a proposito, no una version parametrizada de la de Incidente,
    para no forzar un comportamiento compartido que no aplica todavia."""
    incident.assigned_to_user_id = assigned_to_user_id
    incident.assigned_at = datetime.now(timezone.utc)
    incident.status = "en_revision"

    db.add(IncidentActivityLog(
        incident_id=incident.id,
        action="motor_asigno_cdc",
        performed_by=actor_id,
        performed_by_name=actor_name,
        performed_by_role="sistema",
        module_slug="it-service-desk",
        detail={"usuario_asignado": assigned_to_user_id, "via": via},
    ))
    await db.commit()

    profile = await _get_user_profile(assigned_to_user_id)
    await _notify_inapp(
        assigned_to_user_id,
        f"Control de Cambios #{incident.folio} para revisar",
        incident.title,
        "info",
        {"incident_id": str(incident.id), "folio": incident.folio},
    )
    if profile.get("email"):
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    "http://email-service:8000/api/v1/email/system-notification",
                    json={
                        "to_email": profile["email"],
                        "full_name": profile.get("full_name", ""),
                        "subject": f"Control de Cambios #{incident.folio} para revisar",
                        "message": "Se te asigno un Control de Cambios para revision.",
                        "fields": [{"label": "Folio", "value": incident.folio, "mono": True}, {"label": "Titulo", "value": incident.title, "mono": False}],
                        "alert_type": "info",
                    },
                )
        except Exception:
            pass

    from app.routes.mesa_de_soporte.mesa_de_soporte import _broadcast_ticket_update
    await _broadcast_ticket_update(incident)
