# Contexto de Sesión — Módulo Legal / Submódulo Contratos
Intranet Avalanz — `feature/legal-contract-requests`

---

## 1. Reglas de trabajo

Estas reglas aplican en cada sesión sin excepción.

- **Código completo** — archivos nuevos se entregan como artefacto descargable. Cambios puntuales se entregan con Python directo en terminal.
- **Lectura de archivos** — siempre con `grep` o `sed -n`, nunca `cat` en el chat (rompe el heredoc).
- **Ediciones multilínea en servidor** — usar `python3 << 'EOF'` en lugar de `sed` para evitar errores de escape. Para insertar líneas en posición específica usar lectura línea a línea con Python.
- **Archivos Windows → Linux** — después de cada descarga dar el comando PowerShell con ruta UNC:
```powershell
$src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
```
- **Git** — commits en inglés. Push desde servidor. Rama activa: `feature/legal-contract-requests`.
- **Backend modificado con código** — `docker cp archivo avalanz-legal:/app/... && docker restart avalanz-legal`. Backend modificado con Dockerfile — `docker compose build --no-cache + up -d`.
- **Cuando build ignora cambios** — verificar con `docker exec avalanz-legal grep -n "texto" /app/archivo.py`. Si el archivo en el contenedor no tiene el cambio, copiar con `docker cp`.
- **Inicio de sesión nueva** — leer este archivo primero, luego `legal-service.md`, luego pedir estado del repo.
- **No mezclar contextos** — todos los comandos son para el servidor SSH (`abcovarrubias@10.12.0.51`) salvo que se indique explícitamente "local".
- **Normalización de roles** — los roles de módulo viajan con prefijo `legal:` en el JWT. Siempre normalizar con `get_flat_roles(user)` en backend y `r.split(':')[1]` en frontend antes de comparar.

---

## 2. Estructura del proyecto

### Servidores
| Entorno | Usuario | Host | Ruta |
|---|---|---|---|
| Local (WSL) | `abyblackmouth@LAPTOP-4SPKNTJH` | — | `~/code/avalanz/intranet-avalanz` |
| Producción | `abcovarrubias@int-avz` | `10.12.0.51` | `~/intranet-avalanz` |

### Frontend
- Next.js 16 App Router — corre con PM2: proceso `intranet-frontend` (id: 2)
- Rebuild: `cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend`
- Azul corporativo: `#1a4fa0`
- Layout Legal: navegación horizontal (tabs), no sidebar vertical
- Filtros en móvil: grid 2 columnas
- Tabla de sobres: 8 por página, responsive (tabla desktop / tarjetas móvil)

### Backend — Legal Service
```
backend/modules/legal-service/
├── app/
│   ├── main.py
│   ├── config.py              → FRONTEND_URL, EMAIL_SERVICE_URL incluidos
│   └── database.py
├── contract_requests/
│   ├── models.py              → 18+ tablas SQLAlchemy
│   ├── schemas.py             → EnvelopeAttachmentOut incluye object_key, bucket, is_current, version_number
│   ├── routes.py              → /api/v1/legal/envelopes — incluye get_flat_roles() helper
│   ├── service.py             → usa datetime.now(timezone.utc) en toda fecha
│   └── signing_service.py    → proveedores email_sim y docusign (placeholder)
├── templates/
│   ├── index.json             → catálogo con contract_type_id por template
│   └── nda-mutuo/
│       ├── fields.json        → campos del formulario (temporal — migrar a BD)
│       └── template.html      → HTML del contrato con variables {{CAMPO}}
└── migrations/versions/
    ├── fd194ef42a01           → Initial schema
    ├── a7d79d465637           → Rename to envelopes
    ├── 2c4cbf7f7b31           → Add envelope_signers
    ├── a3208a4d12c7           → Add intercompany fields
    ├── 425fe54b7106           → Add template slug/version, mime types, correction checklist
    ├── a62f97aa714d           → Add signing tokens + provider config
    └── d3a02f07031f           → Add version tracking to envelope_attachments
```

### Admin-service — cambios realizados
```
backend/admin-service/
├── app/
│   ├── main.py                → endpoint interno agregado: GET /internal/users/by-module-role
│   └── routes/
│       └── users.py           → GET /users/by-module-role (con auth, no usar — usar el de main.py)
```

