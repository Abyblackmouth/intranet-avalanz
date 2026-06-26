"""
Servicio de notificaciones para el Módulo Legal.
Llama al notify-service y websocket-service via HTTP interno.
"""
import httpx
import os
import logging

logger = logging.getLogger("avalanz")

NOTIFY_URL     = os.getenv("NOTIFY_SERVICE_URL", "http://avalanz-notify:8000")
WEBSOCKET_URL  = os.getenv("WEBSOCKET_SERVICE_URL", "http://avalanz-websocket:8000")
MODULE_SLUG    = "legal"


async def _post(url: str, payload: dict) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.post(url, json=payload)
            return r.status_code < 300
    except Exception as e:
        logger.error(f"[notify] Error llamando {url}: {e}")
        return False


async def _notify(user_ids: list, type: str, title: str, body: str,
                  data: dict = None, company_id: str = None) -> None:
    if not user_ids:
        return
    await _post(f"{NOTIFY_URL}/api/v1/notifications/internal/bulk", {
        "user_ids": [str(uid) for uid in user_ids],
        "type": type,
        "title": title,
        "body": body,
        "module_slug": MODULE_SLUG,
        "company_id": str(company_id) if company_id else None,
        "data": data or {},
    })


async def _ws_send(user_id: str, event_type: str, data: dict) -> None:
    await _post(f"{WEBSOCKET_URL}/ws/send", {
        "user_id": str(user_id),
        "event_type": event_type,
        "data": data,
        "module_slug": MODULE_SLUG,
    })


async def _ws_broadcast(user_ids: list, event_type: str, data: dict) -> None:
    if not user_ids:
        return
    await _post(f"{WEBSOCKET_URL}/ws/broadcast", {
        "user_ids": [str(uid) for uid in user_ids],
        "event_type": event_type,
        "data": data,
        "module_slug": MODULE_SLUG,
    })


def _envelope_data(envelope) -> dict:
    return {
        "envelope_id": str(envelope.id),
        "folio": envelope.folio,
        "contract_type_name": envelope.contract_type_name,
        "company_name": envelope.company_name,
        "requested_by_name": envelope.requested_by_name,
        "status": envelope.status,
    }


async def notify_nuevo_sobre(envelope, coordinador_ids: list) -> None:
    data = _envelope_data(envelope)
    title = f"Nuevo contrato — {envelope.folio}"
    body = f"{envelope.requested_by_name} de {envelope.company_name} solicitó un {envelope.contract_type_name}."
    await _notify(user_ids=coordinador_ids, type="info", title=title, body=body,
                  data=data, company_id=str(envelope.company_id))
    await _ws_broadcast(coordinador_ids, "notification.new", {**data, "title": title, "body": body, "type": "info"})
    await _ws_broadcast(coordinador_ids, "legal.tabla_actualizada", data)


