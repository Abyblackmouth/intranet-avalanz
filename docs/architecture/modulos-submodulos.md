# Guía de Módulos y Submódulos — Intranet Avalanz

## Concepto

Un módulo es un ecosistema de negocio independiente dentro de la intranet. Cada módulo pertenece a una empresa específica, tiene su propio microservicio backend, sus propias rutas en el frontend, sus propios roles y permisos, y aparece en el sidebar del usuario que tenga acceso asignado.

Un submódulo es un subproceso dentro del módulo. Por ejemplo el módulo Legal puede tener submódulos: Expedientes, Contratos, Audiencias.

---

## Tipos de módulos

**Corporativos (multi-empresa):** Un solo módulo sirve a todas las empresas del grupo. La BD es compartida pero cada registro lleva `company_id` para separar la información. Ejemplo: Legal.

**Por empresa (instancia independiente):** Cada empresa tiene su propia instancia del módulo con su propia BD. Ejemplo: Bóveda DYCE y Bóveda AGIM son dos instancias separadas con diferente BD y diferente contenedor Docker.

---

## Estructura de archivos generada

Al crear el módulo `legal`:

```
frontend/app/(private)/app/legal/
├── layout.tsx              ← layout con menú lateral de submódulos
└── page.tsx                ← dashboard del módulo

frontend/components/app/legal/
└── .gitkeep                ← carpeta lista para componentes

backend/modules/legal-service/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   │   └── __init__.py
│   ├── routes/
│   │   ├── __init__.py
│   │   └── legal.py
│   └── services/
│       ├── __init__.py
│       └── legal_service.py
├── Dockerfile
├── requirements.txt
└── .env.example
```

Al crear el submódulo `expedientes` dentro de `legal`:

```
frontend/app/(private)/app/legal/expedientes/
└── page.tsx                ← página base del submódulo

frontend/components/app/legal/expedientes/
├── ExpedientesTable.tsx    ← tabla principal
└── ExpedientesForm.tsx     ← formulario

backend/modules/legal-service/app/
├── routes/expedientes.py   ← endpoints REST
└── services/expediente_service.py ← lógica de negocio
```

---

## Flujo completo para crear un módulo

### Prerequisito: scaffold server corriendo

El scaffold server debe estar activo antes de crear módulos desde el admin. Se levanta en una terminal separada:

```bash
node scripts/scaffold-server.js
# Corre en http://localhost:3002
```

### 1. Dar de alta en el admin

Ir a `/admin/modules` → Nuevo módulo. Llenar nombre, empresa, ícono y orden. Al guardar se dispara automáticamente el scaffold que genera todos los archivos base.

Aparece un modal de progreso que dura mínimo 5 segundos mientras se genera la estructura. Al terminar, el sistema pide cerrar sesión y volver a entrar para que el JWT incluya el nuevo módulo y aparezca en el sidebar.

### 2. Conectar el servicio al docker-compose

En `infrastructure/docker/docker-compose.yml`:

```yaml
legal-service:
  build:
    context: ../../backend/modules/legal-service
  container_name: avalanz-legal
  env_file:
    - ../../backend/modules/legal-service/.env
  depends_on:
    - postgres
  networks:
    - avalanz-network
```

### 3. Crear la base de datos del módulo

```bash
docker exec avalanz-postgres psql -U avalanz_user -c "CREATE DATABASE avalanz_legal;"
```

### 4. Configurar el .env del servicio

Copiar `.env.example` a `.env` y ajustar:

```bash
cp backend/modules/legal-service/.env.example backend/modules/legal-service/.env
```

Editar `DATABASE_URL`, `JWT_SECRET_KEY` y demás variables según el entorno.

### 5. Levantar el servicio y aplicar migraciones

```bash
docker compose up legal-service -d
docker exec avalanz-legal bash -c "cd /app && alembic init migrations && alembic revision --autogenerate -m 'init' && alembic upgrade head"
```

### 6. Cerrar sesión y volver a entrar

El JWT se actualiza e incluye el módulo. Aparece en el sidebar.

---

## Flujo completo para crear un submódulo

### 1. Dar de alta en el admin

Ir a `/admin/modules` → expandir el módulo → botón `+ Submódulo`. Al guardar se genera la estructura automáticamente.

### 2. Registrar el router en el backend

En `backend/modules/legal-service/app/main.py` importar y registrar el nuevo router:

```python
from app.routes import expedientes

app.include_router(expedientes.router, prefix="/expedientes")
```

### 3. Cerrar sesión y volver a entrar

El submódulo aparece anidado bajo el módulo en el sidebar.

---

## Sidebar — comportamiento

Los módulos aparecen en la sección **Mis Módulos** del sidebar. Cada módulo tiene una flecha para colapsar/expandir sus submódulos. El super admin ve todos los módulos activos automáticamente sin necesidad de asignación manual.

El JWT incluye los módulos con el siguiente formato:

```json
{
  "modules": [
    {
      "slug": "legal",
      "icon": "scale",
      "submodules": [
        { "slug": "expedientes", "icon": "file-text", "name": "Expedientes" }
      ]
    }
  ]
}
```

---

## Eliminación de módulos

### Desde el admin (soft delete)

La eliminación desde el admin requiere una **clave de confirmación** (ver `claves-admin.md`). Hace soft delete en BD — el módulo desaparece del sistema y del sidebar pero el código en filesystem queda intacto.

### Eliminar el código (solo en desarrollo)

```bash
git rm -rf frontend/app/(private)/app/legal
git rm -rf frontend/components/app/legal
git rm -rf backend/modules/legal-service
git commit -m "chore: remove legal module"
```

**Nunca eliminar carpetas en producción sin pasar por git.**

---

## Script generador manual

Además del scaffold automático, el script puede usarse directamente desde terminal:

```bash
# Crear módulo
node scripts/create-module.js legal

# Crear submódulo
node scripts/create-module.js legal expedientes
```

El script detecta si los archivos ya existen y no los sobreescribe.

---

## Roles dentro de un módulo

Cada módulo puede tener roles propios (director_legal, abogado, asistente). Estos se configuran en `/admin/roles` y se asignan a usuarios desde `/admin/users`.

El JWT incluye los roles de módulo con el formato `modulo:rol`, por ejemplo `legal:director_legal`. El código del módulo lee este dato para determinar qué puede ver y hacer el usuario dentro del módulo.

---

## Relación entre módulo y microservicio backend

El slug del módulo es el vínculo entre el catálogo (admin) y el código. El slug en BD debe coincidir exactamente con:

- El nombre de la carpeta en `frontend/app/(private)/app/[slug]/`
- El nombre del servicio en `backend/modules/[slug]-service/`
- El nombre de la BD: `avalanz_[slug]` (con guiones reemplazados por guiones bajos)

Si el slug cambia en BD, las rutas del frontend y el nombre del servicio deben actualizarse manualmente.
