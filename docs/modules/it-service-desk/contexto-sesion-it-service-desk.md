# Contexto de sesión · Intranet Avalanz

**Actualizado:** 2 de octubre de 2026 · **Estado:** IT Service Desk en productivo

Documento para arrancar un chat nuevo con todo el contexto. Léelo completo antes de proponer cambios.

---

## 1. Quién y qué

- **Desarrollador líder:** Héctor Abraham Covarrubias Martínez (Administración ERP TOTVS · Grupo Avalanz). Matrícula 012185.
- **Proyecto:** Intranet Avalanz para Grupo Avalanz (AGIM, DYCE, SPPEL, Vanta Media, Corporativo, Todito, CNCI, Zignia).
- **Personas clave:** Edgar Ricardo Hortelales Ruiz (Project Manager), Renato Perrogon Hurtado (especialista), Andrés Hinojosa (sponsor).
- **Módulo principal en curso:** IT Service Desk (Incidentes, Control de Cambios y Solicitud de Accesos), en **productivo** desde el 1 de octubre de 2026.

---

## 2. Infraestructura

| Pieza | Valor |
|---|---|
| Servidor | `abcovarrubias@int-avz` · IP interna `10.12.0.51` · IP pública `200.23.37.225` |
| Dominio | `https://intranet.avalanz.com` (alcanzable desde internet) |
| Repositorio | `Abyblackmouth/intranet-avalanz` |
| Carpeta en el servidor | `~/intranet-avalanz` |
| Carpeta en la laptop | `~/code/avalanz/intranet-avalanz` |
| Stack | Next.js 16 · FastAPI · PostgreSQL · Docker Compose · Nginx · RabbitMQ · MinIO · Gotenberg · Prometheus/Grafana |
| Frontend | PM2, proceso `intranet-frontend` (id 1 desde el reinicio del 2 oct 2026) · despliegue: `~/intranet-avalanz/frontend/deploy-frontend.sh` (solo reinicia si compila) |
| Bases de datos | `avalanz_it_service_desk`, `avalanz_admin`, `avalanz_notify`, `avalanz_legal`… (usuario `avalanz_user`, contenedor `avalanz-postgres`) |
| Contenedores clave | `avalanz-it-service-desk`, `avalanz-admin`, `avalanz-email`, `avalanz-legal`, `avalanz-gotenberg`, `avalanz-nginx`, `avalanz-postgres` |
| Herramientas de administración | `~/intranet-avalanz/utilerias/` — **fuera de Git** (ignorada en `.git/info/exclude`), permisos 700. Contiene `limpieza-it-service-desk.py` (borra **todos** los tickets; simula por defecto, `--execute` pide la frase `BORRAR TICKETS DE PRUEBA`) |
| Respaldos | `~/respaldos/` (dumps `pg_dump -Fc`) |

---

## 3. Reglas de trabajo (importantes)

### Git
- Rama base: **`develop`**. Laptop, servidor y GitHub se mantienen sincronizados.
- **Antes de tocar archivos, crear o confirmar la rama.**
- **`feature/…`**: funcionalidades nuevas; **se conservan** después de integrarse.
- **`fix/…`**: correcciones; **se borran** (local y remota) después de integrarse a develop.
- Integración con `git merge --no-ff`. Mensajes de commit en inglés, con cuerpo explicativo.
- **Nunca** subir `.env` ni llaves `.pem`. Después de cada commit, verificar: `git show --name-only --pretty="" HEAD | grep "\.env"` debe salir vacío.

### Forma de trabajar
- Bloques enfocados, con **confirmación en cada paso**. Primero diagnóstico de solo lectura, luego el cambio.
- Héctor revisa **en el navegador**, no solo el código. Pide capturas cuando hay dudas visuales.
- Respuestas en **español**, claras, con el **por qué**. Las decisiones confirmadas se tratan como cerradas.
- Respaldar con `cp` a `/tmp/` antes de editar; los parches con Python verifican que el texto a reemplazar exista **exactamente una vez** (`assert s.count(old) == 1`).

