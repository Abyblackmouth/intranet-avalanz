# Contexto de Sesión — Intranet Avalanz

Este archivo se actualiza al final de cada sesión de trabajo para mantener continuidad entre chats.

---

## Estado actual del proyecto

**Rama activa:** `feature/admin-users`
**Última actividad:** 2026-04-03

---

## Lo que está funcionando

- Login completo con 2FA condicional por red
- Sidebar, Header sin errores de hidratación
- Panel admin — módulo de usuarios completo:
  - Tabla con empresa, rol, 2FA, estado, última conexión
  - Formulario de alta en drawer lateral con todos los campos
  - Modal de detalle con 3 pestañas: info, sesiones activas, historial de login
  - Menú de 3 puntos con dropdown posicionado con `fixed` (no se esconde)
- Cron de limpieza diaria de login_history y user_sessions con respaldo CSV
- Alembic configurado en admin-service con migraciones versionadas
- Endpoints internos en auth-service: info, batch-info, sessions, login-history
- Nginx con rutas de companies y groups agregadas

---

## Lo que sigue pendiente en feature/admin-users

- Acciones del menú de 3 puntos conectadas al backend:
  - Editar usuario (modal con form precargado)
  - Bloquear / Desbloquear
  - Resetear contraseña
  - Revocar todas las sesiones
  - Eliminar usuario
- Módulos y permisos del usuario en el modal de detalle (dejado para cuando se trabaje el tema de módulos)

---

## Próximos módulos admin pendientes

- Empresas (CRUD)
- Grupos (CRUD)
- Módulos y submódulos
- Roles y permisos

---

## Convenciones importantes

- Siempre pedir artefactos completos, no parciales
- Rutas siempre antes del artefacto
- Comandos de copia siempre en PowerShell (la carpeta Downloads de Windows no es accesible desde WSL)
- Sin usar emojis a menos que el usuario los use primero
- Guías van a `docs/architecture/`
- Al modificar archivos existentes del backend copiar al contenedor y reiniciar el servicio

---

## Notas técnicas importantes

- `CORPORATE_IP_RANGES` en auth-service debe ser formato JSON: `["192.168.0.0/16","10.0.0.0/8","172.16.0.0/12","127.0.0.1/32"]`
- URL del admin-service en auth_service.py debe incluir puerto: `http://admin-service:8000/...`
- `dcron` no funciona en WSL2 — el cron usa loop con `sleep 60`
- Hydration errors: todo lo que dependa de Zustand (roles, usuario) debe estar protegido con `mounted &&`
- IP de WSL2 puede cambiar — si el login falla verificar `NEXT_PUBLIC_API_URL` en `frontend/.env.local`

---

## Estructura de servicios

| Contenedor | Puerto interno | Descripción |
|---|---|---|
| avalanz-nginx | 80 | API Gateway |
| avalanz-auth | 8000 | Auth Service |
| avalanz-admin | 8000 | Admin Service |
| avalanz-upload | 8000 | Upload Service |
| avalanz-notify | 8000 | Notify Service |
| avalanz-websocket | 8000 | WebSocket Service |
| avalanz-email | 8000 | Email Service |
| avalanz-postgres | 5432 | PostgreSQL |
| avalanz-redis | 6379 | Redis |
| avalanz-cron | — | Limpieza de historicos |
