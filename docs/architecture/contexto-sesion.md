Contexto de Sesión — Intranet Avalanz
Este archivo debe ser lo primero que lea el asistente al iniciar un nuevo chat.
Antes de continuar el trabajo, el asistente debe leer las siguientes guías en orden:
 
docs/architecture/contexto-sesion.md (este archivo)
docs/Acta_Constitucion / Alcance / Resumen_Ejecutivo (documentos de proyecto)
docs/architecture/politica-roles-permisos.md
docs/architecture/shared.md
docs/architecture/auth-service.md
docs/architecture/admin-service.md
docs/architecture/frontend.md
docs/architecture/notify-service.md
docs/architecture/websocket-service.md
docs/architecture/monitoring.md
docs/architecture/modulos-submodulos.md
docs/architecture/docker-levantamiento.md
docs/architecture/upload-service.md
docs/architecture/minio.md
La guía específica del módulo en el que se va a trabajar
 
 
Reglas de trabajo
Estas reglas aplican en cada sesión de chat sin excepción.
Código completo — todo archivo nuevo se entrega como artefacto descargable. Ajustes y cambios puntuales se entregan con el comando cat directo en terminal.
Lectura de archivos — siempre con grep o sed, nunca cat en el chat (rompe el heredoc).
Archivos de Windows a Linux — después de cada descarga dar el comando PowerShell con ruta UNC:
powershell$src = if (Test-Path "$env:USERPROFILE\Downloads\archivo (1).ext") { "$env:USERPROFILE\Downloads\archivo (1).ext" } else { "$env:USERPROFILE\Downloads\archivo.ext" }
Copy-Item $src "\\wsl$\Ubuntu\home\abyblackmouth\code\avalanz\intranet-avalanz\ruta\destino"
Git — una rama por feature. Push y merge a develop solo cuando se confirma que el entregable está completo. Nunca push en medio de una feature.
Guías — al cerrar cada rama revisar todas las guías relevantes, ajustar lo que cambió y agregar lo nuevo. La guía debe leerse como si siempre hubiera sido así — sin mencionar cambios ni movimientos.
Nota importante: En las guias no se debe omitir nada se puede ajustar el texto al concepto actual pero jamas omitir nada porque ese es el trabajo que se a realizado y no se debe de perder.
contexto-sesion.md — solo se actualiza cuando se está perdiendo contexto y hay que cambiar de chat. No se actualiza al final de cada rama.
Comentarios en código — solo comentarios que expliquen qué hace el código. Nunca comentarios que describan refactorizaciones, movimientos o cambios realizados.
Inicio de sesión nueva — el flujo es siempre este orden:
 
El usuario pega el contenido de contexto-sesion.md
El usuario carga los archivos: Alcance, Resumen Técnico y Acta de Constitución
Claude pide la estructura del proyecto con un comando Ubuntu y espera a que el usuario la pegue
El usuario carga todos los archivos .md de docs/architecture/
Claude lee todos los .md cargados y da un resumen breve de cada uno para confirmar que los leyó
Solo después de todo esto se puede continuar trabajando
 
Para archivos grandes — escribir directamente con cat en WSL en lugar de descargar desde artefacto, ya que los artefactos a veces se guardan como duplicados con (1) en el nombre.
Backend modificado — siempre copiar el archivo al contenedor con docker cp y reiniciar el servicio después de cada cambio.
 
Estado actual del proyecto
Rama activa: develop
Última actividad: 2026-04-20
 
Módulos completados
Autenticación
 
Login con 2FA condicional por red (corporativa = sin 2FA, externa = con 2FA)
Cambio de contraseña temporal en primer login con verificación de is_temp_password antes de mostrar formulario
Configuración y verificación de TOTP (Microsoft Authenticator) con QR via api.qrserver.com
Recuperación de contraseña con token de un solo uso — is_used=True tras confirmación
Endpoint GET /api/v1/auth/password-reset/validate?token=xxx valida token sin consumirlo
Página reset-password verifica token al cargar — muestra "Enlace expirado" inmediatamente si no es válido
Bloqueo automático por intentos fallidos (MAX_FAILED_ATTEMPTS = 3)
Bloqueo manual por administrador
lock_type diferencia bloqueo manual vs intentos fallidos
Refresh automático de JWT en el frontend
AuthProvider verifica is_temp_password y redirige a /change-password si aplica
Link de cambio de contraseña verifica is_temp_password via /internal/users/{id}/info
clearSession en setup-2fa limpia tokens antes de redirigir al login
Fetch en páginas auth usa process.env.NEXT_PUBLIC_API_URL como prefijo
 
Panel de administración
 
Usuarios — tabla completa, alta, edición (incluyendo cambio de empresa para super_admin), detalle, bloqueo/desbloqueo, reset contraseña, revocar sesiones (individual y todas), eliminar, badge Protegido
Empresas — tarjetas por grupo, alta manual y desde constancia SAT, edición con carga de constancia SAT, detalle, eliminar
Grupos — tarjetas con stats, CRUD, panel detalle
Módulos y submódulos — CRUD, íconos Lucide con popover flotante y búsqueda, scaffold automático, sidebar dinámico
Roles — roles globales y operativos con scope, CRUD completo
Permisos — permisos globales por categoría, permisos por submódulo en árbol, CRUD completo
 
