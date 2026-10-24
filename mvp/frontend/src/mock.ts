/** In-memory API used when VITE_MOCK_API=1 (design review / demos without GCP). Same surface as ./api. */
import { auth } from "./firebase";
import { emptyAgent, type ActionSpec, type AgentIn, type AgentOut, type AuditEntry, type ConnectorIn, type ConnectorOut, type ConnectorStats, type ConnectorTypes, type Flow, type HubStats, type KnowledgeFile, type Me, type RunResponse, type TestResult } from "./types";
import connectorTypes from "./connectorTypes.json";

export const MOCK = import.meta.env.VITE_MOCK_API === "1";
export const mockUser = { uid: "u-lin", email: "chlin@vghtc.gov.tw", displayName: "林志豪 主治醫師", photoURL: null } as const;
/** Signed-in uid (mock user when VITE_MOCK_API=1). */
export const currentUid = () => (MOCK ? mockUser.uid : auth.currentUser?.uid);
export const currentName = () => (MOCK ? mockUser.displayName : auth.currentUser?.displayName);

const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const mk = (id: string, p: Partial<AgentOut>): AgentOut => ({
  ...emptyAgent(), id, owner_uid: "u-lin", owner_email: mockUser.email, status: "draft", version: 0, knowledge_count: 0, updated_at: ago(2), ...p,
});
let agents: AgentOut[] = [
  mk("ag-cardio-094", { name: "心臟內科出院病歷智慧整理 Agent", department: "心臟內科 (CV)", code: "CARD-801", status: "published", version: 3, knowledge_count: 2, model_group: "reasoning",
    description: "自動統整冠狀動脈攝影紀錄、心導管介入處置 (PCI) 數據與心臟超音波報告，標準化轉譯為中榮 ICD-10 出院摘要。", published_at: ago(5),
    test_cases: [{ title: "案例 1：急性心肌梗塞 (AMI) 術後第5天病歷", message: "請幫我整理病歷號 #8839201 的心導管手術紀錄與昨天的 Echo 報告，生成出院衛教重點。" }] }),
  mk("ag-nur-104", { name: "門診衛教即時問答助手", department: "護理部 / 門診中心", code: "NUR-104", status: "published", version: 1, category: "admin", owner_uid: "u-other", owner_email: "nurse@vghtc.gov.tw", updated_at: ago(4), knowledge_count: 1 }),
  mk("ag-er-023", { name: "急診檢傷流病快速比對 Agent", department: "急診醫學部 (EM)", code: "ER-023", status: "published", version: 2, owner_uid: "u-other", owner_email: "er@vghtc.gov.tw", updated_at: ago(20), knowledge_count: 3 }),
  mk("ag-rad-302", { name: "放射科影像報告結構化工具", department: "放射線部 (RAD)", code: "RAD-302", updated_at: ago(72) }),
  mk("ag-endo-509", { name: "糖尿病共同照護追蹤助理", department: "新陳代謝科 (ENDO)", code: "DM-509", status: "published", version: 1, category: "consultation", updated_at: ago(120), knowledge_count: 1 }),
  mk("ag-icc-018", { name: "院內感染管制感控通報 Agent", department: "感染管制中心 (ICC)", code: "ICC-018", updated_at: ago(168) }),
];
let files: KnowledgeFile[] = [
  { id: "k1", agent_id: "ag-cardio-094", agent_name: agents[0].name, name: "中榮病歷標準詞彙庫 v4.0.pdf", content_type: "application/pdf", size_bytes: 4.2e6, gcs_uri: "gs://x/k1", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: ago(30) },
  { id: "k2", agent_id: "ag-cardio-094", agent_name: agents[0].name, name: "心臟學會臨床指引 2024.pdf", content_type: "application/pdf", size_bytes: 8.4e6, gcs_uri: "gs://x/k2", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: ago(40) },
  { id: "k3", agent_id: "ag-er-023", agent_name: agents[2].name, name: "TTAS 檢傷標準手冊.pdf", content_type: "application/pdf", size_bytes: 2.1e6, gcs_uri: "gs://x/k3", status: "indexed", error: "", uploaded_by: "er@vghtc.gov.tw", created_at: ago(90) },
];
const audit: AuditEntry[] = [
  { id: "a1", actor: "u-lin", actor_email: mockUser.email, action: "agent.run", at: ago(0.2), details: { agent_id: "ag-cardio-094", latency_ms: 1180, models: ["gemini-3.1-pro-preview"] } },
  { id: "a2", actor: "u-lin", actor_email: mockUser.email, action: "knowledge.upload", at: ago(30), details: { agent_id: "ag-cardio-094", file: "中榮病歷標準詞彙庫 v4.0.pdf", bytes: 4200000 } },
  { id: "a3", actor: "u-lin", actor_email: mockUser.email, action: "agent.publish", at: ago(5), details: { agent_id: "ag-cardio-094", version: 3 } },
];
const TYPES = connectorTypes as unknown as ConnectorTypes;
const conn = (id: string, p: Partial<ConnectorOut>): ConnectorOut => ({
  id, type: "mcp", label: "", scope: "", config: {}, secret_fields: [], redact_pii: true, audit_payloads: true, owner_uid: "u-lin", owner_email: mockUser.email,
  status: "active", last_test: { ok: true, message: "OK", ms: 14, at: ago(1) }, agents_count: 0, updated_at: ago(3), ...p,
});
let connectors: ConnectorOut[] = [
  conn("cn-cardio-mcp", { type: "mcp", label: "Cardio-Guidelines Remote MCP Node", scope: "心血管中心節點：指引語義檢索、藥物劑量換算與專科計算", config: { url: "https://mcp-cardio.vghtc.internal/mcp", auth_kind: "bearer" }, secret_fields: ["token"], agents_count: 3,
    last_test: { ok: true, message: "MCP 握手成功：cardio-guidelines · 14 個工具", ms: 8, at: ago(1), tools: [{ id: "search_guideline", label: "search_guideline", description: "語義檢索心臟學會指引" }, { id: "drug_dose", label: "drug_dose", description: "依體重與 eGFR 計算劑量" }] } }),
  conn("cn-slack-er", { type: "slack", label: "Slack 跨科急診警報 Bot (醫療專用)", scope: "急診重症、心導管室異常警報即時通知", config: { default_channel: "#er-alerts", scopes: ["chat:write", "channels:read"] }, secret_fields: ["webhook_url"], status: "unverified", last_test: null, owner_uid: "u-other", owner_email: "er@vghtc.gov.tw" }),
  conn("cn-his", { type: "his_fhir", label: "TCVGH HIS 核心系統雙向 Webhook", scope: "門診報到、危急值開立", config: { base_url: "https://10.120.44.18:9092/fhir" }, status: "error", last_test: { ok: false, message: "HIS / FHIR 閘道尚未串接", ms: 0, at: ago(2) } }),
  conn("cn-teams-nur", { type: "teams", label: "Microsoft Teams 護理站通知", scope: "護理排班與值班呼叫", secret_fields: ["webhook_url"], agents_count: 1 }),
];
const delay = <T,>(v: T, ms = 150) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const find = (id: string) => { const a = agents.find((x) => x.id === id); if (!a) throw new Error("404 agent not found"); return a; };

