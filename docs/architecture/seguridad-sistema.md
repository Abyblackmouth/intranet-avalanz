# Seguridad del Sistema — Intranet Avalanz
## Documentación de infraestructura de seguridad

**Versión:** 1.1  
**Fecha:** 29 de junio de 2026 · actualizado el 22 de octubre de 2026  
**Autor:** Héctor Abraham Covarrubias Martínez  
**Alcance:** Infraestructura base del servidor — aplica a toda la plataforma, no a un módulo específico

---

## Visión general

La seguridad de la Intranet Avalanz opera en **5 capas independientes**. Cada capa actúa como respaldo de las anteriores — si una falla, la siguiente la contiene.

```
Internet
    │
    ▼
① UFW (firewall del SO)
    │  Bloquea IPs maliciosas antes de que lleguen a Docker o Nginx
    ▼
② fail2ban (detección automática de intrusos)
    │  Banea IPs automáticamente al detectar patrones de ataque
    ▼
③ Nginx (rate limiting y proxy inverso)
    │  Limita la frecuencia de requests por IP
    ▼
④ Servicios backend (identidad, sesiones y bloqueo de cuentas)
    │  Verifica la identidad (contraseña, 2FA por red), controla el primer
    │  acceso y registra cada sesión; bloquea cuentas tras intentos fallidos
    ▼
⑤ Sistema de notificaciones (alerta al administrador)
       Notifica por correo cuando ocurre un evento de seguridad
```

---

## Capa 1 — UFW (Uncomplicated Firewall)

### Qué es
UFW es el firewall del sistema operativo Ubuntu. Controla qué tráfico entra y sale del servidor a nivel de sistema operativo, antes de que llegue a Docker, Nginx o cualquier servicio.

### Estado
- **Activo** desde el 29 de junio de 2026
- Configurado para iniciar automáticamente con el sistema

### Reglas activas

| # | Puerto/IP | Acción | Origen | Descripción |
|---|---|---|---|---|
| 1 | Anywhere | DENY IN | 189.163.174.41 | IP atacante bloqueada (INC-2026-001) |
| 2 | 3000 | ALLOW IN | 172.18.0.0/16 | Docker → frontend Next.js |
| 3 | 22/tcp | ALLOW IN | Anywhere | SSH |
| 4 | 80/tcp | ALLOW IN | Anywhere | HTTP |
| 5 | 443/tcp | ALLOW IN | Anywhere | HTTPS |
| 6 | 3000 | ALLOW IN | 172.16.0.0/12 | Docker (rango completo) → frontend |

### Comandos de gestión

```bash
# Ver reglas activas numeradas
sudo ufw status numbered

# Bloquear una IP manualmente
sudo ufw deny from IP_ATACANTE to any

# Desbloquear una regla por número
sudo ufw delete NUMERO

# Verificar estado
sudo ufw status verbose
```

### Notas importantes
- El puerto 3000 (frontend Next.js) debe estar abierto para el rango Docker (`172.16.0.0/12`) — sin esta regla Nginx no puede llegar al frontend y la intranet muestra 504
- SSH está abierto para cualquier IP — considerar restringirlo a IPs conocidas en producción operativa

---

## Capa 2 — fail2ban

### Qué es
fail2ban monitorea los logs del servidor en tiempo real y banea automáticamente en UFW las IPs que generen patrones de ataque, sin intervención humana.

### Estado
- **Activo** desde el 29 de junio de 2026
- Configurado en `/etc/fail2ban/jail.local`

### Jails configurados

#### nginx-docker
Monitorea el log de Nginx (dentro del contenedor Docker) y banea IPs que generen demasiadas respuestas 429.

```ini
[nginx-docker]
enabled  = true
filter   = nginx-docker
logpath  = /var/lib/docker/containers/6107efc9c61e.../json.log
maxretry = 10
findtime = 60    # ventana de 60 segundos
bantime  = 3600  # ban de 1 hora
```

