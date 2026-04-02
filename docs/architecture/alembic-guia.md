# Alembic — Guía de Referencia

Ubicación de archivos: `backend/admin-service/`

---

## ¿Qué es Alembic?

Alembic es la herramienta de migraciones de base de datos para SQLAlchemy. Funciona como un **control de versiones para tu esquema de BD** — cada vez que agregas, modificas o eliminas columnas/tablas, Alembic genera un archivo Python que describe ese cambio y lo aplica a la BD de forma controlada.

Sin Alembic: modificas el modelo → borras y recreas la BD → pierdes datos.
Con Alembic: modificas el modelo → generas migración → aplicas migración → datos intactos.

---

## Estructura de archivos

```
backend/admin-service/
├── alembic.ini                          → Configuración principal de Alembic
├── migrations/
│   ├── env.py                           → Configuración del entorno de migración
│   ├── script.py.mako                   → Template para generar archivos de migración
│   └── versions/
│       ├── 152e0764c443_initial_schema.py   → Migración 1: estado inicial de la BD
│       └── xxxx_add_campos_usuario.py       → Migración 2: campos nuevos (próxima)
```

### alembic.ini
Archivo de configuración principal. Define dónde está la carpeta de migraciones (`script_location = migrations`). La URL de la BD se ignora porque se sobreescribe desde variables de entorno en `env.py`.

### migrations/env.py
El cerebro de Alembic. Hace tres cosas:
- Importa todos los modelos SQLAlchemy para que Alembic los conozca
- Lee las variables de entorno para construir la URL de conexión a la BD
- Ejecuta las migraciones en modo online (conectado a la BD) u offline (genera SQL puro)

### migrations/script.py.mako
Template Mako que se usa para generar cada archivo de migración. No se modifica manualmente.

### migrations/versions/
Carpeta donde viven todas las migraciones. Cada archivo tiene:
- Un ID único (hash) — ej: `152e0764c443`
- Una referencia a la migración anterior (`down_revision`) — así forman una cadena
- Función `upgrade()` — qué hacer al aplicar la migración
- Función `downgrade()` — cómo revertirla

---

## Flujo de trabajo

### Cuando agregas o modificas campos en un modelo:

```
1. Modificar el modelo en admin_models.py
        |
2. Copiar el modelo al contenedor
        |
3. Generar la migración (autogenerate compara modelo vs BD)
        |
4. Aplicar la migración a la BD
```

---

## Comandos esenciales

Todos los comandos se ejecutan dentro del contenedor:

### Generar una migración nueva
```bash
docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'descripcion del cambio'"
```
Compara el modelo actual con el estado de la BD y genera un archivo en `versions/` con los cambios detectados.

### Aplicar migraciones pendientes
```bash
docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"
```
Aplica todas las migraciones que aún no se han ejecutado en la BD. `head` significa "hasta la más reciente".

### Ver el estado actual
```bash
docker exec avalanz-admin bash -c "cd /app && alembic current"
```
Muestra en qué versión está la BD actualmente.

### Ver historial de migraciones
```bash
docker exec avalanz-admin bash -c "cd /app && alembic history"
```
Lista todas las migraciones en orden.

### Revertir la última migración
```bash
docker exec avalanz-admin bash -c "cd /app && alembic downgrade -1"
```
Deshace la última migración aplicada. Útil si algo salió mal.

### Revertir hasta una versión específica
```bash
docker exec avalanz-admin bash -c "cd /app && alembic downgrade 152e0764c443"
```

---

## Flujo completo para agregar campos nuevos

Este es el flujo que seguimos para agregar `matricula`, `puesto` y `departamento`:

```bash
# 1. Modificar admin_models.py localmente
# 2. Copiar al contenedor
docker cp backend/admin-service/app/models/admin_models.py avalanz-admin:/app/app/models/admin_models.py

# 3. Generar la migración
docker exec avalanz-admin bash -c "cd /app && alembic revision --autogenerate -m 'add matricula puesto departamento to users'"

# 4. Copiar el archivo generado de vuelta al proyecto local
docker cp avalanz-admin:/app/migrations/versions/ backend/admin-service/migrations/

# 5. Aplicar la migración
docker exec avalanz-admin bash -c "cd /app && alembic upgrade head"

# 6. Verificar que los campos quedaron en la BD
docker exec avalanz-postgres psql -U avalanz_user -d avalanz_admin -c "\d users"
```

---

## Importante: sincronizar archivos locales

Cuando generas una migración dentro del contenedor, el archivo queda SOLO en el contenedor. Hay que copiarlo al proyecto local para que quede en git:

```bash
docker cp avalanz-admin:/app/migrations/versions/ ~/code/avalanz/intranet-avalanz/backend/admin-service/migrations/
```

---

## Regla de oro

**Nunca modifiques manualmente los archivos de `versions/`.** Deja que Alembic los genere con `--autogenerate`. Si el autogenerate no detecta algo correctamente, revisa que todos los modelos estén importados en `env.py`.