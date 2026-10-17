"""Conexiones con las plataformas (Ajustes → Conexiones).

Los secretos (contrasena/token hacia la plataforma y el token de entrada que
manda la plataforma) se guardan cifrados con la FERNET_KEY del modulo y nunca
se devuelven al frontend, salvo el token de entrada, que el super admin
necesita leer para capturarlo en el parametro MV_XWFTOKEN de Protheus.
"""
import secrets
import time
from typing import Any, Dict, List, Optional

import httpx
from fastapi import HTTPException
from shared.utils.encryption import decrypt_data, encrypt_data
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import config
from app.models import Conexion, ConexionEmpresa, Flujo
from app.services.ajustes.ajustes_service import registrar_historial

AUTH_TIPOS = ("ninguna", "basica", "token")


def _cifrar(texto: Optional[str]) -> Optional[str]:
    if not texto:
        return None
    if not config.FERNET_KEY:
        raise HTTPException(status_code=500, detail="Falta FERNET_KEY en el .env del workflows-service")
    return encrypt_data(texto, config.FERNET_KEY)


def _descifrar(cifrado: Optional[str]) -> Optional[str]:
    if not cifrado:
        return None
    return decrypt_data(cifrado, config.FERNET_KEY)


def generar_token() -> str:
    return "wft_" + secrets.token_urlsafe(32)


def serializar(c: Conexion, empresas: List[ConexionEmpresa], flujos: int = 0, con_token: bool = False) -> Dict[str, Any]:
    return {
        "id": c.id, "slug": c.slug, "titulo": c.titulo, "url_base": c.url_base,
        "auth_tipo": c.auth_tipo, "auth_usuario": c.auth_usuario, "tiene_secreto": bool(c.auth_secreto),
        "token_entrada": _descifrar(c.token_entrada) if con_token else None,
        "timeout_seg": c.timeout_seg, "reintentos_max": c.reintentos_max, "espaciado_min": c.espaciado_min or [],
        "activa": c.activa, "flujos": flujos,
        "empresas": [{"id": e.id, "clave": e.clave, "nombre": e.nombre, "company_id": e.company_id, "activa": e.activa}
                     for e in sorted(empresas, key=lambda x: x.clave)],
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


async def _empresas(db: AsyncSession, conexion_id: str) -> List[ConexionEmpresa]:
    res = await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.conexion_id == conexion_id))
    return list(res.scalars().all())


async def _flujos_count(db: AsyncSession, conexion_id: str) -> int:
    res = await db.execute(select(Flujo.id).where(Flujo.conexion_id == conexion_id))
    return len(res.all())


async def obtener(db: AsyncSession, conexion_id: str) -> Conexion:
    res = await db.execute(select(Conexion).where(Conexion.id == conexion_id))
    c = res.scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404, detail="Conexión no encontrada")
    return c


async def por_slug(db: AsyncSession, slug: str) -> Optional[Conexion]:
    res = await db.execute(select(Conexion).where(Conexion.slug == slug))
    return res.scalar_one_or_none()


async def listar(db: AsyncSession) -> List[Dict[str, Any]]:
    res = await db.execute(select(Conexion).order_by(Conexion.titulo))
    out = []
    for c in res.scalars().all():
        out.append(serializar(c, await _empresas(db, c.id), await _flujos_count(db, c.id), con_token=True))
    return out


def _validar(datos: Dict[str, Any]) -> None:
    slug = (datos.get("slug") or "").strip().lower()
    if not slug or not slug.replace("-", "").replace("_", "").isalnum() or len(slug) > 50:
        raise HTTPException(status_code=422, detail="El slug solo lleva letras, números y guiones (es lo que viaja en el sobre como plataforma)")
    if not (datos.get("titulo") or "").strip():
        raise HTTPException(status_code=422, detail="El título es obligatorio")
    if datos.get("auth_tipo") not in AUTH_TIPOS:
        raise HTTPException(status_code=422, detail="Tipo de autenticación no válido")
    esp = datos.get("espaciado_min") or []
    if not isinstance(esp, list) or not all(isinstance(x, int) and x > 0 for x in esp):
        raise HTTPException(status_code=422, detail="El espaciado es una lista de minutos, por ejemplo 1, 5, 15, 60")
    for campo, lo, hi in (("timeout_seg", 1, 300), ("reintentos_max", 0, 50)):
        v = datos.get(campo)
        if not isinstance(v, int) or not lo <= v <= hi:
            raise HTTPException(status_code=422, detail=f"{campo} debe estar entre {lo} y {hi}")