### Docker
- Contenedor legal: `avalanz-legal` (servicio: `legal-service`)
- Contenedor admin: `avalanz-admin` (servicio: `admin-service`)
- MinIO puerto 9001 (consola web) ahora mapeado en docker-compose.yml
- MinIO credenciales: `AvalanzMinIO2026 / 55520173966a34f64caa19e807985392b0e90dff`

### Dependencias del legal-service (requirements.txt)
```
fastapi==0.111.0
uvicorn[standard]==0.29.0
sqlalchemy==2.0.30
asyncpg==0.29.0
pydantic-settings==2.2.1
alembic==1.13.1
httpx==0.27.0
python-jose[cryptography]==3.3.0
prometheus-fastapi-instrumentator==7.0.0
weasyprint==57.2
pydyf==0.6.0
```

### Base de datos
- BD legal: `avalanz_legal` en `avalanz-postgres`
- BD admin: `avalanz_admin` en `avalanz-postgres`
- Contraseña BD: `f98311083c76c30a5827efc731a016e99c28f580`
- **Regla crítica:** para ediciones multilínea usar Python, no `sed`.

### Tablas en avalanz_legal (18+ tablas)
`envelopes`, `envelope_signers`, `envelope_signing_tokens`, `signing_provider_config`, `envelope_form_snapshots`, `envelope_status_logs`, `envelope_time_tracking`, `envelope_comments`, `envelope_attachments`, `envelope_attachment_logs`, `envelope_activity_logs`, `contract_types`, `contract_type_fields`, `contract_type_attachment_defs`, `lawyer_assignments`, `folio_sequences`

### Historial de migraciones
| Revisión | Descripción |
|---|---|
| `fd194ef42a01` | Initial schema |
| `a7d79d465637` | Rename to envelopes |
| `2c4cbf7f7b31` | Add envelope_signers |
| `a3208a4d12c7` | Add intercompany fields |
| `425fe54b7106` | Add template slug/version, mime types, correction checklist |
| `a62f97aa714d` | Add signing tokens + provider config |
| `d3a02f07031f` | Add version tracking to envelope_attachments |

### Archivos frontend relevantes
| Archivo | Ruta |
|---|---|
| Página principal (lista) | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Nuevo contrato (stepper) | `frontend/app/(private)/app/legal/solicitud-de-contratos/nuevo/page.tsx` |
| Tabla + slide-over | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API legal | `frontend/services/legalService.ts` |
| Upload service | `frontend/services/uploadService.ts` |
| Layout Legal | `frontend/app/(private)/app/legal/layout.tsx` |

---

## 3. Roles y usuarios configurados

### Roles de módulo Legal en avalanz_admin
| ID | Nombre | Slug |
|---|---|---|
| `8fecb981-0d9a-4a30-9b29-fd918892ed68` | Abogado | abogado |
| `f9273068-6f57-4637-99cb-9b9416445041` | Coordinador Legal | coordinador_legal |

Módulo Legal ID: `65b93f94-20cf-4483-8a65-ef7788c09e12`

### Usuarios con rol en módulo Legal
| Usuario | Email | Contraseña | Rol |
|---|---|---|---|
| LOURDES RUIZ RAMOS | soporte@avalanz.com | Avalanz01* | coordinador_legal |
| FELIPE GONZALEZ MARTINEZ | abraham_covarrubias@cnci.com.mx | — | abogado |

### Regla de normalización de roles
Los roles viajan en el JWT con prefijo: `legal:abogado`, `legal:coordinador_legal`.

```python
# Backend — helper en routes.py (ya implementado)
def get_flat_roles(user: dict) -> list:
    return [r.split(":")[-1] for r in user.get("roles", [])]
```

```typescript
// Frontend — en resolveLegalRole (ya implementado)
const flat = roles.map(r => r.includes(':') ? r.split(':')[1] : r)
```

---

## 4. Estado actual — Lo que funciona ✅

### Lista de sobres
- Tabla desktop con columnas: semáforo, folio, tipo, empresa, solicitante (con avatar), recibido, días, estado, abogado
- Tarjetas móvil
- Paginación 8 por página
- Filtros: estado, tipo de contrato, búsqueda — en móvil grid 2 columnas
- KPIs: activos, atrasadas (SLA vencido), en espera de firmas
- Semáforo SLA: verde / amarillo / rojo con horas cuando es < 1 día
- Visibilidad filtrada por rol (solicitante ve solo su empresa, abogado solo sus asignados, coordinador/super_admin ven todo)

