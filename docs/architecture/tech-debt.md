# Tech Debt & UX Pendientes

Este archivo documenta mejoras pendientes que no son fallas críticas pero impactan la experiencia o el rendimiento. Se atienden cuando no hay features activas en desarrollo.

---

## Checklist de producción — variables y rutas a actualizar

Antes de desplegar al servidor on-premise revisar y actualizar los siguientes valores en cada servicio.

### auth-service — `backend/auth-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `CORPORATE_IP_RANGES` | `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32","200.23.36.0/24"]` | Verificar rangos reales — el rango 200.23.36.0/24 es la IP del Fortinet, sin él el login pide 2FA desde la oficina |
| `JWT_SECRET_KEY` | Clave actual | Generar nueva con `openssl rand -hex 32` |
| `FERNET_KEY` | Clave actual | Generar nueva con `Fernet.generate_key()` |

### admin-service — `backend/admin-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### upload-service — `backend/upload-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `STORAGE_ENDPOINT` | `http://avalanz-minio:9000` | `http://avalanz-minio:9000` (igual, es interno) |
| `STORAGE_ACCESS_KEY` | `minioadmin` | Cambiar por credencial segura |
| `STORAGE_SECRET_KEY` | `Avalanz2026!` | Cambiar por credencial segura |
| `SIGNED_URL_HOST` | `http://localhost:9000` | `http://{IP_SERVIDOR}:9000` o dominio real |
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### email-service — `backend/email-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `SMTP_HOST` | `mailpit` | Host SMTP corporativo real |
| `SMTP_PORT` | `1025` | Puerto SMTP real (587 TLS / 465 SSL) |
| `SMTP_USER` | — | Correo corporativo real |
| `SMTP_PASSWORD` | — | Contraseña del correo corporativo |
| `SMTP_USE_TLS` | `False` | `True` si el servidor SMTP lo requiere |
| `FRONTEND_URL` | `http://localhost:3000` | `https://intranet.avalanz.com` |

### notify-service — `backend/notify-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### websocket-service — `backend/websocket-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### frontend — `frontend/.env.local`
| Variable | Valor actual (servidor provisional) | Valor producción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://intranet.avalanz.com` | `https://intranet.avalanz.com` |
| `NEXT_PUBLIC_WS_URL` | `ws://intranet.avalanz.com/ws` | `wss://intranet.avalanz.com/ws` |
| `NEXT_PUBLIC_SCAFFOLD_URL` | `http://intranet.avalanz.com:3002` | `https://intranet.avalanz.com:3002` |

### infrastructure — `infrastructure/docker/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `MINIO_ACCESS_KEY` | `minioadmin` | Cambiar por credencial segura |
| `MINIO_SECRET_KEY` | `Avalanz2026!` | Cambiar por contraseña segura |
| `POSTGRES_PASSWORD` | `Avalanz2026!` | Cambiar por contraseña segura |

### DEBUG — todos los servicios
Cambiar `DEBUG=True` a `DEBUG=False` en los `.env` de todos los microservicios antes de desplegar. Con `DEBUG=True` el endpoint `/docs` (Swagger) está expuesto públicamente y filtra toda la estructura de la API.

### MinIO — `infrastructure/docker/docker-compose.yml`
El puerto `9001` (consola web) no debe estar expuesto en producción. Comentar o eliminar el mapeo `9001:9001`.

### PostgreSQL — `infrastructure/docker/docker-compose.yml`
El puerto `5432` se abrió para DBeaver en desarrollo. En producción debe estar cerrado o accesible solo desde la red interna. Eliminar el mapeo `5432:5432`.

---

## Seguridad — pendientes para producción

### HTTPS — crítico, certificado ya comprado
**Estado:** Certificado comprado — pendiente de instalación por infra desde el Fortinet.
**Cambio requerido:**
- Configurar Nginx para escuchar en 443 con SSL y hacer redirect automático de 80 a 443
- Actualizar `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL` en el frontend a `https://` y `wss://`
- Rebuild del frontend después del cambio de variables
**Impacto:** Seguridad crítica — sin HTTPS los tokens JWT viajan en texto plano por la red.

