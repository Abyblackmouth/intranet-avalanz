from fastapi import FastAPI
from app.config import config
from app.routes import router as main_router

app = FastAPI(title="Legal Service", version="1.0.0")

app.include_router(main_router, prefix="/api/v1/legal")

@app.get("/health")
async def health():
    return {"service": "legal-service", "status": "ok"}
