# Shared — Guía de Referencia

Ubicación: `backend/shared/`

El módulo `shared` es la base común de todos los microservicios. Contiene configuración, utilidades, middlewares, modelos y excepciones reutilizables. Ningún microservicio debe duplicar lógica que ya existe aquí.

---

## Estructura

```
shared/
├── config/
│   └── base_config.py
├── exceptions/
│   └── http_exceptions.py
├── models/
│   ├── base.py
│   └── responses.py
├── utils/
│   ├── jwt.py
│   ├── encryption.py
│   └── helpers.py
└── middleware/
    ├── cors.py
    ├── rate_limit.py
    ├── logging.py
    └── jwt_validator.py
```

---

## config/base_config.py

Clase base de configuración que todos los servicios deben extender. Lee variables automáticamente desde el archivo `.env` del servicio usando `pydantic-settings`.

### Variables disponibles

| Variable | Tipo | Default | Descripcion |
|---|---|---|---|
| ENV | str | development | Entorno de ejecucion |
| DEBUG | bool | False | Modo debug |
| SERVICE_NAME | str | base-service | Nombre del servicio |
| SERVICE_VERSION | str | 1.0.0 | Version del servicio |
| DB_HOST | str | localhost | Host de PostgreSQL |
| DB_PORT | int | 5432 | Puerto de PostgreSQL |
| DB_NAME | str | — | Nombre de la base de datos |
| DB_USER | str | — | Usuario de la base de datos |
| DB_PASSWORD | str | — | Contrasena de la base de datos |
| REDIS_HOST | str | localhost | Host de Redis |
| REDIS_PORT | int | 6379 | Puerto de Redis |
| REDIS_PASSWORD | str | — | Contrasena de Redis |
| REDIS_DB | int | 0 | Numero de base de datos Redis |
| RABBITMQ_HOST | str | localhost | Host de RabbitMQ |
| RABBITMQ_PORT | int | 5672 | Puerto de RabbitMQ |
| RABBITMQ_USER | str | guest | Usuario de RabbitMQ |
| RABBITMQ_PASSWORD | str | guest | Contrasena de RabbitMQ |
| RABBITMQ_VHOST | str | / | Virtual host de RabbitMQ |
| JWT_SECRET_KEY | str | — | Clave secreta para firmar tokens |
| JWT_ALGORITHM | str | HS256 | Algoritmo JWT |
| JWT_ACCESS_TOKEN_EXPIRE_MINUTES | int | 30 | Expiracion por inactividad |
| JWT_REFRESH_TOKEN_EXPIRE_DAYS | int | 7 | Expiracion del refresh token |
| JWT_INACTIVITY_EXPIRE_MINUTES | int | 30 | Minutos de inactividad permitidos |
| JWT_ABSOLUTE_EXPIRE_HOURS | int | 8 | Maximo absoluto de sesion en horas |
| CORS_ORIGINS | List[str] | ["*"] | Origenes permitidos para CORS |
| RATE_LIMIT_REQUESTS | int | 100 | Requests maximas por ventana |
| RATE_LIMIT_WINDOW_SECONDS | int | 60 | Ventana de tiempo en segundos |
| STORAGE_ENDPOINT | str | http://localhost:9000 | Endpoint MinIO o S3 |
| STORAGE_ACCESS_KEY | str | — | Clave de acceso al almacenamiento |
| STORAGE_SECRET_KEY | str | — | Clave secreta del almacenamiento |
| STORAGE_BUCKET_DEFAULT | str | avalanz | Bucket por defecto |
| STORAGE_USE_SSL | bool | False | Usar SSL en almacenamiento |
| CORPORATE_IP_RANGES | List[str] | ["192.168.0.0/16", "10.0.0.0/8"] | Rangos IP corporativos para 2FA condicional |
| CONSUL_HOST | str | localhost | Host de Consul |
| CONSUL_PORT | int | 8500 | Puerto de Consul |
| LOG_LEVEL | str | INFO | Nivel de logs |
| LOG_FORMAT | str | json | Formato de logs (json o text) |

### Propiedades calculadas

