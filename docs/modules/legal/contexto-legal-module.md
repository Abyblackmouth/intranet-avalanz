# Contexto de Sesión — Módulo Legal / Submódulo Contratos
Intranet Avalanz — `feature/legal-contract-requests`

---

## 1. Reglas de trabajo

Estas reglas aplican en cada sesión sin excepción.

- **Código completo** — archivos nuevos se entregan como artefacto descargable. Cambios puntuales se entregan con `cat` o `sed` directo en terminal.
- **Lectura de archivos** — siempre con `grep` o `sed`, nunca `cat` en el chat (rompe el heredoc).
- **Archivos Windows → Linux** — después de cada descarga dar el comando PowerShell con ruta UNC:
```powershell
$src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
```
- **Git** — una rama por feature. Commits en inglés. Push y pull siempre explícito entre local y servidor.
- **Backend modificado** — copiar archivo al contenedor con `docker cp` y reiniciar el servicio.
- **Guías** — al cerrar cada tarea revisar `docs/modules/legal/legal-service.md` y actualizar lo que cambió.
- **Inicio de sesión nueva** — leer este archivo primero, luego `legal-service.md`, luego pedir estructura del proyecto.
- **Comentarios en código** — solo explican qué hace el código, nunca describen cambios o refactorizaciones.
- **Ediciones multilínea en servidor** — usar Python (`python3 << 'EOF'`) en lugar de `sed` para evitar errores de escape.

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
- Estado UI con Zustand, datos servidor con React Query/SWR
- Hydration: proteger con `mounted &&`

### Backend — Legal Service
```
backend/modules/legal-service/
├── app/main.py                     → FastAPI, middlewares, routers
├── contract_requests/              → Submódulo Contratos (carpeta conserva nombre)
│   ├── models.py                   → 13 tablas SQLAlchemy
│   ├── schemas.py                  → Pydantic schemas
│   ├── routes.py                   → Endpoints /api/v1/legal/envelopes
│   └── service.py                  → Lógica de negocio, SLA, balanceo
└── migrations/versions/
    ├── fd194ef42a01_initial_schema_contract_requests.py
    └── a7d79d465637_rename_contract_requests_tables_to_.py
```

### Docker
- Contenedor: `avalanz-legal` (servicio en compose: `legal-service`)
- Rebuild: `cd ~/intranet-avalanz/infrastructure/docker && docker compose -f docker-compose.yml build legal-service && docker compose -f docker-compose.yml up -d legal-service`
- Nginx upstream: `avalanz-legal:8000` en `infrastructure/nginx/conf.d/intranet.conf`

### Base de datos
- BD: `avalanz_legal` en `avalanz-postgres`
- Migraciones desde el servidor (no desde contenedor):
```bash
export DB_HOST=$(docker inspect avalanz-postgres --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
export DB_PORT=5432 DB_USER=avalanz_user DB_NAME=avalanz_legal
export DB_PASSWORD=<ver KeePass>
export PYTHONPATH=/home/abcovarrubias/intranet-avalanz/backend/modules/legal-service
cd ~/intranet-avalanz/backend/modules/legal-service
alembic upgrade head
```
- **Regla crítica:** para renombrar tablas usar `op.rename_table()` manual — NUNCA `--autogenerate`.

### Tablas en BD (13 tablas actuales)
`envelopes`, `envelope_form_snapshots`, `envelope_status_logs`, `envelope_time_tracking`, `envelope_comments`, `envelope_attachments`, `envelope_attachment_logs`, `envelope_activity_logs`, `contract_types`, `contract_type_fields`, `contract_type_attachment_defs`, `lawyer_assignments`, `folio_sequences`

### Archivos frontend relevantes
| Archivo | Ruta |
|---|---|
| Página principal | `frontend/app/(private)/app/legal/solicitud-de-contratos/page.tsx` |
| Tabla de sobres | `frontend/components/app/legal/ContractRequestsTable.tsx` |
| Tipos TypeScript | `frontend/types/contract.types.ts` |
| Servicio API | `frontend/services/legalService.ts` |
| Layout Legal | `frontend/app/(private)/app/legal/layout.tsx` |

### Rutas API
- Base: `/api/v1/legal/envelopes`
- La API devuelve `{ data: [...], total, page, per_page, total_pages }` — sin wrapper `success/message`
- Otros servicios sí usan wrapper — no confundir al leer respuestas

---

## 3. Nuevos requerimientos (sesión con equipo legal)