Filtro en `/etc/fail2ban/filter.d/nginx-docker.conf`:
```ini
[Definition]
failregex = .*"log":"<HOST> -.*POST /api/v1/auth/login.* 429.*"
datepattern = "time":"%%Y-%%m-%%dT%%H:%%M:%%S
```

#### sshd
Monitorea intentos de conexión SSH fallidos.

```ini
[sshd]
enabled  = true
maxretry = 5      # 5 intentos fallidos
findtime = 60     # en 60 segundos
bantime  = 86400  # ban de 24 horas
```

### Whitelist — IPs que nunca se banean

```ini
[DEFAULT]
ignoreip = 127.0.0.1/8 ::1 200.23.36.4 172.16.0.0/12
```

| IP/Rango | Descripción |
|---|---|
| `127.0.0.1/8` | Loopback |
| `::1` | Loopback IPv6 |
| `200.23.36.4` | IP pública del equipo de desarrollo |
| `172.16.0.0/12` | Rango completo de redes Docker |

### Comandos de gestión

```bash
# Ver estado de todos los jails
sudo fail2ban-client status

# Ver IPs baneadas por jail
sudo fail2ban-client status nginx-docker
sudo fail2ban-client status sshd

# Desbanear una IP manualmente
sudo fail2ban-client set sshd unbanip IP
sudo fail2ban-client set nginx-docker unbanip IP

# Ver historial de bans
sudo grep "Ban\|Unban" /var/log/fail2ban.log | tail -30

# Reiniciar fail2ban
sudo systemctl restart fail2ban
```

---

## Capa 3 — Nginx (rate limiting)

### Configuración de zonas

Definidas en `infrastructure/nginx/nginx.conf`:

```nginx
limit_req_zone $binary_remote_addr zone=api:10m  rate=30r/s;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/s;
limit_conn_zone $binary_remote_addr zone=conn_limit:10m;
```

### Endpoint de login — protección especial

El endpoint de login tiene una regla más restrictiva que el resto de auth:

```nginx
# infrastructure/nginx/conf.d/intranet.conf
location = /api/v1/auth/login {
    limit_req zone=auth burst=2 nodelay;
    limit_req_status 429;
    proxy_pass http://auth_service;
    ...
}
```

Con `burst=2`, a partir del 3er intento consecutivo rápido Nginx devuelve `429 Too Many Requests` sin procesar la solicitud ni llegar al auth-service.

### Headers de seguridad

Todos los responses incluyen:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```

---

## Capa 4 — Servicios backend

### 4.1 auth-service — bloqueo de cuentas

El auth-service bloquea automáticamente una cuenta (`is_locked = true`) después de un número configurado de intentos fallidos consecutivos. Una vez bloqueada, la cuenta no puede autenticarse aunque la contraseña sea correcta.

El desbloqueo es automático después del tiempo configurado, o manual desde el panel de administración.

**Bloqueado no es lo mismo que baja:** un usuario bloqueado sigue siendo empleado (los módulos le siguen asignando trabajo); solo se excluyen los usuarios dados de baja (inactivos).

### 4.2 Primer acceso y contraseña temporal

Cuando un administrador da de alta a un usuario o le restablece la contraseña, el sistema genera una **contraseña temporal** (vigente 24 horas) y la envía por correo. El flujo de primer acceso está diseñado para que **solo quien conoce esa contraseña temporal** pueda definir la definitiva:

```
Correo de bienvenida / restablecimiento
    │  Contiene la contraseña temporal y un botón "Iniciar sesión" (lleva al login)
    ▼
Login con la contraseña temporal
    │  El auth-service la valida y entrega un token de cambio de contraseña:
    │  firmado, de corta vida (JWT_2FA_TEMP_EXPIRE_MINUTES) y ligado a ese usuario
    ▼
