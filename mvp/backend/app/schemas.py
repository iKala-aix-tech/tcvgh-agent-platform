"""Pydantic models shared by the API and the flow interpreter.

The canvas (React Flow) saves `nodes` and `edges`. Each node has a `type` from NODE_TYPES and a
`data` dict with the fields the left/right panels edit. The interpreter only trusts these schemas.
"""
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

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
# Fixed department list (monitoring filters group by it). Keep in sync with frontend/src/types.ts.
DEPARTMENTS: tuple[str, ...] = (
    "內科部", "外科部", "急診醫學部", "心臟血管中心", "神經醫學中心", "新陳代謝科", "放射線部", "護理部", "藥劑部",
    "感染管制中心", "臨床試驗與轉譯研究中心", "智慧醫療組 (IT)",
)


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
    department: str = ""  # one of DEPARTMENTS or "" (legacy free-text values read back as "")
    code: str = ""  # short specialty code shown on hub cards, e.g. CARD-801
    model_group: ModelGroup = "fast"
    temperature: float = Field(default=0.3, ge=0, le=2)
    top_p: float = Field(default=0.95, ge=0, le=1)
    routing: RoutingPolicy = Field(default_factory=RoutingPolicy)
    connectors: list[Connector] = Field(default_factory=list)
    flow: Flow = Field(default_factory=Flow)
    test_cases: list[TestCase] = Field(default_factory=list)

    @field_validator("department", mode="before")
    @classmethod
    def _known_department(cls, v: object) -> str:
        return v if isinstance(v, str) and v in DEPARTMENTS else ""


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


class ApproveRequest(BaseModel):
    session_id: str
    approve: bool = True


class StepTrace(BaseModel):
    node_id: str
    type: str
    model: str | None = None
    group: str | None = None
    summary: str
    ms: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0


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
    # Derived at read time from action + details (nothing extra is stored on the audit doc).
    category: str = "other"  # inference | connector | build | access | other
    severity: str = "info"  # info | success | warning
    target_kind: str = ""  # agent | connector | system | ""
    target_id: str = ""
    target_label: str = ""
    agent_label: str = ""  # name of the agent involved (also set for connector calls made by an agent)
    department: str = ""  # that agent's department, "" when unknown
    details: dict[str, Any] = Field(default_factory=dict)


class AuditPage(BaseModel):
    items: list[AuditEntry]
    next_cursor: str | None = None  # pass back as ?cursor= for the next page
    scanned: int = 0  # audit docs read to fill this page (filters run in the backend)
    truncated: bool = False  # scan cap hit before the page filled; more matches may follow the cursor


class AuditCount(BaseModel):
    key: str
    label: str = ""
    count: int


class AuditSummary(BaseModel):
    day: str  # YYYY-MM-DD, Asia/Taipei
    total: int
    total_yesterday: int
    delta_pct: float | None = None
    by_category: dict[str, int] = Field(default_factory=dict)
    connector_calls: int = 0
    connector_failed: int = 0
    top_connectors: list[AuditCount] = Field(default_factory=list)
    warnings: int = 0
    warning_breakdown: list[AuditCount] = Field(default_factory=list)
    active_users: int = 0
    run_users: int = 0  # distinct people who ran an agent today
    build_users: int = 0  # distinct people who changed an agent, knowledge, or connector today
    agents_invoked: int = 0
    capped: bool = False  # today's scan hit the cap; counts are lower bounds


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



# ------------------------------------------------------------------ monitoring (admin-only)
class ModelSlice(BaseModel):
    model: str
    requests: int = 0
    tokens: int = 0
    cost_usd: float = 0.0


class DailyPoint(BaseModel):
    date: str  # YYYY-MM-DD, Asia/Taipei
    requests: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    by_model: list[ModelSlice] = Field(default_factory=list)


class MonitoringSummary(BaseModel):
    range_from: str
    range_to: str
    department: str = ""
    requests: int = 0
    failed: int = 0
    fallbacks: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    avg_latency_ms: int = 0
    # deltas vs the previous period of the same length (None when the previous period is empty)
    requests_delta_pct: float | None = None
    tokens_delta_pct: float | None = None
    cost_delta_pct: float | None = None
    active_agents: int = 0  # agents with >=1 call in range
    total_agents: int = 0
    published_agents: int = 0
    month_cost_usd: float = 0.0  # calendar month to date, all departments
    monthly_budget_usd: float = 0.0
    usd_twd_rate: float = 0.0
    daily: list[DailyPoint] = Field(default_factory=list)
    models: list[str] = Field(default_factory=list)  # every model seen in range, for chart legend


class AgentUsageRow(BaseModel):
    agent_id: str
    name: str = ""
    department: str = ""
    owner_email: str = ""
    status: str = ""
    main_model: str = ""
    main_group: str = ""
    requests: int = 0
    failed: int = 0
    fallbacks: int = 0
    tokens: int = 0
    cost_usd: float = 0.0
    avg_latency_ms: int = 0
