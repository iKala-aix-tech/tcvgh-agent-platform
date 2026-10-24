"""Knowledge files: upload -> GCS (audit copy) -> Vertex AI RAG Engine corpus (one per agent).

The corpus is created lazily on the first upload so agents without knowledge cost nothing.
Indexing happens synchronously inside the request (RAG Engine `upload_file` chunks + embeds);
Cloud Run timeout is 300 s which comfortably covers a 25 MB PDF.
"""
import logging
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from google.api_core.exceptions import NotFound
from google.cloud import firestore, storage

from .. import db
from ..auth import User, current_user
from ..config import settings
from ..schemas import KnowledgeFileOut
from .agents import load_editable, load_visible

router = APIRouter(tags=["knowledge"])
log = logging.getLogger(__name__)

ALLOWED_SUFFIXES = {".pdf", ".txt", ".md", ".docx", ".pptx", ".html", ".csv", ".json"}


def _out(agent_id: str, agent_name: str, doc) -> KnowledgeFileOut:
    return KnowledgeFileOut(id=doc.id, agent_id=agent_id, agent_name=agent_name, **(doc.to_dict() or {}))


@router.get("/api/agents/{agent_id}/knowledge", response_model=list[KnowledgeFileOut])
def list_knowledge(agent_id: str, user: User = Depends(current_user)):
    snap = load_visible(agent_id, user)
    name = (snap.to_dict() or {}).get("name", "")
    q = snap.reference.collection("knowledge").order_by("created_at", direction=firestore.Query.DESCENDING)
    return [_out(agent_id, name, d) for d in q.stream()]


@router.get("/api/knowledge", response_model=list[KnowledgeFileOut])
def library(user: User = Depends(current_user)):
    """Knowledge library page: every file on agents the user can see (own + published)."""
    col = db.client().collection("agents")
    agents: dict[str, dict] = {}
    for d in col.where(filter=firestore.FieldFilter("owner_uid", "==", user.uid)).stream():
        agents[d.id] = d.to_dict() or {}
    for d in col.where(filter=firestore.FieldFilter("status", "==", "published")).stream():
        agents.setdefault(d.id, d.to_dict() or {})
    out: list[KnowledgeFileOut] = []
    for aid, a in agents.items():
        if not a.get("knowledge_count"):
            continue
        for f in col.document(aid).collection("knowledge").stream():
            out.append(_out(aid, a.get("name", ""), f))
    return sorted(out, key=lambda f: str(f.created_at or ""), reverse=True)


@router.post("/api/agents/{agent_id}/knowledge", response_model=KnowledgeFileOut, status_code=201)
async def upload_knowledge(agent_id: str, file: UploadFile = File(...), user: User = Depends(current_user)):
    s = settings()
    if not s.rag_enabled:
        raise HTTPException(503, "knowledge is disabled (RAG_ENABLED=false)")
    snap = load_editable(agent_id, user)
    agent = snap.to_dict() or {}
    filename = Path(file.filename or "upload").name
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(415, f"unsupported file type {suffix}; allowed: {', '.join(sorted(ALLOWED_SUFFIXES))}")
    data = await file.read()
    if len(data) > s.max_upload_mb * 1024 * 1024:
        raise HTTPException(413, f"file exceeds {s.max_upload_mb} MB")

    # 1. Audit copy in the upload bucket (versioned, no public access).
    kref = snap.reference.collection("knowledge").document()
    blob_path = f"agents/{agent_id}/knowledge/{kref.id}/{filename}"
    bucket = storage.Client(project=s.google_cloud_project).bucket(s.upload_bucket)
    bucket.blob(blob_path).upload_from_string(data, content_type=file.content_type or "application/octet-stream")
    gcs_uri = f"gs://{s.upload_bucket}/{blob_path}"

    record = {"name": filename, "content_type": file.content_type or "", "size_bytes": len(data), "gcs_uri": gcs_uri,
              "rag_file": None, "status": "indexing", "error": "", "uploaded_by": user.email, "created_at": db.now()}
    kref.set(record)

    # 2. Index into the agent's corpus (created on first upload).
    from ..engine import rag

    try:
        corpus = agent.get("rag_corpus")
        if not corpus:
            corpus = rag.create_corpus(f"tcvgh-agent-{agent_id}", agent.get("name", ""))
            snap.reference.update({"rag_corpus": corpus})
        with tempfile.TemporaryDirectory() as tmp:
            local = Path(tmp) / f"upload{suffix}"  # ASCII path; real name goes in display_name
            local.write_bytes(data)
            rag_file = rag.upload_file(corpus, str(local), filename)
        record.update({"rag_file": rag_file, "status": "indexed"})
        kref.update({"rag_file": rag_file, "status": "indexed"})
        snap.reference.update({"knowledge_count": firestore.Increment(1), "updated_at": db.now()})
    except Exception as exc:  # keep the record so the UI can show the failure and allow retry/delete
        msg = f"{exc.__class__.__name__}: {exc}"[:500]
        record.update({"status": "error", "error": msg})
        kref.update({"status": "error", "error": msg})
        db.audit(user.uid, "knowledge.error", user.email, agent_id=agent_id, file=filename, error=msg)
        raise HTTPException(502, f"indexing failed: {msg}") from exc

    db.audit(user.uid, "knowledge.upload", user.email, agent_id=agent_id, file=filename, bytes=len(data))
    return KnowledgeFileOut(id=kref.id, agent_id=agent_id, agent_name=agent.get("name", ""), **record)


@router.delete("/api/agents/{agent_id}/knowledge/{file_id}", status_code=204)
def delete_knowledge(agent_id: str, file_id: str, user: User = Depends(current_user)):
    snap = load_editable(agent_id, user)
    kref = snap.reference.collection("knowledge").document(file_id)
    k = kref.get()
    if not k.exists:
        raise HTTPException(404, "file not found")
    rec = k.to_dict() or {}
    if rec.get("rag_file"):
        from ..engine import rag

        rag.delete_file(rec["rag_file"])
    try:
        s = settings()
        storage.Client(project=s.google_cloud_project).bucket(s.upload_bucket).blob(
            rec["gcs_uri"].removeprefix(f"gs://{s.upload_bucket}/")).delete()
    except NotFound:  # audit copy already gone; not fatal
        log.warning("gcs object missing for knowledge file %s", file_id)
    kref.delete()
    if rec.get("status") == "indexed":
        snap.reference.update({"knowledge_count": firestore.Increment(-1), "updated_at": db.now()})
    db.audit(user.uid, "knowledge.delete", user.email, agent_id=agent_id, file=rec.get("name"))
