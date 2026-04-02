# Guía: Agregar Campos Nuevos a Usuarios

Ubicación: `docs/architecture/agregar-campos-usuario.md`

Esta guía documenta el proceso completo para agregar campos nuevos al modelo de usuario, desde la base de datos hasta el frontend. Se basa en el proceso que seguimos para agregar `matricula`, `puesto` y `departamento`.

---

## Archivos involucrados

| Capa | Archivo | Qué cambia |
|---|---|---|
| Modelo BD | `backend/admin-service/app/models/admin_models.py` | Definición de columnas SQLAlchemy |
| Migración | `backend/admin-service/migrations/versions/` | Script que altera la tabla en PostgreSQL |
| Servicio | `backend/admin-service/app/services/user_service.py` | Lógica de negocio: create, update, serialize |
| Rutas | `backend/admin-service/app/routes/users.py` | Schemas Pydantic de entrada/salida |
| Tipos TS | `frontend/types/user.types.ts` | Interfaces TypeScript |
| Formulario | `frontend/components/admin/users/UserForm.tsx` | Campo visible al crear usuario |
| Tabla | `frontend/components/admin/users/UserTable.tsx` | Columna visible en la lista |

---

## Paso 1 — Modelo (admin_models.py)

Agrega la columna en la clase `User`:

```python
# backend/admin-service/app/models/admin_models.py

class User(BaseModelWithSoftDelete):
    __tablename__ = "users"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id   = Column(UUID(as_uuid=True), ForeignKey("companies.id"), nullable=False)
    email        = Column(String(255), unique=True, nullable=False)
    full_name    = Column(String(255), nullable=False)
    matricula    = Column(String(50), unique=True, nullable=True, index=True)
    puesto       = Column(String(150), nullable=True)
    departamento = Column(String(150), nullable=True)
    # ← Agrega tu campo aquí, por ejemplo:
    telefono     = Column(String(20), nullable=True)
```

Parámetros comunes:
- `nullable=True` — campo opcional
- `nullable=False` — campo requerido
- `unique=True` — valor único en toda la tabla
- `index=True` — crea índice para búsquedas rápidas

---

## Paso 2 — Migración de Alembic

### 2.1 Copiar el modelo actualizado al contenedor
```bash
docker cp backend/admin-service/app/models/admin_models.py \
  avalanz-admin:/app/app/models/admin_models.py
```

### 2.2 Generar la migración
```bash
docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'add telefono to users'"
```

Si Alembic genera `pass` en el upgrade (bug conocido), edita el archivo manualmente:

```python
# backend/admin-service/migrations/versions/XXXX_add_telefono.py

def upgrade() -> None:
    op.add_column('users', sa.Column('telefono', sa.String(20), nullable=True))

def downgrade() -> None:
    op.drop_column('users', 'telefono')
```

### 2.3 Copiar el archivo de migración al contenedor
```bash
docker cp backend/admin-service/migrations/versions/XXXX_add_telefono.py \
  avalanz-admin:/app/migrations/versions/XXXX_add_telefono.py
```

### 2.4 Aplicar la migración
```bash
docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"
```

### 2.5 Verificar que los campos quedaron en la BD
```bash
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "\d users"
```

### 2.6 Copiar versiones de migración al proyecto local
```bash
docker cp avalanz-admin:/app/migrations/versions/ \
  backend/admin-service/migrations/
```

---

## Paso 3 — user_service.py

Actualiza tres funciones:

### create_user — agregar parámetro y guardarlo
```python
async def create_user(
    db: AsyncSession,
    company_id: str,
    email: str,
    full_name: str,
    matricula: Optional[str] = None,
    puesto: Optional[str] = None,
    departamento: Optional[str] = None,
    telefono: Optional[str] = None,   # ← nuevo
    ...
) -> Dict[str, Any]:

    user = User(
        company_id=company_id,
        email=email,
        full_name=full_name,
        matricula=matricula,
        puesto=puesto,
        departamento=departamento,
        telefono=telefono,   # ← nuevo
        ...
    )
```

### update_user — agregar parámetro y actualizarlo
```python
async def update_user(
    db: AsyncSession,
    user_id: str,
    telefono: Optional[str] = None,   # ← nuevo
    ...
) -> Dict[str, Any]:

    values = {}
    if telefono is not None:
        values["telefono"] = telefono   # ← nuevo
```

