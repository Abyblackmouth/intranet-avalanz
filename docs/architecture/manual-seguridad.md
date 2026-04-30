# Manual de Seguridad — Intranet Avalanz

**Versión:** 1.0
**Fecha:** 30 de abril de 2026
**Clasificación:** Uso interno — Equipo de TI

---

## 1. Introducción

Este documento describe las medidas de seguridad implementadas en la Intranet Avalanz, los vectores de ataque conocidos, el estado de protección actual y las acciones pendientes antes del despliegue público. Está orientado al equipo de TI y al desarrollador principal para mantener y mejorar la postura de seguridad del sistema.

---

## 2. Capas de Seguridad Implementadas

### 2.1 Autenticación

**Doble factor (2FA) condicional por red**
El sistema detecta si el usuario entra desde la red corporativa o desde internet. Desde internet exige 2FA via TOTP (Microsoft Authenticator u equivalente). Desde la red interna no lo solicita para no entorpecer el trabajo cotidiano.

Los rangos de red corporativa están configurados en `CORPORATE_IP_RANGES` del auth-service:
```
["192.168.0.0/16", "10.0.0.0/8", "172.16.0.0/12", "127.0.0.1/32", "200.23.36.0/24"]
```

**Bloqueo automático por intentos fallidos**
Después de 3 intentos fallidos consecutivos la cuenta se bloquea automáticamente con `lock_type = "failed_attempts"`. Se notifica al usuario por correo. El usuario puede recuperar acceso via el flujo de recuperación de contraseña.

**Bloqueo manual por administrador**
Un super admin puede bloquear una cuenta manualmente con `lock_type = "manual"`. Las cuentas bloqueadas manualmente no pueden recuperar contraseña por el flujo automático — requieren intervención del administrador.

**Contraseñas temporales**
Los usuarios nuevos reciben una contraseña temporal con expiración de 24 horas. En el primer login se fuerza el cambio de contraseña antes de acceder al sistema.

**Política de contraseñas**
Mínimo 8 caracteres, una mayúscula, una minúscula, un número y un carácter especial. Validada tanto en frontend como en backend.

---

### 2.2 Tokens JWT

**Access token**
Expiración por inactividad: 30 minutos. Expiración absoluta: 8 horas. Si el usuario está activo, el token se renueva automáticamente via refresh token sin interrumpir la sesión.

**Refresh token**
Almacenado en base de datos con hash SHA256. Se invalida al hacer logout, al revocar la sesión o al expirar. Un usuario puede tener máximo 3 sesiones activas simultáneas — la más antigua se revoca automáticamente al abrir la cuarta.

**Payload del JWT**
Incluye `user_id`, `email`, `full_name`, `is_super_admin`, `roles`, `modules`, `companies`, `permissions` y `cross_company`. No incluye datos sensibles como contraseñas o tokens de sesión.

**Detección de expiración en el frontend**
El WebSocket verifica la expiración del token antes de cada intento de reconexión. El AuthProvider verifica la expiración cada vez que detecta inactividad de 30 minutos. Si el token está expirado se hace logout automático y redirect al login.

---

### 2.3 Control de Acceso

**Roles globales**
- `super_admin` — acceso total a toda la plataforma
- `admin_empresa` — gestión dentro de su empresa únicamente

**Segmentación por empresa**
Cada usuario solo puede ver datos de su empresa. Los usuarios con `cross_company: true` (super admin o roles con scope corporativo) pueden ver datos de todas las empresas.

**Usuario protegido**
El usuario `admin@avalanz.com` está definido como `PROTECTED_SUPER_ADMIN_EMAIL` en el código. No puede ser modificado, bloqueado ni eliminado por ningún flujo del panel de administración.

**Módulos dinámicos**
El acceso a módulos operativos se define por asignación en la base de datos. Los módulos y permisos se incluyen en el JWT al hacer login. Un super admin recibe automáticamente todos los módulos activos.

---

### 2.4 Rate Limiting — Nginx

Configurado en `infrastructure/nginx/nginx.conf`:

| Zona | Límite | Aplicado en |
|---|---|---|
| `auth` | 5 req/seg por IP | Login, 2FA, recuperación de contraseña |
| `api` | 30 req/seg por IP | Todos los endpoints de API |
| `conn_limit` | 20 conexiones simultáneas por IP | Login, 2FA |

**Burst configurado:**
- Endpoints de auth: burst=10 nodelay
- Endpoints de API: burst=20 nodelay

Cuando se supera el límite Nginx devuelve `429 Too Many Requests` sin procesar la petición.

---

### 2.5 Protección contra Inyección SQL

Todos los accesos a base de datos usan SQLAlchemy 2.0 con queries parametrizados. No hay concatenación de strings para construir queries. Los modelos ORM validan los tipos de datos antes de ejecutar cualquier operación.

---

### 2.6 Validación de Inputs

**Backend:** Pydantic valida todos los cuerpos de petición. Los tipos, longitudes y formatos se verifican antes de procesar cualquier dato. Los errores de validación devuelven 422 con detalle del campo fallido.

