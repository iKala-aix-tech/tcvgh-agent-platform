// Mirrors backend/app/schemas.py. Keep the two in sync.
export type ModelGroup = "fast" | "reasoning" | "budget" | "sovereign";
export type NodeType = "input" | "llm" | "condition" | "tool" | "approval" | "output";

export const MODEL_GROUPS: { id: ModelGroup; label: string; hint: string }[] = [
  { id: "fast", label: "fast", hint: "Gemini 3 Flash → gpt-oss-20b (on-prem) → Claude Haiku 4.5" },
  { id: "reasoning", label: "reasoning", hint: "Gemini 3.1 Pro → Claude Sonnet 4.6 → GPT-5.4 → gpt-oss-120b" },
  { id: "budget", label: "budget", hint: "Gemma 4 26B (on-prem) → Nova 2 Lite → Claude Haiku 4.5" },
  { id: "sovereign", label: "sovereign (on-prem only)", hint: "gpt-oss-120b → Gemma 4; never falls back to cloud" },
];

export interface RoutingPolicy {
  default_group: ModelGroup;
  reasoning_keywords: string[];
  sovereign_only: boolean;
  max_cost_tier: "budget" | "fast" | "reasoning";
}

export interface Connector {
  provider: "gmail" | "calendar" | "drive" | "docs";
  scopes: string[];
  requires_approval: boolean;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  label?: string | null;
}

export interface AgentIn {
  name: string;
  description: string;
  instructions: string;
  model_group: ModelGroup;
  routing: RoutingPolicy;
  connectors: Connector[];
  flow: { nodes: FlowNode[]; edges: FlowEdge[] };
}
export interface AgentOut extends AgentIn {
  id: string;
  owner_email: string;
  status: "draft" | "published";
  version: number;
  updated_at?: string;
}

export interface StepTrace {
  node_id: string;
  type: string;
  model?: string | null;
  group?: string | null;
  summary: string;
}
export interface RunResponse {
  session_id: string;
  reply: string;
  trace: StepTrace[];
  pending_approval?: { node_id: string; message: string; preview: string } | null;
}

export const emptyAgent = (): AgentIn => ({
  name: "新的 Agent",
  description: "",
  instructions: "你是台中榮總的內部助理。回答精簡、使用繁體中文。",
  model_group: "fast",
  routing: { default_group: "fast", reasoning_keywords: ["分析", "比較", "規劃", "為什麼"], sovereign_only: false, max_cost_tier: "reasoning" },
  connectors: [],
  flow: {
    nodes: [
      { id: "in", type: "input", position: { x: 40, y: 160 }, data: { label: "使用者輸入" } },
      { id: "llm", type: "llm", position: { x: 300, y: 160 }, data: { label: "LLM 步驟", prompt: "{{input}}" } },
      { id: "out", type: "output", position: { x: 560, y: 160 }, data: { label: "回覆", template: "{{last}}" } },
    ],
    edges: [
      { id: "e-in-llm", source: "in", target: "llm" },
      { id: "e-llm-out", source: "llm", target: "out" },
    ],
  },
});
