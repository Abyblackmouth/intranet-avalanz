# ----------------------------------------------------------------------
# Imagen del dialog-service
# Mismo patron que el assistant-service: Python 3.11 slim, contexto
# backend para incluir shared/, y el .env fuera de la imagen.
# ----------------------------------------------------------------------
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

COPY dialog-service/requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY dialog-service/ .
COPY shared/ /app/shared

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