Archivos de empleados (feature/upload-service)
 
upload-service configurado con bucket dirdoc en MinIO
Estructura de archivos: dirdoc/{company_slug}/{module_slug}/{submodule_slug}/
Archivos de empleados: dirdoc/admin/employees/documents/user_{matricula}_{company}_{folio}.{ext}
Tablas user_files y user_file_audit_log en admin-service con trazabilidad completa
Tab Documentos en UserDetail — subir, descargar (URL firmada 15 min), eliminar (soft delete)
Acceso rápido desde menú de 3 puntos → opción Documentos
Validación de tipo y tamaño en frontend antes de enviar
Auditoría de uploaded, downloaded, deleted con nombre, rol, IP y user agent del ejecutor
URLs firmadas temporales (15 min) para descarga segura desde MinIO
 
Reportes de usuarios (feature/user-report)
 
Botón Exportar Excel en página de usuarios — genera concentrado_usuarios_YYYY-MM-DD.xlsx
Columnas: Matrícula, Nombre, Email, Puesto, Departamento, Empresa, Roles (separados por |), Estado, 2FA, Último acceso, Fecha creación
Excluye usuario protegido del reporte
Filtro de bloqueados funcional — columna cache is_locked en tabla users del admin-service
is_locked se sincroniza automáticamente al bloquear/desbloquear desde el panel
Filtro de estado activos excluye usuarios bloqueados correctamente
 
Reporte de auditoría PDF por usuario (feature/user-audit-report)
 
Reporte PDF profesional generado desde menú de 3 puntos → Reporte de auditoría
Página 1: Información general, empresa (nombre comercial, razón social, RFC), matrícula, puesto, departamento, 2FA, roles globales, módulos y submódulos asignados
Página 2: Historial de sesiones activas, historial de accesos con stats (total, exitosos, fallidos, red corporativa), dispositivo/navegador parseado, columna 2FA sesión
Página 3: Archivos del expediente, nota de módulos operativos pendientes
Super admin muestra "Acceso total a todos los módulos" en lugar de tabla vacía
jsPDF 2.5.1 + jspdf-autotable 3.8.2 (versiones compatibles con Turbopack)
 
Sistema de notificaciones en tiempo real
 
notify-service + websocket-service + frontend (campana, panel, toasts)
Hook useWebSocket con reconexión automática cada 5s y heartbeat cada 30s
Revocar sesiones desde UserDetail revoca sesión individual via endpoint interno
Revocar todas las sesiones desde menú de 3 puntos envía correo de notificación al usuario
 
Monitoreo
 
Prometheus + Grafana — métricas de los 6 servicios FastAPI
Nginx 80, Grafana 3001, Prometheus 9090
Alertas configuradas en Grafana: servicio caído, latencia alta, errores 5xx, RAM alta
Notificación por correo via Mailpit en desarrollo (reemplazar con SMTP corporativo en producción)
 
Backups automáticos
 
Script backup_postgres.sh en el cron — respaldo diario a la 1:00 AM
Respalda las 3 BDs: avalanz_auth, avalanz_admin, avalanz_notify
Archivos .sql.gz por BD con fecha en el nombre
Retención de 30 días — elimina automáticamente backups antiguos
Volumen cron-backups:/backups persiste los archivos
 
Infraestructura
 
Cron de limpieza con CSV backup
Mailpit para correos en desarrollo
Scaffold automático de módulos
MinIO con consola en 9001 — bucket dirdoc para gobernanza de archivos
PostgreSQL expuesto en 5432 para DBeaver
CORS configurado en Nginx para desarrollo local (localhost:3000)
 
 
UI/UX — Mergeado a develop
 
feature/ui-login — animaciones, logo, inputs, flujos completos
feature/ui-sidebar-header — sidebar compacto, Jakarta Sans, header armonizado
feature/ui-usertable — avatares por hash, paginación 10 registros, altura fija 629px
feature/ui-email-templates — plantillas Avalanz, validación token al cargar, fixes de flujo
feature/ui-modals — selector de íconos con popover flotante y búsqueda en módulos
 
Pendiente: hover en módulos del sidebar (bug Tailwind v4), dashboard principal (V2)
 
Convenciones de UI
 
