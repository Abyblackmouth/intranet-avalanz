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
| Excel | SheetJS (xlsx) | 0.18.x |
| PDF | jsPDF + jspdf-autotable | 2.5.1 + 3.8.2 |
| Gráficas | Recharts | — |
| Fuentes | Geist Sans, Geist Mono, Plus Jakarta Sans, Roboto (Google Fonts via Next.js) | — |

> jsPDF versión 2.5.1 y jspdf-autotable versión 3.8.2 son las versiones compatibles con Turbopack. No usar versiones 4.x — rompen el build.

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
│   │   ├── profile/page.tsx      → Perfil del usuario autenticado
│   │   ├── admin/                → Panel de administración
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          → Redirect a /admin/users
│   │   │   ├── groups/
│   │   │   ├── companies/
│   │   │   ├── users/            → Incluye Exportar Excel y filtro de bloqueados
│   │   │   ├── modules/          → CRUD con selector de íconos popover flotante
│   │   │   ├── roles/
│   │   │   └── permissions/
│   │   ├── app/                  → Módulos operativos
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          → Redirect a /admin/users al iniciar sesión
│   │   │   └── [module]/[submodule]/
│   │   └── layout.tsx            → Incluye ToastContainer
│   ├── layout.tsx                → Layout raíz global con fuentes Google
│   ├── page.tsx                  → Redirect a /login
│   └── not-found.tsx
│
├── components/
│   ├── ui/                       → Componentes shadcn/ui
│   ├── layout/
│   │   ├── Sidebar.tsx           → Sidebar colapsable con navegación dinámica
│   │   ├── Header.tsx            → Header con reloj, notificaciones y menú usuario
│   │   └── PageWrapper.tsx       → Wrapper de páginas con título, descripción y acciones
│   ├── auth/                     → Formularios de autenticación
│   │   └── AuthProvider.tsx      → Valida sesión y redirige según is_temp_password
│   ├── admin/                    → Componentes del panel admin
│   │   ├── users/
│   │   │   ├── UserTable.tsx     → Tabla de usuarios con paginación y menú flotante
│   │   │   ├── UserDetail.tsx    → Panel lateral con 4 tabs incluyendo Documentos y Sesiones
│   │   │   ├── UserForm.tsx      → Formulario de creación de usuario
│   │   │   ├── UserEditForm.tsx  → Formulario de edición con selector de empresa para super_admin
│   │   │   ├── UserAuditReport.tsx → Generador de reporte PDF de auditoría por usuario
│   │   │   └── UserModuleAccess.tsx
│   │   └── companies/
│   │       ├── CompanyForm.tsx
│   │       ├── CompanyEditForm.tsx
│   │       └── CompanyDetail.tsx
│   ├── shared/
│   │   ├── ToastContainer.tsx    → Toasts flotantes esquina inferior derecha
│   │   ├── AdminInput.tsx        → Input reutilizable para páginas admin
│   │   └── AdminCard.tsx         → Card reutilizable con hover elegante
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
│   ├── uploadService.ts          → Endpoints de archivos de usuario y storage
│   ├── notificationService.ts    → Endpoints del notify-service
│   └── roleService.ts            → Endpoints de roles y permisos
│
├── lib/                          → Utilidades y helpers
├── types/                        → TypeScript interfaces
├── proxy.ts                      → Middleware de protección de rutas
└── .env.local                    → Variables de entorno (no en repo)
```

---

## Variables de entorno

Archivo: `frontend/.env.local` — no está en el repo, se crea manualmente en cada ambiente. Ver `frontend-produccion.md` para los valores por ambiente.

| Variable | Descripción |
|---|---|
| NEXT_PUBLIC_API_URL | URL base del API (Nginx) |
| NEXT_PUBLIC_WS_URL | URL del WebSocket |
| NEXT_PUBLIC_SCAFFOLD_URL | URL del scaffold-server |
| NEXT_PUBLIC_APP_NAME | Nombre de la app |
| NEXT_PUBLIC_APP_VERSION | Versión de la app |

> Las variables `NEXT_PUBLIC_*` se hornean en el build. Cualquier cambio requiere `npm run build` + `pm2 restart intranet-frontend`.

---

## Protección de rutas — proxy.ts

El middleware intercepta todas las rutas antes de renderizar. Si no hay `access_token` en cookies y la ruta no es pública, redirige a `/login`. Si hay token y el usuario intenta acceder a `/login`, redirige a `/app`.

Rutas públicas: `/login`, `/reset-password`, `/change-password`, `/setup-2fa`

```typescript
if (!token && !isPublicRoute) → redirect('/login')
if (token && pathname === '/login') → redirect('/app')
```

---

## Convenciones de UI

### Colores y tokens

| Token | Valor | Uso |
|---|---|---|
| Azul corporativo | `#1a4fa0` | Botones primarios, items activos, focus |
| Verde Excel | `emerald-600` | Botón de exportar Excel |
| Fondo layout | `bg-slate-50` | Fondo general de páginas privadas |
| Fondo sidebar/header | `bg-white` | Siempre blanco |
| Borde sidebar | `border-r-2 border-slate-300` | Separador sidebar-contenido |
| Borde header | `border-b-2 border-slate-300` | Consistente con sidebar |

