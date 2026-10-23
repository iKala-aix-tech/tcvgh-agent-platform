"""Option B: de-identify (pseudonymize) text before it is stored or sent to any model.

Uses Sensitive Data Protection `deidentify_content` with deterministic encryption
(CryptoDeterministicConfig) so the same real value always maps to the same token inside a
request, which lets the model still reason about "the same patient". The AES key is wrapped by
Cloud KMS; only the backend SA can unwrap it, and `reidentify` is a separate, audited call.

When DEID_ENABLED=false (sandbox smoke tests) text passes through unchanged.
"""
from functools import lru_cache

from google.cloud import dlp_v2

from ..config import settings

# Built-in infoTypes relevant to a Taiwanese hospital. Add custom regex infoTypes for the
# hospital's own chart / MRN formats once TCVGH shares the patterns.
INFO_TYPES = [
    "PERSON_NAME",
    "TAIWAN_NATIONAL_ID_NUMBER",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "DATE_OF_BIRTH",
    "MEDICAL_RECORD_NUMBER",
    "STREET_ADDRESS",
    "PASSPORT",
]
SURROGATE = "PHI"  # tokens look like PHI(12):AbCd...


@lru_cache
def _client() -> dlp_v2.DlpServiceClient:
    return dlp_v2.DlpServiceClient()


def _crypto_config() -> dict:
    s = settings()
    return {
        "crypto_deterministic_config": {
            "crypto_key": {"kms_wrapped": {"wrapped_key": s.deid_kms_wrapped_key, "crypto_key_name": s.deid_kms_key_name}},
            "surrogate_info_type": {"name": SURROGATE},
        }
    }


def deidentify(text: str) -> str:
    s = settings()
    if not s.deid_enabled or not text.strip():
        return text
    parent = f"projects/{s.google_cloud_project}/locations/{s.region}"
    resp = _client().deidentify_content(
        request={
            "parent": parent,
            "inspect_config": {"info_types": [{"name": t} for t in INFO_TYPES], "min_likelihood": "POSSIBLE"},
            "deidentify_config": {
                "info_type_transformations": {"transformations": [{"primitive_transformation": _crypto_config()}]}
            },
            "item": {"value": text},
        }
    )
    return resp.item.value


def reidentify(text: str) -> str:
    """Reverse the pseudonymization. Only expose to users holding the admin/clinician role; every call is audited."""
    s = settings()
    if not s.deid_enabled or not text.strip():
        return text
    parent = f"projects/{s.google_cloud_project}/locations/{s.region}"
    resp = _client().reidentify_content(
        request={
            "parent": parent,
            "reidentify_config": {
                "info_type_transformations": {"transformations": [{"primitive_transformation": _crypto_config()}]}
            },
            "inspect_config": {"custom_info_types": [{"info_type": {"name": SURROGATE}, "surrogate_type": {}}]},
            "item": {"value": text},
        }
    )
    return resp.item.value
