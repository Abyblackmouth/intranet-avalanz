from pydantic import BaseModel
from typing import Any, Generic, List, Optional, TypeVar
from datetime import datetime

T = TypeVar("T")


class BaseResponse(BaseModel):
    success: bool
    message: str
    timestamp: datetime = None

    def model_post_init(self, __context: Any) -> None:
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()


class DataResponse(BaseResponse, Generic[T]):
    data: Optional[T] = None


class PaginationMeta(BaseModel):
    total: int
    page: int
    per_page: int
    total_pages: int
    has_next: bool
    has_prev: bool


class PaginatedResponse(BaseResponse, Generic[T]):
    data: List[T] = []
    meta: PaginationMeta


class ErrorDetail(BaseModel):
    field: Optional[str] = None
    message: str
    type: Optional[str] = None


class ErrorResponse(BaseResponse):
    success: bool = False
    error_code: str
    detail: Optional[Any] = None
    path: Optional[str] = None


class CreatedResponse(DataResponse[T], Generic[T]):
    success: bool = True
    message: str = "Recurso creado exitosamente"


class UpdatedResponse(DataResponse[T], Generic[T]):
    success: bool = True
    message: str = "Recurso actualizado exitosamente"


class DeletedResponse(BaseResponse):
    success: bool = True
    message: str = "Recurso eliminado exitosamente"


class HealthResponse(BaseModel):
    service: str
    version: str
    status: str
    timestamp: datetime = None
    dependencies: Optional[dict] = None

    def model_post_init(self, __context: Any) -> None:
        if self.timestamp is None:
            self.timestamp = datetime.utcnow()
