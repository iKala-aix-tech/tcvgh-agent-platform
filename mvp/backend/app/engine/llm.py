"""Thin client to the LiteLLM proxy (column D).

Two auth layers when LiteLLM runs on Cloud Run with internal ingress + IAM:
  * Cloud Run IAM: a Google ID token for the LiteLLM URL audience, sent in
    `X-Serverless-Authorization` so it does not collide with LiteLLM's own `Authorization` key.
  * LiteLLM: the master/virtual key in `Authorization: Bearer`.
Locally (http://localhost:4000) the ID token step is skipped.
"""
from functools import lru_cache

import google.auth.transport.requests
import google.oauth2.id_token
from openai import OpenAI

from ..config import settings

_SKIP_IAM_PREFIXES = ("http://localhost", "http://127.0.0.1")


def _id_token(audience: str) -> str | None:
    if audience.startswith(_SKIP_IAM_PREFIXES):
        return None
    req = google.auth.transport.requests.Request()
    return google.oauth2.id_token.fetch_id_token(req, audience)


@lru_cache
def _client() -> OpenAI:
    s = settings()
    headers = {}
    tok = _id_token(s.litellm_base_url)
    if tok:
        headers["X-Serverless-Authorization"] = f"Bearer {tok}"
    return OpenAI(base_url=f"{s.litellm_base_url.rstrip('/')}/v1", api_key=s.litellm_api_key,
                  default_headers=headers, timeout=120)


def complete(*, group: str, system: str, messages: list[dict], agent_id: str, user_id: str,
             temperature: float = 0.3, top_p: float | None = None, json_mode: bool = False) -> tuple[str, str]:
    """Return (reply_text, model_actually_used). `group` is a LiteLLM model group alias."""
    client = _client()
    kwargs: dict = {}
    if top_p is not None:
        kwargs["top_p"] = top_p
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    resp = client.chat.completions.create(
        model=group,
        messages=[{"role": "system", "content": system}, *messages],
        temperature=temperature,
        user=user_id,
        # LiteLLM reads these for spend attribution and tag-based routing.
        extra_body={"metadata": {"agent_id": agent_id, "model_group": group, "tags": [f"agent:{agent_id}"]}},
        **kwargs,
    )
    text = resp.choices[0].message.content or ""
    return text, getattr(resp, "model", group)


def reset_client_cache() -> None:
    """ID tokens expire after 1h; call when a 401 comes back from Cloud Run."""
    _client.cache_clear()
