# Guía — Scaffold Server y Sistema de Módulos

## Qué es el scaffold-server

El scaffold-server es un proceso Node.js que corre en el servidor (fuera de Docker) en el puerto 3002. Su función es recibir peticiones HTTP del admin-service cuando se crea un módulo o submódulo, generar automáticamente la estructura de archivos en el frontend y backend, reconstruir el frontend y hacer commit+push al repositorio.

---

## Arquitectura del flujo

```
Browser → Admin Panel → createModule() → admin-service (Docker)
                                              ↓
                               POST /scaffold/module {slug}
                                              ↓
                               scaffold-server (PM2 puerto 3002)
                                              ↓
                        create-module.js genera archivos
                                              ↓
                        npm run build (frontend)
                                              ↓
                        pm2 restart intranet-frontend
                                              ↓
                        git add -A + git commit + git push
```

---

## Archivos del sistema

| Archivo | Descripción |
|---|---|
| `scripts/create-module.js` | Genera la estructura de carpetas y archivos |
| `scripts/scaffold-server.js` | Servidor HTTP que recibe las peticiones y orquesta todo |
| `backend/admin-service/app/services/module_service.py` | Llama al scaffold-server después de crear módulo/submódulo |
| `backend/admin-service/app/config.py` | Variable `SCAFFOLD_SERVER_URL` |

---

## Endpoints del scaffold-server

### GET /health
Verifica que el servidor está corriendo.
```bash
curl http://10.12.0.51:3002/health
# {"ok":true,"service":"scaffold-server","port":3002}
```

### POST /scaffold/module
Crea la estructura de un módulo nuevo.
```bash
curl -X POST http://10.12.0.51:3002/scaffold/module \
  -H "Content-Type: application/json" \
  -d '{"slug":"boveda"}'
```

### POST /scaffold/submodule
Crea la estructura de un submódulo dentro de un módulo existente.
```bash
curl -X POST http://10.12.0.51:3002/scaffold/submodule \
  -H "Content-Type: application/json" \
  -d '{"moduleSlug":"boveda","subSlug":"contratos"}'
```

---

## Estructura generada por módulo

### Frontend
```
frontend/app/(private)/app/{slug}/
├── layout.tsx      — sidebar con submódulos del módulo
└── page.tsx        — página "Módulo en construcción"

frontend/components/app/{slug}/
└── .gitkeep        — carpeta lista para componentes
```

### Backend
```
backend/modules/{slug}-service/
├── app/
│   ├── __init__.py
│   ├── main.py         — FastAPI app con health endpoint
│   ├── config.py       — variables de entorno con pydantic-settings
│   ├── database.py     — conexión async a PostgreSQL
│   ├── models/
│   │   └── __init__.py — modelos SQLAlchemy (vacíos, listos para definir)
│   ├── routes/
│   │   ├── __init__.py — router principal que incluye sub-routers
│   │   └── {slug}.py   — ruta GET / del módulo
│   └── services/
│       ├── __init__.py
│       └── {slug}_service.py — lógica de negocio (vacía)
├── Dockerfile
├── requirements.txt
└── .env.example
```

---

## Estructura generada por submódulo

### Frontend
```
frontend/app/(private)/app/{moduleSlug}/{subSlug}/
└── page.tsx        — página "en construcción"

frontend/components/app/{moduleSlug}/{subSlug}/
├── {SubSlug}Table.tsx  — tabla principal (vacía)
└── {SubSlug}Form.tsx   — formulario (vacío)
```

### Backend (dentro del servicio del módulo padre)
```
backend/modules/{moduleSlug}-service/app/
├── routes/{subSlug}/
│   ├── __init__.py
│   └── {subSlug}.py    — rutas del submódulo
└── services/{subSlug}/
    ├── __init__.py
    └── {subSlug}_service.py
```

---

## Validaciones del create-module.js

- Slug válido: solo letras minúsculas, números y guiones
- No crea módulo si ya existe la carpeta en frontend O en backend
- No crea submódulo si ya existe la carpeta en frontend O en backend
- Verifica que el módulo padre existe antes de crear submódulo

---

## Variables de entorno requeridas

### admin-service (.env)
```
SCAFFOLD_SERVER_URL=http://10.12.0.250:3002
```
La IP `10.12.0.250` es la IP del host Docker — el contenedor la usa para salir a localhost del servidor.

### frontend (.env.local)
```
NEXT_PUBLIC_SCAFFOLD_URL=http://10.12.0.51:3002
```
El browser usa la IP pública del servidor para llamar al scaffold directamente.

---

## PM2 — gestión del scaffold-server

```bash
# Ver estado
pm2 status

# Logs en tiempo real
pm2 logs scaffold-server

# Reiniciar
pm2 restart scaffold-server

# Ver últimas líneas
pm2 logs scaffold-server --lines 30
```

---

## Git configuración en el servidor

Para que el auto-commit funcione, el servidor necesita:

```bash
# Configurar identidad git
git -C ~/intranet-avalanz config user.email "abraham_covarrubias@avalanz.com"
git -C ~/intranet-avalanz config user.name "Abraham Covarrubias"

# Configurar remote con SSH (no HTTPS)
git -C ~/intranet-avalanz remote set-url origin git@github.com:Abyblackmouth/intranet-avalanz.git

# Generar SSH key si no existe
ssh-keygen -t ed25519 -C "abraham_covarrubias@avalanz.com" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
# Agregar en GitHub → Settings → SSH Keys
```

---

## Usar el script directamente (sin el servidor)

```bash
cd ~/intranet-avalanz

# Crear módulo
node scripts/create-module.js boveda

# Crear submódulo
node scripts/create-module.js boveda contratos

# Ver ayuda
node scripts/create-module.js
```

---

## Próximos pasos después de crear un módulo

1. Dar de alta el módulo en el admin: `/admin/modules`
2. Asignar el módulo a usuarios desde el panel de usuarios
3. Agregar el servicio al `docker-compose.yml` apuntando a `backend/modules/{slug}-service`
4. Crear la BD del módulo si usa una propia
5. Desarrollar las rutas y servicios dentro de la estructura generada
6. Crear los submódulos desde el admin o con el script
