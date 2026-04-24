# Monitoring Guide — Intranet Avalanz

Ubicacion: `docs/architecture/`

---

## Que son las metricas

Las metricas son mediciones numericas que se recolectan de los servicios en intervalos regulares para entender su comportamiento en tiempo real. A diferencia de los logs (que registran eventos puntuales), las metricas permiten ver tendencias, detectar anomalias y anticipar problemas antes de que afecten a los usuarios.

En Intranet Avalanz las metricas cubren dos capas:

**Capa de aplicacion** — cada microservicio FastAPI expone metricas de sus propios endpoints: cuantas peticiones recibe, cuanto tardan en responder, cuantos errores genera.

**Capa de infraestructura** — RabbitMQ, PostgreSQL, Redis y Nginx exponen metricas via exporters dedicados.

---

## Para que sirven

**Deteccion de problemas en tiempo real** — si un servicio empieza a responder lento o a generar errores 5xx, las metricas lo muestran antes de que los usuarios reporten algo.

**Capacity planning** — ver el consumo de RAM y CPU por servicio ayuda a decidir cuando escalar recursos.

**Analisis post-mortem** — cuando ocurre un incidente, las metricas historicas permiten ver exactamente que paso y cuando.

**SLA y disponibilidad** — medir el porcentaje de peticiones exitosas vs fallidas para garantizar niveles de servicio.

---

## Casos de uso concretos para Avalanz

**Un modulo operativo nuevo esta lento** — comparar la latencia antes y despues del deploy para identificar si el problema es el nuevo codigo o la infraestructura.

**Pico de usuarios** — ver en tiempo real como responden los servicios cuando muchos usuarios entran al mismo tiempo (por ejemplo al inicio de jornada).

**Servicio caido** — el panel de Servicios activos baja de 6 a 5, alerta inmediata sin necesidad de que un usuario reporte el problema.

**Consultas lentas a BD** — picos en conexiones activas de PostgreSQL o latencia del admin-service indican queries sin indice o joins pesados.

**Errores de integracion** — un aumento de errores 5xx en el notify-service puede indicar que el websocket-service no esta disponible.

**Memoria de Redis saturada** — el panel de Redis muestra cuando el cache esta cerca del limite configurado.

---

## Stack de monitoreo

### Prometheus

Motor de recoleccion de metricas. Cada 15 segundos consulta el endpoint `/metrics` de cada servicio y almacena los datos en una base de datos de series de tiempo (TSDB).

Acceso local: `http://localhost:9090`

No requiere autenticacion en desarrollo. En produccion debe estar protegido detras de Nginx con autenticacion basica.

Documentacion oficial: https://prometheus.io/docs/

### Grafana

Plataforma de visualizacion y alertas. Se conecta a Prometheus como datasource y permite crear dashboards con graficas, gauges, alertas y paneles estadisticos.

Acceso local: `http://localhost:3001`
Credenciales: `admin / Avalanz2026!`

El dashboard se carga automaticamente al levantar el contenedor via provisionamiento desde filesystem — no es necesario importarlo manualmente.

Documentacion oficial: https://grafana.com/docs/grafana/latest/

### prometheus-fastapi-instrumentator

Libreria Python que se agrega a cada servicio FastAPI con 2 lineas de codigo. Expone automaticamente el endpoint `/metrics` con metricas estandar de HTTP sin configuracion adicional.

Repositorio y documentacion: https://github.com/trallnag/prometheus-fastapi-instrumentator

### Exporters de infraestructura

| Exporter | Imagen | Puerto interno | Que monitorea |
|---|---|---|---|
| postgres-exporter | prometheuscommunity/postgres-exporter:v0.15.0 | 9187 | Conexiones, queries, tablas |
| redis-exporter | oliver006/redis_exporter:v1.61.0 | 9121 | Memoria, clientes, comandos |
| nginx-exporter | nginx/nginx-prometheus-exporter:1.1.0 | 9113 | Conexiones, peticiones, estado |

