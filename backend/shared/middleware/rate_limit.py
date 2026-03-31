import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from shared.utils.helpers import get_client_ip


class RateLimitMiddleware(BaseHTTPMiddleware):

    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        # Almacenamiento en memoria: {ip: [timestamp, ...]}
        self._store: dict = {}

    async def dispatch(self, request: Request, call_next):
        ip = get_client_ip(dict(request.headers), request.client.host)
        now = time.time()
        window_start = now - self.window_seconds

        # Limpiar timestamps fuera de la ventana de tiempo
        timestamps = self._store.get(ip, [])
        timestamps = [t for t in timestamps if t > window_start]

        if len(timestamps) >= self.max_requests:
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "error_code": "RATE_LIMIT_EXCEEDED",
                    "message": "Demasiadas solicitudes, intenta mas tarde",
                    "detail": {
                        "max_requests": self.max_requests,
                        "window_seconds": self.window_seconds,
                        "retry_after": int(self.window_seconds - (now - timestamps[0])),
                    },
                    "path": str(request.url.path),
                },
                headers={"Retry-After": str(int(self.window_seconds - (now - timestamps[0])))},
            )

        timestamps.append(now)
        self._store[ip] = timestamps

        response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(self.max_requests)
        response.headers["X-RateLimit-Remaining"] = str(self.max_requests - len(timestamps))
        response.headers["X-RateLimit-Reset"] = str(int(window_start + self.window_seconds))
        return response


def setup_rate_limit(app: FastAPI, max_requests: int, window_seconds: int) -> None:
    app.add_middleware(
        RateLimitMiddleware,
        max_requests=max_requests,
        window_seconds=window_seconds,
    )