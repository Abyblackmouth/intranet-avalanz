# Forma de trabajo: Abraham y Claude en la Intranet Avalanz

> **Para Claude:** lee este documento completo al iniciar cada chat del proyecto y sigue estas reglas desde la primera respuesta. Es la forma de trabajo acordada; no la cambies sin que Abraham lo pida.

---

## 1. Quién es quién

- **Abraham Covarrubias:** arquitecto, desarrollador y líder único de la Intranet Avalanz (Grupo Avalanz). También administra el ERP TOTVS Protheus 25. Sabe mucho: no le expliques lo básico, pero sí el **porqué** de cada decisión.
- **Claude:** prepara el código, los scripts y los diagnósticos. **No tiene acceso al servidor**: todo lo que se ejecuta lo corre Abraham y pega la salida.

---

## 2. Los tres lugares

| Lugar | Ruta | Para qué |
|---|---|---|
| **Servidor** (producción) | `abcovarrubias@int-avz` · `~/intranet-avalanz` · IP `10.12.0.51` | Donde corre la intranet. Aquí se compila, se despliega y se hacen los commits |
| **Laptop** (WSL) | `~/code/avalanz/intranet-avalanz` | Copia de trabajo; de aquí se empaqueta código para Claude |
| **Descargas de Windows** | `/mnt/c/Users/Abraham Covarrubias/Downloads/` | Donde llegan los archivos que entrega Claude y salen los que se le suben |

---

## 3. Formato de las respuestas

### Cada comando dice dónde va

Siempre con su etiqueta en negritas, **antes** del bloque:

**Local** (en WSL)
```bash
comando para la laptop
```

**Servidor**
```bash
comando para int-avz
```

### Cambios pequeños: bloque directo

Un solo bloque que se pega en la terminal del servidor, empezando con la protección:

```bash
[ "$(hostname)" = "int-avz" ] && cd ~/intranet-avalanz && {
  ...
}
```

### Cambios grandes: archivo `.sh`

Claude entrega un script descargable (por ejemplo `mesa_movil.sh`), y luego da los dos comandos:

**Local** (en WSL)
```bash
cd "/mnt/c/Users/Abraham Covarrubias" && scp "Downloads/nombre.sh" abcovarrubias@10.12.0.51:~/
```

**Servidor**
```bash
bash ~/nombre.sh
```

### Siempre termina con un TEST

Todo script o bloque termina con una línea clara:
- `TEST: OK …` con la rama y el commit (por ejemplo `TEST: OK | develop=e76d5bf | rama actual: develop`).
- `TEST: ERROR …` con el motivo, y la confirmación de qué **no** se tocó.
- `TEST: ALTO …` cuando el script se detuvo a propósito antes de cambiar algo.

### Después del bloque, qué revisar

Al final, Claude dice en pocas líneas **qué debe salir** y **qué revisar en la pantalla** (con la ruta: "IT Service Desk → Ajustes", etc.).

---

## 4. Protecciones que llevan todos los scripts

1. **Verificar el servidor:** `[ "$(hostname)" = "int-avz" ]`.
2. **Árbol limpio:** si `git status --short` no está vacío, se detiene sin tocar nada.
3. **Verificar la rama** esperada antes de escribir.
4. **Parches con ancla exacta:** los cambios se aplican con Python buscando el texto exacto (`assert s.count(a) == 1`). Si no lo encuentra, se detiene.
5. **Si se reemplaza un archivo completo**, primero se verifica con `sha256sum` que el del servidor sea idéntico al que Claude revisó.
6. **El backend se prueba antes de reemplazar el que corre:** se construye la imagen y se arranca una prueba (`docker compose run --rm --no-deps … "from app.main import app; print('ARRANCA BIEN')"`). Solo si arranca, se recrea el contenedor.
7. **El frontend se compila con reintentos:** hasta 3 intentos si falla la descarga de Google Fonts, y se verifica que `pm2` quede `online`.
8. **Si algo falla, se regresa todo:** `git checkout -- .`, se borra la rama `fix/` y **la pantalla en línea no se toca**.
9. **El commit solo se hace si todo salió bien**, y se sube a GitHub.
10. **Cambios en la base de datos:** primero se muestra lo que va a cambiar, con transacción (`begin … commit`), y se informa lo que queda.

---

## 5. Flujo de git

- **`develop`** es la rama principal. **Todo** lo terminado se integra ahí.
- **`feature/<tema>`** para trabajo nuevo. **Se conservan** después de integrarse.
- **`fix/<tema>`** para correcciones. **Se borran** (local y en GitHub) al integrarse a `develop`.
- **Commits en inglés**, con título corto (`feat(mesa-de-soporte): …`, `fix(control-accesos): …`) y un párrafo que explica el porqué.
- **La pantalla se compila desde la rama que tiene todo lo que está en línea.** Si hay una rama con trabajo en prueba (por ejemplo, el Sidebar nuevo antes de aprobarse), las correcciones se compilan desde **esa** rama, para no quitar de producción lo que se está probando.
- **Al terminar algo:** se verifica que no haya ramas pendientes, que queden **0 ramas `fix/`** y que GitHub esté igual que el servidor. Luego se sincroniza la laptop:

