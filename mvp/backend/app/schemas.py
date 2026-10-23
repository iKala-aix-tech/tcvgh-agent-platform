"""Pydantic models shared by the API and the flow interpreter.

The canvas (React Flow) saves `nodes` and `edges`. Each node has a `type` from NODE_TYPES and a
`data` dict with the fields the left/right panels edit. The interpreter only trusts these schemas.
"""
from typing import Any, Literal

from pydantic import BaseModel, Field

ModelGroup = Literal["fast", "reasoning", "budget", "sovereign"]
NodeType = Literal["input", "llm", "condition", "tool", "approval", "output"]
NODE_TYPES: tuple[str, ...] = ("input", "llm", "condition", "tool", "approval", "output")


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


class AgentIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""
    instructions: str = ""
    model_group: ModelGroup = "fast"
    routing: RoutingPolicy = Field(default_factory=RoutingPolicy)
    connectors: list[Connector] = Field(default_factory=list)
    flow: Flow = Field(default_factory=Flow)


class AgentOut(AgentIn):
    id: str
    owner_uid: str
    owner_email: str
    status: Literal["draft", "published"] = "draft"
    version: int = 0
    created_at: Any = None
    updated_at: Any = None


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


class RunResponse(BaseModel):
    session_id: str
    reply: str
    trace: list[StepTrace]
    pending_approval: dict[str, Any] | None = None
