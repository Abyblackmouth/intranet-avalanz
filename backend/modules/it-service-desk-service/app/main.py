from fastapi import FastAPI
from app.config import config
from app.routes import router as main_router

app = FastAPI(title="It Service Desk Service", version="1.0.0")

app.include_router(main_router, prefix="/api/v1/it-service-desk")

@app.get("/health")
async def health():
    return {"service": "it-service-desk-service", "status": "ok"}