El nginx-exporter requiere que el endpoint `/nginx_status` este habilitado en Nginx via el modulo `stub_status`. El bloque esta configurado en `infrastructure/nginx/conf.d/intranet.conf` y solo acepta conexiones desde redes internas Docker.

---

## Como acceder al panel de Grafana

1. Abrir `http://localhost:3001` en el browser
2. Ingresar con `admin / Avalanz2026!`
3. En el menu lateral ir a Dashboards
4. Seleccionar Intranet Avalanz — Servicios

El dashboard se actualiza automaticamente cada 10 segundos. El rango de tiempo por defecto es los ultimos 30 minutos — se puede cambiar en la esquina superior derecha.

---

## Configuracion en el proyecto

### Archivos relevantes

```
infrastructure/
├── prometheus/
│   ├── prometheus.yml         configuracion de scraping y targets
│   └── alerts.yml             reglas de alerta
└── grafana/
    ├── datasources.yml        conexion automatica de Grafana con Prometheus (UID fijo)
    ├── dashboards.yml         provisionamiento automatico del dashboard desde filesystem
    └── avalanz-services-dashboard.json   dashboard principal
```

### Como se agrego a cada servicio FastAPI

Se agregaron 2 elementos a cada microservicio:

**1. Dependencia en requirements.txt**
```
prometheus-fastapi-instrumentator==7.0.0
```

**2. Inicializacion en app/main.py** — despues de crear la instancia de FastAPI y antes de registrar los middlewares:
```python
from prometheus_fastapi_instrumentator import Instrumentator

app = FastAPI(...)

Instrumentator().instrument(app).expose(app)

setup_logging(app, ...)
```

Esto expone automaticamente el endpoint `GET /metrics` en cada servicio con todas las metricas HTTP estandar.

### Como Prometheus descubre los servicios

La configuracion en `infrastructure/prometheus/prometheus.yml` define un job por servicio. Los exporters de infraestructura se scrape en sus puertos propios, no en los puertos de los servicios originales:

```yaml
# Servicio FastAPI — scrape directo
- job_name: "auth-service"
  static_configs:
    - targets: ["auth-service:8000"]

# PostgreSQL — via exporter
- job_name: "postgres"
  static_configs:
    - targets: ["postgres-exporter:9187"]

# Redis — via exporter
- job_name: "redis"
  static_configs:
    - targets: ["redis-exporter:9121"]

# Nginx — via exporter
- job_name: "nginx"
  static_configs:
    - targets: ["nginx-exporter:9113"]
```

### Como Grafana se conecta a Prometheus

El archivo `infrastructure/grafana/datasources.yml` configura el datasource con UID fijo para que el dashboard JSON pueda referenciarlo sin usar variables:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    uid: PBFA97CFB590B2093
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### Como se provisionan los dashboards automaticamente

El archivo `infrastructure/grafana/dashboards.yml` le indica a Grafana que cargue dashboards desde el filesystem al arrancar:

```yaml
apiVersion: 1
providers:
  - name: "Avalanz Dashboards"
    type: file
    options:
      path: /var/lib/grafana/dashboards
```

El `docker-compose.yml` monta el JSON del dashboard en esa ruta. Si se ejecuta `docker compose down -v` y se vuelve a levantar, el dashboard aparece automaticamente sin importacion manual.

### SMTP de Grafana

El SMTP de Grafana se configura via variables de entorno en el `docker-compose.yml`:

```yaml
environment:
  GF_SMTP_ENABLED: "true"
  GF_SMTP_HOST: "mailpit:1025"
  GF_SMTP_FROM_ADDRESS: "grafana@avalanz.com"
  GF_SMTP_FROM_NAME: "Grafana Avalanz"
  GF_SMTP_SKIP_VERIFY: "true"
```

En produccion reemplazar `mailpit:1025` con el servidor SMTP corporativo real.

---

## Servicios monitoreados

