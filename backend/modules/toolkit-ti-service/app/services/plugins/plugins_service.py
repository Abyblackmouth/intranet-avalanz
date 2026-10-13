"""Ejecucion de plugins: cada corrida va en su propio proceso, con limite de tiempo y de
memoria, para que un plugin colgado o con error no afecte al servicio. Las entradas y los
resultados se guardan en el almacenamiento (MinIO) y el registro queda en la base."""
import asyncio
import json
import os
import resource
import shutil
import sys
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

import boto3
from botocore.config import Config as BotoConfig
from sqlalchemy import select

from app.config import config
from app.database import AsyncSessionLocal
from app.models import PluginEjecucion

BUCKET = "dirdoc"
MEMORIA_MAX = 1024 * 1024 * 1024        # 1 GB por ejecucion
LOG_MAX = 60_000                        # caracteres del registro que se guardan


def _s3():
    ep = config.MINIO_ENDPOINT
    return boto3.client("s3", endpoint_url=ep if ep.startswith("http") else f"http://{ep}",
                        aws_access_key_id=config.MINIO_ACCESS_KEY, aws_secret_access_key=config.MINIO_SECRET_KEY,
                        config=BotoConfig(signature_version="s3v4"), region_name="us-east-1")


def _subir(ruta: Path, key: str) -> dict:
    _s3().upload_file(str(ruta), BUCKET, key)
    return {"nombre": ruta.name, "object_key": key, "bucket": BUCKET, "size_bytes": ruta.stat().st_size}


def _limites():
    resource.setrlimit(resource.RLIMIT_AS, (MEMORIA_MAX, MEMORIA_MAX))


async def preparar(slug: str, params: dict, archivos: dict, usuario: dict, origen: str = "manual") -> tuple:
    """Guarda las entradas en una carpeta de trabajo y crea la ejecucion. archivos: {param: (nombre, bytes)}"""
    trabajo = Path(tempfile.mkdtemp(prefix=f"plugin_{slug}_"))
    (trabajo / "entrada").mkdir()
    nombres = {}
    for param, (nombre, datos) in archivos.items():
        limpio = Path(nombre).name.replace(" ", "_")[-120:] or f"{param}.bin"
        (trabajo / "entrada" / limpio).write_bytes(datos)
        nombres[param] = limpio
    (trabajo / "params.json").write_text(json.dumps(params))
    (trabajo / "archivos.json").write_text(json.dumps(nombres))
    async with AsyncSessionLocal() as db:
        e = PluginEjecucion(slug=slug, estado="en_proceso", parametros=params, origen=origen,
                            iniciado_por_id=usuario.get("user_id"), iniciado_por=usuario.get("full_name"),
                            archivos_entrada=[{"nombre": n, "param": p} for p, n in nombres.items()])
        db.add(e)
        await db.commit()
        await db.refresh(e)
        return e.id, trabajo


async def correr(ejecucion_id, slug: str, trabajo: Path, tiempo_maximo: int) -> None:
    """Corre el plugin aparte y guarda el resultado. Se lanza en segundo plano."""
    inicio = datetime.now(timezone.utc)
    log, estado, error, salidas, entradas = "", "error", None, [], []
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "app.plugins_runner", slug, str(trabajo),
            cwd="/app", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT, preexec_fn=_limites,
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=tiempo_maximo)
            log = out.decode(errors="replace")
            estado = "ok" if proc.returncode == 0 else "error"
            if estado == "error":
                error = next((l[2:] for l in reversed(log.splitlines()) if l.startswith("✗")), "El plugin termino con error")
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            error = f"Se detuvo: paso de su tiempo maximo ({tiempo_maximo} s)"
        prefijo = f"toolkit-ti/plugins/{slug}/{ejecucion_id}"
        for ruta in sorted((trabajo / "entrada").glob("*")):
            entradas.append(await asyncio.to_thread(_subir, ruta, f"{prefijo}/entrada/{ruta.name}"))
        if estado == "ok":
            for ruta in sorted((trabajo / "salida").glob("*")):
                if ruta.is_file():
                    salidas.append(await asyncio.to_thread(_subir, ruta, f"{prefijo}/salida/{ruta.name}"))
    except Exception as e:
        error = f"No se pudo ejecutar: {type(e).__name__}: {e}"
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)
    fin = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        e = (await db.execute(select(PluginEjecucion).where(PluginEjecucion.id == ejecucion_id))).scalar_one()
        e.estado, e.error, e.log = estado, error, log[-LOG_MAX:]
        e.archivos_salida = salidas
        e.archivos_entrada = entradas or e.archivos_entrada
        e.terminado_at, e.duracion_ms = fin, int((fin - inicio).total_seconds() * 1000)
        await db.commit()


async def limpiar_colgadas() -> None:
    """Al arrancar el servicio: las ejecuciones que quedaron a medias se marcan como error."""
    async with AsyncSessionLocal() as db:
        filas = (await db.execute(select(PluginEjecucion).where(PluginEjecucion.estado == "en_proceso"))).scalars().all()
        for e in filas:
            e.estado, e.error, e.terminado_at = "error", "El servicio se reinicio durante la ejecucion", datetime.now(timezone.utc)
        await db.commit()