export const mockApi = {
  me: () => delay<Me>({ uid: mockUser.uid, email: mockUser.email, name: mockUser.displayName, role: "builder" }),
  stats: () => delay<HubStats>({ my_agents: agents.filter((a) => a.owner_uid === "u-lin").length, my_published: 2, hospital_published: agents.filter((a) => a.status === "published").length, runs_today: 1840, knowledge_files: files.length, deid_enabled: false }),
  listAgents: () => delay(agents.filter((a) => a.owner_uid === "u-lin" || a.status === "published")),
  getAgent: (id: string) => delay(find(id)),
  createAgent: (body: AgentIn) => { const a = mk(`ag-${Math.random().toString(36).slice(2, 7)}`, { ...body, updated_at: new Date().toISOString() }); agents = [a, ...agents]; return delay(a); },
  updateAgent: (id: string, body: AgentIn) => { const a = { ...find(id), ...body, updated_at: new Date().toISOString() }; agents = agents.map((x) => (x.id === id ? a : x)); return delay(a); },
  validate: (flow: Flow) => delay({ problems: flow.nodes.some((n) => n.type === "output") ? [] : ["缺少「回覆」節點"] }),
  publishAgent: (id: string) => { const a = { ...find(id), status: "published" as const, version: find(id).version + 1, published_at: new Date().toISOString() }; agents = agents.map((x) => (x.id === id ? a : x)); return delay(a); },
  unpublishAgent: (id: string) => { const a = { ...find(id), status: "draft" as const }; agents = agents.map((x) => (x.id === id ? a : x)); return delay(a); },
  deleteAgent: (id: string) => { agents = agents.filter((x) => x.id !== id); return delay(undefined); },
  run: (id: string, message: string, session_id?: string) => delay<RunResponse>({
    session_id: session_id ?? "s1", latency_ms: 1180,
    reply: `【出院衛教重點摘要：急性心肌梗塞 PCI 術後】\n\n冠狀動脈介入治療紀錄 (PCI)：LAD 放置 DES 塗藥支架 (3.0 x 24mm)，血流自 TIMI-1 恢復至 TIMI-3。\n昨日心臟超音波：LVEF 48%（心尖前壁收縮功能輕微減損）。\n\n護理出院衛教要點：\n• 股動脈/橈動脈穿刺處：術後觀察無血腫，避免單手提重物 (>3kg) 7 天。\n• 胸痛警戒信號：若出現壓迫性胸痛合併冷汗或輻射至左肩，需立即撥打 119。\n• 回診排程：心臟內科門診預約於下週四上午 09:30。\n\n（根據提問：${message.slice(0, 40)}）`,
    trace: [{ node_id: "in", type: "input", summary: "收到使用者輸入", ms: 0 }, { node_id: "kb", type: "knowledge", summary: "檢索 2 段落（top_k=5）", ms: 310 }, { node_id: "llm", type: "llm", group: "reasoning", model: "gemini-3.1-pro-preview", summary: "412 字", ms: 860 }, { node_id: "out", type: "output", summary: "回覆組裝完成", ms: 0 }],
    citations: [{ source: "TCVGH-CV-Guide-v14.pdf", uri: "", score: 0.81, text: "…" }, { source: "AHA/ACC 2023 ACS Guideline.pdf", uri: "", score: 0.74, text: "…" }],
  }, 900),
  listKnowledge: (agentId: string) => delay(files.filter((f) => f.agent_id === agentId)),
  library: () => delay(files),
  uploadKnowledge: (agentId: string, file: File) => { const f: KnowledgeFile = { id: `k${Date.now()}`, agent_id: agentId, agent_name: find(agentId).name, name: file.name, content_type: file.type, size_bytes: file.size, gcs_uri: "gs://x", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: new Date().toISOString() }; files = [f, ...files]; return delay(f, 1200); },
  deleteKnowledge: (_a: string, fileId: string) => { files = files.filter((f) => f.id !== fileId); return delay(undefined); },
  audit: () => delay(audit),
  connectorTypes: () => delay(TYPES),
  connectorStats: () => delay<ConnectorStats>({ connected: connectors.filter((c) => c.status === "active").length, available_types: TYPES.types.filter((t) => t.available).length, invocations_today: 14820, mcp_nodes: 1 }),
  listConnectors: () => delay(connectors),
  getConnector: (id: string) => { const c = connectors.find((x) => x.id === id); if (!c) throw new Error("404 connector not found"); return delay(c); },
  createConnector: (b: ConnectorIn) => { const c = conn(`cn-${Math.random().toString(36).slice(2, 7)}`, { ...b, secret_fields: Object.keys(b.secrets).filter((k) => b.secrets[k]), status: "unverified", last_test: null, updated_at: new Date().toISOString() }); connectors = [c, ...connectors]; return delay(c); },
  updateConnector: (id: string, b: ConnectorIn) => { const cur = connectors.find((x) => x.id === id)!; const c = { ...cur, ...b, secret_fields: [...new Set([...cur.secret_fields, ...Object.keys(b.secrets).filter((k) => b.secrets[k])])], updated_at: new Date().toISOString() }; connectors = connectors.map((x) => (x.id === id ? c : x)); return delay(c); },
  testConnector: (id: string) => { const cur = connectors.find((x) => x.id === id)!; const t = TYPES.types.find((x) => x.id === cur.type)!; const r: TestResult = t.available ? { ok: true, message: cur.type === "mcp" ? "MCP 握手成功：demo · 2 個工具" : "連線成功", ms: 42, at: new Date().toISOString(), tools: cur.type === "mcp" ? [{ id: "search_guideline", label: "search_guideline", description: "" }, { id: "drug_dose", label: "drug_dose", description: "" }] : undefined } : { ok: false, message: t.coming ?? "", ms: 0, at: new Date().toISOString() }; connectors = connectors.map((x) => (x.id === id ? { ...x, status: r.ok ? "active" : "error", last_test: r } : x)); return delay(r, 900); },
  connectorActions: (id: string) => { const cur = connectors.find((x) => x.id === id)!; const t = TYPES.types.find((x) => x.id === cur.type)!; return delay<ActionSpec[]>(t.actions === "dynamic" ? (cur.last_test?.tools ?? []).map((x) => ({ id: x.id, label: x.label, description: x.description, args: [{ key: "query", label: "query", kind: "text" }], write: true })) : t.actions); },
  deleteConnector: (id: string) => { connectors = connectors.filter((x) => x.id !== id); return delay(undefined); },
};
