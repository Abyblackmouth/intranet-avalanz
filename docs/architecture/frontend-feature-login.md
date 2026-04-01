# Feature: Auth Login — Guía de Referencia

Rama: `feature/frontend-login`  
Estado: Completado

Implementa el flujo completo de autenticación del frontend — login, cambio de contraseña temporal, configuración y verificación de 2FA, y recuperación de contraseña.

---

## Archivos creados

```
frontend/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── change-password/page.tsx
│   │   ├── setup-2fa/page.tsx
│   │   └── reset-password/page.tsx
│   └── (private)/
│       └── layout.tsx             → Incluye AuthProvider
├── components/
│   └── auth/
│       └── AuthProvider.tsx       → Valida token al cargar rutas privadas
├── services/
│   ├── api.ts                     → Axios con interceptors y refresh automático
│   └── authService.ts             → Todas las llamadas al auth-service
├── store/
│   └── authStore.ts               → Estado global de autenticación (Zustand)
└── types/
    ├── auth.types.ts
    └── api.types.ts
```

---

## Flujos implementados

### Flujo 1 — Login normal (red corporativa)

```
/login
  └── POST /api/v1/auth/login
        └── access_token + refresh_token
              └── Guarda tokens en cookies
              └── GET /api/v1/auth/me → guarda user en Zustand
              └── redirect /app
```

### Flujo 2 — Login con 2FA (red externa)

```
/login
  └── POST /api/v1/auth/login
        └── action: 2fa_required + temp_token
              └── redirect /setup-2fa?mode=verify&temp_token=xxx
                    └── POST /api/v1/auth/2fa/verify
                          └── access_token + refresh_token
                                └── redirect /app
```

### Flujo 3 — Primer login (contraseña temporal)

```
/login
  └── POST /api/v1/auth/login
        └── action: change_password + user_id
              └── redirect /change-password?user_id=xxx
                    └── POST /api/v1/auth/change-temp-password
                          └── action: setup_2fa
                                └── redirect /setup-2fa?mode=setup&user_id=xxx
                                      └── GET /api/v1/2fa/setup → QR + secret
                                      └── POST /api/v1/2fa/activate
                                            └── Muestra backup codes
                                            └── redirect /login
```

### Flujo 4 — Recuperación de contraseña

```
/reset-password
  └── POST /api/v1/auth/password-reset/request
        └── Email enviado (mensaje neutro)

/reset-password?token=xxx
  └── POST /api/v1/auth/password-reset/confirm
        └── Contraseña actualizada
        └── redirect /login
```

---

## Páginas

### /login

- Formulario con email y contraseña
- Validación con React Hook Form + Zod
- Manejo de los 3 posibles responses del backend
- Toggle de visibilidad de contraseña
- Link a recuperación de contraseña

### /change-password

Recibe `user_id` como query param.

- Formulario de nueva contraseña con confirmación
- Indicador de reglas en tiempo real (verde/gris por regla)
- Valida: 8 caracteres, mayúscula, minúscula, número, carácter especial
- Al completar redirige a `/setup-2fa?mode=setup`

### /setup-2fa

Recibe `mode` y opcionalmente `temp_token` como query params.

**mode=setup** (primer login):
- Carga el QR del backend con `GET /api/v1/2fa/setup`
- Muestra el QR en SVG renderizado inline
- Muestra el secret con botón de copiar
- Campo para confirmar con primer código del autenticador
- Al activar muestra los 8 códigos de respaldo en grid

**mode=verify** (login externo):
- Solo muestra el campo de código TOTP
- Al verificar guarda tokens y redirige a `/app`

### /reset-password

**Sin token** (solicitar recuperación):
- Campo de email
- Al enviar muestra mensaje neutro sin confirmar si el email existe

**Con token** (nueva contraseña):
- Formulario de nueva contraseña con indicador de reglas
- Al guardar redirige al login con mensaje de éxito

---

## AuthProvider

Archivo: `components/auth/AuthProvider.tsx`

Se ejecuta en todas las rutas privadas al cargar. Valida el token con el servidor llamando a `GET /api/v1/auth/me`. Si el token no existe o está expirado, limpia el store de Zustand y redirige al login.

Esto resuelve el problema de Zustand persistiendo `isAuthenticated: true` en localStorage cuando el servidor se reinicia y los tokens expiran.

```typescript
// Lógica del AuthProvider
const token = Cookies.get('access_token')

if (!token) {
  logout()  // limpia localStorage
  return
}

// Valida con el servidor
const res = await getMe()
if (res.success) setUser(res.data)
else logout() → router.push('/login')
```

---

## authStore (Zustand)

Archivo: `store/authStore.ts`

Persiste `user` e `isAuthenticated` en localStorage con `zustand/middleware/persist`.

### Helpers disponibles en componentes

```typescript
const { user, isAdmin, isSuperAdmin, hasModule, hasRole, hasPermission, logout } = useAuthStore()

// Verificar si puede acceder al panel admin
if (isAdmin()) { ... }

// Verificar acceso a módulo específico
if (hasModule('legal')) { ... }

// Verificar permiso específico
if (hasPermission('users:write')) { ... }
```

---

## api.ts — Refresh automático de tokens

El interceptor de respuesta maneja automáticamente la renovación del `access_token`:

1. Request falla con `401`
2. Toma el `refresh_token` de cookies
3. Llama a `POST /api/v1/auth/refresh`
4. Actualiza el `access_token` en cookies
5. Reintenta el request original
6. Si el refresh también falla → `clearSession()` → redirect `/login`

Los requests que fallan mientras se está renovando el token se encolan y se reintentan todos con el nuevo token.

---

## Configuración de email para desarrollo

Para probar el flujo de recuperación de contraseña en desarrollo se recomienda usar **Mailtrap**:

1. Crear cuenta en mailtrap.io
2. Ir a Email Testing → Inboxes → SMTP Settings
3. Actualizar `backend/email-service/.env`:

```bash
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=tu_user
SMTP_PASSWORD=tu_password
SMTP_USE_TLS=True
```

4. Reiniciar el email-service:
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart email-service
```

---

## Problemas conocidos en desarrollo

### Super admin requiere 2FA
En desarrollo la IP de Docker (`172.18.x.x`) se detecta como red externa. Solución aplicada: agregar `172.16.0.0/12` a `CORPORATE_IP_RANGES` en `backend/auth-service/.env` y marcar `is_2fa_configured = true` en la BD.

### Token persistido redirige al dashboard
Si el servidor se reinicia y el token expira, Zustand puede tener `isAuthenticated: true` en localStorage. El `AuthProvider` lo detecta y limpia automáticamente. Si persiste, limpiar manualmente desde consola del navegador:

```javascript
localStorage.clear();
document.cookie.split(";").forEach(c => document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"));
location.reload();
```