# Guía — Frontend en Producción / Servidor Provisional

Esta guía cubre la configuración del frontend Next.js en el servidor provisional (10.12.0.51) y lo que se necesita para producción.

---

## Stack del frontend

- Next.js 16.2.1 con App Router y Turbopack
- React 19
- Tailwind CSS v4
- Zustand para estado global
- shadcn/ui (Radix/Nova)
- PM2 como process manager

---

## Estructura de rutas

```
frontend/app/
├── (auth)/                     — páginas sin autenticación
│   ├── login/page.tsx
│   ├── change-password/page.tsx
│   ├── reset-password/page.tsx
│   └── setup-2fa/page.tsx
└── (private)/                  — páginas con autenticación requerida
    ├── profile/page.tsx          — perfil del usuario autenticado
    ├── admin/
    │   ├── users/page.tsx
    │   ├── companies/page.tsx
    │   ├── groups/page.tsx
    │   ├── modules/page.tsx      — con scaffold automático
    │   ├── roles/page.tsx
    │   └── permissions/page.tsx
    └── app/
        ├── [module]/page.tsx     — fallback "Módulo en construcción"
        ├── [module]/[submodule]/page.tsx
        └── {slug}/               — páginas generadas por scaffold
            ├── layout.tsx        — sidebar del módulo
            └── page.tsx
```

---

## Historial de variables de entorno por ambiente

El archivo `.env.local` NO está en el repo — se crea manualmente en cada servidor.

### Desarrollo local (WSL2)
```bash
NEXT_PUBLIC_API_URL=http://localhost
NEXT_PUBLIC_WS_URL=ws://localhost/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://localhost:3002
```

### Servidor provisional / pruebas (activo — 2026-04-28)
```bash
NEXT_PUBLIC_API_URL=http://intranet.avalanz.com
NEXT_PUBLIC_WS_URL=ws://intranet.avalanz.com/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://intranet.avalanz.com:3002
```

### Producción (pendiente — cuando esté el SSL)
```bash
NEXT_PUBLIC_API_URL=https://intranet.avalanz.com
NEXT_PUBLIC_WS_URL=wss://intranet.avalanz.com/ws
NEXT_PUBLIC_SCAFFOLD_URL=https://intranet.avalanz.com:3002
```

> **Importante:** Las variables `NEXT_PUBLIC_*` se hornean en el build. Cualquier cambio requiere reconstruir el frontend con `npm run build`.

---

## Build y deploy

```bash
# Instalar dependencias
cd ~/intranet-avalanz/frontend
npm install

# Build de producción
npm run build

# Iniciar con PM2
pm2 start npm --name "intranet-frontend" -- start -- -p 3000

# Guardar configuración PM2
pm2 save

# Configurar arranque automático
pm2 startup
# Ejecutar el comando que genera pm2 startup
```

---

## PM2 — comandos frecuentes

```bash
# Estado
pm2 status

# Reiniciar frontend (después de un build)
pm2 restart intranet-frontend

# Ver logs
pm2 logs intranet-frontend --lines 20

# Rebuild completo (cuando hay cambios en el código)
cd ~/intranet-avalanz/frontend
npm run build && pm2 restart intranet-frontend

# Recrear proceso PM2 si falla
pm2 delete intranet-frontend
cd ~/intranet-avalanz/frontend
pm2 start npm --name intranet-frontend -- start -- -p 3000
pm2 save
```

---

## Nginx como proxy inverso

El frontend corre en el puerto 3000 internamente. Nginx en el puerto 80 actúa como proxy.

El upstream apunta directamente a la IP del servidor porque PM2 corre fuera de Docker:

```nginx
upstream frontend {
    server 10.12.0.51:3000;
}

server {
    listen 80;
    server_name intranet.avalanz.com 10.12.0.51 _;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> **Nota:** El `server_name` incluye `_` como catch-all para que funcione con cualquier IP sin necesidad del header `Host`.

---

## Rutas de API que pasan por Nginx

Todas las peticiones al backend van por Nginx en el puerto 80. Las rutas críticas que deben existir en `intranet.conf` en este orden (más específicas primero):

```nginx
# Auth sub-rutas (van al auth-service, no al admin-service)
location ~ ^/api/v1/auth/internal/users/[^/]+/sessions {
    proxy_pass http://auth_service;
}
location ~ ^/api/v1/auth/internal/users/[^/]+/login-history {
    proxy_pass http://auth_service;
}
location ~ ^/api/v1/auth/internal/users/[^/]+/revoke-sessions {
    proxy_pass http://auth_service;
}

# User files (van al admin-service)
location ~ ^/api/v1/users/[^/]+/files {
    proxy_pass http://admin_service;
    client_max_body_size 55M;
}

# Notifications — SIN trailing slash (fix 2026-04-28)
location /api/v1/notifications {
    proxy_pass http://notify_service;
}

# Ruta general de usuarios (admin-service)
location /api/v1/users/ {
    proxy_pass http://admin_service;
}
```

> **Importante:** Las rutas específicas deben definirse ANTES de las rutas generales en Nginx. El orden importa.
> **Fix 2026-04-28:** `/api/v1/notifications` sin trailing slash — con slash Nginx no hacía match con subrutas como `/unread-count`.

---

## WebSocket

El WebSocket se conecta en `ws://intranet.avalanz.com/ws` (o `wss://` con SSL). Nginx tiene configurado el upgrade:

```nginx
location /ws {
    proxy_pass http://websocket_service;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

---

## Página de perfil

La página `/profile` está en `frontend/app/(private)/profile/page.tsx`.

- Hace fetch a `GET /api/v1/users/{user_id}` para obtener puesto, departamento y matrícula
- Avatar circular con iniciales del nombre
- Para super admins muestra "Grupo Avalanz" como empresa
- Solo lectura — edición requiere contactar al administrador
- El botón en el Header apunta a `/profile` (no a `/app/profile`)

---

## Errores de build frecuentes

### useSearchParams() sin Suspense boundary
Next.js 16 requiere que `useSearchParams()` esté dentro de un `<Suspense>`. Páginas afectadas:
- `change-password/page.tsx`
- `reset-password/page.tsx`
- `setup-2fa/page.tsx`

Solución: envolver el componente que usa `useSearchParams` en `<Suspense fallback={null}>`.

### TypeError en layout.tsx generado por scaffold
El tipo de `modules` en el store no incluye `submodules`. Solución en el template:
```typescript
// Incorrecto
const submodules: any[] = mod?.submodules ?? []

// Correcto
const submodules: any[] = (mod as any)?.submodules ?? []
```

### Property does not exist en getModules
`getModules` en `adminService.ts` requiere parámetros opcionales:
```typescript
export const getModules = (params?: Record<string, string | number | boolean>) =>
  api.get('/api/v1/modules/', { params })
```

### TypeError: Cannot read properties of undefined (reading 'charAt') en Sidebar
El Sidebar usa `charAt` sobre slugs e íconos que pueden ser `undefined`. Todos los accesos deben protegerse:
```typescript
// Incorrecto
slug.charAt(0).toUpperCase() + slug.slice(1)
iconSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('')

// Correcto
(slug || '').charAt(0).toUpperCase() + (slug || '').slice(1)
(iconSlug || '').split('-').map((w: string) => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join('')
```

---

## Actualizar el frontend en el servidor

Cada vez que hay cambios en el código del frontend:

```bash
# En el servidor
cd ~/intranet-avalanz
git pull origin develop
cd frontend
npm run build && pm2 restart intranet-frontend
```

Los cambios en `NEXT_PUBLIC_*` también requieren rebuild ya que se hornean en tiempo de build.