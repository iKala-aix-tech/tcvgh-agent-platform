"""Runtime settings. Every value comes from the environment (Cloud Run env vars / secrets)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    google_cloud_project: str
    region: str = "asia-east1"

    litellm_base_url: str
    litellm_api_key: str

    # Named Firestore database in asia-east1. The shared sandbox's "(default)" database is in nam5 (US).
    firestore_database: str = "tcvgh-agent-platform"
    upload_bucket: str
    allowed_domains: str = ""  # comma-separated Workspace domains allowed to sign in

    deid_enabled: bool = False
    deid_kms_wrapped_key: str = ""
    deid_kms_key_name: str = ""

    # Knowledge (Vertex AI RAG Engine). asia-east1 is a Preview region for RAG Engine (checked 2026-10-24).
    rag_enabled: bool = True
    rag_location: str = "asia-east1"
    # Multilingual embeddings so Chinese clinical documents retrieve well.
    rag_embedding_model: str = "publishers/google/models/text-multilingual-embedding-002"
    rag_chunk_size: int = 512
    rag_chunk_overlap: int = 100
    rag_top_k: int = 5
    max_upload_mb: int = 25

    @property
    def allowed_domain_list(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_domains.split(",") if d.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