| Servicio | Job en Prometheus | Target | Estado |
|---|---|---|---|
| auth-service | auth-service | auth-service:8000 | Activo |
| admin-service | admin-service | admin-service:8000 | Activo |
| notify-service | notify-service | notify-service:8000 | Activo |
| upload-service | upload-service | upload-service:8000 | Activo |
| websocket-service | websocket-service | websocket-service:8000 | Activo |
| email-service | email-service | email-service:8000 | Activo |
| RabbitMQ | rabbitmq | rabbitmq:15692 | Activo |
| PostgreSQL | postgres | postgres-exporter:9187 | Activo |
| Redis | redis | redis-exporter:9121 | Activo |
| Nginx | nginx | nginx-exporter:9113 | Activo |

---

## Metricas disponibles por servicio FastAPI

Todas las metricas son generadas automaticamente por prometheus-fastapi-instrumentator.

| Metrica | Descripcion | Uso tipico |
|---|---|---|
| http_requests_total | Total de peticiones HTTP recibidas | Calcular req/seg con rate() |
| http_request_duration_seconds | Histograma de tiempos de respuesta | Calcular latencia promedio y percentiles |
| http_request_size_bytes | Tamano de peticiones entrantes | Detectar payloads grandes |
| http_response_size_bytes | Tamano de respuestas salientes | Detectar respuestas anormalmente grandes |
| process_resident_memory_bytes | RAM usada por el proceso Python | Detectar memory leaks |
| process_cpu_seconds_total | CPU consumida por el proceso | Detectar procesos con alto consumo |
| python_gc_objects_collected_total | Objetos recolectados por el garbage collector | Diagnostico avanzado de memoria |

## Metricas de infraestructura

| Metrica | Origen | Descripcion |
|---|---|---|
| pg_stat_activity_count | postgres-exporter | Conexiones activas a PostgreSQL por estado |
| pg_up | postgres-exporter | Estado del exporter (1=ok, 0=error) |
| redis_memory_used_bytes | redis-exporter | Memoria RAM usada por Redis |
| redis_connected_clients | redis-exporter | Clientes conectados a Redis |
| redis_memory_max_bytes | redis-exporter | Limite maximo de memoria configurado |
| nginx_connections_active | nginx-exporter | Conexiones activas en Nginx |
| nginx_connections_waiting | nginx-exporter | Conexiones en espera (keep-alive) |
| nginx_http_requests_total | nginx-exporter | Total de peticiones HTTP procesadas |
| nginx_up | nginx-exporter | Estado del exporter (1=ok, 0=error) |

---

## Dashboard principal

El dashboard de Avalanz esta guardado en `infrastructure/grafana/avalanz-services-dashboard.json` y contiene 5 secciones:

- **Resumen General** — 4 stats: peticiones/seg, errores/seg, latencia promedio, servicios activos
- **Trafico HTTP** — peticiones por servicio en tiempo real y tasa de errores 4xx/5xx
- **Latencia** — tiempo de respuesta promedio por servicio y bargauge comparativo
- **Recursos del Sistema** — RAM y CPU por servicio
- **Infraestructura** — conexiones PostgreSQL, memoria Redis, peticiones y conexiones Nginx

El dashboard se carga automaticamente al levantar Grafana. No requiere importacion manual.

---

## Alertas configuradas en Grafana

Las alertas se configuran desde la UI de Grafana en **Alerting → Alert rules**. Todas las reglas viven en la carpeta `Intranet Avalanz`, grupo de evaluacion `avalanz-alerts` con intervalo de 2 minutos.

El contact point configurado es `avalanz-email` — envia correos via SMTP (Mailpit en desarrollo).

### Reglas activas

| Nombre | Query PromQL | Condicion | Pending period | Descripcion |
|---|---|---|---|---|
| Servicio caido | `count(up{job=~"auth-service|admin-service|notify-service|upload-service|websocket-service|email-service"} == 0)` | IS ABOVE 0 | 2m | Dispara cuando uno o mas servicios FastAPI no responden |
| Latencia alta | `avg(rate(http_request_duration_seconds_sum[1m]) / rate(http_request_duration_seconds_count[1m]))` | IS ABOVE 1 | 2m | Dispara cuando la latencia promedio supera 1 segundo |
| Errores 5xx elevados | `sum(rate(http_requests_total{status=~"5.."}[1m])) / sum(rate(http_requests_total[1m]))` | IS ABOVE 0.01 | 2m | Dispara cuando errores 5xx superan el 1% del trafico |
| RAM alta | `process_resident_memory_bytes{job=~"auth-service|admin-service|notify-service|upload-service|websocket-service|email-service"} / 1024 / 1024` | IS ABOVE 512 | 2m | Dispara cuando algun servicio supera 512MB de RAM |