### Despliegue seguro del backend (obligatorio)
```bash
cd ~/intranet-avalanz/infrastructure/docker
docker compose build it-service-desk-service
if docker compose run --rm --no-deps --entrypoint python it-service-desk-service -c "from app.main import app; print('ARRANCA BIEN')" 2>&1 | grep -q "ARRANCA BIEN"; then
  docker compose up -d --force-recreate it-service-desk-service; sleep 12
  docker inspect -f '{{.State.Status}} · reinicios: {{.RestartCount}}' avalanz-it-service-desk
  docker exec avalanz-nginx nginx -s reload
else
  echo "✖ No arranca: el servicio que corre NO se tocó"   # y regresar los respaldos
fi
```
Si hay migraciones: `docker exec avalanz-it-service-desk alembic upgrade head`.

### Lecciones aprendidas (no repetir)
1. **Python 3.11 en el contenedor:** no anidar comillas dobles dentro de un f-string con comillas dobles (el host tiene 3.12 y lo acepta; el contenedor no). Usar constantes (`TZ_MTY`) o concatenación.
2. **`config.py` no acepta variables desconocidas:** toda variable nueva del `.env` se declara también en `config.py`, o el servicio no arranca (`Extra inputs are not permitted`).
3. **El `.env` se copia dentro de la imagen:** tras cambiarlo, **reconstruir** (no solo recrear).
4. **Probar con `docker compose run`**, no con `docker run` montando solo `app/`: este último no ve el `.env` ni el compose.
5. **Rutas duplicadas:** FastAPI usa la primera registrada. Antes de agregar una ruta, buscar si ya existe otra con la misma dirección (pasó con `PATCH /incidencias/{id}/severidad`).
6. **Las verificaciones de "ya aplicado"** deben buscar la **función** (`async def nombre(`), no un texto que pueda aparecer en otro lado.
7. **`await db.refresh(obj)` entre el `commit` y el broadcast**, o la pantalla no se actualiza en vivo.
8. **Zona horaria:** los contenedores corren en UTC; toda hora que se **muestra** se convierte a `America/Monterrey`. La base guarda en UTC.
9. **`KanbanBoard.tsx` no se toca** sin extremo cuidado; el Tablero Proyectos es un componente aparte (`CdcKanbanBoard.tsx`).
10. **Después de un despliegue del frontend**, las pestañas abiertas pueden mostrar "This page couldn't load" (`Failed to find Server Action`): basta con recargar. Desplegar fuera de horario cuando se pueda.
11. **Responsivo:** los ajustes para laptops van con el prefijo `max-[1440px]:`; nunca fijar anchos que afecten a las pantallas grandes.
12. **Documentación:** al actualizar un documento existente, **no condensar**: conservar todo lo vigente y sumar lo nuevo.

---

## 4. IT Service Desk — estado actual

Documentación completa en `docs/modules/it-service-desk/`:
- `it-service-desk-service.md` — guía de referencia (al día, octubre 2026)
- `it-service-desk-motor-asignacion.md`, `it-service-desk-roles-y-perfiles.md`, `it-service-desk-base-de-datos.md` — **pendientes de actualizar** con lo de septiembre-octubre
- `it-service-desk-control-accesos-docusign.md`, `it-service-desk-control-accesos-firma-manual.md` — nuevos