### Cards

```
bg-white rounded-xl border border-slate-200 shadow-sm
hover:shadow-md hover:border-[#1a4fa0]/30 hover:-translate-y-0.5
transition-all duration-200
```

### Inputs en páginas admin (sobre fondo slate-50)

```
border border-slate-200 rounded-lg text-sm text-slate-900
placeholder:text-slate-400 bg-white outline-none
hover:border-slate-300
focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10
transition-all duration-150
```

Usar el componente `AdminInput` de `components/shared/AdminInput.tsx` — soporta prop `icon` para íconos a la izquierda.

### Inputs en páginas auth (sobre fondo blanco)

```css
border: 1.5px solid #e2e8f0; border-radius: 10px;
focus: border-color #1a4fa0; box-shadow: 0 0 0 3.5px rgba(26,79,160,0.10);
```

### Botones primarios

```
bg-[#1a4fa0] text-white rounded-lg hover:bg-blue-700
font-medium px-4 py-2 text-sm transition
```

### Botón Excel

```
bg-emerald-600 text-white rounded-lg hover:bg-emerald-700
font-medium px-4 py-2 text-sm transition disabled:opacity-50
```

### Badges de estado

```
// Activo
bg-emerald-50 text-emerald-700 border border-emerald-200

// Inactivo/Bloqueado
bg-red-50 text-red-600 border border-red-200
```

Siempre incluir punto de color: `<span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />`

### Menús flotantes (3 puntos)

- Detección de espacio: `menuHeight = 280` para decidir si abrir hacia arriba o hacia abajo
- Borde: `border border-slate-200 shadow-lg rounded-xl`
- Items hover gris fuerte: `hover:bg-slate-300` (visible en pantallas brillosas)
- Items destructivos: `text-red-600 hover:bg-red-200`
- Botones cancelar en modales: `hover:bg-slate-100`

### Avatares con iniciales

6 colores determinísticos por hash del nombre del usuario:

```typescript
const avatarColors = [
  'bg-[#1a4fa0]', 'bg-violet-500', 'bg-teal-500',
  'bg-orange-400', 'bg-rose-500', 'bg-emerald-500',
]
const colorIndex = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % avatarColors.length
```

### Fuentes

| Fuente | Variable CSS | Uso |
|---|---|---|
| Geist Sans | `--font-geist-sans` | Cuerpo general |
| Geist Mono | `--font-geist-mono` | Código y monoespaciado |
| Plus Jakarta Sans | `--font-jakarta` | Títulos del sidebar y PageWrapper |
| Roboto | `--font-roboto` | Disponible, no usado actualmente |

Todas las fuentes se importan en `app/layout.tsx` y se aplican como variables CSS al elemento `<html>`.

### Banners de color en páginas

No usar banners de degradado azul (`bg-gradient-to-r from-[#1a4fa0]`) en páginas del área privada. Usar fondo neutro `bg-slate-100` o eliminar el banner completamente. El azul corporativo se reserva para botones, items activos y elementos de acción.

---

## Layout — Sidebar

