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
    from sqlalchemy import select

    data = json.loads(body)
    incident_id = data["incident_id"]

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Incident).where(Incident.id == incident_id))
        incident = result.scalar_one_or_none()
        if not incident or incident.status != "en_backlog":
            return

        assignment = await resolve_assignment(
            db, incident.system_id, incident.module_id, incident.reported_type
        )

        if assignment["encontrado"]:
            incident.assigned_team = assignment["equipo_asignado"]
            incident.assigned_to_user_id = assignment["usuario_asignado"]
            incident.status = "asignado"

            db.add(IncidentActivityLog(
                incident_id=incident.id,
                action="motor_asigno",
                performed_by=SYSTEM_ACTOR_ID,
                performed_by_name="Motor de Asignacion",
                performed_by_role="sistema",
                module_slug="it-service-desk",
                detail={
                    "equipo_asignado": assignment["equipo_asignado"],
                    "usuario_asignado": assignment["usuario_asignado"],
                },
            ))
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