### En productivo
- **Incidentes:** tabla, Kanban, tiempo real, SLA en horas hábiles con relojes **R** (respuesta) y **S** (resolución), marca de revisión (enlace del correo o botón), cambio de severidad con recálculo y aviso, varias imágenes con pegado (Ctrl + V), impresión, Excel.
- **Control de Cambios:** ciclo completo de 12 etapas, Tablero Proyectos, Excel "Seguimiento CC".
- **Solicitud de Accesos:** formulario de 7 etapas, ticket `ACC`, revisión de TI (aprobar/rechazar), firma con **DocuSign** (probada de punta a punta en el ambiente de pruebas), contraseña temporal, expediente del empleado (`ALTA|MOD_{FORMATO}_{MATRICULA}_{FOLIO}_{FECHA}.pdf`).
- **Firma manual** (liga + hoja de "Liberación de TI" con firma guardada y huella SHA-256): **implementada, sin probar de punta a punta**.

### SLA
| Severidad | Respuesta | Resolución | Horas |
|---|---|---|---|
| S1 | 30 min | 5 h | Naturales |
| S2 | 45 min | 8 h | Hábiles |
| S3 | 2 h | 24 h | Hábiles |
| S4 | 4 h | 50 h | Hábiles |

Hábiles: L-V 9:00-19:00 hora de Monterrey, sin 1 ene, 16 sep, 25 dic. Cálculo único en `app/services/sla.py`. Editable en Actualizaciones → SLA.

### Roles (qué tickets ven)
| Rol | Ve |
|---|---|
| Incident Manager, Project Manager, Especialistas, Comité Directivo, Auditoría | Todos |
| **Técnico** (consultores externos) | Solo los asignados a él y los que levante |
| Jefe Empresa | Los de su empresa |
| Solicitante (acceso sin rol) | Solo los suyos |

- El **motor** asigna también a los **técnicos ligados** en el catálogo (desde octubre).
- **Bloqueado ≠ baja:** los bloqueados siguen recibiendo tickets; solo se excluyen las bajas (inactivos).
- Actualizaciones: Incident Manager y super admin. Ajustes: solo super admin.

### Usuarios
- **Alta masiva** en Administración → Usuarios → Alta masiva (revisión antes de crear, correos escalonados, reporte).
- Se dieron de alta **11 técnicos externos** (TOTVS ×7, Detecno ×2, CEM Odoo DYCE ×1, Exertus ×1), empresa AVALANZ, rol `Tecnico`, departamento = proveedor. Andrés Hernández está ligado a TOTVS · Stock (equipo técnico).
- Algunos consultores no podían entrar por el **proxy de su propia empresa**; se les mandó un correo para que su TI permita `intranet.avalanz.com` (IP 200.23.37.225, puerto 443).

### Datos
- Los tickets de prueba **se limpiaron** (dos veces); los folios arrancan en **000001**. Catálogos, usuarios, formatos y ajustes intactos.

### Configuración clave
- DocuSign apunta al **ambiente de pruebas** (`demo.docusign.net`). Ajustes: `acc.metodo_firma = docusign`, `acc.docusign_ambiente = pruebas`.
- La firma de TI **no está subida** (solo hace falta para la firma manual).
- Tarea programada: consulta de DocuSign cada 5 min (crontab del host).

---

## 5. Pendientes (en orden sugerido)

### Inmediatos
1. **Ligar a los 11 técnicos** a sus sistemas en IT Service Desk → Actualizaciones → Catálogo (cada uno en el equipo que atiende; si atiende ambos tipos, ligarlo en los dos).
2. **Actualizar los otros 3 documentos** (motor, roles y perfiles, base de datos), completos, sin condensar.
3. **Probar la firma manual** de punta a punta (subir la firma de TI, aprobar con `manual`, subir escaneo desde incógnito, liberar).

### Pantalla
4. **Dashboard de métricas** y demás pantallas con el criterio responsivo de 13" (`max-[1440px]:`).
5. **Aviso de versión nueva** ("Hay una versión nueva: recarga la página") para evitar el mensaje en inglés tras desplegar.

### Seguridad
6. Proteger la consulta interna de DocuSign de **Legal** (`/legal/envelopes/internal/docusign-poll`), hoy llamable desde internet.
7. Revisar qué buscan los robots que escanean la intranet (`docker logs avalanz-nginx`).