Archivo: `components/layout/Sidebar.tsx`

Sidebar colapsable con dos estados: expandido (`w-60`) y colapsado (`w-16`). El estado se controla con `mounted` para evitar hydration mismatch.

**Estructura:**
- Logo `w-10 h-10` con `object-contain` + nombre "Intranet Avalanz" en Plus Jakarta Sans
- Sección "Administración" — solo visible para admins. Super admin ve todos los items; admin_empresa solo ve Usuarios y Empresas
- Sección "Mis Módulos" — módulos dinámicos del JWT con submódulos colapsables
- Footer con avatar azul + iniciales + nombre + rol + punto verde de conexión

**Submódulos desplegables:**
- Línea vertical izquierda: `border-l-2 border-slate-100`
- Item activo: `bg-blue-50 text-[#1a4fa0]`
- Item inactivo: `text-slate-500 hover:bg-slate-100`

**Items de navegación activos:** `bg-[#1a4fa0] text-white`
**Items de navegación hover:** `hover:bg-slate-100`

> **Fix 2026-04-28:** Todos los accesos a `slug` e `iconSlug` en el Sidebar están protegidos con `(slug || '')` y `(iconSlug || '')` para evitar `TypeError: Cannot read properties of undefined (reading 'charAt')` cuando algún módulo tiene datos incompletos.

---

## Layout — Header

Archivo: `components/layout/Header.tsx`

Altura fija `h-14`. Contiene:
- Lado izquierdo: reloj en tiempo real (`font-mono text-slate-500`) + fecha + separador + hora de conexión
- Lado derecho: `NotificationBell` + menú de usuario con iniciales, nombre y rol

El reloj se actualiza cada segundo via `setInterval`. La fecha usa `toLocaleDateString('es-MX')` y se muestra en minúsculas con la clase `lowercase`.

El menú de usuario contiene: Mi perfil, Panel admin (solo admins), Cerrar sesión.

> **Nota:** El botón "Mi perfil" redirige a `/profile` — no a `/app/profile`.

---

## Layout — PageWrapper

Archivo: `components/layout/PageWrapper.tsx`

Wrapper sin fondo propio — se integra directamente con el `bg-slate-50` del layout. No tiene `border-b` ni `bg-white`.

```tsx
<PageWrapper
  title="Usuarios"
  description="Gestiona los usuarios de la plataforma"
  actions={<button>+ Nuevo usuario</button>}
>
  {/* contenido */}
</PageWrapper>
```

El título usa Plus Jakarta Sans (`font-semibold text-xl text-slate-800`). La descripción usa `text-xs text-slate-400`.

---

## Componentes compartidos

### AdminInput

Archivo: `components/shared/AdminInput.tsx`

Input reutilizable para páginas admin. Aplica el estilo estándar sobre `bg-slate-50` automáticamente.

```tsx
<AdminInput
  icon={<Search size={14} />}
  placeholder="Buscar..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>
```

### AdminCard

Archivo: `components/shared/AdminCard.tsx`

Card reutilizable con hover elegante. Props: `children`, `className`, `onClick`, `hover` (default true).

---

## AuthProvider

Archivo: `components/auth/AuthProvider.tsx`

Se ejecuta en cada ruta privada. Valida el token con `GET /api/v1/auth/me`. Si el usuario tiene `is_temp_password: true` redirige a `/change-password?user_id=xxx`. Si el token es inválido hace logout y redirige a `/login`.

---

## Página de perfil — `/profile`

Archivo: `app/(private)/profile/page.tsx`

Página de perfil del usuario autenticado. Accesible desde el menú de usuario en el Header.

- Hace fetch a `GET /api/v1/users/{user_id}` para obtener puesto, departamento y matrícula
- Avatar circular con iniciales del nombre (misma lógica de colores que el Sidebar)
- Para super admins muestra "Grupo Avalanz" como empresa
- Muestra el rol como "Super Administrador" para is_super_admin, o los roles globales asignados
- Solo lectura — un mensaje informativo indica que la edición requiere contactar al administrador

---

## Página de usuarios — `/admin/users`

Archivo: `app/(private)/admin/users/page.tsx`

### Filtros disponibles

