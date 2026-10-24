"""Audit trail (design: 資安審計與推論軌跡). Admins see everything; builders see their own actions."""
from fastapi import APIRouter, Depends, Query
from google.cloud import firestore

from .. import db
from ..auth import User, current_user
from ..schemas import AuditEntry

router = APIRouter(prefix="/api/audit", tags=["audit"])
_CORE = {"actor", "actor_email", "action", "at"}


@router.get("", response_model=list[AuditEntry])
def list_audit(limit: int = Query(100, le=500), action: str | None = None, user: User = Depends(current_user)):
    col = db.client().collection("audit")
    q = col if user.role == "admin" else col.where(filter=firestore.FieldFilter("actor", "==", user.uid))
    if action:
        q = q.where(filter=firestore.FieldFilter("action", "==", action))
    out = []
    for d in q.order_by("at", direction=firestore.Query.DESCENDING).limit(limit).stream():
        r = d.to_dict() or {}
        out.append(AuditEntry(id=d.id, actor=r.get("actor", ""), actor_email=r.get("actor_email", ""),
                              action=r.get("action", ""), at=r.get("at"),
                              details={k: v for k, v in r.items() if k not in _CORE}))
    return out
