# Flujo de Usuario Bloqueado — Guía de Referencia

Ubicación: `docs/architecture/flujo-usuario-bloqueado.md`

Esta guía describe los tipos de bloqueo de cuenta, cómo se diferencian, y los flujos disponibles para desbloquear según el caso.

---

## Tipos de bloqueo

El campo `lock_type` en la tabla `users` del `auth-service` determina el origen del bloqueo:

| lock_type | Origen | Quién puede desbloquear |
|---|---|---|
| `failed_attempts` | Automático — 3 intentos fallidos consecutivos | Admin manualmente, O el usuario por recuperación de contraseña |
| `manual` | Un super_admin lo bloqueó desde el panel | Solo un admin manualmente |
| `null` | No está bloqueado | — |

---

## Mensaje en el login según tipo de bloqueo

| lock_type | Mensaje mostrado al usuario |
|---|---|
| `failed_attempts` | "Cuenta bloqueada por múltiples intentos fallidos, contacta al administrador" |
| `manual` | "Tu cuenta ha sido bloqueada, contacta al administrador" |

---

## Flujo 1 — Bloqueo automático por intentos fallidos

```
Usuario falla 3 intentos consecutivos
        |
auth-service: is_locked=true, lock_type="failed_attempts", failed_attempts=3
        |
auth-service envía correo al usuario:
  "Tu cuenta ha sido bloqueada por 3 intentos fallidos. IP: xxx. Fecha: xxx."
        |
Usuario puede:
  A) Contactar al admin para desbloqueo manual
  B) Usar "Olvide mi contraseña" → le llega correo con link
        |
Al confirmar nueva contraseña:
  is_locked=false, failed_attempts=0, lock_type=null
        |
Usuario puede iniciar sesión normalmente
```

---

## Flujo 2 — Bloqueo manual por administrador

```
super_admin va al panel → menú 3 puntos → Bloquear cuenta
        |
Modal pide motivo obligatorio
        |
admin-service: guarda lock_reason en su BD
auth-service: is_locked=true, lock_type="manual"
        |
Usuario intenta iniciar sesión:
  "Tu cuenta ha sido bloqueada, contacta al administrador"
        |
Usuario intenta recuperar contraseña:
  "Tu cuenta tiene restricciones. Contacta al administrador."
  (no se envía correo)
        |
Solo el admin puede desbloquear:
  super_admin → menú 3 puntos → Desbloquear cuenta → motivo obligatorio
        |
auth-service: is_locked=false, lock_type=null
        |
Usuario puede iniciar sesión normalmente
```

---

## Desbloqueo manual desde el panel (admin)

1. Ir a Panel Admin → Usuarios
2. Localizar al usuario bloqueado (badge rojo "Bloqueado")
3. Menú de 3 puntos → **Desbloquear cuenta**
4. Escribir motivo del desbloqueo (obligatorio)
5. Confirmar

El sistema actualiza:
- `admin-service`: `lock_reason` con el motivo del desbloqueo
- `auth-service`: `is_locked=false`, `locked_at=null`, `lock_type=null`

---

## Desbloqueo por recuperación de contraseña (solo para failed_attempts)

Si el bloqueo es por intentos fallidos, el usuario puede auto-desbloquearse:

1. Ir a `/login` → "Olvide mi contraseña"
2. Ingresar su correo
3. Recibir email con link de recuperación (válido 30 minutos)
4. Seguir el link → ingresar nueva contraseña
5. Al confirmar: cuenta desbloqueada automáticamente

> Si el bloqueo es `manual`, el link no se envía y se muestra: "Tu cuenta tiene restricciones. Contacta al administrador."

---

## Reset de contraseña por admin (no desbloquea)

El reset de contraseña desde el panel admin (`POST /api/v1/users/{user_id}/reset-password`) **no desbloquea la cuenta**. Solo:
- Cambia la contraseña hasheada
- Activa `is_temp_password=true`
- Resetea `failed_attempts=0`

Si el usuario también está bloqueado, el admin debe desbloquear la cuenta por separado desde el menú de acciones.

---

## Resumen de acciones disponibles según tipo de bloqueo

| Acción | failed_attempts | manual |
|---|---|---|
| Admin desbloquea manualmente | ✓ | ✓ |
| Usuario recupera contraseña | ✓ (desbloquea automáticamente) | ✗ |
| Admin resetea contraseña | ✓ (no desbloquea) | ✓ (no desbloquea) |

---

## Notas técnicas

- `lock_type` se guarda en `auth-service` — tabla `users` en BD `avalanz_auth`
- `lock_reason` se guarda en `admin-service` — tabla `users` en BD `avalanz_admin`
- La inferencia del tipo de bloqueo por `failed_attempts vs MAX_FAILED_ATTEMPTS` fue reemplazada por el campo explícito `lock_type` para mayor robustez
- `MAX_FAILED_ATTEMPTS = 3` definido en `backend/auth-service/app/config.py`