- `DATABASE_URL` — construye la URL de conexion asyncpg desde las variables DB_*
- `REDIS_URL` — construye la URL de conexion desde las variables REDIS_*
- `RABBITMQ_URL` — construye la URL de conexion desde las variables RABBITMQ_*

### Como extender en un servicio

```python
from shared.config.base_config import BaseConfig

class AuthConfig(BaseConfig):
    SERVICE_NAME: str = "auth-service"
    SERVICE_VERSION: str = "1.0.0"
    # Variables propias del servicio
    TOTP_ISSUER: str = "Avalanz"

    class Config:
        env_file = ".env"

config = AuthConfig()
```

---

## exceptions/http_exceptions.py

Define todas las excepciones HTTP del proyecto y los handlers globales para registrar en cada servicio.

### Excepciones disponibles

| Clase | Status | Error Code | Uso |
|---|---|---|---|
| UnauthorizedException | 401 | UNAUTHORIZED | Usuario no autenticado |
| InvalidTokenException | 401 | INVALID_TOKEN | Token invalido o expirado |
| TwoFactorRequiredException | 401 | 2FA_REQUIRED | Se requiere codigo 2FA |
| InvalidTwoFactorCodeException | 401 | INVALID_2FA_CODE | Codigo 2FA incorrecto |
| ForbiddenException | 403 | FORBIDDEN | Sin permisos para la accion |
| InsufficientPermissionsException | 403 | INSUFFICIENT_PERMISSIONS | Permisos insuficientes |
| NotFoundException | 404 | NOT_FOUND | Recurso no encontrado |
| AlreadyExistsException | 409 | ALREADY_EXISTS | Recurso duplicado |
| ValidationException | 422 | VALIDATION_ERROR | Error de validacion |
| RateLimitException | 429 | RATE_LIMIT_EXCEEDED | Demasiadas solicitudes |
| InternalServerException | 500 | INTERNAL_SERVER_ERROR | Error interno |
| ServiceUnavailableException | 503 | SERVICE_UNAVAILABLE | Servicio no disponible |
| StorageException | 500 | STORAGE_ERROR | Error en almacenamiento |
| FileTooLargeException | 413 | FILE_TOO_LARGE | Archivo demasiado grande |
| InvalidFileTypeException | 415 | INVALID_FILE_TYPE | Tipo de archivo no permitido |

### Como lanzar una excepcion

```python
from shared.exceptions.http_exceptions import NotFoundException, AlreadyExistsException

# En cualquier servicio o ruta
raise NotFoundException("Usuario")
raise AlreadyExistsException("Email")
```

### Como registrar los handlers en main.py de cada servicio

```python
from shared.exceptions.http_exceptions import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    unhandled_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)
```

### Formato de respuesta de error

Todas las excepciones devuelven el mismo formato JSON:

```json
{
  "success": false,
  "error_code": "NOT_FOUND",
  "message": "Usuario no encontrado",
  "detail": null,
  "path": "/api/v1/users/123"
}
```

---

## models/base.py

Modelos base de SQLAlchemy para las tablas de cada servicio.

### Clases disponibles

| Clase | Descripcion | Columnas extra |
|---|---|---|
| BaseModel | Modelo base con timestamps | created_at, updated_at |
| BaseModelWithSoftDelete | Modelo base con timestamps y soft delete | created_at, updated_at, is_deleted, deleted_at |

### Cuando usar cada una

Usar `BaseModelWithSoftDelete` en entidades que requieren historial o posible restauracion: usuarios, módulos, roles, permisos.

Usar `BaseModel` en entidades de solo escritura: logs, auditoría, notificaciones.

### Nota importante sobre SQLAlchemy 2.0

Las columnas en los mixins (`TimestampMixin`, `SoftDeleteMixin`) se declaran **sin anotaciones de tipo** para evitar conflictos con el sistema de mapeo declarativo de SQLAlchemy 2.0. Los modelos que heredan de `BaseModel` o `BaseModelWithSoftDelete` deben usar `Column()` directamente sin anotaciones de tipo en sus atributos.

### Como usar en un servicio

```python
from sqlalchemy import Column, String
from sqlalchemy.dialects.postgresql import UUID
import uuid
from shared.models.base import BaseModelWithSoftDelete

class User(BaseModelWithSoftDelete):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    full_name = Column(String(255), nullable=False)
```

