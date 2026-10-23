"""The no-code flow interpreter (diagram: 'Agent Runtime').

A canvas is a DAG of six node types. We walk it from the `input` node following edges:

  input      -> the user message (already de-identified) becomes {{input}}
  llm        -> one LiteLLM call; data: {prompt, group?} ; prompt may use {{input}}, {{last}}, {{<nodeId>}}
  condition  -> data: {question} ; an LLM yes/no decides which outgoing edge (sourceHandle "true"/"false")
  tool       -> data: {provider, action, args} ; MVP: returns a stub, real connectors in phase 1b
  approval   -> pauses the run and returns pending_approval (human-in-the-loop) ; resumes on approve
  output     -> data: {template} ; final reply, default {{last}}

Routing: the agent's RoutingPolicy picks the model group per llm step unless the node pins one.
`sovereign_only` forces the on-prem-only group and never falls back (LiteLLM has no cloud member).
"""
from __future__ import annotations

import re

from ..schemas import AgentIn, Flow, FlowNode, StepTrace
from . import llm

MAX_STEPS = 40
_VAR = re.compile(r"{{\s*([\w\-]+)\s*}}")


def _render(template: str, ctx: dict[str, str]) -> str:
    return _VAR.sub(lambda m: ctx.get(m.group(1), ""), template)


def pick_group(agent: AgentIn, node: FlowNode, text: str) -> str:
    """Routing policy: node override > sovereign flag > keyword heuristic > agent default."""
    if agent.routing.sovereign_only:
        return "sovereign"
    if node.data.get("group"):
        return str(node.data["group"])
    if any(k.lower() in text.lower() for k in agent.routing.reasoning_keywords) and agent.routing.max_cost_tier == "reasoning":
        return "reasoning"
    return agent.model_group


def _default_flow(agent: AgentIn) -> Flow:
    """An agent with an empty canvas behaves as a single-LLM chat: input -> llm -> output."""
    return Flow.model_validate({
        "nodes": [
            {"id": "in", "type": "input", "data": {}},
            {"id": "llm", "type": "llm", "data": {"prompt": "{{input}}"}},
            {"id": "out", "type": "output", "data": {"template": "{{last}}"}},
        ],
        "edges": [{"id": "e1", "source": "in", "target": "llm"}, {"id": "e2", "source": "llm", "target": "out"}],
    })


def run_flow(agent: AgentIn, *, agent_id: str, user_id: str, user_message: str,
             history: list[dict]) -> tuple[str, list[StepTrace], dict | None]:
    flow = agent.flow if agent.flow.nodes else _default_flow(agent)
    nodes = {n.id: n for n in flow.nodes}
    out_edges: dict[str, list] = {}
    for e in flow.edges:
        out_edges.setdefault(e.source, []).append(e)

    start = next((n for n in flow.nodes if n.type == "input"), None)
    if start is None:
        raise ValueError("flow has no input node")

    ctx: dict[str, str] = {"input": user_message, "last": user_message}
    trace: list[StepTrace] = []
    system = agent.instructions or f"You are {agent.name}. {agent.description}".strip()

    node: FlowNode | None = start
    steps = 0
    while node is not None and steps < MAX_STEPS:
        steps += 1
        nxt_handle: str | None = None

        if node.type == "input":
            trace.append(StepTrace(node_id=node.id, type="input", summary="user message received"))

        elif node.type == "llm":
            prompt = _render(str(node.data.get("prompt") or "{{input}}"), ctx)
            group = pick_group(agent, node, prompt)
            reply, model = llm.complete(group=group, system=system, agent_id=agent_id, user_id=user_id,
                                        messages=[*history, {"role": "user", "content": prompt}])
            ctx[node.id] = ctx["last"] = reply
            trace.append(StepTrace(node_id=node.id, type="llm", model=model, group=group,
                                   summary=f"{len(reply)} chars"))

        elif node.type == "condition":
            question = _render(str(node.data.get("question") or "Is the request urgent?"), ctx)
            verdict, model = llm.complete(
                group="fast", system="Answer strictly YES or NO.", agent_id=agent_id, user_id=user_id,
                messages=[{"role": "user", "content": f"{question}\n\nContext:\n{ctx['last']}"}], temperature=0,
            )
            nxt_handle = "true" if verdict.strip().upper().startswith("Y") else "false"
            trace.append(StepTrace(node_id=node.id, type="condition", model=model, group="fast",
                                   summary=f"{question} -> {nxt_handle}"))

        elif node.type == "tool":
            provider, action = node.data.get("provider", "?"), node.data.get("action", "?")
            # Phase 1b: call the Connector Service (MCP) here with the user's OAuth token.
            result = f"[tool stub] {provider}.{action} would run with args {_render(str(node.data.get('args', '')), ctx)}"
            ctx[node.id] = ctx["last"] = result
            trace.append(StepTrace(node_id=node.id, type="tool", summary=f"{provider}.{action} (stub)"))

        elif node.type == "approval":
            pending = {"node_id": node.id, "message": _render(str(node.data.get("message") or "Approve this action?"), ctx),
                       "preview": ctx["last"]}
            trace.append(StepTrace(node_id=node.id, type="approval", summary="waiting for human approval"))
            return ctx["last"], trace, pending

        elif node.type == "output":
            reply = _render(str(node.data.get("template") or "{{last}}"), ctx)
            trace.append(StepTrace(node_id=node.id, type="output", summary="reply assembled"))
            return reply, trace, None

        edges = out_edges.get(node.id, [])
        if nxt_handle is not None:
            edges = [e for e in edges if (e.sourceHandle or "true") == nxt_handle] or edges
        node = nodes.get(edges[0].target) if edges else None

    return ctx["last"], trace, None