**Frontend:** React Hook Form + Zod validan los formularios antes de enviar al backend. Los archivos subidos se validan por tipo MIME y tamaño máximo (50MB).

---

### 2.7 Cabeceras de Seguridad HTTP

Configuradas en Nginx para todas las respuestas:

| Cabecera | Valor | Propósito |
|---|---|---|
| X-Frame-Options | SAMEORIGIN | Previene clickjacking |
| X-Content-Type-Options | nosniff | Previene MIME sniffing |
| X-XSS-Protection | 1; mode=block | Protección XSS en browsers legacy |
| Referrer-Policy | strict-origin-when-cross-origin | Controla información de referrer |

---

### 2.8 CORS

El CORS está configurado en cada microservicio. Solo se permiten peticiones desde los orígenes definidos en `CORS_ORIGINS` del `.env` de cada servicio. En producción deben estar listados únicamente los dominios autorizados — nunca `*`.

---

### 2.9 Almacenamiento de Contraseñas

Las contraseñas se hashean con `bcrypt` (versión 4.0.1) con factor de costo por defecto. No se almacena la contraseña en texto plano en ningún punto del sistema. Los tokens de recuperación de contraseña se almacenan como hash SHA256 y se invalidan inmediatamente después de usarse.

---

### 2.10 Cifrado de Secrets TOTP

Los secrets TOTP de cada usuario se cifran con Fernet (criptografía simétrica AES-128-CBC con HMAC-SHA256) antes de guardarse en la base de datos. La clave de cifrado vive en `FERNET_KEY` del `.env` del auth-service.

---

### 2.11 Trazabilidad y Auditoría

Cada petición al sistema se registra con timestamp, método HTTP, ruta, código de respuesta, duración, IP del cliente y user agent. Las acciones administrativas críticas (bloqueos, resets de contraseña, revocación de sesiones) se registran en el historial de login con el usuario que las ejecutó.

Los archivos de empleados tienen su propia tabla de auditoría que registra cada acción: subida, descarga, eliminación — con usuario, IP, timestamp y rol en el momento del evento.

---

### 2.12 Sesiones WebSocket

Las conexiones WebSocket se autentican con el access token en el query parameter `?token=`. Si el token es inválido el servidor cierra la conexión con código 4001. Si el token expira el frontend detecta la expiración antes de reconectar y hace logout automático en lugar de reintentar indefinidamente.

---

### 2.13 Backups

Backup automático diario de las 3 bases de datos (avalanz_auth, avalanz_admin, avalanz_notify) a la 1:00 AM. Retención de 30 días. Al terminar el backup se envía un reporte por correo a `abraham_covarrubias@avalanz.com` y `soporte@avalanz.com` con el resultado detallado.

Verificación automática de integridad los domingos a las 4:00 AM.

---

## 3. Vectores de Ataque y Estado de Protección

| Vector | Descripción | Estado | Notas |
|---|---|---|---|
| Fuerza bruta en login | Intentos masivos de usuario/contraseña | Protegido | Bloqueo a 3 intentos + rate limit 5r/s |
| Enumeración de usuarios | Detectar si un email existe en el sistema | Protegido | Login siempre devuelve "Credenciales incorrectas" |
| Token JWT interceptado | Robo del token en tránsito | Pendiente | Se cierra con SSL/HTTPS |
| Inyección SQL | Manipulación de queries via inputs | Protegido | SQLAlchemy con queries parametrizados |
| XSS (Cross-Site Scripting) | Inyección de scripts maliciosos | Protegido | Cabeceras HTTP + validación de inputs |
| Clickjacking | Embeber la app en un iframe malicioso | Protegido | X-Frame-Options: SAMEORIGIN |
| CSRF | Peticiones falsificadas desde otro sitio | Parcial | CORS configurado — reforzar con tokens CSRF en producción |
| Exposición de puertos internos | Acceso directo a BD o MinIO desde internet | Pendiente | Cerrar puertos 5432 y 9001 al exterior |
| DDoS básico | Saturar el servidor con peticiones | Parcial | Rate limiting en Nginx — ver sección 4 |
| Credenciales débiles | Contraseñas fáciles de adivinar | Protegido | Política de contraseñas + 2FA |
| Sesiones indefinidas | Token que nunca expira | Protegido | 30 min inactividad + 8h absoluto + logout por inactividad |
| Acceso no autorizado entre empresas | Ver datos de otra empresa del grupo | Protegido | Segmentación por company_id en todos los queries |
| Archivos maliciosos | Subir ejecutables disfrazados | Parcial | Validación por MIME type — considerar antivirus en producción |

---

## 4. DDoS — Estado Actual y Mejoras

### 4.1 Protección actual

El rate limiting de Nginx protege contra ataques de baja intensidad:
- 5 req/seg en endpoints de autenticación
- 30 req/seg en endpoints de API
- 20 conexiones simultáneas por IP en login

Esto es suficiente para bloquear scripts automatizados básicos y atacantes amateurs con una sola IP.

### 4.2 Limitaciones actuales

