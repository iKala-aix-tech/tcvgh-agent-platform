// Mirrors backend/app/schemas.py. Keep the two in sync.
export type ModelGroup = "fast" | "reasoning" | "budget" | "sovereign";
export type NodeType =
  | "input" | "his_emr" | "pii_mask" | "knowledge" | "llm" | "condition" | "tool" | "approval" | "structured_output" | "output";
export type AgentCategory = "clinical" | "admin" | "consultation";

export const MODEL_GROUPS: { id: ModelGroup; label: string; hint: string }[] = [
  { id: "fast", label: "fast · Gemini 3 Flash", hint: "Gemini 3 Flash → gpt-oss-20b (on-prem) → Claude Haiku 4.5" },
  { id: "reasoning", label: "reasoning · Gemini 3.1 Pro", hint: "Gemini 3.1 Pro → Claude Sonnet 4.6 → GPT-5.4 → gpt-oss-120b" },
  { id: "budget", label: "budget · Gemma 4 (on-prem)", hint: "Gemma 4 26B (on-prem) → Nova 2 Lite → Claude Haiku 4.5" },
  { id: "sovereign", label: "sovereign · 院內模型", hint: "gpt-oss-120b → Gemma 4; never falls back to cloud" },
];

export const CATEGORIES: { id: AgentCategory; label: string }[] = [
  { id: "clinical", label: "臨床診療 (Clinical)" },
  { id: "admin", label: "行政與衛教 (Admin & Education)" },
  { id: "consultation", label: "跨科會診 (Consultation)" },
];

