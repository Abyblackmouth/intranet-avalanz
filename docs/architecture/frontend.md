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
│   │   └── layout.tsx            → Incluye ToastContainer
│   ├── layout.tsx                → Layout raíz global
│   ├── page.tsx                  → Redirect a /login
│   └── not-found.tsx
│
├── components/
│   ├── ui/                       → Componentes shadcn/ui
│   ├── layout/                   → Sidebar, Header, Breadcrumb
│   │   └── Header.tsx            → Inicializa useWebSocket y renderiza NotificationBell
│   ├── auth/                     → Formularios de autenticación
│   ├── admin/                    → Componentes del panel admin
│   ├── shared/
│   │   └── ToastContainer.tsx    → Toasts flotantes esquina inferior derecha
│   └── notifications/
│       └── NotificationBell.tsx  → Campana con contador y panel desplegable
│
├── hooks/
│   ├── useWebSocket.ts           → Conexión WebSocket con reconexión automática
│   └── useNotifications.ts       → Consulta y gestión de notificaciones
│
├── store/
│   ├── authStore.ts              → Estado global de autenticación
│   ├── notificationStore.ts      → Lista y contador de notificaciones
│   └── toastStore.ts             → Cola de toasts con máximo 3 simultáneos
│
├── services/
│   ├── api.ts                    → Axios con interceptors y refresh automático
│   ├── authService.ts            → Endpoints de autenticación
│   ├── adminService.ts           → Endpoints del panel de administración
│   ├── notificationService.ts    → Endpoints del notify-service
│   └── roleService.ts            → Endpoints de roles y permisos
│
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
| NEXT_PUBLIC_WS_URL | URL del WebSocket | ws://172.20.92.197/ws |
| NEXT_PUBLIC_APP_NAME | Nombre de la app | Intranet Avalanz |
| NEXT_PUBLIC_APP_VERSION | Versión de la app | 1.0.0 |

En producción `NEXT_PUBLIC_WS_URL` usa el dominio real: `ws://intranet.avalanz.com/ws`

---

## Protección de rutas — proxy.ts

El middleware intercepta todas las rutas antes de renderizar. Si no hay `access_token` en cookies y la ruta no es pública, redirige a `/login`. Si hay token y el usuario intenta acceder a `/login`, redirige a `/app`.

Rutas públicas: `/login`, `/reset-password`, `/change-password`, `/setup-2fa`