async def notify_abogado_asignado(envelope, abogado_id: str) -> None:
    data = _envelope_data(envelope)
    title = f"Nuevo sobre asignado — {envelope.folio}"
    body = f"Se te asignó el contrato {envelope.folio} ({envelope.contract_type_name}) de {envelope.company_name}."
    await _notify(user_ids=[abogado_id], type="info", title=title, body=body,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(abogado_id, "notification.new", {**data, "title": title, "body": body, "type": "info"})
    await _ws_send(abogado_id, "legal.tabla_actualizada", data)


async def notify_solicitante_abogado_asignado(envelope) -> None:
    data = _envelope_data(envelope)
    data["assigned_lawyer_name"] = envelope.assigned_lawyer_name
    title = f"Tu contrato fue asignado — {envelope.folio}"
    body = f"Tu contrato {envelope.folio} fue asignado al abogado {envelope.assigned_lawyer_name}."
    await _notify(user_ids=[str(envelope.requested_by_user_id)], type="info", title=title, body=body,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(str(envelope.requested_by_user_id), "notification.new", {**data, "title": title, "body": body, "type": "info"})
    await _ws_send(str(envelope.requested_by_user_id), "legal.tabla_actualizada", data)


async def notify_sobre_en_firmas(envelope) -> None:
    data = _envelope_data(envelope)
    title = f"Contrato aprobado — {envelope.folio}"
    body = f"Tu contrato {envelope.folio} fue aprobado. Los firmantes recibirán un correo de DocuSign para firmar."
    await _notify(user_ids=[str(envelope.requested_by_user_id)], type="success", title=title, body=body,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(str(envelope.requested_by_user_id), "notification.new", {**data, "title": title, "body": body, "type": "success"})
    await _ws_send(str(envelope.requested_by_user_id), "legal.tabla_actualizada", data)


async def notify_sobre_rechazado(envelope, coordinador_ids: list) -> None:
    data = _envelope_data(envelope)
    title_sol = f"Contrato rechazado — {envelope.folio}"
    body_sol = f"Tu contrato {envelope.folio} fue rechazado por el área legal."
    await _notify(user_ids=[str(envelope.requested_by_user_id)], type="error", title=title_sol, body=body_sol,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(str(envelope.requested_by_user_id), "notification.new", {**data, "title": title_sol, "body": body_sol, "type": "error"})
    await _ws_send(str(envelope.requested_by_user_id), "legal.tabla_actualizada", data)
    title_coord = f"Contrato rechazado — {envelope.folio}"
    body_coord = f"El contrato {envelope.folio} de {envelope.company_name} fue rechazado."
    await _notify(user_ids=coordinador_ids, type="warning", title=title_coord, body=body_coord,
                  data=data, company_id=str(envelope.company_id))
    await _ws_broadcast(coordinador_ids, "notification.new", {**data, "title": title_coord, "body": body_coord, "type": "warning"})


async def notify_sobre_completado(envelope, coordinador_ids: list) -> None:
    data = _envelope_data(envelope)
    title_sol = f"Contrato completado — {envelope.folio}"
    body_sol = f"Tu contrato {envelope.folio} fue firmado por todas las partes y está disponible para descargar."
    await _notify(user_ids=[str(envelope.requested_by_user_id)], type="success", title=title_sol, body=body_sol,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(str(envelope.requested_by_user_id), "notification.new", {**data, "title": title_sol, "body": body_sol, "type": "success"})
    await _ws_send(str(envelope.requested_by_user_id), "legal.tabla_actualizada", data)
    if envelope.assigned_lawyer_id:
        await _ws_send(str(envelope.assigned_lawyer_id), "legal.tabla_actualizada", data)
    title_coord = f"Contrato completado — {envelope.folio}"
    body_coord = f"El contrato {envelope.folio} de {envelope.company_name} fue firmado por todas las partes."
    await _notify(user_ids=coordinador_ids, type="success", title=title_coord, body=body_coord,
                  data=data, company_id=str(envelope.company_id))
    await _ws_broadcast(coordinador_ids, "notification.new", {**data, "title": title_coord, "body": body_coord, "type": "success"})


async def notify_correcciones_solicitadas(envelope) -> None:
    data = _envelope_data(envelope)
    title = f"Correcciones requeridas — {envelope.folio}"
    body = f"El área legal solicitó correcciones en tu contrato {envelope.folio}. Revisa los comentarios."
    await _notify(user_ids=[str(envelope.requested_by_user_id)], type="warning", title=title, body=body,
                  data=data, company_id=str(envelope.company_id))
    await _ws_send(str(envelope.requested_by_user_id), "notification.new", {**data, "title": title, "body": body, "type": "warning"})
    await _ws_send(str(envelope.requested_by_user_id), "legal.tabla_actualizada", data)


async def ws_refresh_tabla(user_ids: list, envelope) -> None:
    await _ws_broadcast(user_ids, "legal.tabla_actualizada", _envelope_data(envelope))
