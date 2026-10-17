"""Submódulo Ajustes (solo super admin): ajustes del módulo, conexiones y usuarios de plataformas."""
from typing import Any, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_super_admin
from app.database import get_db
from app.services.ajustes import ajustes_service, conexiones_service, usuarios_service

router = APIRouter(prefix="/ajustes", tags=["Ajustes"])


# ── Ajustes del módulo ─────────────────────────────────────────────────────

class CambioAjuste(BaseModel):
    valor: Any


@router.get("")
async def listar_ajustes(db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await ajustes_service.listar(db)


@router.get("/historial")
async def historial_ajustes(db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await ajustes_service.historial(db)


# ── Conexiones ─────────────────────────────────────────────────────────────

class ConexionIn(BaseModel):
    slug: str
    titulo: str
    url_base: str = ""
    auth_tipo: str = "ninguna"
    auth_usuario: Optional[str] = None
    auth_secreto: Optional[str] = None
    timeout_seg: int = 20
    reintentos_max: int = 5
    espaciado_min: List[int] = [1, 5, 15, 60, 240]
    activa: bool = True


class ConexionPatch(BaseModel):
    titulo: Optional[str] = None
    url_base: Optional[str] = None
    auth_tipo: Optional[str] = None
    auth_usuario: Optional[str] = None
    auth_secreto: Optional[str] = None
    borrar_secreto: Optional[bool] = None
    timeout_seg: Optional[int] = None
    reintentos_max: Optional[int] = None
    espaciado_min: Optional[List[int]] = None
    activa: Optional[bool] = None


class EmpresaIn(BaseModel):
    clave: str
    nombre: str = ""
    company_id: Optional[str] = None


class EmpresaPatch(BaseModel):
    nombre: Optional[str] = None
    company_id: Optional[str] = None
    activa: Optional[bool] = None


@router.get("/conexiones")
async def listar_conexiones(db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.listar(db)


@router.post("/conexiones", status_code=201)
async def crear_conexion(body: ConexionIn, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.crear(db, body.model_dump(), user)


@router.patch("/conexiones/{conexion_id}")
async def actualizar_conexion(conexion_id: str, body: ConexionPatch, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.actualizar(db, conexion_id, body.model_dump(exclude_none=True), user)


@router.delete("/conexiones/{conexion_id}", status_code=204)
async def eliminar_conexion(conexion_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    await conexiones_service.eliminar(db, conexion_id, user)


@router.post("/conexiones/{conexion_id}/regenerar-token")
async def regenerar_token(conexion_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.regenerar_token(db, conexion_id, user)


@router.post("/conexiones/{conexion_id}/probar")
async def probar_conexion(conexion_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.probar(db, conexion_id)


@router.post("/conexiones/{conexion_id}/empresas", status_code=201)
async def agregar_empresa(conexion_id: str, body: EmpresaIn, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.agregar_empresa(db, conexion_id, body.model_dump(), user)


@router.patch("/conexiones/{conexion_id}/empresas/{empresa_id}")
async def actualizar_empresa(conexion_id: str, empresa_id: str, body: EmpresaPatch, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await conexiones_service.actualizar_empresa(db, conexion_id, empresa_id, body.model_dump(exclude_none=True), user)


@router.delete("/conexiones/{conexion_id}/empresas/{empresa_id}", status_code=204)
async def quitar_empresa(conexion_id: str, empresa_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    await conexiones_service.quitar_empresa(db, conexion_id, empresa_id, user)


# ── Usuarios de plataformas ────────────────────────────────────────────────

class UsuarioIn(BaseModel):
    conexion_id: str
    id_externo: str
    login_externo: Optional[str] = None
    email: Optional[str] = None
    nombre: Optional[str] = None
    user_id: Optional[str] = None


@router.get("/usuarios")
async def listar_usuarios(conexion_id: Optional[str] = None, pendientes: bool = False, q: str = "",
                          db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await usuarios_service.listar(db, conexion_id, pendientes, q)


@router.get("/usuarios/buscar-intranet")
async def buscar_intranet(q: str = "", user: dict = Depends(require_super_admin)):
    return await usuarios_service.buscar_intranet(q)


@router.post("/usuarios")
async def guardar_usuario(body: UsuarioIn, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await usuarios_service.guardar(db, body.model_dump(), user)


@router.delete("/usuarios/{usuario_id}", status_code=204)
async def quitar_usuario(usuario_id: str, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    await usuarios_service.quitar(db, usuario_id, user)


# Va al final: /{key} es comodín y FastAPI toma la primera ruta registrada que coincide.
@router.put("/{key}")
async def cambiar_ajuste(key: str, body: CambioAjuste, db: AsyncSession = Depends(get_db), user: dict = Depends(require_super_admin)):
    return await ajustes_service.cambiar(db, key, body.valor, user)
