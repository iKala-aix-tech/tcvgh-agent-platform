"""Agent CRUD + publish. Builders see their own agents; admins see all."""
from fastapi import APIRouter, Depends, HTTPException
from google.cloud import firestore

from .. import db
from ..auth import User, current_user
from ..schemas import AgentIn, AgentOut

router = APIRouter(prefix="/api/agents", tags=["agents"])


def _doc_to_out(doc) -> AgentOut:
    d = doc.to_dict() or {}
    return AgentOut(id=doc.id, **d)


def _load(agent_id: str, user: User):
    snap = db.client().collection("agents").document(agent_id).get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    data = snap.to_dict() or {}
    if data.get("owner_uid") != user.uid and user.role != "admin":
        raise HTTPException(403, "not your agent")
    return snap


@router.get("", response_model=list[AgentOut])
def list_agents(user: User = Depends(current_user)):
    col = db.client().collection("agents")
    q = col if user.role == "admin" else col.where(filter=firestore.FieldFilter("owner_uid", "==", user.uid))
    return [_doc_to_out(d) for d in q.order_by("updated_at", direction=firestore.Query.DESCENDING).stream()]


@router.post("", response_model=AgentOut, status_code=201)
def create_agent(body: AgentIn, user: User = Depends(current_user)):
    ref = db.client().collection("agents").document()
    data = {**body.model_dump(), "owner_uid": user.uid, "owner_email": user.email, "status": "draft",
            "version": 0, "created_at": db.now(), "updated_at": db.now()}
    ref.set(data)
    db.audit(user.uid, "agent.create", agent_id=ref.id, name=body.name)
    return AgentOut(id=ref.id, **data)


@router.get("/{agent_id}", response_model=AgentOut)
def get_agent(agent_id: str, user: User = Depends(current_user)):
    return _doc_to_out(_load(agent_id, user))


@router.put("/{agent_id}", response_model=AgentOut)
def update_agent(agent_id: str, body: AgentIn, user: User = Depends(current_user)):
    snap = _load(agent_id, user)
    data = {**body.model_dump(), "updated_at": db.now()}
    snap.reference.update(data)
    db.audit(user.uid, "agent.update", agent_id=agent_id)
    return _doc_to_out(snap.reference.get())


@router.post("/{agent_id}/publish", response_model=AgentOut)
def publish_agent(agent_id: str, user: User = Depends(current_user)):
    """Snapshot the draft into an immutable version. Runs with use_published=true read the snapshot."""
    snap = _load(agent_id, user)
    data = snap.to_dict() or {}
    version = int(data.get("version", 0)) + 1
    snap.reference.collection("versions").document(str(version)).set(
        {**data, "version": version, "published_at": db.now(), "published_by": user.uid}
    )
    snap.reference.update({"status": "published", "version": version, "updated_at": db.now()})
    db.audit(user.uid, "agent.publish", agent_id=agent_id, version=version)
    return _doc_to_out(snap.reference.get())


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str, user: User = Depends(current_user)):
    snap = _load(agent_id, user)
    snap.reference.delete()
    db.audit(user.uid, "agent.delete", agent_id=agent_id)
