# Tech Debt & UX Pendientes

Este archivo documenta mejoras pendientes que no son fallas críticas pero impactan la experiencia o el rendimiento. Se atienden cuando no hay features activas en desarrollo.

---

## Checklist de producción — variables y rutas a actualizar

Antes de desplegar al servidor on-premise revisar y actualizar los siguientes valores en cada servicio.

### auth-service — `backend/auth-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `CORPORATE_IP_RANGES` | `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]` | Agregar rangos reales de la red corporativa del servidor |
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
| `FRONTEND_URL` | `http://localhost:3000` | `http://{IP_SERVIDOR}` o dominio real |

### notify-service — `backend/notify-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### websocket-service — `backend/websocket-service/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `JWT_SECRET_KEY` | Clave actual | Misma clave que auth-service |

### frontend — `frontend/.env.local`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://172.20.92.197` | `http://{IP_SERVIDOR}` o dominio real |
| `NEXT_PUBLIC_WS_URL` | `ws://172.20.92.197/ws` | `ws://{IP_SERVIDOR}/ws` o dominio real |

### infrastructure — `infrastructure/docker/.env`
| Variable | Valor dev | Valor producción |
|---|---|---|
| `MINIO_ACCESS_KEY` | `minioadmin` | Cambiar por credencial segura |
| `MINIO_SECRET_KEY` | `Avalanz2026!` | Cambiar por credencial segura |
| `POSTGRES_PASSWORD` | `Avalanz2026!` | Cambiar por contraseña segura |

### DEBUG — todos los servicios
Cambiar `DEBUG=True` a `DEBUG=False` en los `.env` de todos los microservicios antes de desplegar. Con `DEBUG=True` el endpoint `/docs` (Swagger) está expuesto públicamente y filtra toda la estructura de la API.

### MinIO — `infrastructure/docker/docker-compose.yml`
El puerto `9001` (consola web) no debe estar expuesto en producción. Comentar o eliminar el mapeo `9001:9001`.

### PostgreSQL — `infrastructure/docker/docker-compose.yml`
El puerto `5432` se abrió para DBeaver en desarrollo. En producción debe estar cerrado o accesible solo desde la red interna. Eliminar el mapeo `5432:5432`.

---

## Seguridad — pendientes para producción

### HTTPS — crítico antes del despliegue
**Descripción:** El proyecto corre en HTTP plano. En producción todo el tráfico debe ir cifrado.
**Cambio requerido:**
- Obtener certificado SSL con Let's Encrypt (gratuito) o certificado corporativo
- Configurar Nginx para escuchar en 443 con SSL y hacer redirect automático de 80 → 443
- Actualizar `NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_WS_URL` en el frontend a `https://` y `wss://`
**Impacto:** Seguridad crítica — sin HTTPS los tokens JWT viajan en texto plano por la red.

### Headers de seguridad en Nginx
**Archivo:** `infrastructure/nginx/conf.d/intranet.conf`
**Descripción:** Faltan headers HTTP que protegen contra ataques comunes de browser.
**Cambio requerido:** Agregar en el bloque `server`:
```nginx
add_header X-Frame-Options "DENY";
add_header X-Content-Type-Options "nosniff";
add_header X-XSS-Protection "1; mode=block";
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header Referrer-Policy "strict-origin-when-cross-origin";
```
**Impacto:** Seguridad — protege contra clickjacking, MIME sniffing y XSS desde el browser.

### Notificación de login desde IP nueva
**Descripción:** El sistema ya registra la IP de cada login. Falta enviar correo de alerta cuando un usuario accede desde una IP que nunca ha usado antes.
**Cambio requerido:** En auth-service, comparar la IP del login actual contra el historial. Si es nueva, enviar correo via email-service con fecha, hora e IP.
**Impacto:** Seguridad — alerta temprana ante accesos no autorizados.

---

## Infraestructura — pendientes para producción

### rsync al servidor secundario de backups
**Descripción:** El acta del proyecto define dos servidores: principal y secundario dedicado a backups. El cron actual ejecuta `pg_dump` localmente pero no transfiere nada al servidor secundario. Sin esta sincronización, un fallo de disco en el servidor principal implica pérdida total de datos y archivos MinIO.
**Cambio requerido:**
- Configurar acceso SSH sin contraseña entre servidor principal y servidor secundario
- Agregar job al cron que ejecute `rsync` diario de los backups de PostgreSQL al servidor secundario
- Agregar job al cron que ejecute `rsync` o `mc mirror` de MinIO (bucket `dirdoc`) al servidor secundario
- Definir retención en el servidor secundario (mínimo 30 días)
**Impacto:** Crítico — sin esto el servidor secundario definido en el acta no cumple ninguna función.