Azul corporativo: #1a4fa0
Verde Excel: emerald-600
Cards: border border-slate-200 shadow-sm hover:shadow-md hover:border-[#1a4fa0]/30 hover:-translate-y-0.5 transition-all duration-200
Inputs admin: border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 bg-white outline-none hover:border-slate-300 focus:border-[#1a4fa0] focus:ring-2 focus:ring-[#1a4fa0]/10 transition-all duration-150
Sidebar: border-r-2 border-slate-300, w-60 / w-16 colapsado
Header: border-b-2 border-slate-300
Fuente títulos: Plus Jakarta Sans via var(--font-jakarta)
PageWrapper: sin fondo blanco — integrado con bg-slate-50
Avatares: 6 colores por hash — #1a4fa0, violet-500, teal-500, orange-400, rose-500, emerald-500
Badges: pill con punto — emerald para activo, red para inactivo/bloqueado
Menús flotantes: menuHeight = 280 para detección de espacio
Componentes: AdminInput y AdminCard en components/shared/
Hovers en menú de 3 puntos: hover:bg-slate-300 para normales, hover:bg-red-200 para destructivos
 
 
Modelo de roles
 
Roles globales: super_admin y admin_empresa
Roles operativos: catálogo con scope y module_id nullable
JWT incluye cross_company: true para super_admin y scope corporativo
 
 
Correos implementados
EventoEstadoBienvenida al crear usuarioActivoReset de contraseña por adminActivoCuenta bloqueada por intentos fallidosActivoRecuperación de contraseñaActivoSesión revocada remotamenteActivoBloqueo manual por administradorNo aplica — decisión de negocio
 
Próximos pasos
 
Infraestructura de producción (cuando esté disponible el servidor):
Servidor Linux con IP fija
NAS para backups externos
HTTPS / certificado autofirmado o corporativo
Deploy y configuración de variables de producción
 
V2 — Desarrollo:
Primer módulo operativo — Bóveda DYCE o Legal
Dashboard de métricas (resolver CORS primero)
Motor de workflows
Módulo de configuración SMTP
 
 
Notas técnicas importantes
 
CORPORATE_IP_RANGES formato JSON: ["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]
URL servicios internos siempre con puerto: http://admin-service:8000/...
dcron no funciona en WSL2 — cron usa loop con sleep 60
Hydration: Zustand protegido con mounted &&
PROTECTED_SUPER_ADMIN_EMAIL = "admin@avalanz.com"
Roles globales usan role_id (no id) en respuesta del API
IP WSL2 puede cambiar — verificar con ip addr show eth0
NEXT_PUBLIC_WS_URL = ws://172.20.92.197/ws
NEXT_PUBLIC_API_URL = http://172.20.92.197
Mailpit: http://localhost:8025 / mailpit:1025
Grafana: http://localhost:3001 — admin / Avalanz2026!
Prometheus: http://localhost:9090
MAX_FAILED_ATTEMPTS = 3
FERNET_KEY en auth-service config.py y .env
internal_router con prefix /api/v1/auth en auth-service/main.py
admin-service llama auth-service: http://auth-service:8000/api/v1/auth/internal/...
Fetch en páginas auth usa process.env.NEXT_PUBLIC_API_URL
Scaffold server en puerto 3002
Clave módulos: TF9DX4-2JAQSJ-61FVM6-0QB1AK
MinIO consola: http://localhost:9001 — minioadmin / Avalanz2026!
MinIO bucket principal: dirdoc — todos los archivos de la plataforma
SIGNED_URL_HOST en upload-service .env debe apuntar al host público en producción
is_locked en tabla users del admin-service es columna cache — se sincroniza al bloquear/desbloquear desde el panel. Si se bloquea directo en auth-service hay que sincronizar manualmente
Los archivos del auth-service se pierden al recrear el contenedor — siempre copiar:
 
bash  docker cp backend/auth-service/app/services/auth_service.py avalanz-auth:/app/app/services/auth_service.py
  docker cp backend/auth-service/app/services/twofa_service.py avalanz-auth:/app/app/services/twofa_service.py
  docker cp backend/auth-service/app/config.py avalanz-auth:/app/app/config.py
  docker cp backend/auth-service/app/routes/internal.py avalanz-auth:/app/app/routes/internal.py
  docker cp backend/auth-service/app/routes/auth.py avalanz-auth:/app/app/routes/auth.py
  docker cp backend/auth-service/app/main.py avalanz-auth:/app/app/main.py
  docker restart avalanz-auth
 
jsPDF versiones compatibles con Turbopack: jspdf@2.5.1 + jspdf-autotable@3.8.2
recharts instalado en frontend para gráficas
Grafana SMTP configurado via variables de entorno en docker-compose (GF_SMTP_*)
Backups PostgreSQL: cron ejecuta backup_postgres.sh diario a la 1:00 AM, archivos en volumen cron-backups:/backups/postgres/

Servicios Docker
ContenedorPuerto externoDescripciónavalanz-nginx80API Gatewayavalanz-auth—Auth Service :8000avalanz-admin—Admin Service :8000avalanz-upload—Upload Service :8000avalanz-notify—Notify Service :8000avalanz-websocket—WebSocket Service :8000avalanz-email—Email Service :8000avalanz-postgres5432PostgreSQLavalanz-redis6379Redisavalanz-rabbitmq5672/15692RabbitMQavalanz-minio9000/9001MinIOavalanz-prometheus9090Prometheusavalanz-grafana3001Grafanaavalanz-cron—Limpieza históricos y backups PostgreSQLmailpit8025/1025Correos desarrollo