| Filtro | Parámetro backend | Descripción |
|---|---|---|
| Buscar | `search` | Por nombre, email o matrícula |
| Estado — Activos | `is_active=true&is_locked=false` | Usuarios activos y no bloqueados |
| Estado — Inactivos | `is_active=false` | Usuarios desactivados |
| Estado — Bloqueados | `is_locked=true` | Usa columna cache `is_locked` en BD del admin-service |
| Empresa | `company_id` | Solo visible para super_admin |

> El filtro "Activos" envía `is_locked=false` además de `is_active=true` para excluir usuarios bloqueados del resultado.

### Exportar Excel

Botón verde "Exportar Excel" junto al botón de nuevo usuario. Genera un archivo `.xlsx` con todos los usuarios de la plataforma (paginando de 100 en 100 para respetar el límite del backend).

Columnas del reporte:

| Columna | Formato |
|---|---|
| Matricula | Número de empleado o — |
| Nombre | Nombre completo |
| Email | Correo electrónico |
| Puesto | Cargo o — |
| Departamento | Área o — |
| Empresa | Nombre comercial |
| Roles | Separados por ` \| ` |
| Estado | Activo / Inactivo / Bloqueado |
| 2FA | Configurado / Sin configurar |
| Ultimo acceso | DD/MM/YYYY HH:mm en 24h |
| Fecha creacion | DD/MM/YYYY |

El usuario protegido (`admin@avalanz.com`) no aparece en el reporte. El archivo se nombra `concentrado_usuarios_YYYY-MM-DD.xlsx`.

---

## Tabla de usuarios — UserTable

Archivo: `components/admin/users/UserTable.tsx`

Tabla con las siguientes características:
- Altura fija del contenedor: `629px` con `display: flex, flexDirection: column`
- Paginación de 10 registros por página
- Avatares con 6 colores determinísticos por hash del nombre
- Menú flotante con detección de espacio (`menuHeight = 280`) — se abre hacia arriba si no hay espacio abajo
- Footer de paginación siempre al fondo del contenedor via `marginTop: auto`
- Correo del usuario: `text-slate-400`

### Opciones del menú de 3 puntos

| Opción | Acción |
|---|---|
| Ver detalle | Abre UserDetail en tab Información |
| Documentos | Abre UserDetail directo en tab Documentos |
| Reporte de auditoría | Genera PDF con 3 páginas de información del usuario |
| Editar | Abre formulario de edición |
| Resetear contraseña | Modal de reset |
| Bloquear / Desbloquear | Modal con motivo obligatorio |
| Revocar sesiones | Revoca todas las sesiones activas y envía correo de notificación |
| Eliminar usuario | Modal de confirmación — solo super_admin, no aparece en usuario protegido |

---

## Panel de detalle — UserDetail

Archivo: `components/admin/users/UserDetail.tsx`

Panel lateral derecho con 4 tabs:

| Tab | Descripción |
|---|---|
| Información | Datos personales, estado de cuenta y roles |
| Sesiones | Sesiones activas con opción de revocar individualmente |
| Historial | Historial de intentos de acceso con IP y resultado |
| Documentos | Archivos del expediente del empleado |

### Prop `initialTab`

Permite abrir el panel directo en un tab específico:

```tsx
<UserDetail
  userId={userId}
  initialTab="documents"
  onClose={handleClose}
  onRefresh={handleRefresh}
/>
```

### Tab Sesiones

- Lista todas las sesiones activas del usuario
- Cada sesión muestra dispositivo, IP, fecha de inicio y última actividad
- Botón de revocar individual — llama a `POST /internal/users/{id}/revoke-session` con el `session_id`
- La revocación individual no envía correo — es una acción granular de seguridad

### Tab Documentos

- Lista todos los archivos activos del empleado ordenados por fecha de subida
- Muestra la descripción como título principal y el nombre del archivo como subtítulo
- Muestra tamaño formateado y fecha relativa de subida
- Botón de descarga — genera URL firmada temporal (15 min) y abre en nueva pestaña
- Botón de eliminar con confirmación — hace soft delete (el archivo sigue en MinIO)
- Formulario de subida con campo de descripción opcional
- Validación en frontend antes de enviar — tipos y tamaño

