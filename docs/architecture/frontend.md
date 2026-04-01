# Frontend — Guía de Referencia

Ubicación: `frontend/`

Interfaz web de la Intranet Avalanz construida con Next.js 16, Tailwind CSS y shadcn/ui. Arquitectura basada en App Router con rutas protegidas por middleware y estado global manejado con Zustand.

---

## Stack tecnológico

| Componente | Tecnología | Versión |
|---|---|---|
| Framework | Next.js | 16.2.1 |
| Lenguaje | TypeScript | — |
| Estilos | Tailwind CSS | — |
| Componentes | shadcn/ui (Radix + Nova) | — |
| Estado global | Zustand | 5.x |
| HTTP client | Axios | 1.x |
| Formularios | React Hook Form + Zod | — |
| Iconos UI | Lucide React | — |
| Iconos marcas | React Icons | 5.x |
| Cookies | js-cookie | — |

---

## Estructura de carpetas

```
frontend/
├── app/                          → App Router (rutas)
│   ├── (auth)/                   → Rutas públicas (sin token)
│   │   ├── login/page.tsx
│   │   ├── change-password/page.tsx
│   │   ├── setup-2fa/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── layout.tsx
│   ├── (private)/                → Rutas privadas (requieren token)
│   │   ├── admin/                → Panel de administración
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── groups/
│   │   │   ├── companies/
│   │   │   ├── users/
│   │   │   ├── modules/
│   │   │   ├── roles/
│   │   │   └── permissions/
│   │   ├── app/                  → Módulos operativos
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── [module]/[submodule]/
│   │   └── layout.tsx
│   ├── layout.tsx                → Layout raíz global
│   ├── page.tsx                  → Redirect a /login
│   └── not-found.tsx
│
├── components/
│   ├── ui/                       → Componentes shadcn/ui
│   ├── layout/                   → Sidebar, Header, Breadcrumb
│   ├── auth/                     → Formularios de autenticación
│   ├── admin/                    → Componentes del panel admin
│   ├── shared/                   → Componentes globales reutilizables
│   └── notifications/            → Campana y lista de notificaciones
│
├── hooks/                        → Custom hooks
├── store/                        → Zustand stores
├── services/                     → Llamadas al API (Axios)
├── lib/                          → Utilidades y helpers
├── types/                        → TypeScript interfaces
├── proxy.ts                      → Middleware de protección de rutas
└── .env.local                    → Variables de entorno
```

---

## Variables de entorno

Archivo: `frontend/.env.local`

| Variable | Descripción | Valor desarrollo |
|---|---|---|
| NEXT_PUBLIC_API_URL | URL base del API | http://localhost |
| NEXT_PUBLIC_WS_URL | URL del WebSocket | ws://localhost/ws |
| NEXT_PUBLIC_APP_NAME | Nombre de la app | Intranet Avalanz |
| NEXT_PUBLIC_APP_VERSION | Versión de la app | 1.0.0 |

---

## Protección de rutas — proxy.ts

El middleware intercepta todas las rutas antes de renderizar. Si no hay `access_token` en cookies y la ruta no es pública, redirige a `/login`. Si hay token y el usuario intenta acceder a `/login`, redirige a `/app`.

Rutas públicas: `/login`, `/reset-password`, `/change-password`, `/setup-2fa`

```typescript
// Lógica del middleware
if (!token && !isPublicRoute) → redirect('/login')
if (token && pathname === '/login') → redirect('/app')
```

---

## Estado global — Zustand

### authStore

Archivo: `store/authStore.ts`

Persiste `user` e `isAuthenticated` en `localStorage` automáticamente.

| Campo / Método | Tipo | Descripción |
|---|---|---|
| user | AuthUser \| null | Datos del usuario autenticado |
| isAuthenticated | boolean | Si hay sesión activa |
| isLoading | boolean | Estado de carga |
| setUser(user) | void | Guarda el usuario en el store |
| setTokens(tokens) | void | Guarda tokens en cookies |
| logout() | void | Limpia cookies y store |
| hasRole(role) | boolean | Verifica si el usuario tiene el rol |
| hasModule(slug) | boolean | Verifica acceso a un módulo |
| hasPermission(perm) | boolean | Verifica un permiso específico |
| isAdmin() | boolean | Si es super_admin o admin_empresa |
| isSuperAdmin() | boolean | Si es super_admin |