### fail2ban — instalación en el servidor
**Estado:** Pendiente, se instala junto con el SSL.
**Cambio requerido:**
- Instalar fail2ban en el servidor: `sudo apt install fail2ban`
- Configurar jail para Nginx en `/etc/fail2ban/jail.local`:
```ini
[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/access.log
maxretry = 10
findtime = 60
bantime  = 3600
```
**Impacto:** Seguridad — complementa el rate limiting de Nginx baneando IPs que generan demasiados 429.

### UptimeRobot — monitoreo externo
**Estado:** Pendiente, se configura cuando esté el SSL.
**Cambio requerido:**
- Crear cuenta gratuita en `https://uptimerobot.com`
- Configurar monitor HTTPS para `https://intranet.avalanz.com` con check cada 5 minutos
- Agregar monitores para health checks: `/health/auth`, `/health/admin`
- Destinatarios de alerta: `abraham_covarrubias@avalanz.com` + número de celular para SMS
**Impacto:** Operación — si el servidor se cae no hay nadie que avise. Prometheus no ayuda si el servidor completo está down.

### SPF + DKIM en Office 365
**Estado:** Pendiente con el admin del tenant de Office 365.
**Cambio requerido:**
- Verificar que el registro SPF de `avalanz.com` incluya `spf.protection.outlook.com`
- Activar DKIM en Exchange Admin Center para el dominio `avalanz.com`
**Impacto:** Correos del sistema van a no deseados en destinatarios externos.

### Rotación de logs Docker
**Descripción:** Los logs de Docker crecen indefinidamente sin límite. Si el disco se llena el servidor se cae.
**Cambio requerido:** Agregar en `docker-compose.yml` para todos los contenedores:
```yaml
logging:
  driver: "json-file"
  options:
    max-size: "50m"
    max-file: "5"
```
**Impacto:** Estabilidad — disco lleno por logs = servidor caído.

### Notificación de login desde IP nueva
**Descripción:** El sistema ya registra la IP de cada login. Falta enviar correo de alerta cuando un usuario accede desde una IP que nunca ha usado antes.
**Cambio requerido:** En auth-service, comparar la IP del login actual contra el historial. Si es nueva, enviar correo via email-service con fecha, hora e IP.
**Impacto:** Seguridad — alerta temprana ante accesos no autorizados.

---

## Infraestructura — pendientes para producción

### rsync al servidor secundario de backups
**Descripción:** El acta del proyecto define dos servidores: principal y secundario dedicado a backups. El cron actual ejecuta `pg_dump` localmente pero no transfiere nada al servidor secundario.
**Cambio requerido:**
- Configurar acceso SSH sin contraseña entre servidor principal y servidor secundario
- Agregar job al cron que ejecute `rsync` diario de los backups de PostgreSQL al servidor secundario
- Agregar job al cron que ejecute `rsync` o `mc mirror` de MinIO (bucket `dirdoc`) al servidor secundario
- Definir retención en el servidor secundario (mínimo 30 días)
**Impacto:** Crítico — sin esto el servidor secundario definido en el acta no cumple ninguna función.

### Scripts de verificación de integridad de backups
**Descripción:** Un backup que nunca se ha probado no garantiza recuperación.
**Cambio requerido:**
- Script semanal que restaure el backup más reciente de PostgreSQL en una BD temporal y verifique que las tablas principales existen y tienen registros
- Script que verifique el checksum de los archivos de backup contra el registro generado al momento del dump
- Notificación por correo si la verificación falla
**Archivo:** `infrastructure/cron/`
**Impacto:** Operación — sin verificación no hay certeza de que los backups sean utilizables ante un desastre.

