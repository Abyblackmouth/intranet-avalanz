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
    calle: Optional[str] = None
    num_ext: Optional[str] = None
    num_int: Optional[str] = None
    colonia: Optional[str] = None
    cp: Optional[str] = None
    municipio: Optional[str] = None
    estado: Optional[str] = None
    constancia_fecha_emision: Optional[str] = None
    constancia_fecha_vigencia: Optional[str] = None
    family_id: Optional[str] = None   # "" quita la familia; sin el campo, no cambia


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


# ── Familias de empresas (CORPORATIVO, CNCI, TODITO…) ─────────────────────────
# Van antes de /{company_id}: si no, "families" se tomaria como el id de una empresa.

class FamilyRequest(BaseModel):
    name: Optional[str] = None
    clave: Optional[str] = None
    is_active: Optional[bool] = None


def _family_dict(f, total: int = 0) -> dict:
    return {"id": str(f.id), "name": f.name, "clave": f.clave, "is_active": f.is_active, "companies": total}


async def _clave_libre(db, base: str, excluir_id=None) -> str:
    """Clave unica de 4 caracteres a partir del nombre (CORPORATIVO -> CORP)."""
    import re
    from sqlalchemy import select
    from app.models.admin_models import CompanyFamily
    raiz = re.sub(r"[^A-Z0-9]", "", base.upper())[:4] or "FAM"
    candidata, n = raiz, 1
    while True:
        existente = (await db.execute(select(CompanyFamily).where(CompanyFamily.clave == candidata))).scalar_one_or_none()
        if not existente or (excluir_id and str(existente.id) == str(excluir_id)):
            return candidata
        n += 1
        candidata = (raiz[:3] + str(n))[:4]


@router.get("/families", response_model=DataResponse)
async def list_families(db: AsyncSession = Depends(get_db), payload=Depends(validator.require_roles(["super_admin"]))):
    from sqlalchemy import select, func
    from app.models.admin_models import Company, CompanyFamily
    conteo = dict((await db.execute(
        select(Company.family_id, func.count()).where(Company.is_deleted == False, Company.family_id.isnot(None)).group_by(Company.family_id)
    )).all())
    familias = (await db.execute(select(CompanyFamily).where(CompanyFamily.is_deleted == False).order_by(CompanyFamily.name))).scalars().all()
    return DataResponse(success=True, message="Familias", data=[_family_dict(f, conteo.get(f.id, 0)) for f in familias])


@router.post("/families", response_model=DataResponse)
async def create_family(body: FamilyRequest, db: AsyncSession = Depends(get_db), payload=Depends(validator.require_roles(["super_admin"]))):
    from fastapi import HTTPException
    from sqlalchemy import select, func
    from app.models.admin_models import CompanyFamily
    nombre = (body.name or "").strip().upper()
    if not nombre:
        raise HTTPException(status_code=422, detail="El nombre de la familia es obligatorio")
    repetida = (await db.execute(select(CompanyFamily).where(func.upper(CompanyFamily.name) == nombre, CompanyFamily.is_deleted == False))).scalar_one_or_none()
    if repetida:
        raise HTTPException(status_code=409, detail="Ya existe una familia con ese nombre")
    familia = CompanyFamily(name=nombre, clave=await _clave_libre(db, (body.clave or nombre)), is_active=True)
    db.add(familia)
    await db.commit()
    await db.refresh(familia)
    return DataResponse(success=True, message="Familia creada", data=_family_dict(familia))


@router.patch("/families/{family_id}", response_model=DataResponse)
async def update_family(family_id: str, body: FamilyRequest, db: AsyncSession = Depends(get_db), payload=Depends(validator.require_roles(["super_admin"]))):
    from fastapi import HTTPException
    from sqlalchemy import select, func
    from app.models.admin_models import CompanyFamily
    familia = (await db.execute(select(CompanyFamily).where(CompanyFamily.id == family_id, CompanyFamily.is_deleted == False))).scalar_one_or_none()
    if not familia:
        raise HTTPException(status_code=404, detail="Familia no encontrada")
    if body.name is not None:
        nombre = body.name.strip().upper()
        if not nombre:
            raise HTTPException(status_code=422, detail="El nombre de la familia es obligatorio")
        repetida = (await db.execute(select(CompanyFamily).where(func.upper(CompanyFamily.name) == nombre,
                    CompanyFamily.id != familia.id, CompanyFamily.is_deleted == False))).scalar_one_or_none()
        if repetida:
            raise HTTPException(status_code=409, detail="Ya existe una familia con ese nombre")
        familia.name = nombre
    if body.clave is not None:
        familia.clave = await _clave_libre(db, body.clave, excluir_id=familia.id)
    if body.is_active is not None:
        familia.is_active = body.is_active
    await db.commit()
    await db.refresh(familia)
    return DataResponse(success=True, message="Familia actualizada", data=_family_dict(familia))


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
    # Familia: se aplica aparte para no tocar el servicio de empresas
    if body.family_id is not None:
        from fastapi import HTTPException
        from sqlalchemy import select
        from app.models.admin_models import Company, CompanyFamily
        company = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one()
        if body.family_id == "":
            company.family_id = None
        else:
            familia = (await db.execute(select(CompanyFamily).where(
                CompanyFamily.id == body.family_id, CompanyFamily.is_deleted == False))).scalar_one_or_none()
            if not familia:
                raise HTTPException(status_code=404, detail="Familia no encontrada")
            company.family_id = familia.id
        await db.commit()
        if isinstance(result, dict):
            result["family_id"] = str(company.family_id) if company.family_id else None
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