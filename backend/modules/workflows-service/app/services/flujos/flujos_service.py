"""Flujos (definicion): datos generales, grupos de aprobacion, miembros, etapas y versiones.

Cada cambio en grupos o etapas crea una version nueva con la definicion completa
en JSON. Las instancias nacen con la version vigente y la recuerdan: cambiar el
flujo hoy no altera lo que ya esta en aprobacion.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (Conexion, Flujo, FlujoGrupo, FlujoGrupoEtapa, FlujoGrupoMiembro, FlujoVersion, Instancia)
from app.motor.grupos import simular as motor_simular
from app.services.ajustes.ajustes_service import registrar_historial


# ── Serializacion ─────────────────────────────────────────────────────────

def _etapa(e: FlujoGrupoEtapa) -> Dict[str, Any]:
    return {"id": e.id, "orden": e.orden, "nombre": e.nombre, "tipo": e.tipo, "puesto_esperado": e.puesto_esperado,
            "tipo_resolucion": e.tipo_resolucion, "aprobador_user_id": e.aprobador_user_id, "aprobador_nombre": e.aprobador_nombre,
            "aprobador_email": e.aprobador_email, "suplente_user_id": e.suplente_user_id, "suplente_nombre": e.suplente_nombre,
            "suplente_email": e.suplente_email, "condicion": e.condicion,
            "comentario_rechazo_obligatorio": e.comentario_rechazo_obligatorio, "permite_adjuntos": e.permite_adjuntos}


def _miembro(m: FlujoGrupoMiembro) -> Dict[str, Any]:
    return {"id": m.id, "user_id": m.user_id, "login_externo": m.login_externo, "nombre": m.nombre}


def _grupo(g: FlujoGrupo, etapas: List[FlujoGrupoEtapa], miembros: List[FlujoGrupoMiembro]) -> Dict[str, Any]:
    return {"id": g.id, "origen_clave": g.origen_clave, "nombre": g.nombre, "es_default": g.es_default,
            "auto_aprobacion": g.auto_aprobacion, "activo": g.activo, "orden": g.orden,
            "etapas": [_etapa(e) for e in sorted(etapas, key=lambda x: x.orden)],
            "miembros": [_miembro(m) for m in sorted(miembros, key=lambda x: x.nombre)]}


async def _grupos_de(db: AsyncSession, flujo_id: str) -> List[Dict[str, Any]]:
    grupos = (await db.execute(select(FlujoGrupo).where(FlujoGrupo.flujo_id == flujo_id).order_by(FlujoGrupo.origen_clave, FlujoGrupo.orden, FlujoGrupo.nombre))).scalars().all()
    ids = [g.id for g in grupos]
    etapas = (await db.execute(select(FlujoGrupoEtapa).where(FlujoGrupoEtapa.grupo_id.in_(ids)))).scalars().all() if ids else []
    miembros = (await db.execute(select(FlujoGrupoMiembro).where(FlujoGrupoMiembro.grupo_id.in_(ids)))).scalars().all() if ids else []
    return [_grupo(g, [e for e in etapas if e.grupo_id == g.id], [m for m in miembros if m.grupo_id == g.id]) for g in grupos]


async def _instancias_activas(db: AsyncSession, flujo_id: str) -> int:
    return (await db.execute(select(func.count()).select_from(Instancia).where(Instancia.flujo_id == flujo_id, Instancia.status == "en_aprobacion"))).scalar_one()


async def _instancias_total(db: AsyncSession, flujo_id: str) -> int:
    return (await db.execute(select(func.count()).select_from(Instancia).where(Instancia.flujo_id == flujo_id))).scalar_one()


def _codigo_folio(v: Any) -> Optional[str]:
    v = str(v or "").strip().upper()
    if v and (len(v) > 6 or not v.isalnum()):
        raise HTTPException(status_code=422, detail="El código del flujo para el folio solo lleva letras y números (máximo 6)")
    return v or None


def _flujo(f: Flujo, conexion: Optional[Conexion], grupos: int, activas: int) -> Dict[str, Any]:
    return {"id": f.id, "process_id": f.process_id, "aliases": f.aliases or [], "nombre": f.nombre, "descripcion": f.descripcion,
            "conexion_id": f.conexion_id, "conexion_titulo": conexion.titulo if conexion else None, "conexion_slug": conexion.slug if conexion else None,
            "result_service": f.result_service, "activo": f.activo, "version": f.version, "correos": f.correos, "resumen": f.resumen, "hoja": f.hoja, "folio_codigo": f.folio_codigo,
            "grupos": grupos, "instancias_activas": activas, "updated_at": f.updated_at.isoformat() if f.updated_at else None}


async def obtener(db: AsyncSession, flujo_id: str) -> Flujo:
    f = (await db.execute(select(Flujo).where(Flujo.id == flujo_id))).scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="Flujo no encontrado")
    return f


async def definicion(db: AsyncSession, flujo_id: str) -> Dict[str, Any]:
    """La definicion completa en JSON: lo que se guarda en cada version y lo que usa el motor."""
    f = await obtener(db, flujo_id)
    return {"flujo_id": f.id, "process_id": f.process_id, "nombre": f.nombre, "result_service": f.result_service,
            "conexion_id": f.conexion_id, "version": f.version, "grupos": await _grupos_de(db, f.id)}


async def nueva_version(db: AsyncSession, flujo: Flujo, user: Dict[str, Any], motivo: str) -> None:
    """Cierra la version vigente y abre una nueva con la definicion actual. Se llama antes del commit."""
    await db.flush()
    flujo.version = (flujo.version or 0) + 1
    flujo.updated_at = datetime.now(timezone.utc)
    await db.execute(update(FlujoVersion).where(FlujoVersion.flujo_id == flujo.id, FlujoVersion.vigente == True).values(vigente=False))  # noqa: E712
    defin = {"process_id": flujo.process_id, "result_service": flujo.result_service, "grupos": await _grupos_de(db, flujo.id)}
    db.add(FlujoVersion(flujo_id=flujo.id, numero=flujo.version, vigente=True, definicion=defin,
                        creada_por=user.get("user_id"), creada_por_nombre=user.get("full_name") or ""))
    await registrar_historial(db, f"flujo.{flujo.process_id}", None, f"v{flujo.version}: {motivo}", user)


# ── Flujos ────────────────────────────────────────────────────────────────

async def listar(db: AsyncSession) -> List[Dict[str, Any]]:
    flujos = (await db.execute(select(Flujo).order_by(Flujo.nombre))).scalars().all()
    conexiones = {c.id: c for c in (await db.execute(select(Conexion))).scalars().all()}
    out = []
    for f in flujos:
        n_grupos = (await db.execute(select(func.count()).select_from(FlujoGrupo).where(FlujoGrupo.flujo_id == f.id))).scalar_one()
        out.append(_flujo(f, conexiones.get(f.conexion_id), n_grupos, await _instancias_activas(db, f.id)))
    return out


async def detalle(db: AsyncSession, flujo_id: str) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    c = (await db.execute(select(Conexion).where(Conexion.id == f.conexion_id))).scalar_one_or_none()
    grupos = await _grupos_de(db, f.id)
    d = _flujo(f, c, len(grupos), await _instancias_activas(db, f.id))
    d["grupos_detalle"] = grupos
    d["instancias_total"] = await _instancias_total(db, f.id)
    d["empresas_conexion"] = await _empresas_conexion(db, f.conexion_id)
    return d


async def _empresas_conexion(db: AsyncSession, conexion_id: str) -> List[Dict[str, Any]]:
    from app.models import ConexionEmpresa
    res = await db.execute(select(ConexionEmpresa).where(ConexionEmpresa.conexion_id == conexion_id).order_by(ConexionEmpresa.clave))
    return [{"clave": e.clave, "nombre": e.nombre, "activa": e.activa} for e in res.scalars().all()]


def _validar_process_id(v: str) -> str:
    v = (v or "").strip()
    if not v or len(v) > 100 or not all(ch.isalnum() or ch in "-_" for ch in v):
        raise HTTPException(status_code=422, detail="processId solo lleva letras, números, guion y guion bajo (por ejemplo CompraDirecta)")
    return v


async def _process_id_libre(db: AsyncSession, conexion_id: str, process_id: str, excepto: Optional[str] = None) -> None:
    flujos = (await db.execute(select(Flujo).where(Flujo.conexion_id == conexion_id))).scalars().all()
    for f in flujos:
        if f.id == excepto:
            continue
        if f.process_id.lower() == process_id.lower() or process_id.lower() in [a.lower() for a in (f.aliases or [])]:
            raise HTTPException(status_code=409, detail=f"«{process_id}» ya lo usa el flujo {f.nombre} en esta plataforma")


async def crear(db: AsyncSession, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    c = (await db.execute(select(Conexion).where(Conexion.id == datos.get("conexion_id", "")))).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=422, detail="Elige la plataforma (conexión)")
    pid = _validar_process_id(datos.get("process_id", ""))
    await _process_id_libre(db, c.id, pid)
    if not (datos.get("nombre") or "").strip():
        raise HTTPException(status_code=422, detail="El nombre es obligatorio")
    f = Flujo(conexion_id=c.id, process_id=pid, nombre=datos["nombre"].strip(), descripcion=(datos.get("descripcion") or "").strip() or None,
              result_service=(datos.get("result_service") or "").strip(), activo=bool(datos.get("activo", True)), version=0,
              folio_codigo=_codigo_folio(datos.get("folio_codigo")))
    db.add(f)
    await db.flush()
    await nueva_version(db, f, user, "flujo creado")
    await db.commit()
    await db.refresh(f)
    return _flujo(f, c, 0, 0)


async def actualizar(db: AsyncSession, flujo_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    cambios = []
    if "process_id" in datos and datos["process_id"] is not None:
        nuevo = _validar_process_id(datos["process_id"])
        if nuevo != f.process_id:
            await _process_id_libre(db, f.conexion_id, nuevo, excepto=f.id)
            if await _instancias_total(db, f.id):
                # Lo que ya esta en vuelo sigue llegando con el nombre viejo: se conserva como alias.
                f.aliases = sorted(set((f.aliases or []) + [f.process_id]))
                cambios.append(f"processId {f.process_id} → {nuevo} (el anterior queda como alias)")
            else:
                cambios.append(f"processId {f.process_id} → {nuevo}")
            f.process_id = nuevo
    if "aliases" in datos and datos["aliases"] is not None:
        f.aliases = sorted(set(_validar_process_id(a) for a in datos["aliases"] if a and a != f.process_id))
        cambios.append("aliases actualizados")
    if "folio_codigo" in datos:
        codigo = _codigo_folio(datos["folio_codigo"])
        if codigo != f.folio_codigo:
            cambios.append(f"código de folio: {f.folio_codigo} → {codigo}")
            f.folio_codigo = codigo
    for campo in ("nombre", "descripcion", "result_service", "activo"):
        if campo in datos and datos[campo] is not None:
            v = datos[campo].strip() if isinstance(datos[campo], str) else datos[campo]
            if campo == "descripcion":
                v = v or None
            if campo == "nombre" and not v:
                raise HTTPException(status_code=422, detail="El nombre es obligatorio")
            if getattr(f, campo) != v:
                cambios.append(f"{campo}: {getattr(f, campo)} → {v}")
                setattr(f, campo, v)
    if "correos" in datos:
        f.correos = datos["correos"]
        cambios.append("correos del flujo actualizados")
    if "resumen" in datos and datos["resumen"] is not None:
        from app.motor.resumen import normalizar
        try:
            nuevo_resumen = normalizar(datos["resumen"])
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if nuevo_resumen != (f.resumen or {}):
            f.resumen = nuevo_resumen
            cambios.append("resumen actualizado")
    if "hoja" in datos and datos["hoja"] is not None:
        from app.motor.hoja import normalizar as normalizar_hoja
        try:
            nueva_hoja = normalizar_hoja(datos["hoja"])
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if nueva_hoja != (f.hoja or {}):
            f.hoja = nueva_hoja
            cambios.append("hoja del trámite actualizada")
    if cambios:
        await nueva_version(db, f, user, "; ".join(cambios))
        await db.commit()
    return await detalle(db, f.id)


async def eliminar(db: AsyncSession, flujo_id: str, user: Dict[str, Any]) -> None:
    f = await obtener(db, flujo_id)
    if await _instancias_total(db, f.id):
        raise HTTPException(status_code=409, detail="El flujo ya tiene trámites; desactívalo en lugar de borrarlo")
    await registrar_historial(db, f"flujo.{f.process_id}", None, "eliminado", user)
    await db.delete(f)
    await db.commit()


async def versiones(db: AsyncSession, flujo_id: str) -> List[Dict[str, Any]]:
    await obtener(db, flujo_id)
    res = await db.execute(select(FlujoVersion).where(FlujoVersion.flujo_id == flujo_id).order_by(FlujoVersion.numero.desc()).limit(50))
    return [{"id": v.id, "numero": v.numero, "vigente": v.vigente, "creada_por": v.creada_por_nombre, "creada_en": v.creada_en.isoformat(),
             "grupos": len(v.definicion.get("grupos", [])) if isinstance(v.definicion, dict) else 0} for v in res.scalars().all()]


# ── Grupos ────────────────────────────────────────────────────────────────

async def _grupo_de(db: AsyncSession, flujo: Flujo, grupo_id: str) -> FlujoGrupo:
    g = (await db.execute(select(FlujoGrupo).where(FlujoGrupo.id == grupo_id, FlujoGrupo.flujo_id == flujo.id))).scalar_one_or_none()
    if not g:
        raise HTTPException(status_code=404, detail="Grupo no encontrado")
    return g


def _validar_clave(clave: str) -> str:
    partes = (clave or "").strip().split("|")
    if len(partes) != 2 or not all(p.strip().isalnum() for p in partes):
        raise HTTPException(status_code=422, detail="La empresa va como grupo|empresa, por ejemplo 02|01")
    return "|".join(p.strip() for p in partes)


async def crear_grupo(db: AsyncSession, flujo_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    clave = _validar_clave(datos.get("origen_clave", ""))
    if not (datos.get("nombre") or "").strip():
        raise HTTPException(status_code=422, detail="El nombre del grupo es obligatorio")
    if datos.get("auto_aprobacion", "omitir") not in ("omitir", "subir"):
        raise HTTPException(status_code=422, detail="auto_aprobacion debe ser omitir o subir")
    es_default = bool(datos.get("es_default", False))
    if es_default:
        await db.execute(update(FlujoGrupo).where(FlujoGrupo.flujo_id == f.id, FlujoGrupo.origen_clave == clave).values(es_default=False))
    n = (await db.execute(select(func.count()).select_from(FlujoGrupo).where(FlujoGrupo.flujo_id == f.id, FlujoGrupo.origen_clave == clave))).scalar_one()
    g = FlujoGrupo(flujo_id=f.id, conexion_id=f.conexion_id, origen_clave=clave, nombre=datos["nombre"].strip(), es_default=es_default,
                   auto_aprobacion=datos.get("auto_aprobacion", "omitir"), activo=bool(datos.get("activo", True)), orden=n)
    db.add(g)
    await db.flush()
    await nueva_version(db, f, user, f"grupo «{g.nombre}» creado en {clave}")
    await db.commit()
    return await detalle(db, f.id)


async def actualizar_grupo(db: AsyncSession, flujo_id: str, grupo_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    cambios = []
    if datos.get("origen_clave") is not None:
        clave = _validar_clave(datos["origen_clave"])
        if clave != g.origen_clave:
            cambios.append(f"empresa {g.origen_clave} → {clave}")
            g.origen_clave = clave
    for campo in ("nombre", "auto_aprobacion", "activo"):
        if datos.get(campo) is not None and getattr(g, campo) != datos[campo]:
            if campo == "auto_aprobacion" and datos[campo] not in ("omitir", "subir"):
                raise HTTPException(status_code=422, detail="auto_aprobacion debe ser omitir o subir")
            if campo == "nombre" and not str(datos[campo]).strip():
                raise HTTPException(status_code=422, detail="El nombre del grupo es obligatorio")
            cambios.append(f"{campo}: {getattr(g, campo)} → {datos[campo]}")
            setattr(g, campo, datos[campo].strip() if isinstance(datos[campo], str) else datos[campo])
    if datos.get("es_default") is not None and bool(datos["es_default"]) != g.es_default:
        if datos["es_default"]:
            await db.execute(update(FlujoGrupo).where(FlujoGrupo.flujo_id == f.id, FlujoGrupo.origen_clave == g.origen_clave, FlujoGrupo.id != g.id).values(es_default=False))
        g.es_default = bool(datos["es_default"])
        cambios.append(f"default: {g.es_default}")
    if cambios:
        await nueva_version(db, f, user, f"grupo «{g.nombre}»: " + "; ".join(cambios))
        await db.commit()
    return await detalle(db, f.id)


async def eliminar_grupo(db: AsyncSession, flujo_id: str, grupo_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    nombre = g.nombre
    await db.delete(g)
    await nueva_version(db, f, user, f"grupo «{nombre}» eliminado")
    await db.commit()
    return await detalle(db, f.id)


# ── Miembros ──────────────────────────────────────────────────────────────

async def agregar_miembro(db: AsyncSession, flujo_id: str, grupo_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    user_id = datos.get("user_id")
    if not user_id:
        raise HTTPException(status_code=422, detail="Elige al usuario")
    existe = (await db.execute(select(FlujoGrupoMiembro).where(FlujoGrupoMiembro.grupo_id == g.id, FlujoGrupoMiembro.user_id == user_id))).scalar_one_or_none()
    if existe:
        raise HTTPException(status_code=409, detail="Ya es miembro de este grupo")
    # Un solicitante solo puede estar en un grupo por empresa del flujo: si no, la resolucion seria ambigua.
    otros = (await db.execute(select(FlujoGrupoMiembro, FlujoGrupo).join(FlujoGrupo, FlujoGrupo.id == FlujoGrupoMiembro.grupo_id)
                              .where(FlujoGrupo.flujo_id == f.id, FlujoGrupo.origen_clave == g.origen_clave, FlujoGrupoMiembro.user_id == user_id))).all()
    if otros:
        raise HTTPException(status_code=409, detail=f"Ya está en el grupo «{otros[0][1].nombre}» de la misma empresa; quítalo de ahí primero")
    db.add(FlujoGrupoMiembro(grupo_id=g.id, user_id=user_id, nombre=(datos.get("nombre") or "").strip(), login_externo=datos.get("login_externo")))
    await nueva_version(db, f, user, f"grupo «{g.nombre}»: miembro {datos.get('nombre', '')} agregado")
    await db.commit()
    return await detalle(db, f.id)


async def quitar_miembro(db: AsyncSession, flujo_id: str, grupo_id: str, miembro_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    m = (await db.execute(select(FlujoGrupoMiembro).where(FlujoGrupoMiembro.id == miembro_id, FlujoGrupoMiembro.grupo_id == g.id))).scalar_one_or_none()
    if not m:
        raise HTTPException(status_code=404, detail="Miembro no encontrado")
    nombre = m.nombre
    await db.delete(m)
    await nueva_version(db, f, user, f"grupo «{g.nombre}»: miembro {nombre} quitado")
    await db.commit()
    return await detalle(db, f.id)


# ── Etapas ────────────────────────────────────────────────────────────────

def _validar_etapa(datos: Dict[str, Any]) -> None:
    if not (datos.get("nombre") or "").strip():
        raise HTTPException(status_code=422, detail="El nombre de la etapa es obligatorio")
    if datos.get("tipo", "aprobacion") not in ("aprobacion", "notificacion", "revision"):
        raise HTTPException(status_code=422, detail="Tipo de etapa no válido")
    if datos.get("tipo", "aprobacion") != "notificacion" and not datos.get("aprobador_user_id"):
        raise HTTPException(status_code=422, detail="Elige al aprobador de la etapa")
    cond = (datos.get("condicion") or "").strip()
    if cond:
        from app.motor.grupos import _COND
        if not _COND.match(cond):
            raise HTTPException(status_code=422, detail="La condición va como campo operador valor, por ejemplo total > 100000")


async def _renumerar(db: AsyncSession, grupo_id: str) -> None:
    etapas = (await db.execute(select(FlujoGrupoEtapa).where(FlujoGrupoEtapa.grupo_id == grupo_id).order_by(FlujoGrupoEtapa.orden))).scalars().all()
    # Dos pasadas para no chocar con la restriccion unica (grupo_id, orden)
    for i, e in enumerate(etapas):
        e.orden = 1000 + i
    await db.flush()
    for i, e in enumerate(etapas, start=1):
        e.orden = i
    await db.flush()


async def crear_etapa(db: AsyncSession, flujo_id: str, grupo_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    _validar_etapa(datos)
    n = (await db.execute(select(func.count()).select_from(FlujoGrupoEtapa).where(FlujoGrupoEtapa.grupo_id == g.id))).scalar_one()
    e = FlujoGrupoEtapa(grupo_id=g.id, orden=n + 1, nombre=datos["nombre"].strip(), tipo=datos.get("tipo", "aprobacion"),
                        puesto_esperado=(datos.get("puesto_esperado") or "").strip() or None,
                        aprobador_user_id=datos.get("aprobador_user_id"), aprobador_nombre=(datos.get("aprobador_nombre") or "").strip(),
                        aprobador_email=datos.get("aprobador_email"), suplente_user_id=datos.get("suplente_user_id"),
                        suplente_nombre=datos.get("suplente_nombre"), suplente_email=datos.get("suplente_email"),
                        condicion=(datos.get("condicion") or "").strip() or None,
                        comentario_rechazo_obligatorio=bool(datos.get("comentario_rechazo_obligatorio", True)),
                        permite_adjuntos=bool(datos.get("permite_adjuntos", True)))
    db.add(e)
    await nueva_version(db, f, user, f"grupo «{g.nombre}»: etapa «{e.nombre}» agregada")
    await db.commit()
    return await detalle(db, f.id)


async def actualizar_etapa(db: AsyncSession, flujo_id: str, grupo_id: str, etapa_id: str, datos: Dict[str, Any], user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    e = (await db.execute(select(FlujoGrupoEtapa).where(FlujoGrupoEtapa.id == etapa_id, FlujoGrupoEtapa.grupo_id == g.id))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Etapa no encontrada")
    completo = {**_etapa(e), **{k: v for k, v in datos.items() if v is not None}}
    _validar_etapa(completo)
    for campo in ("nombre", "tipo", "puesto_esperado", "aprobador_user_id", "aprobador_nombre", "aprobador_email",
                  "suplente_user_id", "suplente_nombre", "suplente_email", "condicion", "comentario_rechazo_obligatorio", "permite_adjuntos"):
        if campo in datos:
            v = datos[campo]
            if isinstance(v, str):
                v = v.strip() or None
            if campo == "aprobador_nombre" and v is None:
                v = ""
            setattr(e, campo, v)
    if datos.get("mover") in ("subir", "bajar"):
        vecinas = (await db.execute(select(FlujoGrupoEtapa).where(FlujoGrupoEtapa.grupo_id == g.id).order_by(FlujoGrupoEtapa.orden))).scalars().all()
        idx = next(i for i, x in enumerate(vecinas) if x.id == e.id)
        j = idx - 1 if datos["mover"] == "subir" else idx + 1
        if 0 <= j < len(vecinas):
            vecinas[idx], vecinas[j] = vecinas[j], vecinas[idx]
            for i, x in enumerate(vecinas):
                x.orden = 1000 + i
            await db.flush()
            for i, x in enumerate(vecinas, start=1):
                x.orden = i
    await nueva_version(db, f, user, f"grupo «{g.nombre}»: etapa «{e.nombre}» actualizada")
    await db.commit()
    return await detalle(db, f.id)


async def eliminar_etapa(db: AsyncSession, flujo_id: str, grupo_id: str, etapa_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    f = await obtener(db, flujo_id)
    g = await _grupo_de(db, f, grupo_id)
    e = (await db.execute(select(FlujoGrupoEtapa).where(FlujoGrupoEtapa.id == etapa_id, FlujoGrupoEtapa.grupo_id == g.id))).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Etapa no encontrada")
    nombre = e.nombre
    await db.delete(e)
    await db.flush()
    await _renumerar(db, g.id)
    await nueva_version(db, f, user, f"grupo «{g.nombre}»: etapa «{nombre}» eliminada")
    await db.commit()
    return await detalle(db, f.id)


# ── Simulador ─────────────────────────────────────────────────────────────

async def simular(db: AsyncSession, flujo_id: str, origen_clave: str, requester_user_id: Optional[str], card_data: Dict[str, Any]) -> Dict[str, Any]:
    """No crea nada: corre el motor sobre la definicion vigente y regresa el camino."""
    defin = await definicion(db, flujo_id)
    return motor_simular(defin, _validar_clave(origen_clave), requester_user_id, card_data or {})