### Slide-over de detalle
- Información: empresa, solicitante, enviado, límite SLA, abogado asignado, contraparte
- Documentos adjuntos con badge "Actual" / "Anterior" + botón descarga (getSignedUrl)
- Historial combinado de status_log + activity_log (filtrando `viewed`), ordenado descendente con hora
- Bitácora de estados con motivos
- Comentarios (internos solo visibles para legal)
- Acciones: Aprobar / Correcciones / Rechazar (según rol y estado)
- Menú `...`: Asignar abogado (coordinador/super_admin), Marcar completado

### Asignación de abogado
- Modal con select desplegable cargado desde `GET /envelopes/lawyers`
- Al seleccionar y confirmar → `PATCH /envelopes/{id}/assign-lawyer` con `{ lawyer_id }`
- El backend obtiene nombre y email del abogado desde admin-service interno
- Registra en `envelope_activity_logs` con acción `lawyer_reassigned`

### Stepper de nuevo contrato (5 pasos)
- Paso 0 (previo): Selección de empresa — aparece si usuario tiene >1 empresa o es super_admin
  - Carga empresas activas: `GET /api/v1/companies/?is_active=true&per_page=100`
- Paso 1: Tipo de contrato — `GET /envelopes/contract-templates`
- Paso 2: Datos del formulario dinámico — `GET /envelopes/contract-templates/{slug}/fields`
- Paso 3: Anexos obligatorios — `GET /envelopes/types/{contract_type_id}/attachments`
  - El `contract_type_id` viene de `template.contract_type_id` en el index.json
- Paso 4: Preview HTML en iframe + descarga PDF (WeasyPrint)
- Paso 5: Confirmar y enviar

### Flujo de submit (al confirmar envío)
```
1. Ping al backend para refrescar token
2. POST /envelopes → crear sobre → envelope_id, folio, company_name (slug de empresa)
3. POST /contract-templates/{slug}/preview-pdf → generar PDF → blob
   → uploadToStorage con module_slug=legal, submodule_slug=envelopes/{folio}, company_slug
   → POST /envelopes/{id}/attachments (JSON) → registrar metadatos
4. Para cada anexo:
   → uploadToStorage con submodule_slug=envelopes/{folio}/attachments
   → POST /envelopes/{id}/attachments (JSON) → registrar metadatos
5. POST /envelopes/{id}/submit → pendiente_legal
6. Redirigir a lista
```

### MinIO — estructura de archivos
```
dirdoc/
└── {company_slug}/              → slug de la empresa (agim, sppel, etc.)
    └── legal/
        └── envelopes/
            └── {folio}/         → ENV-2026-0039
                ├── {uuid}_{folio}_contrato.pdf
                └── attachments/
                    └── {uuid}_{folio}_{nombre}.pdf
```

### Versionado de documentos
- `is_current=true` → versión activa
- `is_current=false` → versión anterior (cuando se reemplaza por corrección)
- Al registrar un nuevo attachment del mismo `attachment_def_id`, el anterior se marca `is_current=false`
- Campos adicionales: `version_number`, `replaced_at`, `replaced_by_name`, `replaced_reason`

### Firma electrónica (email_sim)
- `POST /envelopes/{id}/send-for-signing` → genera tokens únicos y manda correos a firmantes
- `GET /envelopes/signing/confirm/{token}` → confirma firma (sin auth)
- Cuando todos firman → sobre pasa a `completado` automáticamente
- Proveedor configurable desde `POST /envelopes/signing/provider` (solo super_admin/admin_empresa)
- Proveedor activo en `signing_provider_config` tabla, id=1, valor: `email_sim`

### Trazabilidad
- `activity_log` registra: created, submitted, viewed, lawyer_reassigned, lawyer_started_review, approved, rejected, corrections_requested
- `time_tracking` registra por status: borrador, pendiente_legal, en_revision_legal, revision_abogado
- Solo el **abogado asignado** al abrir el sobre cambia estado a `en_revision_legal` y abre entrada `revision_abogado` en time_tracking
- El coordinador puede abrir el sobre sin cambiar el estado