### 3.1 Contratos basados en templates
- El solicitante selecciona un tipo de contrato, llena los campos dinámicos y el sistema genera el PDF
- El solicitante ve un preview antes de crear el sobre
- Los templates los entregará el equipo legal en Word con campos en amarillo
- **Bloqueante:** equipo legal aún no entrega templates, tipos de contrato, ni SLAs por tipo

### 3.2 Contratos abiertos
- El área legal necesita poder cargar un contrato directamente (PDF o Word) sin usar template
- Al cargarse se crea un preview
- Se asignan firmantes manualmente
- Si se aprueba, detona DocuSign con esa información
- **Estado actual:** `is_open_request` y `open_request_description` ya existen en el modelo — falta el flujo de UI para subir el archivo y asignar firmantes

### 3.3 Firmantes por sobre
- Los firmantes no están modelados como tabla propia todavía
- Actualmente DocuSign los recibe como configuración por tipo de contrato
- **Falta:** tabla `envelope_signers` con nombre, email, rol del firmante, documentos requeridos (INE, pasaporte, poder notarial), y estado de firma
- Esta tabla es necesaria tanto para contratos por template como para contratos abiertos

### 3.4 Trazabilidad por abogado
- El equipo legal quiere poder revisar el desempeño individual de cada abogado
- Ver todos los sobres que ha manejado, tiempos de respuesta, rechazos, correcciones solicitadas
- Sirve para tomar decisiones de contratación y redistribución de carga
- **Los datos ya existen** en `envelope_activity_logs` y `envelope_time_tracking` — falta una pantalla/reporte que filtre por abogado

---

## 4. Pendientes por resolver (próximos pasos)

### Backend
- [ ] Migración y modelo de tabla `envelope_signers`
- [ ] Endpoints para gestionar firmantes por sobre
- [ ] Integración DocuSign: envío del sobre, webhook de firma, recuperación de archivos a MinIO (`legal-envelopes`)
- [ ] Reporte SLA diario por correo (cron 11 AM)
- [ ] Endpoint de trazabilidad por abogado

### Frontend
- [ ] Formulario de nuevo sobre — flujo template (campos dinámicos + preview PDF)
- [ ] Flujo de contrato abierto — subir archivo + asignar firmantes
- [ ] Vista de detalle completa del sobre con trazabilidad
- [ ] Panel de firmantes dentro del sobre
- [ ] Vista de trazabilidad por abogado
- [ ] Panel KPIs para coordinador y director
- [ ] Submódulo de solicitud abierta
- [ ] Filtro por empresa en la tabla de sobres

### Bloqueantes del equipo legal
- Templates Word con campos resaltados en amarillo
- Listado definitivo de tipos de contrato
- Anexos obligatorios y opcionales por tipo
- Documentos a solicitar a firmantes (INE, pasaporte, poder notarial, etc.)
- SLA por tipo de contrato (solo NDA tiene 3 días definidos)
- Firmantes por defecto en DocuSign
- Definir nombre del remitente en DocuSign (Legal Corporativo vs empresa del cliente)

---

## 5. Fixes pendientes

### UI — tabla de sobres
- [ ] Los headers de la tabla (`FOLIO`, `TIPO`, etc.) aún no alinean perfectamente con los registros — pendiente ajuste fino de `table-fixed` con anchos en porcentaje
- [ ] El campo `EMPRESA` se agregó al header pero necesita verificación visual en todas las resoluciones
- [ ] Hover en filas — confirmar que se ve bien en pantallas brillantes (monitores de oficina)

### Datos
- [ ] El sobre de prueba `CONT-2026-0001` tiene folio viejo — al limpiar datos de prueba se normalizará a `ENV-`
- [ ] Los 15 sobres de prueba deben eliminarse cuando inicie operación real

### Técnicos
- [ ] Sincronizar archivos modificados directamente en servidor de vuelta al repo local (layout.tsx, ContractRequestsTable.tsx con todos los fixes)
- [ ] Hacer commit y push de los últimos cambios de UI al repo

---

## Notas rápidas de referencia

```bash
# Token de prueba
TOKEN=$(curl -k -s -X POST https://localhost/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@avalanz.com","password":"Admin@2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['access_token'])")

# Probar API
curl -k -s https://localhost/api/v1/legal/envelopes \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Ver logs
docker logs avalanz-legal --tail 30 -f

# Ver BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_legal -c "\dt"
```