async def crear(db: AsyncSession, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    _validar(datos)
    if await por_slug(db, datos["slug"].strip().lower()):
        raise HTTPException(status_code=409, detail="Ya existe una conexión con ese slug")
    token = generar_token()
    c = Conexion(
        slug=datos["slug"].strip().lower(), titulo=datos["titulo"].strip(), url_base=(datos.get("url_base") or "").strip().rstrip("/"),
        auth_tipo=datos["auth_tipo"], auth_usuario=(datos.get("auth_usuario") or "").strip() or None,
        auth_secreto=_cifrar(datos.get("auth_secreto")), token_entrada=_cifrar(token),
        timeout_seg=datos["timeout_seg"], reintentos_max=datos["reintentos_max"], espaciado_min=datos["espaciado_min"],
        activa=bool(datos.get("activa", True)),
    )
    db.add(c)
    await db.flush()
    await registrar_historial(db, f"conexion.{c.slug}", None, "creada", user)
    await db.commit()
    await db.refresh(c)
    return serializar(c, [], 0, con_token=True)


async def actualizar(db: AsyncSession, conexion_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    c = await obtener(db, conexion_id)
    completo = {**serializar(c, []), **datos}
    _validar(completo)
    cambios = []
    for campo in ("titulo", "url_base", "auth_tipo", "auth_usuario", "timeout_seg", "reintentos_max", "espaciado_min", "activa"):
        if campo in datos:
            nuevo = datos[campo]
            if isinstance(nuevo, str):
                nuevo = nuevo.strip()
                if campo == "url_base":
                    nuevo = nuevo.rstrip("/")
                if campo == "auth_usuario":
                    nuevo = nuevo or None
            if getattr(c, campo) != nuevo:
                cambios.append(f"{campo}: {getattr(c, campo)} → {nuevo}")
                setattr(c, campo, nuevo)
    if datos.get("auth_secreto"):
        c.auth_secreto = _cifrar(datos["auth_secreto"])
        cambios.append("auth_secreto: cambiado")
    if datos.get("borrar_secreto"):
        c.auth_secreto = None
        cambios.append("auth_secreto: borrado")
    if cambios:
        await registrar_historial(db, f"conexion.{c.slug}", None, "; ".join(cambios), user)
        await db.commit()
        await db.refresh(c)
    return serializar(c, await _empresas(db, c.id), await _flujos_count(db, c.id), con_token=True)


async def regenerar_token(db: AsyncSession, conexion_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    c = await obtener(db, conexion_id)
    token = generar_token()
    c.token_entrada = _cifrar(token)
    await registrar_historial(db, f"conexion.{c.slug}", None, "token_entrada: regenerado", user)
    await db.commit()
    return {"token_entrada": token}


async def eliminar(db: AsyncSession, conexion_id: str, user: Dict[str, Any]) -> None:
    c = await obtener(db, conexion_id)
    if await _flujos_count(db, c.id):
        raise HTTPException(status_code=409, detail="La conexión tiene flujos; desactívala en lugar de borrarla")
    await registrar_historial(db, f"conexion.{c.slug}", None, "eliminada", user)
    await db.delete(c)
    await db.commit()


def validar_token_entrada(c: Conexion, token: Optional[str]) -> bool:
    """Lo usa el endpoint de integracion: compara el X-WF-Token con el guardado."""
    guardado = _descifrar(c.token_entrada)
    return bool(token) and bool(guardado) and secrets.compare_digest(token, guardado)


def credenciales_salida(c: Conexion) -> Dict[str, Any]:
    """Como autenticarse hacia la plataforma. Solo lo consume el conector, nunca el frontend."""
    return {"tipo": c.auth_tipo, "usuario": c.auth_usuario, "secreto": _descifrar(c.auth_secreto)}


async def probar(db: AsyncSession, conexion_id: str) -> Dict[str, Any]:
    """GET a la URL base con la autenticacion configurada. No manda nada a ningun flujo."""
    c = await obtener(db, conexion_id)
    if not c.url_base:
        raise HTTPException(status_code=422, detail="La conexión no tiene URL base")
    cred = credenciales_salida(c)
    headers, auth = {}, None
    if cred["tipo"] == "basica" and cred["usuario"]:
        auth = (cred["usuario"], cred["secreto"] or "")
    elif cred["tipo"] == "token" and cred["secreto"]:
        headers["Authorization"] = f"Bearer {cred['secreto']}"
    inicio = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=c.timeout_seg, verify=False) as client:
            r = await client.get(c.url_base, headers=headers, auth=auth)
        ms = int((time.monotonic() - inicio) * 1000)
        return {"ok": r.status_code < 500, "status": r.status_code, "ms": ms,
                "mensaje": f"La plataforma respondió HTTP {r.status_code} en {ms} ms"}
    except httpx.TimeoutException:
        return {"ok": False, "status": None, "ms": None, "mensaje": f"Sin respuesta en {c.timeout_seg} s"}
    except Exception as e:  # DNS, conexión rechazada, etc.
        return {"ok": False, "status": None, "ms": None, "mensaje": f"No se pudo conectar: {type(e).__name__}"}


# ── Empresas de la conexion ───────────────────────────────────────────────

def _validar_clave(clave: str) -> str:
    clave = (clave or "").strip()
    partes = clave.split("|")
    if len(partes) != 2 or not all(p.strip().isalnum() for p in partes):
        raise HTTPException(status_code=422, detail="La clave va como grupo|empresa, por ejemplo 02|01")
    return "|".join(p.strip() for p in partes)


async def agregar_empresa(db: AsyncSession, conexion_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    c = await obtener(db, conexion_id)
    clave = _validar_clave(datos.get("clave", ""))
    res = await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.conexion_id == c.id, ConexionEmpresa.clave == clave))
    if res.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Esa clave ya está en la conexión")
    e = ConexionEmpresa(conexion_id=c.id, clave=clave, nombre=(datos.get("nombre") or "").strip(), company_id=datos.get("company_id") or None)
    db.add(e)
    await registrar_historial(db, f"conexion.{c.slug}", None, f"empresa agregada: {clave} {e.nombre}", user)
    await db.commit()
    await db.refresh(e)
    return {"id": e.id, "clave": e.clave, "nombre": e.nombre, "company_id": e.company_id, "activa": e.activa}


async def actualizar_empresa(db: AsyncSession, conexion_id: str, empresa_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    c = await obtener(db, conexion_id)
    res = await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.id == empresa_id, ConexionEmpresa.conexion_id == c.id))
    e = res.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    for campo in ("nombre", "company_id", "activa"):
        if campo in datos:
            setattr(e, campo, datos[campo].strip() if isinstance(datos[campo], str) else datos[campo])
    await registrar_historial(db, f"conexion.{c.slug}", None, f"empresa actualizada: {e.clave}", user)
    await db.commit()
    await db.refresh(e)
    return {"id": e.id, "clave": e.clave, "nombre": e.nombre, "company_id": e.company_id, "activa": e.activa}


async def quitar_empresa(db: AsyncSession, conexion_id: str, empresa_id: str, user: Dict[str, Any]) -> None:
    c = await obtener(db, conexion_id)
    res = await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.id == empresa_id, ConexionEmpresa.conexion_id == c.id))
    e = res.scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Empresa no encontrada")
    await registrar_historial(db, f"conexion.{c.slug}", None, f"empresa quitada: {e.clave}", user)
    await db.delete(e)
    await db.commit()
