#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Auditoria periodica de seguridad · Intranet Avalanz
# Revisa infraestructura, Docker, backend, frontend y servicios, y escribe un
# informe numerado en security/informes-periodicos/INF-NNNN_AAAA-MM-DD.md
#
# Solo LEE: no cambia configuraciones, no intenta ataques y nunca muestra
# contrasenas ni valores secretos (solo cuantos hay y donde estan).
# Uso (en int-avz):  bash security/informes-periodicos/auditoria.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u
[ "$(hostname)" = "int-avz" ] || { echo "Este script es para int-avz"; exit 1; }
cd ~/intranet-avalanz || exit 1

DIR=security/informes-periodicos
mkdir -p "$DIR/acuses"
ULT=$(ls "$DIR"/INF-*.md 2>/dev/null | sed -E 's#.*/INF-([0-9]{4}).*#\1#' | sort -n | tail -1)
NUM=$(printf "%04d" $(( 10#${ULT:-0} + 1 )))
HOY=$(TZ=America/Monterrey date +%F)
INFORME="$DIR/INF-${NUM}_${HOY}.md"
DOMINIO=intranet.avalanz.com
PUB="https://localhost"
C() { curl -sk -o /dev/null -w "%{http_code}" -H "Host: $DOMINIO" --max-time 8 "$@"; }

echo "Auditoria de seguridad · informe INF-$NUM"
sudo -v || { echo "Se necesita sudo para revisar firewall, puertos y SSH"; exit 1; }

# ── Registro de hallazgos ────────────────────────────────────────────────────
declare -a FILAS
NOK=0; NWARN=0; NFAIL=0; SECCION=""
seccion() { SECCION="$1"; FILAS+=("##SECCION##$1"); echo "· $1"; }
fila() {  # estado | revision | evidencia | recomendacion
  local e="$1" icono
  case "$e" in ok) icono="✅"; NOK=$((NOK+1));; warn) icono="⚠️"; NWARN=$((NWARN+1));; fail) icono="❌"; NFAIL=$((NFAIL+1));; esac
  FILAS+=("| $icono | $2 | ${3//|/\\|} | ${4//|/\\|} |")
}

# ════════════════════════════ INFRAESTRUCTURA ═══════════════════════════════
seccion "Infraestructura"
USO=$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')
LIBRE=$(df -hP / | awk 'NR==2 {print $4}')
if [ "$USO" -ge 90 ]; then fila fail "Disco del sistema" "${USO}% usado, ${LIBRE} libres" "Liberar espacio o ampliar el disco de inmediato"
elif [ "$USO" -ge 80 ]; then fila warn "Disco del sistema" "${USO}% usado, ${LIBRE} libres" "Planear la ampliación del disco"
else fila ok "Disco del sistema" "${USO}% usado, ${LIBRE} libres" "—"; fi

MEM=$(free | awk '/Mem:/ {printf "%d", $3*100/$2}')
[ "$MEM" -ge 90 ] && fila warn "Memoria" "${MEM}% en uso" "Revisar consumo por servicio" || fila ok "Memoria" "${MEM}% en uso" "—"

ACT=$(apt list --upgradable 2>/dev/null | grep -c upgradable)
SEGU=$(apt list --upgradable 2>/dev/null | grep -ci security)
if [ "$SEGU" -gt 0 ]; then fila fail "Actualizaciones del sistema" "$ACT pendientes, $SEGU de seguridad" "Aplicar las de seguridad (apt upgrade) en una ventana de mantenimiento"
elif [ "$ACT" -gt 0 ]; then fila warn "Actualizaciones del sistema" "$ACT pendientes" "Aplicarlas en una ventana de mantenimiento"
else fila ok "Actualizaciones del sistema" "Al día" "—"; fi
[ -f /var/run/reboot-required ] && fila warn "Reinicio pendiente" "El sistema pide reiniciar para aplicar actualizaciones" "Programar reinicio" || fila ok "Reinicio pendiente" "No" "—"
dpkg -l unattended-upgrades 2>/dev/null | grep -q "^ii" && fila ok "Actualizaciones automáticas de seguridad" "unattended-upgrades instalado" "—" \
  || fila warn "Actualizaciones automáticas de seguridad" "No instalado" "Instalar unattended-upgrades"

