# ----------------------------------------------------------------------
# Imagen base
# Python 3.11 slim, la misma version que el resto de los servicios de la
# plataforma, para que el codigo se comporte igual que en productivo.
# ----------------------------------------------------------------------
FROM python:3.11-slim

# ----------------------------------------------------------------------
# Variables de entorno de Python
# Sin archivos .pyc, logs sin buffer (aparecen al instante en docker logs)
# y /app en la ruta de importacion para que funcionen "app" y "shared".
# ----------------------------------------------------------------------
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# ----------------------------------------------------------------------
# Dependencias
# Se instalan antes de copiar el codigo: si requirements.txt no cambia,
# Docker reutiliza esta capa y la construccion tarda segundos.
# ----------------------------------------------------------------------
COPY assistant-service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ----------------------------------------------------------------------
# Codigo del servicio y modulo compartido de la plataforma
# El .env queda fuera por Dockerfile.dockerignore: los secretos llegan
# en tiempo de ejecucion desde docker compose, no viven en la imagen.
# ----------------------------------------------------------------------
COPY assistant-service/ .
COPY shared/ /app/shared

# ----------------------------------------------------------------------
# Arranque
# Uvicorn sirve la aplicacion FastAPI en el puerto interno 8000.
# ----------------------------------------------------------------------
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