### Producción de DocuSign
8. Credenciales de la cuenta de **producción** (`DOCUSIGN_*` en el `.env` del IT Service Desk, declaradas en `config.py`) y `acc.docusign_ambiente = produccion`.

### Roles y usuarios
9. Confirmar el alcance de **Auditoría** (hoy ve todo el contenido).
10. Corregir la descripción de **Jefe Empresa** (dice que dictamina CDC; ya no).
11. **Bajas** con fecha y motivo ("Dar de baja" en lugar de "Desactivar"); marca de "Bloqueado" en los buscadores.
12. Lista de usuarios: mostrar los accesos con su módulo (los solicitantes aparecen como "Sin rol").

### Control de accesos
13. Reenviar la liga de la firma manual si vence.
14. Formato **Detecno** (`formatos/detecno/`).
15. ABC de accesos: **baja** de accesos.

### Heredados
16. Logo en el PDF del CDC (`app/services/logo.py` → `control_cambios.py`).
17. RCA (captura y recordatorio).
18. CDC: guardado automático en dictamen y priorización, catálogo "Quién lo desarrolla", ventana de instalación, ajuste de alcance, cancelación, responsable por RT.
19. Paneles "No data" en Grafana; tokens de sesión en logs de Nginx; restablecimiento de contraseña siempre envía correo.
20. Unificar la zona horaria de los contenedores a `America/Monterrey` (después de revisar todo `datetime` sin zona).
21. Comentario `# Legal Service` sobre el bloque del IT Service Desk en `intranet.conf`.

---

## 6. Comandos útiles

```bash
# Estado general
docker ps --format '{{.Names}}\t{{.Status}}' | grep avalanz
pm2 list | grep intranet-frontend
docker exec avalanz-it-service-desk alembic current          # head: b7a1c3e9d2f4

# Frontend
~/intranet-avalanz/frontend/deploy-frontend.sh

# Logs
docker logs avalanz-it-service-desk --since 10m 2>&1 | grep -v /metrics | tail -30
pm2 logs intranet-frontend --lines 30 --nostream

# DocuSign
docker exec avalanz-it-service-desk python -c "import asyncio; from app.services.control_accesos.firma import docusign as ds; asyncio.run(ds.token()); print('TOKEN OK')"
docker exec avalanz-it-service-desk python -c "import httpx; print(httpx.post('http://127.0.0.1:8000/api/v1/it-service-desk/control-accesos/internal/docusign-poll', timeout=120).json())"

# Respaldo
cd ~/respaldos && F=$(date +%Y%m%d_%H%M) && for db in avalanz_it_service_desk avalanz_admin; do docker exec avalanz-postgres pg_dump -U avalanz_user -Fc $db > ${db}_$F.dump; done

# Simular el motor (no crea nada)
docker exec avalanz-it-service-desk python -c "
import asyncio
from sqlalchemy import select
from app.database import get_db
from app.models.mesa_de_soporte import TicketSystem, TicketModule
from app.motor import resolve_assignment
async def main():
    async for db in get_db():
        s = (await db.execute(select(TicketSystem).where(TicketSystem.name == 'TOTVS'))).scalar_one()
        m = (await db.execute(select(TicketModule).where(TicketModule.system_id == s.id, TicketModule.name.ilike('stock')))).scalar_one()
        print(await resolve_assignment(db, s.id, m.id, 'tecnico')); break
asyncio.run(main())"
```

---

## 7. Cómo arrancar el chat nuevo

1. Subir este archivo al proyecto (reemplazando el `contexto-sesion.md` anterior) y, si se va a trabajar sobre ellos, los documentos de `docs/modules/it-service-desk/`.
2. Primer mensaje sugerido: *"Lee contexto-sesion.md. Vamos a seguir con [pendiente]."*
3. Antes de cualquier cambio: confirmar la rama (`git branch --show-current`) y que `git status --short` esté vacío.