### Uso en componentes

```typescript
import { useAuthStore } from '@/store/authStore'

const { user, isAdmin, hasModule, logout } = useAuthStore()

// Verificar si puede ver el panel admin
if (isAdmin()) { ... }

// Verificar acceso a un módulo
if (hasModule('legal')) { ... }
```

---

## HTTP Client — services/api.ts

Instancia de Axios con dos interceptors:

### Request interceptor
Agrega automáticamente el `Authorization: Bearer <token>` en cada request desde las cookies.

### Response interceptor — Refresh automático
Cuando un request falla con `401`:
1. Intenta renovar el `access_token` usando el `refresh_token`
2. Si hay múltiples requests fallando simultáneamente los encola y reintenta todos con el nuevo token
3. Si el refresh falla, limpia las cookies y redirige a `/login`

### Helpers exportados

| Función | Descripción |
|---|---|
| saveSession(access, refresh) | Guarda ambos tokens en cookies |
| clearSession() | Elimina cookies y redirige a /login |
| getAccessToken() | Obtiene el access token de cookies |
| getRefreshToken() | Obtiene el refresh token de cookies |

---

## Servicios — services/

### authService.ts

| Función | Endpoint | Descripción |
|---|---|---|
| login(data) | POST /api/v1/auth/login | Iniciar sesión |
| verify2FA(data) | POST /api/v1/auth/2fa/verify | Verificar código TOTP |
| get2FASetup() | GET /api/v1/2fa/setup | Obtener QR y secret |
| activate2FA(code) | POST /api/v1/2fa/activate | Activar 2FA |
| changePassword(data) | POST /api/v1/auth/change-temp-password | Cambiar contraseña temporal |
| requestPasswordReset(data) | POST /api/v1/auth/password-reset/request | Solicitar recuperación |
| confirmPasswordReset(data) | POST /api/v1/auth/password-reset/confirm | Confirmar nueva contraseña |
| getMe() | GET /api/v1/auth/me | Obtener usuario autenticado |
| logout(refreshToken) | POST /api/v1/auth/logout | Cerrar sesión |
| getSessions() | GET /api/v1/auth/sessions | Listar sesiones activas |
| revokeSession(id) | POST /api/v1/auth/sessions/revoke | Revocar sesión |

---

## Types — types/

### auth.types.ts

| Interface | Descripción |
|---|---|
| LoginRequest | Email y password para login |
| LoginResponse | Respuesta del login con action, tokens o temp_token |
| TwoFARequest | temp_token y code para verificar 2FA |
| TwoFASetupResponse | QR SVG, secret y backup codes |
| ChangePasswordRequest | user_id y new_password |
| AuthUser | Datos completos del usuario en el JWT |
| UserSession | Datos de una sesión activa |
| TokenPair | access_token, refresh_token y token_type |

### api.types.ts

| Interface | Descripción |
|---|---|
| ApiResponse\<T\> | Respuesta estándar del API |
| PaginationMeta | Metadata de paginación |
| PaginatedResponse\<T\> | Respuesta con lista paginada |
| ErrorResponse | Respuesta de error estándar |
| PaginationParams | Parámetros page y per_page |

---

## Flujo de autenticación

```
Usuario entra a /login
        |
        v
Ingresa email y password
        |
        v
POST /api/v1/auth/login
        |
        ├── action: change_password → /change-password?user_id=xxx
        │
        ├── action: 2fa_required → /setup-2fa?temp_token=xxx&mode=verify
        │
        └── access_token + refresh_token
                |
                v
        Guarda tokens en cookies
        GET /api/v1/auth/me → guarda user en Zustand
                |
                v
        Redirect a /app
```

---

## Convenciones de código

- **Layouts y páginas** → `export default function NombrePage()`
- **Componentes medianos y pequeños** → función flecha `const Componente = () => {}`
- **Formularios** → React Hook Form + Zod siempre
- **Llamadas al API** → solo desde `services/`, nunca directamente en componentes
- **Estado global** → solo Zustand, nunca useState para datos compartidos
- **Permisos en UI** → siempre con helpers del authStore (`hasRole`, `hasModule`, etc.)

---

## Arranque local

```bash
cd frontend
npm run dev
```

El frontend queda disponible en `http://localhost:3000`

En producción Nginx sirve el frontend en `http://intranet.avalanz.com`

---

## Instalación desde cero

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```