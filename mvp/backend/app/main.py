"""TCVGH Agent Platform: Platform API + Agent Runtime (FastAPI on Cloud Run)."""
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import User, current_user
from .config import settings
from .routers import agents, audit, connectors, knowledge, runs

app = FastAPI(title="TCVGH Agent Platform API", version="0.2.0")

# In production the frontend is served by Firebase Hosting with /api/* rewritten to this
# service (same origin), so CORS only matters for `npm run dev`.
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_methods=["*"], allow_headers=["*"])

app.include_router(agents.router)
app.include_router(runs.router)
app.include_router(knowledge.router)
app.include_router(audit.router)
app.include_router(connectors.router)


@app.get("/api/health")
def health():
    # Note: Cloud Run's frontend answers /healthz itself (404), so health lives under /api.
    s = settings()
    return {"ok": True, "project": s.google_cloud_project, "region": s.region, "deid_enabled": s.deid_enabled,
            "rag_enabled": s.rag_enabled, "rag_location": s.rag_location}


@app.get("/api/me")
def me(user: User = Depends(current_user)):
    return {"uid": user.uid, "email": user.email, "name": user.name, "role": user.role}
