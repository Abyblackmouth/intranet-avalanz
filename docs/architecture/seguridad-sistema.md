# Seguridad del Sistema — Intranet Avalanz
## Documentación de infraestructura de seguridad

**Versión:** 1.0  
**Fecha:** 29 de junio de 2026  
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
④ Servicios backend (validación y bloqueo de cuentas)
    │  Bloquea cuentas tras intentos fallidos repetidos
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

### auth-service — bloqueo de cuentas

El auth-service bloquea automáticamente una cuenta (`is_locked = true`) después de un número configurado de intentos fallidos consecutivos. Una vez bloqueada, la cuenta no puede autenticarse aunque la contraseña sea correcta.

El desbloqueo es automático después del tiempo configurado, o manual desde el panel de administración.

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

---

## Referencias

- Archivo de configuración UFW: reglas aplicadas directamente en el servidor vía `sudo ufw`
- Archivo de configuración fail2ban: `/etc/fail2ban/jail.local` y `/etc/fail2ban/filter.d/nginx-docker.conf`
- Configuración Nginx: `infrastructure/nginx/nginx.conf` y `infrastructure/nginx/conf.d/intranet.conf`
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

El 27 jul 2026 la IP publica de salida de la oficina cambio de 200.23.36.x a 200.13.24.54, por lo que se empezo a solicitar 2FA en la oficina. Se agrego el bloque 200.13.24.0/24 para corregirlo. Si vuelve a cambiar la IP de salida, agregar el nuevo rango aqui y en el .env del auth-service.

Como aplicar un cambio de rango:
1. Editar `CORPORATE_IP_RANGES` en `backend/auth-service/.env` en local Y en el servidor (el .env no viaja por git).
2. Recrear el contenedor: `cd infrastructure/docker && docker compose up -d --force-recreate auth-service` (un `restart` NO recarga el .env).

---

## IMPORTANTE: contrasenas de BD en los .env de servicios

La contrasena real de PostgreSQL es la definida en `infrastructure/docker/.env` (variable `POSTGRES_PASSWORD`). TODOS los .env de servicios que conectan a la BD (auth, admin, notify) deben tener ese mismo valor en `DB_PASSWORD`. NO debe quedar la contrasena de desarrollo (`Avalanz2026!`) en ningun .env de servicio.

Riesgo (ocurrido el 27 jul 2026): al recrear un contenedor con `--force-recreate`, Docker recarga el .env; si `DB_PASSWORD` tiene la contrasena vieja, el servicio se cae al arrancar con:
`asyncpg.exceptions.InvalidPasswordError: password authentication failed for user "avalanz_user"`.
Mientras el contenedor no se recree, sigue corriendo con la config antigua en memoria, por lo que el problema queda latente hasta el siguiente recreate o el go-live.

Verificacion recomendada antes de cualquier despliegue o recreate:
`grep -rn "DB_PASSWORD" backend/*/.env` — todos deben coincidir con `POSTGRES_PASSWORD` de `infrastructure/docker/.env`. Por seguridad, la contrasena real no se escribe en esta documentacion.
