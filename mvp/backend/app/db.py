"""Firestore access. Collections:

agents/{agentId}                 draft definition (mutable)      owner_uid, name, ..., flow{nodes,edges}, knowledge_doc_ids
agents/{agentId}/versions/{n}    immutable snapshot on publish
agents/{agentId}/knowledge/{id}  LEGACY per-agent files (before the library; see scripts/migrate_knowledge_library.py)
documents/{docId}                hospital knowledge library: name, category, department, gcs_uri, deid_uri, rag_file, version
config/knowledge                 {rag_corpus}: the single hospital RAG corpus
sessions/{sessionId}             test-chat / channel conversations, pseudonymized content only
audit/{autoId}                   who did what, when (append-only)
usage/{autoId}                   one row per LLM call: tokens, cost, served model (no prompt text)
usage_daily/{day}_{agentId}      per-agent daily rollup read by the admin monitoring dashboard
"""
from datetime import UTC, datetime
from functools import lru_cache

from google.cloud import firestore

from .config import settings


@lru_cache
def client() -> firestore.Client:
    return firestore.Client(project=settings().google_cloud_project, database=settings().firestore_database)


def now() -> datetime:
    return datetime.now(UTC)


def audit(actor_uid: str, action: str, actor_email: str = "", **details) -> None:
    client().collection("audit").add({"actor": actor_uid, "actor_email": actor_email, "action": action,
                                      "at": now(), **details})
