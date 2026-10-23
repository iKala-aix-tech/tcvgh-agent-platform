"""TCVGH Agent Platform: Platform API + Agent Runtime (FastAPI on Cloud Run)."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import agents, runs

app = FastAPI(title="TCVGH Agent Platform API", version="0.1.0")

# In production the frontend is served by Firebase Hosting with /api/* rewritten to this
# service (same origin), so CORS only matters for `npm run dev`.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

app.include_router(agents.router)
app.include_router(runs.router)


@app.get("/api/health")
def health():
    # Note: Cloud Run's frontend answers /healthz itself (404), so health lives under /api.
    s = settings()
    return {"ok": True, "project": s.google_cloud_project, "region": s.region, "deid_enabled": s.deid_enabled}


@app.get("/api/me")
def me():
    # Resolved by the auth dependency in a later iteration; kept simple for smoke tests.
    return {"status": "use /api/agents with a Firebase ID token"}