export const NODE_KINDS: { type: NodeType; label: string; icon: string; hint: string }[] = [
  { type: "his_emr", label: "HIS/EMR 輸入", icon: "input", hint: "院內 FHIR 閘道（尚未串接，stub）" },
  { type: "knowledge", label: "知識檢索 (RAG)", icon: "manage_search", hint: "從此 Agent 的知識庫檢索段落" },
  { type: "llm", label: "醫療大模型", icon: "psychology", hint: "一次模型推論" },
  { type: "pii_mask", label: "敏感資安遮蔽", icon: "shield", hint: "Sensitive Data Protection 去識別化" },
  { type: "condition", label: "條件判斷", icon: "alt_route", hint: "LLM 回答 YES/NO 決定分支" },
  { type: "structured_output", label: "結構化輸出", icon: "data_object", hint: "依 JSON Schema 輸出" },
  { type: "tool", label: "連接器動作", icon: "extension", hint: "Google Workspace（stub）" },
  { type: "approval", label: "人工核准", icon: "how_to_reg", hint: "暫停等待主治醫師審核" },
  { type: "output", label: "回覆", icon: "output", hint: "最終回覆模板" },
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
export interface Flow { nodes: FlowNode[]; edges: FlowEdge[] }

export interface TestCase { title: string; message: string }

export interface AgentIn {
  name: string;
  description: string;
  instructions: string;
  category: AgentCategory;
  department: string;
  code: string;
  model_group: ModelGroup;
  temperature: number;
  top_p: number;
  routing: RoutingPolicy;
  connectors: Connector[];
  flow: Flow;
  test_cases: TestCase[];
}
export interface AgentOut extends AgentIn {
  id: string;
  owner_uid: string;
  owner_email: string;
  status: "draft" | "published";
  version: number;
  rag_corpus?: string | null;
  knowledge_count: number;
  created_at?: string | null;
  updated_at?: string | null;
  published_at?: string | null;
}

export interface KnowledgeFile {
  id: string;
  agent_id: string;
  agent_name: string;
  name: string;
  content_type: string;
  size_bytes: number;
  gcs_uri: string;
  rag_file?: string | null;
  status: "indexing" | "indexed" | "error";
  error: string;
  uploaded_by: string;
  created_at?: string | null;
}

export interface StepTrace {
  node_id: string;
  type: string;
  model?: string | null;
  group?: string | null;
  summary: string;
  ms: number;
}
export interface Citation { source: string; uri: string; score?: number | null; text: string }
export interface RunResponse {
  session_id: string;
  reply: string;
  trace: StepTrace[];
  citations: Citation[];
  structured?: Record<string, unknown> | null;
  pending_approval?: { node_id: string; message: string; preview: string } | null;
  latency_ms: number;
}

export interface AuditEntry {
  id: string;
  actor: string;
  actor_email: string;
  action: string;
  at?: string | null;
  details: Record<string, unknown>;
}

export interface HubStats {
  my_agents: number;
  my_published: number;
  hospital_published: number;
  runs_today: number;
  knowledge_files: number;
  deid_enabled: boolean;
}

export interface Me { uid: string; email: string; name: string; role: string }

/** Strip server-managed fields before PUT. */
export const toAgentIn = (a: AgentOut): AgentIn => ({
  name: a.name, description: a.description, instructions: a.instructions, category: a.category,
  department: a.department, code: a.code, model_group: a.model_group, temperature: a.temperature, top_p: a.top_p,
  routing: a.routing, connectors: a.connectors, flow: a.flow, test_cases: a.test_cases,
});

export const emptyAgent = (): AgentIn => ({
  name: "新的 Agent",
  description: "",
  instructions: "# 角色設定：臺中榮民總醫院 院內助理\n\n你是台中榮總的內部助理。回答精簡、使用繁體中文，引用知識庫時標註來源編號。",
  category: "clinical",
  department: "",
  code: "",
  model_group: "fast",
  temperature: 0.15,
  top_p: 0.85,
  routing: { default_group: "fast", reasoning_keywords: ["分析", "比較", "規劃", "為什麼"], sovereign_only: false, max_cost_tier: "reasoning" },
  connectors: [],
  flow: {
    nodes: [
      { id: "in", type: "input", position: { x: 40, y: 200 }, data: { label: "使用者輸入" } },
      { id: "kb", type: "knowledge", position: { x: 340, y: 200 }, data: { label: "知識檢索", query: "{{input}}", top_k: 5 } },
      { id: "llm", type: "llm", position: { x: 640, y: 200 }, data: { label: "臨床摘要生成", prompt: "{{input}}" } },
      { id: "out", type: "output", position: { x: 940, y: 200 }, data: { label: "回覆", template: "{{last}}" } },
    ],
    edges: [
      { id: "e-in-kb", source: "in", target: "kb" },
      { id: "e-kb-llm", source: "kb", target: "llm" },
      { id: "e-llm-out", source: "llm", target: "out" },
    ],
  },
  test_cases: [],
});

// ---- connectors (shared, hospital-wide). Specs come from GET /api/connectors/types.
export interface FieldSpec {
  key: string; label: string; kind: "text" | "url" | "secret" | "select" | "textarea" | "checkboxes";
  required: boolean; hint: string; placeholder: string; options: { value: string; label: string; disabled?: boolean }[];
  default: unknown; section: "server" | "credentials";
}
export interface ActionSpec { id: string; label: string; description?: string; args: { key: string; label: string; kind: string; required?: boolean }[]; write: boolean }
export interface ConnectorType {
  id: string; label: string; category: string; protocol: string; icon: string; badge: string; available: boolean; coming?: string;
  description: string; fields: FieldSpec[]; actions: ActionSpec[] | "dynamic";
}
export interface ConnectorTypes { categories: { id: string; label: string }[]; types: ConnectorType[] }
export interface ConnectorIn {
  type: string; label: string; scope: string; config: Record<string, unknown>; secrets: Record<string, string>;
  redact_pii: boolean; audit_payloads: boolean;
}
export interface TestResult { ok: boolean; message: string; ms: number; at?: string; tools?: { id: string; label: string; description: string }[] }
export interface ConnectorOut extends Omit<ConnectorIn, "secrets"> {
  id: string; secret_fields: string[]; owner_uid: string; owner_email: string;
  status: "unverified" | "active" | "error"; last_test?: TestResult | null; agents_count: number;
  created_at?: string | null; updated_at?: string | null;
}
export interface ConnectorStats { connected: number; available_types: number; invocations_today: number; mcp_nodes: number }

