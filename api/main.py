"""
Anomalyze REST API — FastAPI backend for the React dashboard.

Run:
  uvicorn api.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import anomalies, filters, logs

app = FastAPI(title="Anomalyze API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(filters.router, prefix="/api", tags=["filters"])
app.include_router(logs.router, prefix="/api/logs", tags=["logs"])
app.include_router(anomalies.router, prefix="/api/anomalies", tags=["anomalies"])


@app.get("/api/health")
def health():
    try:
        from api.database import get_client
        get_client().admin.command("ping")
        return {"status": "ok", "mongo": "connected"}
    except Exception as e:
        return {"status": "degraded", "mongo": str(e)}