### Centralización de logs con Rsyslog + logrotate
**Descripción:** Actualmente los logs de cada microservicio viven dentro de su contenedor Docker. En producción esto hace imposible diagnosticar problemas sin entrar a cada contenedor por separado.
**Cambio requerido:**
- Configurar Rsyslog en el servidor para recolectar logs de todos los contenedores
- Configurar logrotate para comprimir y rotar logs con retención de 90 días
**Impacto:** Operación — sin logs centralizados el diagnóstico en producción es ciego.

### Cloudflare como proxy (largo plazo)
**Descripción:** El rate limiting de Nginx protege contra atacantes con una sola IP pero no contra botnets o ataques volumétricos a nivel de red.
**Cambio requerido:** Cambiar los DNS para que apunten a Cloudflare en lugar de la IP pública directamente. Plan gratuito absorbe ataques volumétricos y ofrece WAF básico.
**Impacto:** Seguridad DDoS — protección ante ataques distribuidos.

---

## Trazabilidad — pendientes

### Auditoría de acciones administrativas
**Descripción:** Se registra quién sube y baja archivos de empleados pero no hay log de acciones críticas del panel como crear usuario, cambiar rol, eliminar empresa, bloquear cuenta, etc.
**Cambio requerido:** Crear tabla `admin_audit_log` en el admin-service con: acción, entidad afectada, `performed_by`, `performed_at`, `ip_address`, detalle JSON.
**Impacto:** Trazabilidad — sin esto no se puede auditar quién hizo qué en el panel de administración.

### Política de retención de logs de auditoría
**Descripción:** Definir cuánto tiempo se guardan los logs de login, historial de accesos y auditoría de archivos. Actualmente el cron limpia historial de login a 90 días y sesiones revocadas a 30 días.
**Pendiente:** Confirmar con el área legal si esos tiempos cumplen con los requisitos de cumplimiento del grupo.

---

## Frontend

### Hover en módulos del sidebar
**Archivo:** `frontend/components/layout/Sidebar.tsx`
**Descripción:** El hover en los módulos del sidebar no funciona visualmente aunque el código es idéntico al commit donde sí funcionaba. El `hover:bg-slate-100` está en el `div` exterior pero no se renderiza. Posible bug de Tailwind v4.
**Impacto:** UX — sin feedback visual al pasar el mouse por los módulos.

### Performance del frontend en desarrollo — Next.js Turbopack lento en WSL2
**Archivo:** `frontend/next.config.ts`
**Descripción:** Next.js con Turbopack detecta el filesystem de WSL2 como lento (benchmark >200ms).
**Impacto:** DX — el desarrollo es más lento de lo esperado en WSL2.

### TypeScript — role_id no existe en tipo GlobalRole y ModuleRole en UserForm
**Archivo:** `frontend/components/admin/users/UserForm.tsx`
**Cambio requerido:** Actualizar los tipos en `role.types.ts` para asegurar consistencia en el nombre del campo ID.
**Impacto:** TypeScript — no bloquea el build de producción pero genera errores en `tsc --noEmit`.

### TypeScript — pages de rutas dinámicas [id] no son módulos válidos
**Archivos:** `frontend/app/(private)/admin/companies/[id]/page.tsx`, `groups/[id]/page.tsx`, `modules/[id]/page.tsx`, `users/[id]/page.tsx`
**Cambio requerido:** Verificar que cada página dinámica tenga `export default function Page({ params }: { params: { id: string } })`.
**Impacto:** TypeScript — no bloquea el build pero genera ruido en el output de `tsc --noEmit`.

---

## Scaffold automático

### Auto-commit del scaffold falla silenciosamente
**Descripción:** El scaffold-server genera los archivos correctamente pero el auto-commit via gitCommit() puede fallar sin reportar error visible. Los archivos se crean pero no se pushean al repo automáticamente.
**Cambio requerido:** Agregar logging detallado al flujo gitCommit() en `scripts/scaffold-server.js` y enviar notificación si el commit falla.
**Impacto:** Operación — al crear un módulo desde el panel los archivos están en el servidor pero no en el repo.

---

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.
- El checklist de producción y la sección de seguridad deben revisarse completos antes de cualquier despliegue público.