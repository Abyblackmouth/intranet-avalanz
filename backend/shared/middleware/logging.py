import time
import logging
import json
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from shared.utils.helpers import get_client_ip

logger = logging.getLogger("avalanz")


def setup_logger(service_name: str, log_level: str = "INFO", log_format: str = "json") -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    logger = logging.getLogger("avalanz")
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setLevel(level)

        if log_format == "json":
            handler.setFormatter(JsonFormatter(service_name))
        else:
            handler.setFormatter(
                logging.Formatter(f"[{service_name}] %(asctime)s %(levelname)s %(message)s")
            )

        logger.addHandler(handler)


class JsonFormatter(logging.Formatter):

    def __init__(self, service_name: str):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "service": self.service_name,
            "level": record.levelname,
            "message": record.getMessage(),
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "logger": record.name,
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "extra"):
            log_entry.update(record.extra)
        return json.dumps(log_entry, ensure_ascii=False)


class LoggingMiddleware(BaseHTTPMiddleware):

    def __init__(self, app, service_name: str):
        super().__init__(app)
        self.service_name = service_name

    async def dispatch(self, request: Request, call_next):
        start = time.time()
        ip = get_client_ip(dict(request.headers), request.client.host)

        response = await call_next(request)

        duration_ms = round((time.time() - start) * 1000, 2)
        status = response.status_code

        log_data = {
            "method": request.method,
            "path": str(request.url.path),
            "status_code": status,
            "duration_ms": duration_ms,
            "client_ip": ip,
            "user_agent": request.headers.get("user-agent", ""),
        }

        if status >= 500:
            logger.error("request", extra={"extra": log_data})
        elif status >= 400:
            logger.warning("request", extra={"extra": log_data})
        else:
            logger.info("request", extra={"extra": log_data})

        return response


def setup_logging(app: FastAPI, service_name: str, log_level: str = "INFO", log_format: str = "json") -> None:
    setup_logger(service_name, log_level, log_format)
    app.add_middleware(LoggingMiddleware, service_name=service_name)