Cambio de contraseña (POST /api/v1/auth/change-temp-password)
    │  El servidor exige el token (propósito "change_password", del mismo usuario),
    │  que la cuenta tenga una contraseña temporal vigente y una contraseña fuerte
    ▼
Acceso según la red real de la persona (ver 4.3)
```

| Validación del cambio de contraseña | Si no se cumple |
|---|---|
| Token de cambio válido, vigente y del mismo usuario | 401 — "vuelve a iniciar sesión con tu contraseña temporal" |
| La cuenta tiene contraseña temporal | 403 — "tu contraseña ya fue cambiada" |
| La contraseña temporal no ha vencido | 403 — "la contraseña temporal ha expirado" |
| Contraseña fuerte (8+ caracteres, mayúscula, minúscula, número y especial) | 401 con el detalle de la regla |

Los correos **no** llevan un enlace directo al cambio de contraseña: el botón lleva al **login**, donde la persona escribe su contraseña temporal. Si alguien abre un enlace de cambio de contraseña sin token (por ejemplo, de un correo antiguo), la pantalla lo redirige al login.

### 4.3 Verificación en dos pasos (2FA)

El 2FA es **condicional por red** (ver la sección *Red corporativa y 2FA condicional*):

| Situación | Qué pide el sistema |
|---|---|
| Acceso desde una red de confianza | Solo la contraseña |
| Acceso desde fuera, con 2FA configurado | Contraseña + código de 6 dígitos del autenticador |
| Acceso desde fuera, sin 2FA configurado | Configurar el 2FA (escanear el QR) antes de entrar; si la cuenta no está en su primer acceso, el login indica que se pida al administrador restablecer la contraseña |

Reglas del 2FA:
- **Se configura una sola vez.** El secreto TOTP se guarda cifrado (Fernet) en `user_totp`; el código se valida con una ventana de ±1 intervalo para tolerar pequeños desfases de reloj.
- **Restablecer la contraseña no toca el 2FA.** Tras cambiar la contraseña temporal, quien ya tiene 2FA sigue usando el mismo autenticador: fuera de la red se le pide su código; en la red de confianza entra directo. Solo quien no tiene 2FA pasa a configurarlo.
- **Un 2FA activo no se regenera.** Si se vuelve a abrir la pantalla de configuración teniendo el 2FA activo, el servidor no genera un secreto nuevo (respuesta "El 2FA ya esta activado") y la pantalla envía al login.
- **Consistencia de estado.** `users.is_2fa_configured` y `user_totp.is_active` se actualizan juntos: mientras un secreto nuevo no se active con un código válido, la cuenta no se considera con 2FA configurado.
- **El QR lo genera el servidor.** La imagen se dibuja con el SVG que produce el auth-service (`qr_code_svg`); el secreto nunca se envía a servicios externos.
- **Códigos de respaldo:** se generan al configurar el 2FA y se guardan con hash (SHA-256).
- **Reconfigurar el 2FA** (por ejemplo, por cambio de teléfono) es una acción administrativa: el super admin puede desactivarlo (`POST /api/v1/2fa/deactivate`) y la persona lo configura de nuevo en su siguiente primer acceso.

### 4.4 Registro de sesiones

Cada sesión se registra con la **IP y el navegador reales** de la persona (`user_sessions`), incluido el acceso que se abre al terminar el cambio de contraseña temporal. Cada intento de acceso queda en `login_history`, con su resultado, si la red era de confianza y si se pidió 2FA.

En **Administración → Usuarios** (pestañas *Sesiones* e *Historial*, y el reporte PDF de auditoría) cada acceso muestra su red:

| Distintivo | Significado |
|---|---|
| 📶 Nombre de la red (por ejemplo, **Vanta Media**), en azul | Red de confianza con nombre |
| 📶 **Corporativa**, en azul | Red de confianza sin nombre registrado |
| 🚫 **Externa**, en gris | Cualquier otra red |

Los nombres de las redes se registran en `frontend/lib/redes.ts` (una línea por red, en formato CIDR). La lista de redes de confianza que define el 2FA sigue viviendo en `CORPORATE_IP_RANGES` del auth-service; al agregar una red allí, conviene darle nombre también en `redes.ts`.

### 4.5 Enlaces en los correos

- Los correos que llevan a un ticket usan la dirección `/app/it-service-desk/mesa-de-soporte?ticket=<id>` (y `&ver=conversacion` en los de comentarios). El panel del ticket se abre pidiendo el ticket por su id, con las mismas reglas de acceso del servidor: si la persona no tiene acceso, el panel lo indica.
- Si no hay sesión, el login recuerda la dirección de destino (parámetro `volver`) y, al entrar —con o sin 2FA—, regresa a ella. **Solo se aceptan destinos internos que empiecen con `/app`**, para que el login no pueda usarse para redirigir a sitios externos.
- Una vez usado, el enlace se retira de la barra de direcciones para que la navegación siga normal.

---

## Capa 5 — Sistema de notificaciones

### Eventos de seguridad que generan notificación

| Evento | Destinatario | Canal |
|---|---|---|
| Cuenta bloqueada por intentos fallidos | super_admin | Correo electrónico |
| Sesión revocada remotamente | Usuario afectado | WebSocket + correo |

### Información incluida en la notificación
- Cuenta afectada
- IP desde la que se realizaron los intentos
- Hora del evento

---

## Procedimiento ante un nuevo ataque

### Detección automática
fail2ban detecta y banea la IP automáticamente. El administrador puede revisar los logs después.

### Detección manual (correo de cuenta bloqueada)

1. **Identificar la IP atacante:**
```bash
docker logs avalanz-auth 2>&1 | grep "email_del_usuario" | tail -20
```

2. **Verificar si ya fue baneada por fail2ban:**
```bash
sudo fail2ban-client status nginx-docker
sudo fail2ban-client status sshd
```

3. **Bloquear manualmente en UFW si no fue baneada:**
```bash
sudo ufw deny from IP_ATACANTE to any
```

4. **Verificar que la cuenta no fue comprometida:**
```bash
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin \
  -t -c "SELECT email, is_locked, lock_reason FROM users WHERE email='EMAIL';"