---

## models/responses.py

Modelos Pydantic para estandarizar todas las respuestas de la API.

### Clases disponibles

| Clase | Descripcion |
|---|---|
| BaseResponse | Respuesta base con success, message y timestamp |
| DataResponse[T] | Respuesta con un objeto de datos generico |
| PaginatedResponse[T] | Respuesta con lista paginada y metadata |
| ErrorResponse | Respuesta de error estandarizada |
| CreatedResponse[T] | Respuesta de creacion exitosa |
| UpdatedResponse[T] | Respuesta de actualizacion exitosa |
| DeletedResponse | Respuesta de eliminacion exitosa |
| HealthResponse | Respuesta del endpoint de salud del servicio |

### Como usar en las rutas

```python
from shared.models.responses import DataResponse, PaginatedResponse, CreatedResponse

# Respuesta con un objeto
@router.get("/{user_id}", response_model=DataResponse[UserSchema])
async def get_user(user_id: str):
    user = await user_service.get_by_id(user_id)
    return DataResponse(success=True, message="Usuario obtenido", data=user)

# Respuesta paginada
@router.get("/", response_model=PaginatedResponse[UserSchema])
async def list_users(page: int = 1, per_page: int = 20):
    users, total = await user_service.list(page, per_page)
    return PaginatedResponse(
        success=True,
        message="Usuarios obtenidos",
        data=users,
        meta=paginate(total, page, per_page),
    )
```

---

## utils/jwt.py

Manejo completo del ciclo de vida de tokens JWT.

### Tipos de token

| Tipo | Duracion | Uso |
|---|---|---|
| access | 30 min (inactividad) / 8 hrs (absoluto) | Autenticacion en cada request |
| refresh | 7 dias | Renovar el access token sin re-login |
| 2fa_temp | 15 minutos | Token intermedio durante flujo 2FA |

### Funciones disponibles

| Funcion | Descripcion |
|---|---|
| create_access_token | Genera token de acceso con doble expiracion |
| create_refresh_token | Genera token de refresco |
| create_2fa_temp_token | Genera token temporal para flujo 2FA |
| decode_access_token | Decodifica y valida token de acceso |
| decode_refresh_token | Decodifica y valida token de refresco |
| decode_2fa_temp_token | Decodifica y valida token temporal 2FA |
| is_token_expired | Verifica si un token esta expirado |
| get_token_payload_without_validation | Lee el payload sin verificar firma |

### Flujo de sesion

```
1. Login exitoso (usuario + contrasena correctos)
   |
   |- Usuario en red corporativa  --> access_token + refresh_token
   |
   |- Usuario fuera de red        --> 2fa_temp_token (10 min)
                                          |
                                    Ingresa codigo 2FA
                                          |
                                   access_token + refresh_token

2. Cada request del frontend envia: Authorization: Bearer <access_token>

3. Al expirar el access_token (30 min inactividad):
   Frontend usa refresh_token --> nuevo access_token (session_started_at se conserva)

4. Al cumplirse 8 horas absolutas:
   Cierre de sesion obligatorio, nuevo login requerido
```

---

## utils/encryption.py

Operaciones criptograficas centralizadas.

### Funciones disponibles

| Funcion | Descripcion | Uso tipico |
|---|---|---|
| hash_password | Hash bcrypt de contrasena (usa bcrypt directo, sin passlib) | Guardar contrasenas en BD |
| verify_password | Verificar contrasena contra hash | Login |
| generate_secure_token | Token URL-safe aleatorio | Links de recuperacion |
| generate_numeric_code | Codigo numerico de N digitos | 2FA por SMS o email |
| generate_hmac | Firma HMAC-SHA256 | Firmar links o datos |
| verify_hmac | Verificar firma HMAC | Validar integridad |
| encrypt_data | Cifrado simetrico Fernet | Datos sensibles en BD |
| decrypt_data | Descifrado Fernet | Recuperar datos cifrados |
| hash_sha256 | Hash SHA256 general | Identificadores, checksums |
| encode_base64 | Encoding base64 URL-safe | Datos en transito |
| decode_base64 | Decoding base64 URL-safe | Datos en transito |

---

## utils/helpers.py

