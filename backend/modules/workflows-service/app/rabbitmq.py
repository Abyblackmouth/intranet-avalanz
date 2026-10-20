"""Cola workflows.resultados: el regreso a la plataforma corre fuera de la petición HTTP.

Cuando un trámite cierra, se publica un mensaje por cada transacción pendiente y el
consumidor la intenta. Además, un barrido cada minuto recoge lo que esté en error con
próximo intento vencido (por si RabbitMQ no estaba o el mensaje se perdió)."""
import asyncio
import json
import logging

import aio_pika
from sqlalchemy import select

from app.config import config

logger = logging.getLogger("avalanz")
QUEUE_NAME = "workflows.resultados"


async def publicar(tx_id: str) -> None:
    try:
        connection = await aio_pika.connect_robust(config.RABBITMQ_URL)
        async with connection:
            channel = await connection.channel()
            await channel.declare_queue(QUEUE_NAME, durable=True)
            await channel.default_exchange.publish(aio_pika.Message(body=json.dumps({"tx_id": tx_id}).encode(), delivery_mode=aio_pika.DeliveryMode.PERSISTENT), routing_key=QUEUE_NAME)
    except Exception:
        logger.exception("No se pudo publicar en RabbitMQ; el barrido lo recogerá")


async def publicar_resultados_pendientes(instancia_id: str) -> None:
    from app.database import AsyncSessionLocal
    from app.models import Transaccion
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Transaccion.id).where(Transaccion.instancia_id == instancia_id, Transaccion.direccion == "salida", Transaccion.estado == "pendiente_envio"))
        ids = [r[0] for r in res.all()]
    for tx_id in ids:
        await publicar(tx_id)


async def _procesar_tx(tx_id: str) -> None:
    from app.database import AsyncSessionLocal
    from app.models import Transaccion
    from app.motor import transacciones as outbox
    async with AsyncSessionLocal() as db:
        tx = (await db.execute(select(Transaccion).where(Transaccion.id == tx_id))).scalar_one_or_none()
        if not tx or tx.estado not in ("pendiente_envio", "error"):
            return
        r = await outbox.procesar(db, tx)
        logger.info("workflows.resultados tx=%s estado=%s status=%s", tx_id, r.get("estado"), r.get("status"))


async def start_consumer() -> None:
    connection = await aio_pika.connect_robust(config.RABBITMQ_URL)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=1)
    queue = await channel.declare_queue(QUEUE_NAME, durable=True)
    logger.info("Workflows: consumidor de resultados conectado")
    async with queue.iterator() as it:
        async for message in it:
            async with message.process():
                try:
                    await _procesar_tx(json.loads(message.body)["tx_id"])
                except Exception:
                    logger.exception("Error procesando resultado")


async def barrido_periodico(cada_segundos: int = 60) -> None:
    """Recoge pendientes y errores con próximo intento vencido. Un flujo trabado no detiene a otro:
    cada transacción se procesa por separado."""
    from app.database import AsyncSessionLocal
    from app.motor import transacciones as outbox
    while True:
        try:
            async with AsyncSessionLocal() as db:
                for tx in await outbox.pendientes(db):
                    try:
                        await outbox.procesar(db, tx)
                    except Exception:
                        logger.exception("Barrido: falló tx %s", tx.id)
                try:
                    from app.motor.avisos import revisar_afectaciones_pendientes
                    await revisar_afectaciones_pendientes(db)
                except Exception:
                    logger.exception("Barrido: revisión de afectaciones pendientes")
        except Exception:
            logger.exception("Barrido de resultados falló")
        await asyncio.sleep(cada_segundos)