### Validación de archivos en frontend

```typescript
const ALLOWED_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
]
const MAX_SIZE_MB = 50
```

---

## Formulario de edición — UserEditForm

Archivo: `components/admin/users/UserEditForm.tsx`

Panel lateral derecho de edición de usuario. Campos disponibles:

| Campo | Visible para | Descripción |
|---|---|---|
| Empresa | super_admin | Selector de empresa — permite cambiar la empresa del usuario |
| Nombre completo | Todos | Campo de texto |
| Correo electrónico | Todos | Campo de email |
| Matrícula | super_admin | Número de empleado |
| Puesto | Todos | Cargo del empleado |
| Departamento | Todos | Área del empleado |
| Rol global | super_admin | Selector de rol global — excluye super_admin y admin_empresa para admin_empresa |
| Acceso a módulos | super_admin, admin_empresa | Lista de módulos asignados con opción de agregar y revocar |

> El selector de empresa solo es visible para super_admin. Al seleccionar una empresa y guardar, el campo `company_id` se envía en el payload y el backend solo lo procesa si el solicitante es super_admin.

---

## Reporte de auditoría PDF — UserAuditReport

Archivo: `components/admin/users/UserAuditReport.tsx`

Genera un PDF de 3 páginas con información completa del usuario. Se accede desde el menú de 3 puntos → "Reporte de auditoría".

**Página 1 — Perfil:**
- Información general: nombre, email, matrícula, puesto, departamento
- Empresa: nombre comercial, razón social y RFC
- Estado de cuenta: activo/inactivo, bloqueado/desbloqueado, 2FA configurado
- Roles globales asignados
- Módulos y submódulos con rol operativo — super_admin muestra "Acceso total a todos los módulos"

**Página 2 — Historial de sesiones:**
- Sesiones activas actuales
- Historial de accesos con estadísticas (total, exitosos, fallidos, desde red corporativa)
- Dispositivo/navegador parseado del user agent
- Columna 2FA por sesión

**Página 3 — Trazabilidad:**
- Archivos del expediente del empleado
- Nota sobre módulos operativos pendientes

**Librerías:** jsPDF 2.5.1 + jspdf-autotable 3.8.2 (versiones específicas compatibles con Turbopack — no actualizar sin verificar compatibilidad)

---

## Selector de íconos — Módulos

Archivo: `app/(private)/admin/modules/page.tsx`

El selector de íconos en el formulario de creación y edición de módulos y submódulos es un **popover flotante**. Al hacer click en el botón muestra un panel con búsqueda en tiempo real y grid de 8 columnas con los 100 íconos disponibles.

- Click en el botón abre el popover
- Campo de búsqueda filtra por nombre del ícono en tiempo real
- Al seleccionar un ícono se cierra el popover automáticamente
- Click fuera del popover lo cierra sin seleccionar

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
        │         change-password verifica is_temp_password via /internal/users/{id}/info
        │         Si is_temp_password=false → muestra "Link expirado"
        │
        ├── action: 2fa_required → /setup-2fa?temp_token=xxx&mode=verify
        │
        ├── action: setup_2fa → /setup-2fa?mode=setup&... (primer login con 2FA)
        │         Al activar 2FA llama clearSession() antes de redirigir al login
        │
        └── access_token + refresh_token
                |
                v
        Guarda tokens en cookies
        GET /api/v1/auth/me → guarda user en Zustand
        AuthProvider verifica is_temp_password → redirige si aplica
                |
                v
        Redirect a /app → redirect automático a /admin/users
        Header inicializa useWebSocket → conexión WebSocket activa
```

---

## Flujo de recuperación de contraseña

```
Usuario solicita recuperación → POST /api/v1/auth/password-reset/request
        |
        v
Recibe correo con link /reset-password?token=xxx
        |
        v
Ingresa nueva contraseña → POST /api/v1/auth/password-reset/confirm
        |
        ├── success → token marcado is_used=True en BD → redirect /login
        └── error → INVALID_TOKEN (token ya usado o expirado) → muestra error
