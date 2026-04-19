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

### MinIO — `infrastructure/docker/docker-compose.yml`
El puerto `9001` de la consola de MinIO no debe estar expuesto en producción. Comentar o eliminar el mapeo `9001:9001` del docker-compose antes de desplegar.

---

## Frontend

### Autocomplete de Chrome en campo de búsqueda de usuarios
**Archivo:** `frontend/app/(private)/admin/users/page.tsx`
**Descripción:** Chrome autocompleta el campo de búsqueda con credenciales guardadas al abrir modales que contienen inputs de contraseña. `autoComplete="off"` y `type="search"` no lo resuelven — Chrome los ignora. Requiere un componente de input personalizado que bloquee el comportamiento de forma más agresiva.
**Impacto:** UX — el filtro de búsqueda se llena con el email del admin al abrir el modal de reset de contraseña.

### Hover en opciones del menú de 3 puntos
**Archivo:** `frontend/components/admin/users/UserTable.tsx`
**Descripción:** Las opciones del menú de acciones (3 puntos) no tienen hover visible al pasar el mouse. El usuario no puede distinguir visualmente sobre qué opción está posicionado.
**Cambio requerido:** Agregar fondo gris (`hover:bg-slate-100`) en el componente `MenuItem` para opciones no peligrosas, y `hover:bg-red-50` para las peligrosas ya lo tiene.
**Impacto:** UX — falta feedback visual de posición del cursor.

### Editar empresa del usuario desde el formulario de edición
**Archivo:** `frontend/components/admin/users/UserEditForm.tsx`
**Descripción:** El formulario de edición de usuario no incluye el campo de empresa (`company_id`). El super admin debería poder reasignar un usuario a una empresa diferente desde este formulario.
**Cambio requerido:** Agregar selector de empresa (solo empresas activas) en `UserEditForm.tsx` y pasar `company_id` en el payload de `UpdateUserRequest`. Verificar que el backend en `update_user` de `user_service.py` acepte y procese el campo `company_id`.
**Impacto:** UX — el super admin no puede cambiar la empresa de un usuario sin eliminarlo y recrearlo.

### Carga de constancia SAT en edición de empresa
**Archivo:** `frontend/components/admin/companies/CompanyEditForm.tsx`
**Descripción:** El formulario de edición no tiene tab de carga de constancia SAT. Al agregarlo debe comportarse diferente al de alta:
- No cargar RFC ni razón social del PDF (ya existen en BD)
- Verificar que el RFC del PDF coincida con el RFC de la empresa — si no coincide mostrar: "La constancia no corresponde a la empresa [nombre_comercial]"
- Si el RFC coincide, cargar solo domicilio y fechas de vigencia
**Impacto:** UX — el admin no puede actualizar el domicilio fiscal de una empresa existente cargando su nueva constancia.

### Performance del frontend en desarrollo — Next.js Turbopack lento en WSL2
**Archivo:** `frontend/next.config.ts`
**Descripción:** Next.js con Turbopack detecta el filesystem de WSL2 como lento (benchmark >200ms). Esto causa arranque lento y hot reload tardado en desarrollo.
**Cambio requerido:** Investigar opciones: mover `.next/dev` a un directorio en el filesystem nativo de Linux, evaluar si eliminar el `package.json` raíz mejora la situación, o configurar `turbopack.root` más específicamente.
**Impacto:** DX — el desarrollo es más lento de lo esperado en WSL2.

### Refresh del JWT al crear módulo
**Decisión tomada:** El usuario cierra sesión manualmente después de crear un módulo. El modal de confirmación post-scaffold indica claramente que debe cerrar sesión para ver el módulo en el sidebar. No se implementará refresh automático por simplicidad y seguridad.