### Admin-service — endpoint interno
```
GET http://admin-service:8000/internal/users/by-module-role
    ?module_slug=legal&role_slug=abogado
→ [{"id": "uuid", "name": "Nombre", "email": "email"}]
```
No requiere autenticación. No expuesto en Nginx. Solo red Docker interna.

---

## 5. Datos de prueba actuales en servidor

- 25+ sobres con estados variados (pendiente_legal, en_revision_legal, en_firmas, completado, rechazado)
- Tipo de contrato activo: **NDA Mutuo** (`contract_type_id: 11111111-1111-1111-1111-111111111111`)
- Template en `templates/nda-mutuo/`
- Felipe asignado manualmente a ENV-2026-0039 vía `assign-lawyer`
- Felipe NO está en `lawyer_assignments` para NDA Mutuo — la asignación automática no funcionará hasta configurarlo
- Archivos en MinIO bajo `dirdoc/agim/legal/envelopes/` y `dirdoc/sppel/legal/envelopes/`

---

## 6. Pendientes inmediatos 🔴

### Para probar asignación automática
- [ ] Insertar Felipe en `lawyer_assignments` para el tipo NDA Mutuo:
```sql
INSERT INTO lawyer_assignments (id, lawyer_user_id, lawyer_name, lawyer_email, contract_type_id, is_active, assigned_by)
VALUES (gen_random_uuid(), 'fd8c58aa-e09d-4c90-b9b4-b826ff657057', 'FELIPE GONZALEZ MARTINEZ',
  'abraham_covarrubias@cnci.com.mx', '11111111-1111-1111-1111-111111111111', true,
  '2859bacf-5202-4997-9fba-9892f727c479');
```

### Notificaciones pendientes
- [ ] Correo al abogado cuando se le asigna un sobre (al hacer assign-lawyer)
- [ ] Correo al solicitante cuando el sobre pasa a `completado`

### Firma electrónica
- [ ] Página pública `/firmar/{token}` en el frontend — el firmante llega al link del correo y ve el contrato + botón confirmar
- [ ] Select de proveedor de firma en panel de admin (UI para super_admin/admin_empresa)

### Firmantes
- [ ] CRUD endpoints para `envelope_signers`
- [ ] Paso de firmantes en el stepper de nuevo contrato (entre Datos y Anexos)

---

## 7. Pendientes técnicos (ver tech-debt-legal.md para detalle)

### Backend
- [ ] Márgenes del PDF en páginas 2+ (WeasyPrint — body tiene padding solo para pág. 1)
- [ ] Tabla de firmas en PDF con formato visual correcto
- [ ] Endpoint trazabilidad por abogado: `GET /envelopes/reports/lawyer/{lawyer_id}`
- [ ] Reporte SLA diario por correo (cron 11 AM)
- [ ] Integración DocuSign (cuando haya credenciales)

### Frontend
- [ ] Correcciones de UI tabla: altura fija para 8 filas, alineación de headers
- [ ] Checklist de correcciones en slide-over cuando abogado solicita cambios
- [ ] Vista de trazabilidad por abogado
- [ ] Panel KPIs para coordinador y director

### Configuración
- [ ] Crear tipos de contrato reales (eliminar UUID hardcodeado `11111111...`)
- [ ] Migrar campos de `fields.json` a `contract_type_fields` en BD
- [ ] UI de administración de templates para coordinador
- [ ] Limpieza de datos de prueba al go-live

### Bloqueantes del equipo legal
- Templates Word con campos variables resaltados en amarillo
- Listado definitivo de tipos de contrato
- Anexos obligatorios/opcionales por tipo
- Documentos a solicitar a firmantes (INE, pasaporte, poder notarial)
- SLA por tipo (solo NDA: 3 días definidos)
- Firmantes por defecto en DocuSign
- Nombre del remitente en DocuSign

---

## 8. Comandos de referencia