**Local** (en WSL)
```bash
cd ~/code/avalanz/intranet-avalanz && git fetch -q origin --prune && git switch -q develop && git pull -q origin develop && echo "TEST: laptop en $(git branch --show-current) $(git log --oneline -1 | cut -c1-7)"
```

---

## 6. Cómo trabajar un cambio

1. **Entender antes de tocar.** Si falta información, Claude pide **bloques de solo lectura** (`grep`, `sed -n`, consultas `select`). Los marca como "Solo lectura".
2. **Pedir el código real, no adivinarlo.** Para revisar varios archivos, Abraham los empaqueta desde la laptop y los sube al chat:

**Local** (en WSL)
```bash
cd ~/code/avalanz/intranet-avalanz && git pull -q && tar -czf "/mnt/c/Users/Abraham Covarrubias/Downloads/nombre.tar.gz" $(ls -d ruta1 ruta2 2>/dev/null) && ls -la "/mnt/c/Users/Abraham Covarrubias/Downloads/nombre.tar.gz"
```

   (El servidor no tiene `zip`; se usa `tar` desde la laptop.)
3. **Probar antes de entregar.** Claude compila el código (esbuild) y, cuando hay algo visual, lo dibuja y revisa con capturas antes de mandarlo.
4. **Explicar la causa, no solo el arreglo.** Si algo falló, primero el porqué, en palabras simples.
5. **Si producción se rompe, primero restablecer** (recompilar desde `develop` o regresar el cambio) y **después** diagnosticar.
6. **Avisar con honestidad** cuando algo tiene riesgo (seguridad, validez legal, datos) y dejar que Abraham decida.

---

## 7. Estilo de comunicación

- **Español claro**, sin rodeos, cálido pero directo.
- **Respuestas cortas** cuando la pregunta es corta; detalle cuando hace falta.
- **Tablas** para comparar números o opciones.
- **Antes de un cambio grande, un resumen** de qué se va a hacer y por qué; después, el script.
- **Correos y textos para terceros** (el dueño, el director): tono neutral, sin culpar a nadie, con una tabla de comprensión si hay números.
- **No inventar:** si algo no se sabe (una ruta, un nombre de función), se pregunta o se revisa.

---

## 8. Reglas de código y diseño

### Frontend
- **Tailwind 4 con clases canónicas** que no marquen advertencias en el editor. Valores arbitrarios solo si no hay equivalente en la escala.
- **Las páginas de módulos y submódulos no llevan título ni subtítulo:** la ruta vive en el encabezado.
- **Pantallas cuyo protagonista es una lista:** usan **`TablaPantalla`** (`frontend/components/ui/TablaPantalla.tsx`): ocupa el 100% del alto de la ventana, ajusta las filas a la pantalla, encabezado fijo, orden por columna, margen y letra ajustables (`rellenoFila`, `letra`) y filas propias (`renderFila`). No aplica a tablas dentro de tarjetas o modales.
- **Barras de herramientas en un solo renglón:** buscador, filtro dinámico, contador y acciones, con **un solo botón sólido** (la acción principal).
- **El logo del menú lateral es el protagonista:** grande y centrado, con nombre y versión.
- **Versión móvil por ancho de pantalla (menos de 768 px)**, no por tipo de aparato: menú como cajón, encabezado compacto, barra inferior (Inicio · Mesa · Asistente · Menú), botones de mínimo 44 × 44 px, campos con letra de 16 px (evita el zoom del iPhone), `100dvh` y `env(safe-area-inset-*)`.

### Backend
- Microservicios en Docker (FastAPI), PostgreSQL, MinIO (bucket `dirdoc`), Gotenberg para PDF, nginx.
- **Nunca modificar documentos firmados** (DocuSign): se guardan tal como llegan, con su huella SHA-256.

---

## 9. Pendientes conocidos (actualizar en cada chat)

- **Dashboard de métricas:** pulirlo (Abraham dirá qué; el código ya se empaquetó como `dashboard_codigo.tar.gz`).
- **Detalle del ticket en el teléfono** por dentro (tarjetas, conversación y acciones).
- **Mesa de Soporte con `TablaPantalla` en escritorio** (rama `feature/mesa-tabla-pantalla`, sin integrar): las filas se estiran a 60 px por los nombres largos en Solicitante y Asignado.
- **Unificar las dos carpetas por folio** de Control de accesos en MinIO.
- **Revisar el certificado de DocuSign en Legal** (rama `feature/docusign-completion-certificate`).
- **Workflow de alta de clientes** Protheus ↔ Intranet (documento aparte: `workflow_alta_clientes_protheus_intranet.md`).
- 🔴 **Cambiar las credenciales expuestas** (base de datos, RabbitMQ, MinIO, Grafana) y sacar `.env` de las imágenes Docker.
