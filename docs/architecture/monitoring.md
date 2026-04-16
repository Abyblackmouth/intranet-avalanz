# Monitoring Guide — Intranet Avalanz

Ubicacion: `docs/architecture/`

---

## Que son las metricas

Las metricas son mediciones numericas que se recolectan de los servicios en intervalos regulares para entender su comportamiento en tiempo real. A diferencia de los logs (que registran eventos puntuales), las metricas permiten ver tendencias, detectar anomalias y anticipar problemas antes de que afecten a los usuarios.

En Intranet Avalanz las metricas cubren dos capas:

**Capa de aplicacion** — cada microservicio FastAPI expone metricas de sus propios endpoints: cuantas peticiones recibe, cuanto tardan en responder, cuantos errores genera.

**Capa de infraestructura** — RabbitMQ expone sus propias metricas de colas y mensajes. PostgreSQL, Redis y Nginx requieren exporters adicionales (pendiente).

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

**Consultas lentas a BD** — picos en la latencia del admin-service o auth-service indican queries sin indice o joins pesados.

**Errores de integracion** — un aumento de errores 5xx en el notify-service puede indicar que el websocket-service no esta disponible.

---

## Stack de monitoreo

### Prometheus

Motor de recoleccion de metricas. Cada 15 segundos consulta el endpoint `/metrics` de cada servicio y almacena los datos en una base de datos de series de tiempo (TSDB).

Acceso local: `http://localhost:9090`

No requiere autenticacion en desarrollo. En produccion debe estar protegido detras de Nginx con autenticacion basica.

Documentacion oficial: https://prometheus.io/docs/

### Grafana

Plataforma de visualizacion. Se conecta a Prometheus como datasource y permite crear dashboards con graficas, gauges, alertas y paneles estadisticos. Los dashboards se pueden exportar como JSON para versionarlos en git.

Acceso local: `http://localhost:3001`
Credenciales: `admin / Avalanz2026!`

Documentacion oficial: https://grafana.com/docs/grafana/latest/

### prometheus-fastapi-instrumentator

Libreria Python que se agrega a cada servicio FastAPI con 2 lineas de codigo. Expone automaticamente el endpoint `/metrics` con metricas estandar de HTTP sin configuracion adicional.

Repositorio y documentacion: https://github.com/trallnag/prometheus-fastapi-instrumentator

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
│   └── alerts.yml             reglas de alerta (actualmente vacio)
└── grafana/
    ├── datasources.yml        conexion automatica de Grafana con Prometheus
    └── avalanz-services-dashboard.json   dashboard principal exportado
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

La configuracion en `infrastructure/prometheus/prometheus.yml` define un job por servicio apuntando al nombre del contenedor Docker y puerto 8000:

```yaml
scrape_configs:
  - job_name: "auth-service"
    static_configs:
      - targets: ["auth-service:8000"]
    metrics_path: "/metrics"
    scrape_interval: 15s
```

Prometheus resuelve `auth-service:8000` via la red Docker interna `avalanz-network`. No es necesario exponer el puerto externamente — la comunicacion es interna entre contenedores.

### Como Grafana se conecta a Prometheus

El archivo `infrastructure/grafana/datasources.yml` configura automaticamente el datasource al levantar el contenedor:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
```

Grafana resuelve `prometheus:9090` via la red Docker interna. El datasource aparece como default en Grafana sin configuracion manual.

---

## Servicios monitoreados

| Servicio | Job en Prometheus | Puerto interno | Estado |
|---|---|---|---|
| auth-service | auth-service | 8000 | Activo |
| admin-service | admin-service | 8000 | Activo |
| notify-service | notify-service | 8000 | Activo |
| upload-service | upload-service | 8000 | Activo |
| websocket-service | websocket-service | 8000 | Activo |
| email-service | email-service | 8000 | Activo |
| RabbitMQ | rabbitmq | 15692 | Activo |
| PostgreSQL | postgres | 5432 | Pendiente exporter |
| Redis | redis | 6379 | Pendiente exporter |
| Nginx | nginx | 9113 | Pendiente exporter |

La configuracion de scraping esta en `infrastructure/prometheus/prometheus.yml`.

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

---

## Dashboard principal

El dashboard de Avalanz esta guardado en `infrastructure/grafana/avalanz-services-dashboard.json`.

Contiene 4 secciones:

- **Resumen General** — 4 stats: peticiones/seg, errores/seg, latencia promedio, servicios activos
- **Trafico HTTP** — peticiones por servicio en tiempo real y tasa de errores 4xx/5xx
- **Latencia** — tiempo de respuesta promedio por servicio y bargauge comparativo
- **Recursos del Sistema** — RAM y CPU por servicio

Para importarlo en Grafana: menu + arriba a la derecha → Import dashboard → Upload JSON file → seleccionar `avalanz-services-dashboard.json` → elegir Prometheus como datasource → Import.

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

# Servicios activos
count(up{job=~"auth-service|admin-service|notify-service|upload-service|websocket-service|email-service"} == 1)
```

---

## Pendientes

### Exporters para infraestructura

Para monitorear PostgreSQL, Redis y Nginx se necesitan exporters adicionales que se agregan al docker-compose:

- **postgres-exporter** — conexiones activas, queries lentas, tamano de tablas
- **redis-exporter** — memoria, hit rate, comandos por segundo
- **nginx-prometheus-exporter** — conexiones activas, peticiones por status code

### Alertas

El archivo `infrastructure/prometheus/alerts.yml` esta vacio. Se deben configurar alertas para:

- Servicio caido (up == 0) por mas de 1 minuto
- Latencia promedio mayor a 1 segundo sostenida por mas de 2 minutos
- Tasa de errores 5xx mayor al 1% del trafico total
- RAM de cualquier servicio superando 512MB

### Persistencia de dashboards en Grafana

Actualmente los dashboards se guardan en el volumen Docker de Grafana. Si se ejecuta `docker compose down -v` se pierden. La solucion definitiva es configurar Grafana con provisionamiento automatico desde el filesystem apuntando a `infrastructure/grafana/`, lo que elimina la necesidad de importar manualmente el JSON.
