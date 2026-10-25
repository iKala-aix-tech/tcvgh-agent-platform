"""Thin client to the LiteLLM proxy (column D).

Two auth layers when LiteLLM runs on Cloud Run with internal ingress + IAM:
  * Cloud Run IAM: a Google ID token for the LiteLLM URL audience, sent in
    `X-Serverless-Authorization` so it does not collide with LiteLLM's own `Authorization` key.
  * LiteLLM: the master/virtual key in `Authorization: Bearer`.
Locally (http://localhost:4000) the ID token step is skipped.
"""
import time
from dataclasses import dataclass
from functools import lru_cache

import google.auth.transport.requests
import google.oauth2.id_token
from openai import OpenAI

from ..config import settings

_SKIP_IAM_PREFIXES = ("http://localhost", "http://127.0.0.1")

# Our own price table, USD per 1M tokens (input, output), keyed by a substring of the served model id.
# LiteLLM's response-cost header is not used (MVP decision 2026-10-25); first match wins, so keep
# the more specific ids first. TODO: verify against the Vertex AI pricing page before billing anyone.
PRICES: tuple[tuple[str, float, float], ...] = (
    ("gemini-3.1-pro", 2.00, 12.00),
    ("gemini-3-flash", 0.50, 3.00),
    ("gemini-2.5-pro", 1.25, 10.00),
    ("gemini-2.5-flash", 0.30, 2.50),
    ("claude-sonnet", 3.00, 15.00),
    ("claude-haiku", 1.00, 5.00),
    ("gpt-5", 1.25, 10.00),
    ("nova-2-lite", 0.06, 0.24),
    ("gpt-oss", 0.0, 0.0),  # on-prem vLLM: no per-token charge
    ("gemma", 0.0, 0.0),
)
# Primary model per group, mirrors litellm/config.yaml. A served model outside this is a fallback.
PRIMARY: dict[str, str] = {"fast": "gemini-3-flash", "reasoning": "gemini-3.1-pro", "budget": "gemini-3-flash", "sovereign": "gpt-oss"}


def normalize_model(model: str) -> str:
    """'vertex_ai/gemini-3-flash-preview' -> 'gemini-3-flash-preview'."""
    return model.rsplit("/", 1)[-1]


def cost_usd(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    m = normalize_model(model)
    for needle, p_in, p_out in PRICES:
        if needle in m:
            return round((prompt_tokens * p_in + completion_tokens * p_out) / 1e6, 6)
    return 0.0


def is_fallback(group: str, model: str) -> bool:
    primary = PRIMARY.get(group)
    return bool(primary) and primary not in normalize_model(model)


@dataclass(frozen=True)
class Completion:
    text: str
    model: str  # served model (normalized), may differ from the group's primary on fallback
    prompt_tokens: int
    completion_tokens: int
    cost_usd: float
    ms: int


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
             temperature: float = 0.3, top_p: float | None = None, json_mode: bool = False) -> Completion:
    """One chat completion through the proxy. `group` is a LiteLLM model group alias."""
    client = _client()
    t0 = time.perf_counter()
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
    model = normalize_model(getattr(resp, "model", None) or group)
    usage = getattr(resp, "usage", None)
    p_tok = int(getattr(usage, "prompt_tokens", 0) or 0)
    c_tok = int(getattr(usage, "completion_tokens", 0) or 0)
    return Completion(text=text, model=model, prompt_tokens=p_tok, completion_tokens=c_tok,
                      cost_usd=cost_usd(model, p_tok, c_tok), ms=int((time.perf_counter() - t0) * 1000))


def reset_client_cache() -> None:
    """ID tokens expire after 1h; call when a 401 comes back from Cloud Run."""
    _client.cache_clear()