ROOT=$(sudo sshd -T 2>/dev/null | awk '/^permitrootlogin/ {print $2}')
PASS=$(sudo sshd -T 2>/dev/null | awk '/^passwordauthentication/ {print $2}')
[ "$ROOT" = "no" ] && fila ok "SSH: entrada como root" "PermitRootLogin $ROOT" "—" || fila fail "SSH: entrada como root" "PermitRootLogin ${ROOT:-?}" "Poner PermitRootLogin no"
[ "$PASS" = "no" ] && fila ok "SSH: contraseñas" "Solo con llave" "—" || fila warn "SSH: contraseñas" "PasswordAuthentication ${PASS:-?}" "Usar llaves SSH y desactivar contraseñas"

UFW=$(sudo ufw status 2>/dev/null | head -1 | awk '{print $2}')
[ "$UFW" = "active" ] && fila ok "Firewall (ufw)" "Activo" "Recuerda: los puertos publicados por Docker se saltan ufw" || fila fail "Firewall (ufw)" "${UFW:-no instalado}" "Activar ufw permitiendo solo 22, 80 y 443"
DU=$(sudo iptables -L DOCKER-USER -n 2>/dev/null | grep -cvE "^Chain|^target|RETURN")
[ "$DU" -gt 0 ] && fila ok "Firewall para Docker (DOCKER-USER)" "$DU reglas" "—" || fila warn "Firewall para Docker (DOCKER-USER)" "Sin reglas: los puertos de Docker quedan abiertos" "Publicar puertos internos solo en 127.0.0.1, o filtrar en DOCKER-USER"

# Puertos: los que escuchan fuera de localhost y si se alcanzan por la IP del servidor
IP=$(hostname -I | awk '{print $1}')
PERMITIDOS=" 22 80 443 "
for p in $(sudo ss -tlnH 2>/dev/null | awk '$4 !~ /^(127\.|\[::1\])/ {n=split($4,a,":"); print a[n]}' | sort -un); do
  ALC=$(timeout 3 bash -c "echo > /dev/tcp/$IP/$p" 2>/dev/null && echo "se alcanza por $IP" || echo "no se alcanza por $IP")
  PROC=$(sudo ss -tlnpH "( sport = :$p )" 2>/dev/null | grep -oE '\("[^"]+"' | head -1 | tr -d '("')
  if [[ "$PERMITIDOS" == *" $p "* ]]; then fila ok "Puerto $p" "$PROC · $ALC" "—"
  else fila fail "Puerto $p expuesto" "$PROC · $ALC" "Publicarlo solo en 127.0.0.1 (o quitarlo del docker-compose)"; fi
done

for j in $(sudo fail2ban-client status 2>/dev/null | awk -F: '/Jail list/ {gsub(/[ ,]+/," ",$2); print $2}'); do
  LP=$(sudo fail2ban-client get "$j" logpath 2>/dev/null | grep -oE "/[^ ]+" | head -1)
  TOT=$(sudo fail2ban-client status "$j" 2>/dev/null | awk -F: '/Total failed/ {gsub(/ /,"",$2); print $2}')
  if [ -n "$LP" ] && sudo test -e "$LP"; then fila ok "fail2ban: $j" "Vigila $LP · $TOT fallos registrados" "—"
  else fila fail "fail2ban: $j" "Vigila un archivo que NO existe ($LP)" "Apuntar la regla a un registro estable (por ejemplo, el log de nginx montado en el host)"; fi
done