Funciones de uso general para todos los servicios.

### Funciones disponibles

| Funcion | Descripcion |
|---|---|
| is_corporate_ip | Verifica si una IP esta dentro de los rangos corporativos |
| get_client_ip | Extrae la IP real del cliente considerando proxies y Nginx |
| paginate | Genera metadata de paginacion |
| get_offset | Calcula el offset para queries SQL paginadas |
| generate_uuid | Genera un UUID v4 |
| is_valid_uuid | Valida formato UUID |
| now_utc | Retorna datetime actual en UTC |
| format_datetime | Formatea datetime a string |
| is_expired | Verifica si una fecha ya expiro |
| slugify | Convierte texto a slug URL-friendly |
| truncate | Trunca un texto con sufijo |
| sanitize_string | Elimina caracteres peligrosos de un string |
| remove_none_values | Elimina claves con valor None de un dict |
| flatten_dict | Aplana un diccionario anidado |
| is_valid_email | Valida formato de email |
| is_strong_password | Valida fortaleza de contrasena |

### Reglas de contrasena segura

- Minimo 8 caracteres
- Al menos una letra mayuscula
- Al menos una letra minuscula
- Al menos un numero
- Al menos un caracter especial (!@#$%^&*...)

---

## middleware/cors.py

Registra el middleware de CORS en la aplicacion con los valores definidos en el `.env` de cada servicio.

### Como usar

```python
from shared.middleware.cors import setup_cors

setup_cors(
    app=app,
    origins=config.CORS_ORIGINS,
    allow_credentials=config.CORS_ALLOW_CREDENTIALS,
    allow_methods=config.CORS_ALLOW_METHODS,
    allow_headers=config.CORS_ALLOW_HEADERS,
)
```

---

## middleware/rate_limit.py

Controla el numero de requests por IP en una ventana de tiempo. Responde con `429` al exceder el limite.

### Headers de respuesta

| Header | Descripcion |
|---|---|
| X-RateLimit-Limit | Maximo de requests permitidas |
| X-RateLimit-Remaining | Requests restantes en la ventana actual |
| X-RateLimit-Reset | Timestamp Unix de reset de la ventana |
| Retry-After | Segundos a esperar antes de reintentar (solo en 429) |

### Como usar

```python
from shared.middleware.rate_limit import setup_rate_limit

setup_rate_limit(
    app=app,
    max_requests=config.RATE_LIMIT_REQUESTS,
    window_seconds=config.RATE_LIMIT_WINDOW_SECONDS,
)
```

---

## middleware/logging.py

Registra cada request con metodo, ruta, status code, duracion en milisegundos e IP del cliente. Salida en formato JSON compatible con Rsyslog.

### Niveles de log por status code

| Status | Nivel |
|---|---|
| 2xx / 3xx | INFO |
| 4xx | WARNING |
| 5xx | ERROR |

### Como usar

```python
from shared.middleware.logging import setup_logging

setup_logging(
    app=app,
    service_name=config.SERVICE_NAME,
    log_level=config.LOG_LEVEL,
    log_format=config.LOG_FORMAT,
)
```

---

## middleware/jwt_validator.py

Dependencias de FastAPI para proteger rutas con autenticacion y autorizacion.

### Como usar en las rutas

```python
from shared.middleware.jwt_validator import JWTValidator

validator = JWTValidator(secret_key=config.JWT_SECRET_KEY, algorithm=config.JWT_ALGORITHM)

# Solo verificar que el token es valido
@router.get("/me", dependencies=[Depends(validator.get_current_user())])
async def get_me(payload=Depends(validator.get_current_user())):
    return payload

# Verificar rol especifico
@router.delete("/{user_id}", dependencies=[Depends(validator.require_roles(["super_admin"]))])
async def delete_user(user_id: str):
    ...

# Verificar acceso a modulo
@router.get("/boveda", dependencies=[Depends(validator.require_module_access("boveda"))])
async def get_boveda():
    ...
```

---

## Dependencias requeridas

Agregar en el `requirements.txt` de cada servicio que use `shared`:

```
fastapi
pydantic-settings
sqlalchemy
asyncpg
alembic
python-jose[cryptography]
passlib[bcrypt]
cryptography
```