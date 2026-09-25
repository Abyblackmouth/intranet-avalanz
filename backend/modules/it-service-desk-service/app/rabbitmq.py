"""Publicador y consumidor de la cola incidencias.motor.asignacion.

El motor corre desacoplado de la peticion HTTP que crea el ticket --
el usuario recibe su folio de inmediato, y la asignacion ocurre en
segundo plano, procesando un mensaje a la vez (ver seccion 6.2 de
submodulo-incidencias-motor-asignacion.md).
"""
import json
import logging

import aio_pika

from app.config import config
from app.motor import resolve_assignment, SYSTEM_ACTOR_ID

logger = logging.getLogger("avalanz")

QUEUE_NAME = "incidencias.motor.asignacion"


async def publish_incident_created(incident_id: str) -> None:
    connection = await aio_pika.connect_robust(config.RABBITMQ_URL)
    async with connection:
        channel = await connection.channel()
        await channel.declare_queue(QUEUE_NAME, durable=True)
        await channel.default_exchange.publish(
            aio_pika.Message(
                body=json.dumps({"incident_id": incident_id}).encode(),
                delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
            ),
            routing_key=QUEUE_NAME,
        )


async def _process_message(body: bytes) -> None:
    from app.database import AsyncSessionLocal
    from app.models.mesa_de_soporte import Incident, IncidentActivityLog
    from app.assignment import finalize_assignment
    from sqlalchemy import select

    data = json.loads(body)
    incident_id = data["incident_id"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Incident).where(Incident.id == incident_id))
        incident = result.scalar_one_or_none()
        if not incident or incident.status != "en_backlog":
            return

        # El motor busca especialista por system_id/reported_type -- CDC y
        # ACC no tienen esos campos (None), y una coincidencia accidental
        # con un "especialista general" de Incidente los asignaria a la
        # persona equivocada. Para cualquier tipo que no sea incidente, se
        # salta la busqueda por completo y se va directo a "sin especialista".
        if incident.ticket_type == "incidente":
            assignment = await resolve_assignment(
                db, incident.system_id, incident.module_id, incident.reported_type
            )
        else:
            assignment = {"encontrado": False}

        if assignment["encontrado"]:
            await finalize_assignment(
                db, incident,
                assigned_team=assignment["equipo_asignado"],
                assigned_to_user_id=assignment["usuario_asignado"],
                actor_id=SYSTEM_ACTOR_ID,
                actor_name="Motor de Asignacion",
                actor_role="sistema",
                action="motor_asigno",
            )
        else:
            db.add(IncidentActivityLog(
                incident_id=incident.id,
                action="motor_sin_especialista",
                performed_by=SYSTEM_ACTOR_ID,
                performed_by_name="Motor de Asignacion",
                performed_by_role="sistema",
                module_slug="it-service-desk",
                detail={"nota": "Se queda en backlog para asignacion manual"},
            ))
            await db.commit()

            from app.assignment import _notify_inapp
            import httpx
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    im_resp = await client.get(
                        "http://admin-service:8000/internal/users/by-module-role",
                        params={"module_slug": "it-service-desk", "role_slug": "incident-manager"},
                    )
                    im_users = im_resp.json() if im_resp.status_code == 200 else []
                for im in im_users:
                    await _notify_inapp(
                        im["id"], f"Ticket #{incident.folio} sin especialista disponible",
                        f"{incident.title} — Quedó en backlog, requiere asignación manual", "warning",
                        {"incident_id": str(incident.id), "folio": incident.folio},
                    )
            except Exception:
                pass


async def start_consumer() -> None:
    connection = await aio_pika.connect_robust(config.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue(QUEUE_NAME, durable=True)

    logger.info("Motor de asignacion: consumidor conectado, esperando mensajes...")

    async with queue.iterator() as queue_iter:
        async for message in queue_iter:
            async with message.process():
                try:
                    await _process_message(message.body)
                except Exception:
                    logger.exception("Error procesando mensaje del motor de asignacion")