### _serialize_user — incluirlo en la respuesta
```python
def _serialize_user(user: User, ...) -> Dict[str, Any]:
    return {
        ...
        "telefono": user.telefono,   # ← nuevo
    }
```

### Copiar y reiniciar
```bash
docker cp backend/admin-service/app/services/user_service.py \
  avalanz-admin:/app/app/services/user_service.py

docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.dev.yml \
  restart admin-service
```

---

## Paso 4 — users.py (routes)

Actualiza los schemas Pydantic:

```python
# backend/admin-service/app/routes/users.py

class CreateUserRequest(BaseModel):
    company_id: str
    email: EmailStr
    full_name: str
    matricula: Optional[str] = None
    puesto: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None   # ← nuevo

class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = None
    matricula: Optional[str] = None
    puesto: Optional[str] = None
    departamento: Optional[str] = None
    telefono: Optional[str] = None   # ← nuevo
```

Y pásalo en el endpoint:
```python
result = await user_service.create_user(
    ...
    telefono=body.telefono,   # ← nuevo
)
```

```bash
docker cp backend/admin-service/app/routes/users.py \
  avalanz-admin:/app/app/routes/users.py
```

---

## Paso 5 — Tipos TypeScript (user.types.ts)

```typescript
// frontend/types/user.types.ts

export interface UserRow {
  user_id: string
  email: string
  full_name: string
  matricula: string | null
  puesto: string | null
  departamento: string | null
  telefono: string | null   // ← nuevo
  ...
}

export interface CreateUserPayload {
  ...
  telefono?: string   // ← nuevo
}

export interface UpdateUserPayload {
  ...
  telefono?: string   // ← nuevo
}
```

---

## Paso 6 — Si quieres verlo en el formulario (UserForm.tsx)

Agrega el campo en `frontend/components/admin/users/UserForm.tsx`:

### 6.1 Agregar al estado inicial del form
```tsx
const [form, setForm] = useState({
  ...
  telefono: '',   // ← nuevo
})
```

### 6.2 Agregar al payload de envío
```tsx
const payload: CreateUserPayload = {
  ...
  telefono: form.telefono || undefined,   // ← nuevo
}
```

### 6.3 Agregar el input en el JSX
```tsx
{/* Telefono */}
<div>
  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
    Teléfono
  </label>
  <div className="relative">
    <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
    <input
      type="text"
      name="telefono"
      value={form.telefono}
      onChange={handleChange}
      placeholder="Ej. +52 55 1234 5678"
      className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  </div>
</div>
```

No olvides importar el icono:
```tsx
import { Phone } from 'lucide-react'
```

---

## Paso 7 — Si quieres verlo en la tabla (UserTable.tsx)

Agrega la columna en `frontend/components/admin/users/UserTable.tsx`:

### 7.1 Agregar encabezado de columna
```tsx
<th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wider px-4 py-3">
  Teléfono
</th>
```

### 7.2 Agregar celda en cada fila
```tsx
<td className="px-4 py-3">
  <p className="text-sm text-slate-700">{user.telefono || '—'}</p>
</td>
```

---

## Resumen de comandos

```bash
# 1. Editar admin_models.py localmente
# 2. Copiar modelo al contenedor
docker cp backend/admin-service/app/models/admin_models.py avalanz-admin:/app/app/models/admin_models.py

# 3. Generar migración
docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'descripcion'"

# 4. Si autogenerate genera pass, editar el archivo manualmente y copiarlo:
docker cp backend/admin-service/migrations/versions/XXXX.py avalanz-admin:/app/migrations/versions/XXXX.py

# 5. Aplicar migración
docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"

# 6. Verificar BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "\d users"

# 7. Copiar versiones al local
docker cp avalanz-admin:/app/migrations/versions/ backend/admin-service/migrations/

# 8. Actualizar user_service.py, users.py, user.types.ts, UserForm.tsx, UserTable.tsx
# 9. Copiar servicios actualizados al contenedor
docker cp backend/admin-service/app/services/user_service.py avalanz-admin:/app/app/services/user_service.py
docker cp backend/admin-service/app/routes/users.py avalanz-admin:/app/app/routes/users.py

# 10. Reiniciar admin-service
docker compose -f infrastructure/docker/docker-compose.yml \
  -f infrastructure/docker/docker-compose.dev.yml restart admin-service
```
