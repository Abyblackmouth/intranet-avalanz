from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from app.config import config
from app.database import get_db
from app.services import company_service
from shared.models.responses import DataResponse, CreatedResponse, DeletedResponse
from shared.middleware.jwt_validator import JWTValidator

router = APIRouter(prefix="/companies", tags=["Empresas"])
validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)


# ── Schemas ───────────────────────────────────────────────────────────────────

class CreateCompanyRequest(BaseModel):
    group_id: str
    nombre_comercial: str
    name: str
    rfc: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True
    calle: Optional[str] = None
    num_ext: Optional[str] = None
    num_int: Optional[str] = None
    colonia: Optional[str] = None
    cp: Optional[str] = None
    municipio: Optional[str] = None
    estado: Optional[str] = None
    constancia_fecha_emision: Optional[str] = None
    constancia_fecha_vigencia: Optional[str] = None


class UpdateCompanyRequest(BaseModel):
    nombre_comercial: Optional[str] = None
    name: Optional[str] = None
    rfc: Optional[str] = None
    description: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=CreatedResponse)
async def create_company(
    body: CreateCompanyRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await company_service.create_company(
        db=db,
        group_id=body.group_id,
        nombre_comercial=body.nombre_comercial,
        name=body.name,
        rfc=body.rfc,
        description=body.description,
        is_active=body.is_active,
        calle=body.calle,
        num_ext=body.num_ext,
        num_int=body.num_int,
        colonia=body.colonia,
        cp=body.cp,
        municipio=body.municipio,
        estado=body.estado,
        constancia_fecha_emision=body.constancia_fecha_emision,
        constancia_fecha_vigencia=body.constancia_fecha_vigencia,
        requested_by=payload,
    )
    return CreatedResponse(data=result)


@router.get("/", response_model=DataResponse)
async def list_companies(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    group_id: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await company_service.list_companies(
        db=db,
        page=page,
        per_page=per_page,
        group_id=group_id,
        is_active=is_active,
        search=search,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Empresas obtenidas", data=result)


@router.get("/{company_id}", response_model=DataResponse)
async def get_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin", "admin_empresa"])),
):
    result = await company_service.get_company_by_id(
        db=db, company_id=company_id, requested_by=payload
    )
    return DataResponse(success=True, message="Empresa obtenida", data=result)


@router.patch("/{company_id}", response_model=DataResponse)
async def update_company(
    company_id: str,
    body: UpdateCompanyRequest,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await company_service.update_company(
        db=db,
        company_id=company_id,
        nombre_comercial=body.nombre_comercial,
        name=body.name,
        rfc=body.rfc,
        description=body.description,
        requested_by=payload,
    )
    return DataResponse(success=True, message="Empresa actualizada", data=result)


@router.patch("/{company_id}/enable", response_model=DataResponse)
async def enable_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await company_service.enable_company(
        db=db, company_id=company_id, requested_by=payload
    )
    return DataResponse(success=True, message="Empresa habilitada exitosamente", data=result)


@router.patch("/{company_id}/disable", response_model=DataResponse)
async def disable_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    result = await company_service.disable_company(
        db=db, company_id=company_id, requested_by=payload
    )
    return DataResponse(success=True, message="Empresa deshabilitada exitosamente", data=result)


@router.delete("/{company_id}", response_model=DeletedResponse)
async def delete_company(
    company_id: str,
    db: AsyncSession = Depends(get_db),
    payload=Depends(validator.require_roles(["super_admin"])),
):
    await company_service.delete_company(
        db=db, company_id=company_id, requested_by=payload
    )
    return DeletedResponse()