El rate limiting de Nginx opera por IP individual. Un atacante con múltiples IPs (botnet) o que use proxies puede distribuir el tráfico y evadir los límites. Tampoco protege contra ataques volumétricos a nivel de red (capa 3/4) que saturen el ancho de banda antes de llegar a Nginx.

### 4.3 Mejoras recomendadas

**Corto plazo (antes del go-live):**

Agregar bloqueo automático de IPs con muchos errores 429 usando `ngx_http_limit_req_module` ya disponible. Configurar en `nginx.conf`:

```nginx
# Bloquear IPs que generan demasiados 429
limit_req_status 429;
```

Y agregar `fail2ban` en el servidor para banear IPs que acumulen muchos 429 en los logs de Nginx:

```bash
sudo apt install fail2ban
```

Configuración básica para Nginx en `/etc/fail2ban/jail.local`:

```ini
[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/access.log
maxretry = 10
findtime = 60
bantime  = 3600
```

**Mediano plazo:**

Poner Cloudflare como proxy — gratuito en el plan básico y absorbe ataques volumétricos antes de que lleguen al servidor. Solo requiere cambiar los DNS para que apunten a Cloudflare en lugar de la IP pública directamente. También ofrece WAF (Web Application Firewall) que filtra patrones de ataque conocidos.

**Largo plazo:**

Si el sistema crece a miles de usuarios diarios, considerar un balanceador de carga y múltiples instancias del frontend. Actualmente toda la carga cae en un solo servidor.

---

## 5. Acciones Pendientes Antes del Go-Live

| # | Acción | Prioridad | Impacto |
|---|---|---|---|
| 1 | Configurar HTTPS con certificado SSL | Crítica | Sin HTTPS los tokens viajan en texto plano |
| 2 | Cerrar puerto 5432 (PostgreSQL) al exterior | Crítica | La BD no debe ser accesible desde internet |
| 3 | Cerrar puerto 9001 (MinIO) al exterior | Crítica | El almacenamiento no debe ser accesible desde internet |
| 4 | Cambiar `DEBUG=False` en todos los servicios | Alta | En DEBUG=True se expone /docs con todos los endpoints |
| 5 | Generar nuevas JWT_SECRET_KEY para producción | Alta | La clave de desarrollo no debe usarse en producción |
| 6 | Cambiar todas las contraseñas de infraestructura | Alta | PostgreSQL, Redis, RabbitMQ, MinIO |
| 7 | Instalar fail2ban en el servidor | Media | Complementa el rate limiting de Nginx |
| 8 | Evaluar Cloudflare como proxy | Media | Protección DDoS volumétrica |
| 9 | Configurar SPF + DKIM en Office 365 | Media | Los correos del sistema van a no deseados |
| 10 | Merge a rama main con aprobación | Alta | El código de producción debe estar en main |

---

## 6. Configuración de Seguridad por Servicio

### Auth Service
| Variable | Valor recomendado producción |
|---|---|
| JWT_SECRET_KEY | Generar con `openssl rand -hex 64` |
| FERNET_KEY | Generar con `python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| JWT_INACTIVITY_EXPIRE_MINUTES | 30 |
| JWT_ABSOLUTE_EXPIRE_HOURS | 8 |
| MAX_FAILED_ATTEMPTS | 3 |
| MAX_ACTIVE_SESSIONS | 3 |
| DEBUG | False |

### Nginx
| Configuración | Valor actual | Recomendación producción |
|---|---|---|
| Rate limit auth | 5r/s | Mantener |
| Rate limit api | 30r/s | Evaluar bajar a 20r/s con más usuarios |
| Burst auth | 10 | Mantener |
| Burst api | 20 | Mantener |
| HTTPS redirect | No configurado | Redirigir todo HTTP a HTTPS |

---

## 7. Respuesta a Incidentes

### Cuenta comprometida
1. Bloquear la cuenta desde el panel de administración (lock_type: manual).
2. Revocar todas las sesiones activas desde el menú de 3 puntos en la tabla de usuarios.
3. Hacer reset de contraseña — el usuario recibirá una contraseña temporal.
4. Revisar el historial de login del usuario para identificar IPs y acciones sospechosas.

### Ataque de fuerza bruta detectado
1. Revisar logs de Nginx para identificar la IP atacante.
2. Bloquear la IP manualmente en el servidor o en el Fortinet.
3. Si se instaló fail2ban, verificar que la IP fue baneada automáticamente.
4. Revisar si alguna cuenta fue comprometida en el historial de login.

### Backup fallido
1. El sistema envía correo automático con el detalle del error.
2. Revisar logs del cron: `docker exec avalanz-cron cat /var/log/cron/backup.log`
3. Ejecutar backup manual: `docker exec avalanz-cron sh /scripts/backup_postgres.sh`
4. Verificar conectividad con PostgreSQL desde el contenedor de cron.

### Token comprometido
Sin HTTPS un token puede ser interceptado en tránsito. Una vez instalado SSL este vector se cierra. Si se sospecha que un token fue comprometido, revocar todas las sesiones del usuario desde el panel de administración.
