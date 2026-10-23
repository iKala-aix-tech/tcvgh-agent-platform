"""Run an agent (test chat in the builder, later also channels). Content is de-identified
BEFORE it touches Firestore or LiteLLM (option B), so sessions never hold identified PHI."""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from openai import APIStatusError

from .. import db
from ..auth import User, current_user
from ..engine import deid, flow, llm
from ..schemas import AgentIn, RunRequest, RunResponse

router = APIRouter(prefix="/api/agents/{agent_id}", tags=["runs"])
HISTORY_TURNS = 10


def _agent_def(agent_id: str, user: User, use_published: bool) -> AgentIn:
    ref = db.client().collection("agents").document(agent_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    data = snap.to_dict() or {}
    if data.get("owner_uid") != user.uid and user.role != "admin" and data.get("status") != "published":
        raise HTTPException(403, "agent is not published")
    if use_published:
        if not data.get("version"):
            raise HTTPException(409, "agent has no published version")
        data = ref.collection("versions").document(str(data["version"])).get().to_dict() or data
    return AgentIn.model_validate(data)


@router.post("/run", response_model=RunResponse)
def run_agent(agent_id: str, body: RunRequest, user: User = Depends(current_user)):
    agent = _agent_def(agent_id, user, body.use_published)

    session_id = body.session_id or uuid.uuid4().hex
    sess_ref = db.client().collection("sessions").document(session_id)
    sess = sess_ref.get().to_dict() or {"agent_id": agent_id, "uid": user.uid, "messages": [], "created_at": db.now()}
    if sess.get("uid") != user.uid:
        raise HTTPException(403, "not your session")

    safe_message = deid.deidentify(body.message)  # option B: pseudonymize at ingress
    history = [{"role": m["role"], "content": m["content"]} for m in sess["messages"][-2 * HISTORY_TURNS:]]

    try:
        reply, trace, pending = flow.run_flow(agent, agent_id=agent_id, user_id=user.uid,
                                              user_message=safe_message, history=history)
    except APIStatusError as exc:
        if exc.status_code == 401:
            llm.reset_client_cache()
        raise HTTPException(502, f"model gateway error {exc.status_code}: {exc.message}") from exc

    sess["messages"] = [*sess["messages"], {"role": "user", "content": safe_message},
                        {"role": "assistant", "content": reply}]
    sess["updated_at"] = db.now()
    sess_ref.set(sess)
    db.audit(user.uid, "agent.run", agent_id=agent_id, session_id=session_id,
             models=[t.model for t in trace if t.model])

    return RunResponse(session_id=session_id, reply=reply, trace=trace, pending_approval=pending)
