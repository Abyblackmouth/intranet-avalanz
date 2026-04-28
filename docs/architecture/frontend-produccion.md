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

## Variables de entorno

El archivo `.env.local` NO está en el repo — se crea manualmente en cada servidor.

### Servidor provisional (10.12.0.51)
```bash
NEXT_PUBLIC_API_URL=http://10.12.0.51
NEXT_PUBLIC_WS_URL=ws://10.12.0.51/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://10.12.0.51:3002
```

### Desarrollo local (WSL2)
```bash
NEXT_PUBLIC_API_URL=http://172.20.x.x      # IP de WSL2, verificar con ip addr show eth0
NEXT_PUBLIC_WS_URL=ws://172.20.x.x/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://localhost:3002
```

### Producción (pendiente)
```bash
NEXT_PUBLIC_API_URL=https://intranet.avalanz.com
NEXT_PUBLIC_WS_URL=wss://intranet.avalanz.com/ws
NEXT_PUBLIC_SCAFFOLD_URL=http://IP_SERVIDOR:3002
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
```

---

## Nginx como proxy inverso

El frontend corre en el puerto 3000 internamente. Nginx en el puerto 80 actúa como proxy:

```nginx
# En infrastructure/nginx/conf.d/intranet.conf
server_name intranet.avalanz.com 10.12.0.51 _;

location / {
    proxy_pass http://host.docker.internal:3000;
    ...
}
```

El `server_name` incluye `_` como catch-all para que funcione con cualquier IP sin necesidad del header `Host`.

---

## Rutas de API que pasan por Nginx

Todas las peticiones al backend van por Nginx en el puerto 80. Las rutas críticas que deben existir en `intranet.conf`:

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

# Ruta general de usuarios (admin-service)
location /api/v1/users/ {
    proxy_pass http://admin_service;
}
```

> **Importante:** Las rutas específicas deben definirse ANTES de las rutas generales en Nginx. El orden importa.

---

## WebSocket

El WebSocket se conecta en `ws://IP_SERVIDOR/ws`. Nginx tiene configurado el upgrade:

```nginx
location /ws {
    proxy_pass http://websocket_service;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

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

---

## Producción — checklist pendiente

- [ ] Configurar HTTPS con certificado SSL
- [ ] Actualizar Nginx para redirigir HTTP a HTTPS
- [ ] Cambiar `NEXT_PUBLIC_API_URL` a `https://intranet.avalanz.com`
- [ ] Cambiar `NEXT_PUBLIC_WS_URL` a `wss://intranet.avalanz.com/ws`
- [ ] Cambiar `DEBUG=False` en todos los servicios backend
- [ ] Generar nuevas JWT keys y contraseñas de producción
- [ ] Cerrar puerto 5432 de PostgreSQL al exterior
- [ ] Cerrar puerto 9001 de MinIO al exterior
- [ ] Validar que PM2 arranca con el sistema

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
