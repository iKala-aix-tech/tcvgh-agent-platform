"""Firestore access. Collections:

agents/{agentId}                 draft definition (mutable)      owner_uid, name, ..., flow{nodes,edges}
agents/{agentId}/versions/{n}    immutable snapshot on publish
sessions/{sessionId}             test-chat / channel conversations, pseudonymized content only
audit/{autoId}                   who did what, when (append-only)
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


def audit(actor_uid: str, action: str, **details) -> None:
    client().collection("audit").add({"actor": actor_uid, "action": action, "at": now(), **details})