```bash
# Tokens
TOKEN=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

TOKEN_L=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"soporte@avalanz.com","password":"Avalanz01*"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Rebuild legal-service (con caché)
cd ~/intranet-avalanz/infrastructure/docker
docker compose -f docker-compose.yml build legal-service && docker compose -f docker-compose.yml up -d legal-service

# Rebuild legal-service (sin caché — cuando build ignora cambios)
docker compose -f docker-compose.yml build --no-cache legal-service && docker compose -f docker-compose.yml up -d legal-service

# Copiar archivo al contenedor sin rebuild (más rápido para pruebas)
docker cp ~/intranet-avalanz/backend/modules/legal-service/contract_requests/routes.py \
  avalanz-legal:/app/contract_requests/routes.py && docker restart avalanz-legal

# Rebuild admin-service
docker compose -f docker-compose.yml build admin-service && docker compose -f docker-compose.yml up -d admin-service

# Rebuild frontend
cd ~/intranet-avalanz/frontend && npm run build && pm2 restart intranet-frontend

# Ver logs
docker logs avalanz-legal --tail 30
docker logs avalanz-admin --tail 20

# Migraciones
export DB_HOST=$(docker inspect avalanz-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export DB_PORT=5432 DB_USER=avalanz_user DB_NAME=avalanz_legal
export DB_PASSWORD=$(grep -o 'avalanz_user:[^@]*' ~/intranet-avalanz/backend/modules/legal-service/.env | cut -d: -f2)
cd ~/intranet-avalanz/backend/modules/legal-service && alembic upgrade head

# MinIO CLI
docker exec avalanz-minio mc alias set local http://localhost:9000 \
  AvalanzMinIO2026 55520173966a34f64caa19e807985392b0e90dff
docker exec avalanz-minio mc ls --recursive local/dirdoc/

# Ver sobres recientes
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal \
  -c "SELECT folio, status, company_name, assigned_lawyer_name FROM envelopes ORDER BY created_at DESC LIMIT 10;"

# Ver roles de módulo
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin \
  -c "SELECT u.full_name, mr.slug as rol FROM user_module_accesses uma JOIN users u ON u.id=uma.user_id JOIN module_roles mr ON mr.id=uma.role_id WHERE uma.is_active=true ORDER BY mr.slug;"

# Probar endpoint de abogados (como coordinador)
curl -k -s "https://localhost/api/v1/legal/envelopes/lawyers" \
  -H "Authorization: Bearer $TOKEN_L" | python3 -m json.tool

# Endpoint interno admin (solo red Docker)
docker exec avalanz-admin curl -s \
  "http://localhost:8000/internal/users/by-module-role?module_slug=legal&role_slug=abogado"

# Verificar que un archivo llegó al contenedor
docker exec avalanz-legal grep -n "texto_a_buscar" /app/contract_requests/routes.py
```

---

## 9. Rutas API — resumen

Base: `/api/v1/legal/envelopes`

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | /types | Todos | Tipos de contrato activos |
| GET | /types/{id}/attachments | Todos | Anexos del tipo |
| GET | /contract-templates | Todos | Catálogo de templates |
| GET | /contract-templates/{slug}/fields | Todos | Campos del formulario |
| POST | /contract-templates/{slug}/preview | Todos | Preview HTML |
| POST | /contract-templates/{slug}/preview-pdf | Todos | PDF WeasyPrint |
| GET | /lawyers | coordinador, super_admin | Abogados activos en módulo legal |
| GET | — (vacío) | Todos (filtrado por rol) | Lista sobres paginada |
| POST | — | Todos | Crear sobre |
| GET | /{id} | Todos (filtrado) | Detalle completo |
| POST | /{id}/submit | solicitante, super_admin | Enviar al área legal |
| POST | /{id}/approve | abogado, coordinador, super_admin | Aprobar |
| POST | /{id}/request-corrections | abogado, coordinador, super_admin | Pedir correcciones |
| POST | /{id}/reject | abogado, coordinador, super_admin | Rechazar |
| POST | /{id}/complete | abogado, coordinador, super_admin | Marcar completado |
| PATCH | /{id}/assign-lawyer | coordinador, super_admin | Asignar abogado (JSON) |
| POST | /{id}/reassign | coordinador, super_admin | Reasignar (Form) |
| POST | /{id}/attachments | Todos | Registrar metadatos archivo (JSON) |
| GET | /{id}/attachments | Todos | Listar archivos |
| POST | /{id}/send-for-signing | abogado, coordinador, super_admin | Enviar a firma |
| GET | /signing/provider | Todos | Proveedor activo |
| POST | /signing/provider | super_admin, admin_empresa | Cambiar proveedor |
| GET | /signing/confirm/{token} | Sin auth | Confirmar firma desde correo |