### Scripts de verificación de integridad de backups
**Descripción:** Un backup que nunca se ha probado no garantiza recuperación. El acta contempla scripts de restore automáticos para verificar integridad.
**Cambio requerido:**
- Script semanal que restaure el backup más reciente de PostgreSQL en una BD temporal y verifique que las tablas principales existen y tienen registros
- Script que verifique el checksum de los archivos de backup contra el registro generado al momento del dump
- Notificación por correo si la verificación falla
**Archivo:** `infrastructure/cron/`
**Impacto:** Operación — sin verificación no hay certeza de que los backups sean utilizables ante un desastre.

### Centralización de logs con Rsyslog + logrotate
**Descripción:** Actualmente los logs de cada microservicio viven dentro de su contenedor Docker. En producción esto hace imposible diagnosticar problemas sin entrar a cada contenedor por separado, y los logs se pierden si el contenedor se recrea.
**Cambio requerido:**
- Configurar Rsyslog en el servidor para recolectar logs de todos los contenedores
- Montar un volumen compartido o usar el driver de logging de Docker apuntando a Rsyslog
- Configurar logrotate para comprimir y rotar logs con retención de 90 días
- Los logs deben incluir: nombre del servicio, timestamp, nivel, mensaje y request ID
**Impacto:** Operación — sin logs centralizados el diagnóstico en producción es ciego.

### Exporters de infraestructura no configurados
**Archivo:** `infrastructure/docker/docker-compose.yml`
**Descripción:** PostgreSQL, Redis y Nginx aparecen como down en Prometheus porque no tienen exporters instalados. Solo se monitorean los 6 servicios FastAPI y RabbitMQ.
**Cambio requerido:** Agregar al docker-compose: `postgres-exporter`, `redis-exporter`, `nginx-prometheus-exporter`.
**Impacto:** Monitoreo incompleto — no se pueden ver conexiones activas a BD, uso de caché Redis ni tráfico de Nginx.

### Persistencia de dashboards de Grafana
**Archivo:** `infrastructure/grafana/`
**Descripción:** Los dashboards de Grafana se guardan en el volumen Docker. Un `docker compose down -v` los borra y hay que reimportarlos manualmente.
**Cambio requerido:** Configurar provisionamiento automático apuntando a `infrastructure/grafana/` para que el dashboard se cargue al levantar el contenedor sin importación manual.
**Impacto:** Operación — en un reset del ambiente se pierde la configuración de dashboards y alertas.

---

## Trazabilidad — pendientes

### Auditoría de acciones administrativas
**Descripción:** Se registra quién sube y baja archivos de empleados pero no hay log de acciones críticas del panel como crear usuario, cambiar rol, eliminar empresa, bloquear cuenta, etc.
**Cambio requerido:** Crear tabla `admin_audit_log` en el admin-service con: acción, entidad afectada, `performed_by`, `performed_at`, `ip_address`, detalle JSON.
**Impacto:** Trazabilidad — sin esto no se puede auditar quién hizo qué en el panel de administración.

---

## Frontend

### Hover en módulos del sidebar
**Archivo:** `frontend/components/layout/Sidebar.tsx`
**Descripción:** El hover en los módulos del sidebar no funciona visualmente aunque el código es idéntico al commit donde sí funcionaba. El `hover:bg-slate-100` está en el `div` exterior pero no se renderiza. Requiere investigación más profunda.
**Impacto:** UX — sin feedback visual al pasar el mouse por los módulos.

### Performance del frontend en desarrollo — Next.js Turbopack lento en WSL2
**Archivo:** `frontend/next.config.ts`
**Descripción:** Next.js con Turbopack detecta el filesystem de WSL2 como lento (benchmark >200ms).
**Cambio requerido:** Investigar opciones para mejorar el arranque y hot reload en WSL2.
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

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.
- El checklist de producción y la sección de seguridad deben revisarse completos antes de cualquier despliegue al servidor on-premise.