```

5. **Documentar el incidente** en `security/incidents/` siguiendo el formato `INC-YYYY-NNN-descripcion.md`

---

## Incidentes registrados

| Folio | Fecha | Tipo | Estado |
|---|---|---|---|
| INC-2026-001 | 28 jun 2026 | Fuerza bruta — endpoint login | Contenido y mitigado ✅ |

---

## Pendientes de seguridad (tech-debt)

Los siguientes puntos están documentados en `docs/architecture/tech-debt.md` bajo la sección de seguridad:

- Implementar CAPTCHA en el formulario de login para producción
- Configurar fail2ban para enviar notificación por correo al admin cuando banee una IP
- Revisar si el log path de fail2ban es correcto si el contenedor de Nginx se recrea (el ID del contenedor cambia)
- Restringir SSH a IPs conocidas del equipo de desarrollo
- Actualizar el ignoreip de fail2ban cuando cambie la IP del equipo de desarrollo
- Botón "Restablecer 2FA" en Administración → Usuarios (desactivar el 2FA y emitir contraseña temporal en un solo paso)
- Limpieza automática de sesiones sin actividad prolongada
- Dar nombre a las redes 200.23.36.0/24 y 200.13.24.0/24 en `frontend/lib/redes.ts`

---

## Referencias

- Archivo de configuración UFW: reglas aplicadas directamente en el servidor vía `sudo ufw`
- Archivo de configuración fail2ban: `/etc/fail2ban/jail.local` y `/etc/fail2ban/filter.d/nginx-docker.conf`
- Configuración Nginx: `infrastructure/nginx/nginx.conf` y `infrastructure/nginx/conf.d/intranet.conf`
- Identidad y 2FA: `backend/auth-service/app/services/auth_service.py` y `twofa_service.py`
- Nombres de red: `frontend/lib/redes.ts`
- Incidentes: `security/incidents/`
- Tests de seguridad: `security/tests/`


---

## Red corporativa y 2FA condicional

El auth-service solicita 2FA solo cuando el login proviene de una IP fuera de los rangos definidos en `CORPORATE_IP_RANGES` (en `backend/auth-service/.env`). Si el login viene de un rango corporativo, no se pide 2FA.

Rangos corporativos autorizados:

| Rango | Descripcion |
|---|---|
| 192.168.0.0/16 | Redes privadas LAN |
| 10.0.0.0/8 | Red interna corporativa |
| 172.16.0.0/12 | Rango privado / Docker |
| 127.0.0.1/32 | Loopback local |
| 200.23.36.0/24 | Salida a internet de oficina (bloque previo) |
| 200.13.24.0/24 | Salida a internet de oficina (agregado 27 jul 2026) |
| 187.189.108.139/32 | Oficina de **Vanta Media** (agregado 22 oct 2026; solo esa IP) |

El 27 jul 2026 la IP publica de salida de la oficina cambio de 200.23.36.x a 200.13.24.54, por lo que se empezo a solicitar 2FA en la oficina. Se agrego el bloque 200.13.24.0/24 para corregirlo. Si vuelve a cambiar la IP de salida, agregar el nuevo rango aqui y en el .env del auth-service.

Antes de agregar una red, conviene confirmar que es una **IP fija de una oficina** del grupo (por ejemplo, revisando en `login_history` quiénes han entrado desde ella): todo acceso desde una red de confianza entra sin 2FA. Para una sola IP se usa el sufijo `/32`.

Como aplicar un cambio de rango:
1. Editar `CORPORATE_IP_RANGES` en `backend/auth-service/.env` en local Y en el servidor (el .env no viaja por git). Encima de la variable se documenta, en comentarios, el nombre de cada red pública.
2. Recrear el contenedor: `cd infrastructure/docker && docker compose up -d --force-recreate auth-service` (un `restart` NO recarga el .env). Si se cambia algo más del servicio, reconstruir con `docker compose build auth-service` y probarlo antes con `docker compose run --rm --no-deps --entrypoint python auth-service -c "from app.main import app"`.
3. Darle nombre a la red en `frontend/lib/redes.ts` y desplegar el frontend.

Verificación rápida de una IP:
```bash
docker compose run --rm --no-deps --entrypoint python auth-service -c "from app.config import config; from shared.utils.helpers import is_corporate_ip; print(is_corporate_ip('IP', config.CORPORATE_IP_RANGES))"
```

---

## IMPORTANTE: contrasenas de BD en los .env de servicios

La contrasena real de PostgreSQL es la definida en `infrastructure/docker/.env` (variable `POSTGRES_PASSWORD`). TODOS los .env de servicios que conectan a la BD (auth, admin, notify) deben tener ese mismo valor en `DB_PASSWORD`. NO debe quedar la contrasena de desarrollo (`Avalanz2026!`) en ningun .env de servicio.

Riesgo (ocurrido el 27 jul 2026): al recrear un contenedor con `--force-recreate`, Docker recarga el .env; si `DB_PASSWORD` tiene la contrasena vieja, el servicio se cae al arrancar con:
`asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "avalanz_user"`.
Mientras el contenedor no se recree, sigue corriendo con la config antigua en memoria, por lo que el problema queda latente hasta el siguiente recreate o el go-live.

Verificacion recomendada antes de cualquier despliegue o recreate:
`grep -rn "DB_PASSWORD" backend/*/.env` — todos deben coincidir con `POSTGRES_PASSWORD` de `infrastructure/docker/.env`. Por seguridad, la contrasena real no se escribe en esta documentacion.