### TypeScript — role_id no existe en tipo GlobalRole y ModuleRole en UserForm
**Archivo:** `frontend/components/admin/users/UserForm.tsx`
**Descripción:** El componente usa `r.role_id` y `r.id` indistintamente para acceder al ID de roles globales y de módulo. Los tipos `GlobalRole` y `ModuleRole` no tienen definido el campo `role_id` — el type checker los rechaza.
**Cambio requerido:** Actualizar los tipos en `role.types.ts` para asegurar consistencia en el nombre del campo ID, y ajustar `UserForm.tsx` para usar el campo correcto.
**Impacto:** TypeScript — no bloquea el build de producción pero genera errores en `tsc --noEmit`.

### TypeScript — pages de rutas dinámicas [id] no son módulos válidos
**Archivos:** `frontend/app/(private)/admin/companies/[id]/page.tsx`, `groups/[id]/page.tsx`, `modules/[id]/page.tsx`, `users/[id]/page.tsx`, `app/[module]/[submodule]/page.tsx`
**Descripción:** El validador de tipos de Next.js `.next/dev/types/validator.ts` reporta que estas páginas no exportan un módulo válido.
**Cambio requerido:** Verificar que cada página dinámica tenga `export default function Page({ params }: { params: { id: string } })` o el tipo de params correspondiente.
**Impacto:** TypeScript — no bloquea el build pero genera ruido en el output de `tsc --noEmit`.

---

## Backend

### Mensaje de cuenta bloqueada no diferencia tipo de bloqueo
**Archivo:** `backend/auth-service/app/services/auth_service.py`
**Descripción:** Cuando una cuenta está bloqueada, el mensaje de error es genérico sin importar si fue bloqueada manualmente por un admin o automáticamente por intentos fallidos.
**Cambio requerido:**
- Bloqueo manual → `"Tu cuenta ha sido bloqueada. Contacta al administrador."`
- Bloqueo por intentos fallidos → `"Cuenta bloqueada por múltiples intentos fallidos. Contacta al administrador."`
**Impacto:** UX — el usuario no sabe por qué fue bloqueado ni qué hacer.

---

## Infraestructura y monitoreo

### Alertas de Grafana no configuradas
**Archivos:** `infrastructure/prometheus/alerts.yml`, `infrastructure/grafana/`
**Descripcion:** Grafana solo visualiza metricas actualmente — no envia alertas. El archivo alerts.yml esta vacio y Alertmanager no tiene canales configurados.
**Cambio requerido:**
- Configurar canal de notificacion en Grafana (Email via SMTP corporativo recomendado)
- Definir reglas de alerta en alerts.yml: servicio caido >1min, latencia >1s sostenida, errores 5xx >1% del trafico, RAM >512MB
- Conectar Alertmanager con el canal configurado
**Impacto:** Operacion — sin alertas los problemas solo se detectan cuando un usuario los reporta.

### Exporters de infraestructura no configurados
**Archivo:** `infrastructure/docker/docker-compose.yml`
**Descripcion:** PostgreSQL, Redis y Nginx aparecen como down en Prometheus porque no tienen exporters instalados. Solo se monitorean los servicios FastAPI.
**Cambio requerido:** Agregar al docker-compose: postgres-exporter, redis-exporter, nginx-prometheus-exporter.
**Impacto:** Monitoreo incompleto — no se puede ver conexiones activas a BD, uso de cache Redis ni trafico de Nginx.

### Persistencia de dashboards de Grafana
**Archivo:** `infrastructure/grafana/`
**Descripcion:** Los dashboards de Grafana se guardan en el volumen Docker. Un docker compose down -v los borra. El JSON esta en infrastructure/grafana/avalanz-services-dashboard.json pero no se carga automaticamente.
**Cambio requerido:** Configurar provisionamiento automatico de dashboards en Grafana apuntando a infrastructure/grafana/ para que el dashboard se cargue al levantar el contenedor sin importacion manual.
**Impacto:** Operacion — en un reset del ambiente hay que reimportar el dashboard manualmente.

---

## Notas
- Los items de este archivo no bloquean el merge ni el avance de features.
- Revisar y limpiar este archivo al inicio de cada sprint.
- El checklist de producción debe revisarse completo antes de cualquier despliegue al servidor on-premise.