```typescript
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

### notificationStore

Archivo: `store/notificationStore.ts`

Gestiona la lista de notificaciones del usuario y el contador de no leídas en memoria durante la sesión.

| Campo / Método | Tipo | Descripción |
|---|---|---|
| notifications | Notification[] | Lista de notificaciones cargadas |
| unreadCount | number | Contador de notificaciones no leídas |
| isOpen | boolean | Si el panel de notificaciones está abierto |
| setNotifications(list) | void | Reemplaza la lista completa |
| addNotification(n) | void | Agrega una notificación al inicio — máximo 50 en memoria |
| markAsRead(id) | void | Marca una notificación como leída localmente |
| markAllAsRead() | void | Marca todas como leídas localmente |
| setUnreadCount(n) | void | Actualiza el contador manualmente |
| setIsOpen(open) | void | Abre o cierra el panel |

### toastStore

Archivo: `store/toastStore.ts`

Gestiona la cola de toasts flotantes. Máximo 3 toasts visibles al mismo tiempo — los siguientes esperan en cola.

| Campo / Método | Tipo | Descripción |
|---|---|---|
| toasts | Toast[] | Cola de toasts activos |
| addToast(toast) | void | Agrega un toast — descarta el más antiguo si hay 3 |
| removeToast(id) | void | Elimina un toast por id |

---

## HTTP Client — services/api.ts

Instancia de Axios con dos interceptors:

**Request interceptor** — agrega automáticamente el `Authorization: Bearer <token>` en cada request desde las cookies.

**Response interceptor** — cuando un request falla con 401, intenta renovar el `access_token` usando el `refresh_token`. Si hay múltiples requests fallando simultáneamente los encola y reintenta todos con el nuevo token. Si el refresh falla, limpia las cookies y redirige a `/login`.

| Función exportada | Descripción |
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

### notificationService.ts

| Función | Endpoint | Descripción |
|---|---|---|
| getNotifications(params) | GET /api/v1/notifications/ | Listar notificaciones del usuario |
| getUnreadCount() | GET /api/v1/notifications/unread-count | Obtener contador de no leídas |
| markAsRead(id) | PATCH /api/v1/notifications/{id}/read | Marcar una como leída |
| markAllAsRead() | PATCH /api/v1/notifications/read-all | Marcar todas como leídas |

---

## Hooks

### useWebSocket

Archivo: `hooks/useWebSocket.ts`

Gestiona la conexión WebSocket durante la sesión. Se inicializa en el `Header` y permanece activo mientras el usuario esté autenticado.

Comportamiento:
- Se conecta automáticamente al detectar un usuario en el authStore
- Lee el token desde las cookies y la URL desde `NEXT_PUBLIC_WS_URL`
- Envía ping cada 30 segundos para mantener la conexión viva
- Reconecta automáticamente cada 5 segundos ante desconexiones inesperadas
- Al recibir `notification.new` — normaliza el campo id, agrega al notificationStore y despacha un toast al toastStore
- Al recibir `session.revoked` o código 4001 — limpia el authStore y redirige al login
- Se desconecta automáticamente al cerrar sesión

### useNotifications

Archivo: `hooks/useNotifications.ts`

Combina el notificationStore con el notificationService para gestionar la carga y actualización de notificaciones.

Comportamiento:
- Al montar refresca el contador de no leídas
- Refresca el contador automáticamente cada 60 segundos (polling de respaldo)
- Al abrir el panel carga la lista completa de notificaciones
- markAsRead y markAllAsRead actualizan el store localmente primero y llaman al API en segundo plano

---

## Componentes de notificaciones

### NotificationBell

Archivo: `components/notifications/NotificationBell.tsx`

Campana en el Header con badge de contador. Al hacer click abre el panel desplegable `NotificationList` que muestra las últimas 20 notificaciones. Desde el panel se puede marcar notificaciones como leídas individualmente o todas a la vez.

El badge muestra el número de notificaciones no leídas. Si supera 99 muestra `99+`. El contador se actualiza en tiempo real via WebSocket sin necesidad de refrescar la página.

### ToastContainer

Archivo: `components/shared/ToastContainer.tsx`

Contenedor de toasts flotantes anclado a la esquina inferior derecha de la pantalla. Los toasts aparecen con animación de entrada desde abajo y desaparecen hacia arriba al cerrarse. Cada toast se auto-cierra en 5 segundos o se puede cerrar manualmente con el botón X.

El color del borde y el ícono varían según el tipo de notificación: azul para info, verde para success, amarillo para warning y rojo para error. Se renderizan máximo 3 toasts simultáneos — los siguientes esperan en la cola del toastStore.

El ToastContainer se inicializa en `app/(private)/layout.tsx` y está disponible en todas las rutas privadas.

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
        Header inicializa useWebSocket → conexión WebSocket activa
```

---

## Convenciones de código

- **Layouts y páginas** → `export default function NombrePage()`
- **Componentes medianos y pequeños** → función flecha `const Componente = () => {}`
- **Llamadas al API** → solo desde `services/`, nunca directamente en componentes
- **Estado global** → solo Zustand, nunca useState para datos compartidos
- **Permisos en UI** → siempre con helpers del authStore (`hasRole`, `hasModule`, etc.)
- **WebSocket** → nunca instanciar WebSocket directamente — usar el hook `useWebSocket`
- **Notificaciones** → siempre a través de `notificationService` y el store, nunca llamadas directas al API desde componentes

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
