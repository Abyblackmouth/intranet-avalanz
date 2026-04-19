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
| `NEXT_PUBLIC_API_URL` | `http://localhost` | `http://{IP_SERVIDOR}` o dominio real |
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

### Alertas de Grafana no configuradas
**Archivos:** `infrastructure/prometheus/alerts.yml`, `infrastructure/grafana/`
**Descripcion:** Grafana solo visualiza metricas actualmente — no envia alertas. El archivo alerts.yml esta vacio y Alertmanager no tiene canales configurados.
**Cambio requerido:**
- Configurar canal de notificacion en Grafana (Email via SMTP corporativo recomendado)
- Definir reglas de alerta en alerts.yml: servicio caido >1min, latencia >1s sostenida, errores 5xx >1% del trafico, RAM >512MB
- Conectar Alertmanager con el canal configurado
**Impacto:** Operacion — sin alertas los problemas solo se detectan cuando un usuario los reporta.

### Backups automáticos de PostgreSQL
**Descripción:** El cron de limpieza existe pero no hay backup automático de la base de datos. En producción una falla de disco sin backup significa pérdida total de datos.
**Cambio requerido:**
- Agregar job al cron que ejecute `pg_dump` diariamente
- Guardar los backups en una ruta externa al servidor (NAS, S3, etc.)
- Retención mínima de 30 días
- Script de validación que verifique que el backup se generó correctamente
**Impacto:** Operación crítica — sin backups no hay recuperación ante desastres.

### Exporters de infraestructura no configurados
**Archivo:** `infrastructure/docker/docker-compose.yml`
**Descripcion:** PostgreSQL, Redis y Nginx aparecen como down en Prometheus porque no tienen exporters instalados. Solo se monitorean los servicios FastAPI.
**Cambio requerido:** Agregar al docker-compose: postgres-exporter, redis-exporter, nginx-prometheus-exporter.
**Impacto:** Monitoreo incompleto — no se puede ver conexiones activas a BD, uso de cache Redis ni trafico de Nginx.

### Persistencia de dashboards de Grafana
**Archivo:** `infrastructure/grafana/`
**Descripcion:** Los dashboards de Grafana se guardan en el volumen Docker. Un docker compose down -v los borra.
**Cambio requerido:** Configurar provisionamiento automatico de dashboards en Grafana apuntando a infrastructure/grafana/ para que el dashboard se cargue al levantar el contenedor sin importacion manual.
**Impacto:** Operacion — en un reset del ambiente hay que reimportar el dashboard manualmente.

### Auditoría de acciones administrativas
**Descripción:** Se registra quién sube/baja archivos de empleados pero no hay log de acciones administrativas críticas como crear usuario, cambiar rol, eliminar empresa, etc.
**Cambio requerido:** Crear tabla `admin_audit_log` en el admin-service con: acción, entidad afectada, performed_by, performed_at, ip_address, detalle JSON.
**Impacto:** Trazabilidad — sin esto no se puede auditar quién hizo qué en el panel de administración.

### Notificación de login desde IP nueva
**Descripción:** El sistema ya registra la IP de cada login. Falta enviar correo de alerta cuando un usuario accede desde una IP que nunca ha usado antes.
**Cambio requerido:** En auth-service, comparar la IP del login actual contra el historial. Si es nueva, enviar correo via email-service con fecha, hora e IP.
**Impacto:** Seguridad — alerta temprana ante accesos no autorizados.

---

## Frontend

### Autocomplete de Chrome en campo de búsqueda de usuarios
**Archivo:** `frontend/app/(private)/admin/users/page.tsx`
**Descripción:** Chrome autocompleta el campo de búsqueda con credenciales guardadas al abrir modales que contienen inputs de contraseña.
**Cambio requerido:** Componente de input personalizado que bloquee el comportamiento de forma más agresiva.
**Impacto:** UX — el filtro de búsqueda se llena con el email del admin al abrir el modal de reset de contraseña.

### Hover en opciones del menú de 3 puntos
**Archivo:** `frontend/components/admin/users/UserTable.tsx`
**Descripción:** Las opciones del menú de acciones no tienen hover visible al pasar el mouse.
**Cambio requerido:** Agregar fondo gris (`hover:bg-slate-100`) en el componente `MenuItem` para opciones no peligrosas.
**Impacto:** UX — falta feedback visual de posición del cursor.

### Editar empresa del usuario desde el formulario de edición
**Archivo:** `frontend/components/admin/users/UserEditForm.tsx`
**Descripción:** El formulario de edición no incluye el campo de empresa (`company_id`).
**Cambio requerido:** Agregar selector de empresa en `UserEditForm.tsx` y pasar `company_id` en el payload de `UpdateUserRequest`.
**Impacto:** UX — el super admin no puede cambiar la empresa de un usuario sin eliminarlo y recrearlo.

### Carga de constancia SAT en edición de empresa
**Archivo:** `frontend/components/admin/companies/CompanyEditForm.tsx`
**Descripción:** El formulario de edición no tiene tab de carga de constancia SAT.
**Cambio requerido:** Agregar tab que cargue solo domicilio y fechas de vigencia — verificando que el RFC del PDF coincida con el RFC de la empresa.
**Impacto:** UX — el admin no puede actualizar el domicilio fiscal de una empresa existente cargando su nueva constancia.

### Performance del frontend en desarrollo — Next.js Turbopack lento en WSL2
**Archivo:** `frontend/next.config.ts`
**Descripción:** Next.js con Turbopack detecta el filesystem de WSL2 como lento (benchmark >200ms).
**Cambio requerido:** Investigar opciones para mejorar el arranque y hot reload en WSL2.
**Impacto:** DX — el desarrollo es más lento de lo esperado en WSL2.

### Refresh del JWT al crear módulo
**Decisión tomada:** El usuario cierra sesión manualmente después de crear un módulo. No se implementará refresh automático por simplicidad y seguridad.

### TypeScript — role_id no existe en tipo GlobalRole y ModuleRole en UserForm
**Archivo:** `frontend/components/admin/users/UserForm.tsx`
**Cambio requerido:** Actualizar los tipos en `role.types.ts` para asegurar consistencia en el nombre del campo ID.
**Impacto:** TypeScript — no bloquea el build de producción pero genera errores en `tsc --noEmit`.

### TypeScript — pages de rutas dinámicas [id] no son módulos válidos
**Archivos:** `frontend/app/(private)/admin/companies/[id]/page.tsx`, `groups/[id]/page.tsx`, `modules/[id]/page.tsx`, `users/[id]/page.tsx`
**Cambio requerido:** Verificar que cada página dinámica tenga `export default function Page({ params }: { params: { id: string } })`.
**Impacto:** TypeScript — no bloquea el build pero genera ruido en el output de `tsc --noEmit`.

---

## Backend

### Mensaje de cuenta bloqueada no diferencia tipo de bloqueo
**Archivo:** `backend/auth-service/app/services/auth_service.py`
**Cambio requerido:**
- Bloqueo manual → `"Tu cuenta ha sido bloqueada. Contacta al administrador."`
- Bloqueo por intentos fallidos → `"Cuenta bloqueada por múltiples intentos fallidos. Contacta al administrador."`
**Impacto:** UX — el usuario no sabe por qué fue bloqueado ni qué hacer.

---

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.
- El checklist de producción y la sección de seguridad deben revisarse completos antes de cualquier despliegue al servidor on-premise.