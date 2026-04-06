from fastapi import FastAPI
from app.config import config
from app.database import engine
from app.routes import legal

app = FastAPI(title="Legal Service", version="1.0.0")

app.include_router(legal.router)

@app.get("/health")
async def health():
    return {"service": "legal-service", "status": "ok"}
