"""Pydantic models shared by the API and the flow interpreter.

The canvas (React Flow) saves `nodes` and `edges`. Each node has a `type` from NODE_TYPES and a
`data` dict with the fields the left/right panels edit. The interpreter only trusts these schemas.
"""
from typing import Any, Literal

from pydantic import BaseModel, Field

ModelGroup = Literal["fast", "reasoning", "budget", "sovereign"]
# Node palette (matches the Agent Studio design):
#   input             user message / trigger
#   his_emr           HIS / EMR fetch (stub until the FHIR gateway exists)
#   pii_mask          de-identification step (Sensitive Data Protection, same engine as ingress)
#   knowledge         retrieval from the agent's RAG corpus (Vertex AI RAG Engine)
#   llm               one model call
#   condition         yes/no branch
#   tool              connector action (stub)
#   approval          human-in-the-loop pause
#   structured_output model call constrained to a JSON schema
#   output            final reply template
NodeType = Literal[
    "input", "his_emr", "pii_mask", "knowledge", "llm", "condition", "tool", "approval", "structured_output", "output"
]
NODE_TYPES: tuple[str, ...] = (
    "input", "his_emr", "pii_mask", "knowledge", "llm", "condition", "tool", "approval", "structured_output", "output"
)
AgentCategory = Literal["clinical", "admin", "consultation"]


class RoutingPolicy(BaseModel):
    """Per-agent routing policy (diagram column D, 'Model routing policy')."""

    default_group: ModelGroup = "fast"
    reasoning_keywords: list[str] = Field(default_factory=lambda: ["分析", "比較", "plan", "why", "summarize"])
    sovereign_only: bool = False  # true => every step forced to on-prem group, no cloud fallback
    max_cost_tier: Literal["budget", "fast", "reasoning"] = "reasoning"


class Connector(BaseModel):
    provider: Literal["gmail", "calendar", "drive", "docs"]
    scopes: list[str] = Field(default_factory=list)
    requires_approval: bool = True  # human-in-the-loop for write actions (MVP default)


class FlowNode(BaseModel):
    id: str
    type: NodeType
    position: dict[str, float] = Field(default_factory=dict)
    data: dict[str, Any] = Field(default_factory=dict)


class FlowEdge(BaseModel):
    id: str
    source: str
    target: str
    sourceHandle: str | None = None  # "true"/"false" on condition nodes
    label: str | None = None


class Flow(BaseModel):
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)


class TestCase(BaseModel):
    """Preset prompt shown in the sandbox's '預載個案' picker."""

    title: str = Field(min_length=1, max_length=80)
    message: str = Field(min_length=1, max_length=4000)


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    instructions: str = ""
    category: AgentCategory = "clinical"
    department: str = ""  # free text, e.g. 心臟內科 (CV)
    code: str = ""  # short specialty code shown on hub cards, e.g. CARD-801
    model_group: ModelGroup = "fast"
    temperature: float = Field(default=0.3, ge=0, le=2)
    top_p: float = Field(default=0.95, ge=0, le=1)
    routing: RoutingPolicy = Field(default_factory=RoutingPolicy)
    connectors: list[Connector] = Field(default_factory=list)
    flow: Flow = Field(default_factory=Flow)
    test_cases: list[TestCase] = Field(default_factory=list)


class AgentOut(AgentIn):
    id: str
    owner_uid: str
    owner_email: str
    status: Literal["draft", "published"] = "draft"
    version: int = 0
    rag_corpus: str | None = None  # Vertex AI RAG corpus resource name, created on first upload
    knowledge_count: int = 0
    created_at: Any = None
    updated_at: Any = None
    published_at: Any = None


class KnowledgeFileOut(BaseModel):
    id: str
    agent_id: str
    agent_name: str = ""
    name: str
    content_type: str = ""
    size_bytes: int = 0
    gcs_uri: str
    rag_file: str | None = None  # RAG Engine ragFile resource name
    status: Literal["indexing", "indexed", "error"] = "indexing"
    error: str = ""
    uploaded_by: str = ""
    created_at: Any = None


class RunRequest(BaseModel):
    message: str = Field(min_length=1, max_length=20000)
    session_id: str | None = None
    use_published: bool = False


class StepTrace(BaseModel):
    node_id: str
    type: str
    model: str | None = None
    group: str | None = None
    summary: str
    ms: int = 0


class Citation(BaseModel):
    source: str  # display name of the knowledge file
    uri: str = ""
    score: float | None = None
    text: str = ""  # chunk excerpt


class RunResponse(BaseModel):
    session_id: str
    reply: str
    trace: list[StepTrace]
    citations: list[Citation] = Field(default_factory=list)
    structured: dict[str, Any] | None = None  # parsed JSON from a structured_output node, if any
    pending_approval: dict[str, Any] | None = None
    latency_ms: int = 0


class AuditEntry(BaseModel):
    id: str
    actor: str
    actor_email: str = ""
    action: str
    at: Any = None
    details: dict[str, Any] = Field(default_factory=dict)


class HubStats(BaseModel):
    my_agents: int = 0
    my_published: int = 0
    hospital_published: int = 0
    runs_today: int = 0
    knowledge_files: int = 0
    deid_enabled: bool = False


# ------------------------------------------------------------------ connectors (shared, hospital-wide)
class ConnectorIn(BaseModel):
    type: str = Field(min_length=1, max_length=32)  # key of engine.connectors.TYPES
    label: str = Field(min_length=1, max_length=120)
    scope: str = ""  # 適用情境與臨床呼叫範圍
    config: dict[str, Any] = Field(default_factory=dict)  # non-secret fields
    secrets: dict[str, str] = Field(default_factory=dict)  # field -> plaintext; only on create / when changing
    redact_pii: bool = True
    audit_payloads: bool = True


class ConnectorOut(BaseModel):
    id: str
    type: str
    label: str
    scope: str = ""
    config: dict[str, Any] = Field(default_factory=dict)
    secret_fields: list[str] = Field(default_factory=list)  # which secret fields are set (values never returned)
    redact_pii: bool = True
    audit_payloads: bool = True
    owner_uid: str
    owner_email: str
    status: Literal["unverified", "active", "error"] = "unverified"
    last_test: dict[str, Any] | None = None  # {ok, message, ms, at, tools?}
    agents_count: int = 0
    created_at: Any = None
    updated_at: Any = None


class ConnectorStats(BaseModel):
    connected: int = 0
    available_types: int = 0
    invocations_today: int = 0
    mcp_nodes: int = 0

