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

    @property
    def allowed_domain_list(self) -> list[str]:
        return [d.strip().lower() for d in self.allowed_domains.split(",") if d.strip()]


@lru_cache
def settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
