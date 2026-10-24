"""Agent CRUD + publish.

Visibility (decided 2026-10-24): publish == hospital-wide. Everyone signed in sees every published
agent in the Hub and may run its published version; only the owner (or an admin) edits, publishes
or deletes. Drafts are private to their owner.
"""
from fastapi import APIRouter, Depends, HTTPException
from google.cloud import firestore

from .. import db
from ..auth import User, current_user
from ..config import settings
from ..engine.flow import validate_flow
from ..schemas import AgentIn, AgentOut, Flow, HubStats

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _doc_to_out(doc) -> AgentOut:
    d = doc.to_dict() or {}
    return AgentOut(id=doc.id, **d)


def can_edit(data: dict, user: User) -> bool:
    return data.get("owner_uid") == user.uid or user.role == "admin"


def load_editable(agent_id: str, user: User):
    snap = db.client().collection("agents").document(agent_id).get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    if not can_edit(snap.to_dict() or {}, user):
        raise HTTPException(403, "not your agent")
    return snap


def load_visible(agent_id: str, user: User):
    snap = db.client().collection("agents").document(agent_id).get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    data = snap.to_dict() or {}
    if not can_edit(data, user) and data.get("status") != "published":
        raise HTTPException(403, "agent is not published")
    return snap


@router.get("", response_model=list[AgentOut])
def list_agents(user: User = Depends(current_user)):
    """Own agents (any status) + everyone's published agents, newest first."""
    col = db.client().collection("agents")
    seen: dict[str, AgentOut] = {}
    mine = col.where(filter=firestore.FieldFilter("owner_uid", "==", user.uid))
    for d in mine.order_by("updated_at", direction=firestore.Query.DESCENDING).stream():
        seen[d.id] = _doc_to_out(d)
    published = col.where(filter=firestore.FieldFilter("status", "==", "published"))
    for d in published.order_by("updated_at", direction=firestore.Query.DESCENDING).stream():
        seen.setdefault(d.id, _doc_to_out(d))
    return sorted(seen.values(), key=lambda a: str(a.updated_at or ""), reverse=True)


@router.get("/stats", response_model=HubStats)
def hub_stats(user: User = Depends(current_user)):
    c = db.client()
    agents = c.collection("agents")
    mine = list(agents.where(filter=firestore.FieldFilter("owner_uid", "==", user.uid)).stream())
    published = list(agents.where(filter=firestore.FieldFilter("status", "==", "published")).stream())
    start = db.now().replace(hour=0, minute=0, second=0, microsecond=0)
    runs_today = sum(1 for _ in c.collection("audit")
                     .where(filter=firestore.FieldFilter("action", "==", "agent.run"))
                     .where(filter=firestore.FieldFilter("at", ">=", start)).stream())
    knowledge = sum(int((d.to_dict() or {}).get("knowledge_count", 0)) for d in mine)
    return HubStats(
        my_agents=len(mine),
        my_published=sum(1 for d in mine if (d.to_dict() or {}).get("status") == "published"),
        hospital_published=len(published),
        runs_today=runs_today,
        knowledge_files=knowledge,
        deid_enabled=settings().deid_enabled,
    )


@router.post("", response_model=AgentOut, status_code=201)
def create_agent(body: AgentIn, user: User = Depends(current_user)):
    ref = db.client().collection("agents").document()
    data = {**body.model_dump(), "owner_uid": user.uid, "owner_email": user.email, "status": "draft",
            "version": 0, "rag_corpus": None, "knowledge_count": 0, "created_at": db.now(), "updated_at": db.now()}
    ref.set(data)
    db.audit(user.uid, "agent.create", user.email, agent_id=ref.id, name=body.name)
    return AgentOut(id=ref.id, **data)


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: str, user: User = Depends(current_user)):
    return _doc_to_out(load_visible(agent_id, user))


@router.post("/validate")
def validate(flow: Flow, user: User = Depends(current_user)):
    return {"problems": validate_flow(flow)}


@router.put("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, body: AgentIn, user: User = Depends(current_user)):
    snap = load_editable(agent_id, user)
    data = {**body.model_dump(), "updated_at": db.now()}
    snap.reference.update(data)
    db.audit(user.uid, "agent.update", user.email, agent_id=agent_id)
    return _doc_to_out(snap.reference.get())


@router.post("/{agent_id}/publish", response_model=AgentOut)
def publish_agent(agent_id: str, user: User = Depends(current_user)):
    """Snapshot the draft into an immutable version and make the agent visible hospital-wide."""
    snap = load_editable(agent_id, user)
    data = snap.to_dict() or {}
    problems = validate_flow(Flow.model_validate(data.get("flow") or {}))
    if problems:
        raise HTTPException(422, "; ".join(problems))
    version = int(data.get("version", 0)) + 1
    snap.reference.collection("versions").document(str(version)).set(
        {**data, "version": version, "published_at": db.now(), "published_by": user.uid}
    )
    snap.reference.update({"status": "published", "version": version, "updated_at": db.now(), "published_at": db.now()})
    db.audit(user.uid, "agent.publish", user.email, agent_id=agent_id, version=version)
    return _doc_to_out(snap.reference.get())


@router.post("/{agent_id}/unpublish", response_model=AgentOut)
def unpublish_agent(agent_id: str, user: User = Depends(current_user)):
    snap = load_editable(agent_id, user)
    snap.reference.update({"status": "draft", "updated_at": db.now()})
    db.audit(user.uid, "agent.unpublish", user.email, agent_id=agent_id)
    return _doc_to_out(snap.reference.get())


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, user: User = Depends(current_user)):
    snap = load_editable(agent_id, user)
    data = snap.to_dict() or {}
    if data.get("rag_corpus"):
        from ..engine import rag

        rag.delete_corpus(data["rag_corpus"])
    for k in snap.reference.collection("knowledge").stream():
        k.reference.delete()
    snap.reference.delete()
    db.audit(user.uid, "agent.delete", user.email, agent_id=agent_id)