```

---

## Estado global — Zustand

### authStore

| Campo / Método | Tipo | Descripción |
|---|---|---|
| user | AuthUser \| null | Datos del usuario autenticado |
| isAuthenticated | boolean | Si hay sesión activa |
| setUser(user) | void | Guarda el usuario en el store |
| setTokens(tokens) | void | Guarda tokens en cookies |
| logout() | void | Limpia cookies y store |
| isAdmin() | boolean | Si es super_admin o admin_empresa |
| isSuperAdmin() | boolean | Si es super_admin |

### AuthUser — campos del JWT

| Campo | Tipo | Descripción |
|---|---|---|
| user_id | string | UUID del usuario |
| email | string | Correo electrónico |
| full_name | string | Nombre completo |
| is_super_admin | boolean | Flag de super admin (desde admin-service permissions) |
| roles | string[] | Roles globales asignados |
| modules | array | Módulos accesibles con submódulos |
| companies | string[] | IDs de empresas accesibles |
| permissions | string[] | Permisos globales |
| cross_company | boolean | Acceso cross-company |

> **Fix 2026-04-28:** `is_super_admin` se agrega al JWT desde `build_token_payload` en el auth-service, leyéndolo de la respuesta del admin-service (`perms.get("is_super_admin")`). El modelo `User` del auth-service no tiene este campo — viene del admin-service.

### notificationStore

| Campo / Método | Tipo | Descripción |
|---|---|---|
| notifications | Notification[] | Lista de notificaciones cargadas |
| unreadCount | number | Contador de notificaciones no leídas |
| addNotification(n) | void | Agrega al inicio — máximo 50 en memoria |
| markAsRead(id) | void | Marca como leída localmente |
| markAllAsRead() | void | Marca todas como leídas localmente |

### toastStore

| Campo / Método | Tipo | Descripción |
|---|---|---|
| toasts | Toast[] | Cola de toasts activos |
| addToast(toast) | void | Agrega — descarta el más antiguo si hay 3 |
| removeToast(id) | void | Elimina por id |

---

## HTTP Client — services/api.ts

Instancia de Axios con interceptors automáticos de token y refresh.

| Función exportada | Descripción |
|---|---|
| saveSession(access, refresh) | Guarda tokens en cookies |
| clearSession() | Elimina cookies y redirige a /login |
| getAccessToken() | Obtiene access token de cookies |
| getRefreshToken() | Obtiene refresh token de cookies |

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

### uploadService.ts

| Función | Endpoint | Descripción |
|---|---|---|
| getUserFiles(userId) | GET /api/v1/users/{id}/files | Listar archivos del empleado |
| uploadUserFile(userId, formData) | POST /api/v1/users/{id}/files | Subir archivo |
| downloadUserFile(userId, fileId) | GET /api/v1/users/{id}/files/{fileId}/download | Obtener URL firmada |
| deleteUserFile(userId, fileId, reason) | DELETE /api/v1/users/{id}/files/{fileId} | Soft delete |
| getFileAudit(userId, fileId) | GET /api/v1/users/{id}/files/{fileId}/audit | Ver auditoría |
| uploadToStorage(formData) | POST /api/v1/upload/ | Subida directa al upload-service |
| getSignedUrl(objectKey, bucket) | GET /api/v1/upload/signed-url | URL firmada directa |
| deleteFromStorage(objectKey, bucket) | DELETE /api/v1/upload/ | Eliminar de MinIO |

---

## Convenciones de código

- **Layouts y páginas** → `export default function NombrePage()`
- **Componentes medianos y pequeños** → función flecha `const Componente = () => {}`
- **Llamadas al API** → solo desde `services/`, nunca directamente en componentes
- **Estado global** → solo Zustand, nunca useState para datos compartidos
- **Hydration** → todo lo que dependa de Zustand o del DOM protegido con `mounted &&` + `useEffect(() => setMounted(true), [])`
- **Permisos en UI** → siempre con helpers del authStore (`isAdmin()`, `isSuperAdmin()`)
- **WebSocket** → nunca instanciar WebSocket directamente — usar el hook `useWebSocket`

---

## Arranque local

```bash
cd frontend
npm run dev
```

El frontend queda disponible en `http://localhost:3000`