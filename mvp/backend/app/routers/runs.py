"""Run an agent (sandbox in the studio, later also channels). Content is de-identified
BEFORE it touches Firestore or LiteLLM (option B), so sessions never hold identified PHI."""
import time
import uuid

from fastapi import APIRouter, Depends, HTTPException
from openai import APIStatusError

from .. import db
from ..auth import User, current_user
from ..engine import deid, flow, llm
from ..schemas import AgentIn, ApproveRequest, RunRequest, RunResponse, StepTrace
from .agents import can_edit

router = APIRouter(prefix="/api/agents/{agent_id}", tags=["runs"])
HISTORY_TURNS = 10


def _agent_def(agent_id: str, user: User, use_published: bool) -> tuple[AgentIn, str | None]:
    ref = db.client().collection("agents").document(agent_id)
    snap = ref.get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    data = snap.to_dict() or {}
    editable = can_edit(data, user)
    if not editable and data.get("status") != "published":
        raise HTTPException(403, "agent is not published")
    if use_published or not editable:  # non-owners always run the published snapshot
        if not data.get("version"):
            raise HTTPException(409, "agent has no published version")
        data = ref.collection("versions").document(str(data["version"])).get().to_dict() or data
    return AgentIn.model_validate(data), (snap.to_dict() or {}).get("rag_corpus")


@router.post("/run", response_model=RunResponse)
def run_agent(agent_id: str, body: RunRequest, user: User = Depends(current_user)):
    agent, corpus = _agent_def(agent_id, user, body.use_published)

    session_id = body.session_id or uuid.uuid4().hex
    sess_ref = db.client().collection("sessions").document(session_id)
    sess = sess_ref.get().to_dict() or {"agent_id": agent_id, "uid": user.uid, "messages": [], "created_at": db.now()}
    if sess.get("uid") != user.uid:
        raise HTTPException(403, "not your session")

    safe_message = deid.deidentify(body.message)  # option B: pseudonymize at ingress
    history = [{"role": m["role"], "content": m["content"]} for m in sess["messages"][-2 * HISTORY_TURNS:]]

    t0 = time.perf_counter()
    try:
        r = flow.run_flow(agent, agent_id=agent_id, user_id=user.uid, user_message=safe_message,
                          history=history, rag_corpus=corpus)
    except APIStatusError as exc:
        if exc.status_code == 401:
            llm.reset_client_cache()
        raise HTTPException(502, f"model gateway error {exc.status_code}: {exc.message}") from exc
    latency = int((time.perf_counter() - t0) * 1000)

    sess["messages"] = [*sess["messages"], {"role": "user", "content": safe_message},
                        {"role": "assistant", "content": r.reply}]
    # A run that stopped at an approval node parks its state on the session; a new message discards it.
    sess["pending"] = {**r.pending, "agent_id": agent_id, "requested_by": user.uid, "use_published": body.use_published,
                       "at": db.now()} if r.pending else None
    sess["updated_at"] = db.now()
    sess_ref.set(sess)
    db.audit(user.uid, "agent.run", user.email, agent_id=agent_id, session_id=session_id, latency_ms=latency,
             models=[t.model for t in r.trace if t.model])

    return RunResponse(session_id=session_id, reply=r.reply, trace=r.trace, citations=r.citations,
                       structured=r.structured, pending_approval=_public_pending(r.pending), latency_ms=latency)


def _public_pending(p: dict | None) -> dict | None:
    """What the UI needs; ctx/grounding stay server-side."""
    return {"node_id": p["node_id"], "message": p["message"], "preview": p["preview"]} if p else None


@router.post("/approve", response_model=RunResponse)
def approve_run(agent_id: str, body: ApproveRequest, user: User = Depends(current_user)):
    """Agent owner (or admin) approves / rejects the step a run paused on, in the same conversation.
    Approve resumes the flow from the node after the approval node with the saved context."""
    snap = db.client().collection("agents").document(agent_id).get()
    if not snap.exists:
        raise HTTPException(404, "agent not found")
    if not can_edit(snap.to_dict() or {}, user):
        raise HTTPException(403, "only the agent owner can approve this step")
    sess_ref = db.client().collection("sessions").document(body.session_id)
    sess = sess_ref.get().to_dict()
    if not sess or sess.get("agent_id") != agent_id:
        raise HTTPException(404, "session not found")
    pending = sess.get("pending")
    if not pending:
        raise HTTPException(409, "nothing is waiting for approval in this session")

    sess["pending"] = None
    if not body.approve:
        reply = "已拒絕此步驟，流程停止。"
        sess["messages"] = [*sess["messages"], {"role": "assistant", "content": reply}]
        sess["updated_at"] = db.now()
        sess_ref.set(sess)
        db.audit(user.uid, "agent.reject", user.email, agent_id=agent_id, session_id=body.session_id, node_id=pending["node_id"])
        return RunResponse(session_id=body.session_id, reply=reply, latency_ms=0,
                           trace=[StepTrace(node_id=pending["node_id"], type="approval", summary="負責人拒絕，流程停止")])

    agent, corpus = _agent_def(agent_id, user, bool(pending.get("use_published")))
    history = [{"role": m["role"], "content": m["content"]} for m in sess["messages"][-2 * HISTORY_TURNS:]]
    t0 = time.perf_counter()
    try:
        r = flow.run_flow(agent, agent_id=agent_id, user_id=user.uid, user_message=str(pending["ctx"].get("input", "")),
                          history=history, rag_corpus=corpus, resume=pending)
    except APIStatusError as exc:
        if exc.status_code == 401:
            llm.reset_client_cache()
        raise HTTPException(502, f"model gateway error {exc.status_code}: {exc.message}") from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    latency = int((time.perf_counter() - t0) * 1000)
    sess["messages"] = [*sess["messages"], {"role": "assistant", "content": r.reply}]
    sess["pending"] = {**r.pending, "agent_id": agent_id, "requested_by": user.uid, "use_published": pending.get("use_published"),
                       "at": db.now()} if r.pending else None
    sess["updated_at"] = db.now()
    sess_ref.set(sess)
    db.audit(user.uid, "agent.approve", user.email, agent_id=agent_id, session_id=body.session_id, node_id=pending["node_id"],
             latency_ms=latency, models=[t.model for t in r.trace if t.model])
    return RunResponse(session_id=body.session_id, reply=r.reply, trace=r.trace, citations=r.citations,
                       structured=r.structured, pending_approval=_public_pending(r.pending), latency_ms=latency)