VENCE=$(echo | timeout 8 openssl s_client -servername $DOMINIO -connect localhost:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$VENCE" ]; then
  DIAS=$(( ( $(date -d "$VENCE" +%s) - $(date +%s) ) / 86400 ))
  [ "$DIAS" -lt 15 ] && fila fail "Certificado HTTPS" "Vence en $DIAS días ($VENCE)" "Renovar" || { [ "$DIAS" -lt 30 ] && fila warn "Certificado HTTPS" "Vence en $DIAS días" "Programar renovación" || fila ok "Certificado HTTPS" "Vence en $DIAS días" "—"; }
else fila warn "Certificado HTTPS" "No se pudo leer" "Revisar la configuración TLS"; fi

RESP=$(ls -t ~/backups/*/* ~/backups/* /var/backups/avalanz/* 2>/dev/null | head -1)
if [ -n "$RESP" ]; then
  HORAS=$(( ( $(date +%s) - $(stat -c %Y "$RESP") ) / 3600 ))
  [ "$HORAS" -le 30 ] && fila ok "Respaldo más reciente" "Hace ${HORAS} h ($(basename "$RESP"))" "Verificar que también exista una copia fuera del servidor" \
    || fila fail "Respaldo más reciente" "Hace ${HORAS} h" "Revisar el respaldo nocturno"
else fila warn "Respaldos" "No se encontraron en ~/backups" "Confirmar dónde se guardan y que existan copias fuera del servidor"; fi

# ═════════════════════════════════ DOCKER ═══════════════════════════════════
seccion "Docker"
for c in $(docker ps -a --format '{{.Names}}' | sort); do
  EST=$(docker inspect --format '{{.State.Status}}' "$c"); REI=$(docker inspect --format '{{.RestartCount}}' "$c")
  SAL=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}sin chequeo{{end}}' "$c")
  if [ "$EST" != "running" ]; then fila fail "Contenedor $c" "$EST" "Revisar por qué no está corriendo"
  elif [ "$SAL" = "unhealthy" ] || [ "$REI" -gt 3 ]; then fila warn "Contenedor $c" "salud: $SAL · reinicios: $REI" "Revisar sus registros"
  else fila ok "Contenedor $c" "corriendo · salud: $SAL · reinicios: $REI" "—"; fi
done
PRIV=$(for c in $(docker ps --format '{{.Names}}'); do [ "$(docker inspect --format '{{.HostConfig.Privileged}}' "$c")" = "true" ] && echo "$c"; done | xargs)
[ -n "$PRIV" ] && fila fail "Contenedores privilegiados" "$PRIV" "Quitar privileged salvo que sea indispensable" || fila ok "Contenedores privilegiados" "Ninguno" "—"
SOCK=$(for c in $(docker ps --format '{{.Names}}'); do docker inspect --format '{{range .Mounts}}{{.Source}} {{end}}' "$c" | grep -q docker.sock && echo "$c"; done | xargs)
[ -n "$SOCK" ] && fila warn "Acceso al socket de Docker" "$SOCK" "Ese contenedor puede controlar todo el servidor; restringirlo o usar un proxy de solo lectura" || fila ok "Acceso al socket de Docker" "Ninguno" "—"
ROOTC=$(for c in $(docker ps --format '{{.Names}}' | grep avalanz-); do u=$(docker inspect --format '{{.Config.User}}' "$c"); [ -z "$u" ] || [ "$u" = "root" ] || [ "$u" = "0" ] && echo "$c"; done | wc -l)
[ "$ROOTC" -gt 0 ] && fila warn "Servicios que corren como root" "$ROOTC contenedores" "Crear un usuario sin privilegios en cada Dockerfile (USER app)" || fila ok "Servicios que corren como root" "Ninguno" "—"
ENVS=$(for c in $(docker ps --format '{{.Names}}' | grep avalanz-); do docker exec "$c" sh -c 'ls /app/.env 2>/dev/null' >/dev/null 2>&1 && echo "${c#avalanz-}"; done | xargs)
[ -n "$ENVS" ] && fila fail "Archivo .env dentro de las imágenes" "$(echo $ENVS | wc -w) servicios: $ENVS" "Agregar .env a .dockerignore, pasar las variables al ejecutar (env_file) y rotar las contraseñas" \
  || fila ok "Archivo .env dentro de las imágenes" "Ninguno" "—"

# ═════════════════════════════════ BACKEND ══════════════════════════════════
seccion "Backend"
for ruta in /api/v1/users/ /api/v1/it-service-desk/incidencias /api/v1/it-service-desk/ajustes /api/v1/legal/contratos /api/v1/toolkit-ti/plugins; do
  S=$(C "$PUB$ruta")
  case "$S" in 401|403) fila ok "Sin sesión: $ruta" "Responde $S" "—";; 404) fila ok "Sin sesión: $ruta" "Responde 404 (no existe o no se expone)" "—";;
    200) fila fail "Sin sesión: $ruta" "Responde 200 sin iniciar sesión" "Exigir sesión en esa ruta";; *) fila warn "Sin sesión: $ruta" "Responde $S" "Revisar";; esac
done
for ruta in /api/v1/auth/internal/users/x/sessions /internal/users/by-module-role /api/v1/it-service-desk/control-accesos/internal/docusign-poll; do
  S=$(C "$PUB$ruta")
  case "$S" in 403|404) fila ok "Ruta interna desde fuera: $ruta" "Responde $S" "—";;
    *) fila fail "Ruta interna desde fuera: $ruta" "Responde $S (se alcanza desde fuera)" "Bloquear /internal en nginx";; esac
done
NGX=$(docker exec avalanz-nginx sh -c 'cat /etc/nginx/nginx.conf /etc/nginx/conf.d/*.conf' 2>/dev/null)
echo "$NGX" | grep -q "limit_req_zone" && fila ok "Límite de peticiones (nginx)" "Configurado ($(echo "$NGX" | grep -c limit_req_zone) zonas)" "—" || fila fail "Límite de peticiones (nginx)" "No configurado" "Agregar limit_req al inicio de sesión"
echo "$NGX" | grep -qE "server_tokens\s+off" && fila ok "nginx oculta su versión" "server_tokens off" "—" || fila warn "nginx oculta su versión" "No" "Agregar server_tokens off"
AUTHC=$(docker ps --format '{{.Names}}' | grep -i auth | head -1)
docker exec "$AUTHC" grep -q "expiracion absoluta" /app/app/services/auth_service.py 2>/dev/null \
  && fila ok "Sesiones: vencimiento absoluto" "La renovación respeta el límite de horas" "—" \
  || fila fail "Sesiones: vencimiento absoluto" "La renovación no respeta el límite" "Aplicar fix/sesion-expiracion-absoluta"
HORAS_S=$(docker exec "$AUTHC" sh -c 'grep -h "JWT_ABSOLUTE_EXPIRE_HOURS" /app/app/config.py /app/.env 2>/dev/null' | grep -oE "[0-9]+" | tail -1)
fila ok "Sesiones: duración máxima" "${HORAS_S:-?} horas · inactividad: $(docker exec "$AUTHC" sh -c 'grep -h JWT_INACTIVITY_EXPIRE_MINUTES /app/app/config.py /app/.env 2>/dev/null' | grep -oE "[0-9]+" | tail -1) min" "—"
DEBUG=$(for c in $(docker ps --format '{{.Names}}' | grep avalanz-); do docker exec "$c" sh -c 'printenv DEBUG 2>/dev/null' | grep -qiE "^(1|true)$" && echo "${c#avalanz-}"; done | xargs)
[ -n "$DEBUG" ] && fila warn "Modo depuración" "$DEBUG" "Apagar DEBUG en producción" || fila ok "Modo depuración" "Apagado en todos los servicios" "—"

# ═════════════════════════════════ FRONTEND ═════════════════════════════════
seccion "Frontend"
VN=$(cd frontend && node -e "console.log(require('next/package.json').version)" 2>/dev/null)
VR=$(cd frontend && node -e "console.log(require('react/package.json').version)" 2>/dev/null)
fila ok "Versiones" "Next.js $VN · React $VR" "Mantenerlas al día; revisar los avisos de seguridad de Next.js cada mes"
AUD=$(cd frontend && timeout 90 npm audit --omit=dev --json 2>/dev/null)
if [ -n "$AUD" ]; then
  CR=$(echo "$AUD" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const v=JSON.parse(d).metadata.vulnerabilities;console.log((v.critical||0)+' '+(v.high||0)+' '+(v.moderate||0))}catch{console.log('? ? ?')}})")
  read -r VC VH VM <<< "$CR"
  if [ "${VC:-0}" != "0" ] || [ "${VH:-0}" != "0" ]; then fila fail "Dependencias del frontend (npm audit)" "críticas: $VC · altas: $VH · moderadas: $VM" "Actualizar (npm audit fix) y probar"
  elif [ "${VM:-0}" != "0" ]; then fila warn "Dependencias del frontend (npm audit)" "moderadas: $VM" "Actualizar en el siguiente mantenimiento"
  else fila ok "Dependencias del frontend (npm audit)" "Sin vulnerabilidades conocidas" "—"; fi
else fila warn "Dependencias del frontend (npm audit)" "No se pudo consultar (sin red al registro de npm)" "Correrlo desde la laptop"; fi
H=$(curl -skI -H "Host: $DOMINIO" --max-time 8 "$PUB/login")
for h in "Strict-Transport-Security" "X-Frame-Options" "X-Content-Type-Options" "Referrer-Policy" "Content-Security-Policy" "Permissions-Policy"; do
  echo "$H" | grep -qi "^$h:" && fila ok "Encabezado $h" "Presente" "—" \
    || { [[ "$h" =~ Content-Security|Permissions ]] && fila warn "Encabezado $h" "Ausente" "Agregarlo en nginx (CSP primero en modo Report-Only)" || fila fail "Encabezado $h" "Ausente" "Agregarlo en nginx"; }
done
R=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -H "Host: $DOMINIO" --max-time 8 http://localhost/)
[[ "$R" =~ ^30[1278]\ https ]] && fila ok "HTTP redirige a HTTPS" "$R" "—" || fila fail "HTTP redirige a HTTPS" "$R" "Redirigir todo HTTP a HTTPS"
MAP=$(ls frontend/.next/static/chunks/*.map 2>/dev/null | head -1)
[ -n "$MAP" ] && { S=$(C "$PUB/_next/static/chunks/$(basename "$MAP")"); [ "$S" = "200" ] && fila warn "Mapas del código fuente" "Se descargan públicamente" "Desactivar productionBrowserSourceMaps" || fila ok "Mapas del código fuente" "Existen pero no se sirven ($S)" "—"; } \
  || fila ok "Mapas del código fuente" "No se generan" "—"
S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$IP:3000/login")
[ "$S" = "200" ] && fila fail "Next.js accesible sin nginx" "http://$IP:3000 responde $S (se salta límites y encabezados)" "Que Next.js escuche solo en 127.0.0.1" || fila ok "Next.js accesible sin nginx" "No ($S)" "—"

# ═════════════════════════════════ SERVICIOS ════════════════════════════════
seccion "Servicios"
prueba() {  # nombre puerto ruta "que significa abierto"
  local S; S=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://$IP:$2$3")
  case "$S" in 000) fila ok "$1" "No se alcanza por $IP:$2" "—";;
    200) fila fail "$1" "http://$IP:$2$3 responde 200 $4" "Publicarlo solo en 127.0.0.1 y entrar por túnel SSH o detrás de nginx con contraseña";;
    *) fila warn "$1" "http://$IP:$2 responde $S" "Publicarlo solo en 127.0.0.1";; esac
}
prueba "Prometheus" 9090 "/api/v1/targets" "(sin contraseña: muestra toda la infraestructura)"
prueba "Grafana" 3001 "/login" "(pantalla de acceso expuesta)"
prueba "MinIO API" 9000 "/minio/health/live" "(almacenamiento de archivos expuesto)"
prueba "MinIO consola" 9001 "/" "(consola de administración expuesta)"
prueba "Correo de pruebas (pantalla)" 8025 "/" "(cualquiera puede leer los correos capturados)"
prueba "RabbitMQ consola" 15672 "/" "(consola de administración expuesta)"
for p in 5432 6379 5672 1025; do
  timeout 3 bash -c "echo > /dev/tcp/$IP/$p" 2>/dev/null && fila fail "Puerto $p (base de datos, caché o mensajería)" "Se alcanza por $IP:$p" "No publicarlo fuera del servidor" \
    || fila ok "Puerto $p (base de datos, caché o mensajería)" "No se alcanza" "—"
done

# ═════════════════════════════════ INFORME ══════════════════════════════════
{
  echo "# Informe de seguridad INF-$NUM"
  echo
  echo "| | |"; echo "|---|---|"
  echo "| **Sistema** | Intranet Avalanz · servidor int-avz ($IP) |"
  echo "| **Fecha** | $(TZ=America/Monterrey date '+%d/%m/%Y %H:%M') (hora de Monterrey) |"
  echo "| **Versión revisada** | develop $(git log --oneline -1 develop | cut -c1-7) |"
  echo "| **Ejecutó** | $(whoami) con \`auditoria.sh\` (solo lectura) |"
  echo
  echo "## Resumen"
  echo
  echo "| ❌ Graves | ⚠️ Atender | ✅ Bien |"; echo "|---|---|---|"; echo "| **$NFAIL** | **$NWARN** | **$NOK** |"
  echo
  echo "### Hallazgos graves y por atender"
  echo
  printf '%s\n' "${FILAS[@]}" | grep -E "^\| (❌|⚠️)" | sed 's/^| \(❌\|⚠️\) | \([^|]*\) | \([^|]*\) | \(.*\) |$/- \1 **\2**: \3 → \4/' || true
  [ "$((NFAIL+NWARN))" -eq 0 ] && echo "Ninguno."
  echo
  echo "## Detalle"
  for f in "${FILAS[@]}"; do
    if [[ "$f" == "##SECCION##"* ]]; then
      echo; echo "### ${f#\#\#SECCION\#\#}"; echo; echo "| | Revisión | Evidencia | Recomendación |"; echo "|---|---|---|---|"
    else echo "$f"; fi
  done
  echo
  echo "---"
  echo "*Este informe solo describe el estado encontrado. Las respuestas y compromisos se registran en el acuse correspondiente (\`acuses/ACU-${NUM}_….md\`).*"
} > "$INFORME"

echo
echo "Informe: $INFORME"
echo "Resumen: ❌ $NFAIL graves · ⚠️ $NWARN por atender · ✅ $NOK bien"