### Comportamiento cuando no hay datos

Las alertas de Latencia alta, Errores 5xx y RAM alta tienen configurado **No data = OK** para evitar falsos positivos cuando no hay suficiente trafico. La alerta de Servicio caido mantiene **No data = Alerting** porque la ausencia de datos indica que el servicio no esta respondiendo.

---

## Queries PromQL de referencia

```promql
# Peticiones por segundo — todos los servicios
sum(rate(http_requests_total[1m]))

# Peticiones por segundo — servicio especifico
rate(http_requests_total{job="auth-service"}[1m])

# Tasa de errores 4xx y 5xx
sum(rate(http_requests_total{status=~"4..|5.."}[1m]))

# Latencia promedio por servicio
rate(http_request_duration_seconds_sum{job="admin-service"}[1m])
/ rate(http_request_duration_seconds_count{job="admin-service"}[1m])

# RAM por servicio en MB
process_resident_memory_bytes{job="auth-service"} / 1024 / 1024

# CPU por servicio
rate(process_cpu_seconds_total{job="auth-service"}[1m])

# Servicios activos (solo los 6 FastAPI)
count(up{job=~"auth-service|admin-service|notify-service|upload-service|websocket-service|email-service"} == 1)

# Conexiones activas PostgreSQL
pg_stat_activity_count{job="postgres"}

# Memoria usada Redis
redis_memory_used_bytes{job="redis"}

# Conexiones activas Nginx
nginx_connections_active{job="nginx"}

# Peticiones por segundo Nginx
rate(nginx_http_requests_total{job="nginx"}[1m])
```

---

## Estructura del JSON de un dashboard de Grafana

Un dashboard es un objeto JSON con la siguiente estructura base:

```json
{
  "title": "Nombre del dashboard",
  "uid": "identificador-unico-slug",
  "refresh": "10s",
  "time": { "from": "now-30m", "to": "now" },
  "panels": [
    {
      "id": 1,
      "type": "timeseries",
      "title": "Titulo del panel",
      "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
      "targets": [
        {
          "expr": "rate(http_requests_total[1m])",
          "legendFormat": "etiqueta de la serie"
        }
      ],
      "fieldConfig": {
        "defaults": {
          "unit": "reqps",
          "thresholds": {
            "mode": "absolute",
            "steps": [
              { "color": "green", "value": null },
              { "color": "red", "value": 10 }
            ]
          }
        }
      }
    }
  ]
}
```

**Tipos de panel mas usados:**

`stat` — numero grande con color segun thresholds. Ideal para KPIs del resumen general.

`timeseries` — grafica de lineas en el tiempo. Ideal para ver tendencias y comparar servicios.

`bargauge` — barras horizontales comparando valores actuales entre multiples servicios.

`gauge` — velocimetro circular. Ideal para porcentajes con umbrales criticos.

`row` — separador colapsable de secciones dentro del dashboard.

**La grilla es de 24 columnas.** Un panel con `w: 12` ocupa la mitad del ancho. Con `w: 24` ocupa todo el ancho. La posicion `y` se incrementa segun la altura `h` de los paneles anteriores.

**Unidades de medida comunes:** `reqps` (peticiones/seg), `s` (segundos), `ms` (milisegundos), `bytes`, `percentunit` (0-1), `short` (numero sin unidad).

**Nota importante sobre datasource en provisionamiento:** El dashboard JSON debe usar el UID directo del datasource (`PBFA97CFB590B2093`) en lugar de la variable `${DS_PROMETHEUS}`. La variable solo funciona al importar manualmente — el provisionamiento desde filesystem no resuelve variables de template.