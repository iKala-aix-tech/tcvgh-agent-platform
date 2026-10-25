/** In-memory API used when VITE_MOCK_API=1 (design review / demos without GCP). Same surface as ./api. */
import { auth } from "./firebase";
import { emptyAgent, type ActionSpec, type AgentIn, type AgentOut, type AgentUsageRow, type AuditCategory, type AuditEntry, type AuditPage, type AuditQuery, type AuditSeverity, type AuditSummary, type ConnectorIn, type ConnectorOut, type ConnectorStats, type ConnectorTypes, type Flow, type HubStats, type KnowledgeFile, type Me, type MonitoringQuery, type MonitoringSummary, type RunResponse, type TestResult, type UsageSort } from "./types";
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
  mk("ag-cardio-094", { name: "心臟內科出院病歷智慧整理 Agent", department: "心臟血管中心", code: "CARD-801", status: "published", version: 3, knowledge_count: 2, model_group: "reasoning",
    description: "自動統整冠狀動脈攝影紀錄、心導管介入處置 (PCI) 數據與心臟超音波報告，標準化轉譯為中榮 ICD-10 出院摘要。", published_at: ago(5),
    test_cases: [{ title: "案例 1：急性心肌梗塞 (AMI) 術後第5天病歷", message: "請幫我整理病歷號 #8839201 的心導管手術紀錄與昨天的 Echo 報告，生成出院衛教重點。" }] }),
  mk("ag-nur-104", { name: "門診衛教即時問答助手", department: "護理部", code: "NUR-104", status: "published", version: 1, category: "admin", owner_uid: "u-other", owner_email: "nurse@vghtc.gov.tw", updated_at: ago(4), knowledge_count: 1 }),
  mk("ag-er-023", { name: "急診檢傷流病快速比對 Agent", department: "急診醫學部", code: "ER-023", status: "published", version: 2, owner_uid: "u-other", owner_email: "er@vghtc.gov.tw", updated_at: ago(20), knowledge_count: 3 }),
  mk("ag-rad-302", { name: "放射科影像報告結構化工具", department: "放射線部", code: "RAD-302", updated_at: ago(72) }),
  mk("ag-endo-509", { name: "糖尿病共同照護追蹤助理", department: "新陳代謝科", code: "DM-509", status: "published", version: 1, category: "consultation", updated_at: ago(120), knowledge_count: 1 }),
  mk("ag-icc-018", { name: "院內感染管制感控通報 Agent", department: "感染管制中心", code: "ICC-018", updated_at: ago(168) }),
];
let files: KnowledgeFile[] = [
  { id: "k1", agent_id: "ag-cardio-094", agent_name: agents[0].name, name: "中榮病歷標準詞彙庫 v4.0.pdf", content_type: "application/pdf", size_bytes: 4.2e6, gcs_uri: "gs://x/k1", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: ago(30) },
  { id: "k2", agent_id: "ag-cardio-094", agent_name: agents[0].name, name: "心臟學會臨床指引 2024.pdf", content_type: "application/pdf", size_bytes: 8.4e6, gcs_uri: "gs://x/k2", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: ago(40) },
  { id: "k3", agent_id: "ag-er-023", agent_name: agents[2].name, name: "TTAS 檢傷標準手冊.pdf", content_type: "application/pdf", size_bytes: 2.1e6, gcs_uri: "gs://x/k3", status: "indexed", error: "", uploaded_by: "er@vghtc.gov.tw", created_at: ago(90) },
];
// ---- audit: deterministic synthetic trail over the last 7 days. Category / severity mirror backend/app/routers/audit.py.
const AUDIT_CAT: Record<string, AuditCategory> = {
  "agent.run": "inference", "agent.approve": "inference", "agent.reject": "inference", "connector.invoke": "connector", "connector.test": "connector",
  "agent.create": "build", "agent.update": "build", "agent.publish": "build", "agent.unpublish": "build", "agent.delete": "build",
  "knowledge.upload": "build", "knowledge.delete": "build", "knowledge.error": "build",
  "connector.create": "access", "connector.update": "access", "connector.delete": "access", "monitoring.export": "access", "audit.export": "access",
};
const auditSeverity = (action: string, d: Record<string, unknown>): AuditSeverity =>
  d.ok === false || action === "knowledge.error" || action === "agent.reject" ? "warning" : d.ok === true || action === "agent.publish" || action === "agent.approve" ? "success" : "info";
const AGENT_META: Record<string, [string, string]> = {
  "ag-cardio-094": ["心臟內科出院病歷智慧整理 Agent", "心臟血管中心"], "ag-nur-104": ["門診衛教即時問答助手", "護理部"],
  "ag-er-023": ["急診檢傷流病快速比對 Agent", "急診醫學部"], "ag-rad-302": ["放射科影像報告結構化工具", "放射線部"],
};
const CONN_LABEL: Record<string, string> = { "cn-cardio-mcp": "Cardio-Guidelines Remote MCP Node", "cn-slack-er": "Slack 跨科急診警報 Bot (醫療專用)", "cn-his": "TCVGH HIS 核心系統雙向 Webhook", "cn-teams-nur": "Microsoft Teams 護理站通知" };
const auditEntry = (id: string, actor: string, actor_email: string, action: string, at: string, details: Record<string, unknown>): AuditEntry => {
  const agentId = String(details.agent_id ?? ""), connId = String(details.connector_id ?? "");
  const agent_label = agentId ? AGENT_META[agentId]?.[0] ?? String(details.name ?? agentId) : "";
  const [target_kind, target_id, target_label] = action.startsWith("connector.") && connId ? ["connector", connId, CONN_LABEL[connId] ?? connId] as const
    : agentId ? ["agent", agentId, agent_label] as const
    : action.endsWith(".export") ? ["system", "", action === "audit.export" ? "稽核報表" : "監控成本報表"] as const : ["", "", ""] as const;
  return { id, actor, actor_email, action, at, category: AUDIT_CAT[action] ?? "other", severity: auditSeverity(action, details),
    target_kind, target_id, target_label, agent_label, department: AGENT_META[agentId]?.[1] ?? "", details };
};
const STAFF: [string, string][] = [["u-lin", mockUser.email], ["u-nur", "nurse@vghtc.gov.tw"], ["u-er", "er@vghtc.gov.tw"], ["u-rad", "rad@vghtc.gov.tw"], ["u-it", "it-admin@vghtc.gov.tw"]];
const STAFF_AGENT: Record<string, string> = { "u-lin": "ag-cardio-094", "u-nur": "ag-nur-104", "u-er": "ag-er-023", "u-rad": "ag-rad-302", "u-it": "ag-cardio-094" };
const auditLog: AuditEntry[] = (() => {
  let seed = 20261025;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const out: AuditEntry[] = [];
  let h = 0.05;
  for (let i = 0; i < 160 && h < 7 * 24; i++, h += 0.15 + rnd() * 1.6) {
    const [uid, email] = pick(STAFF), ag = STAFF_AGENT[uid], r = rnd();
    const [action, d]: [string, Record<string, unknown>] =
      r < 0.42 ? ["agent.run", { agent_id: ag, session_id: `s-${i}`, latency_ms: 600 + Math.floor(rnd() * 2400), models: [pick(["gemini-3-flash-preview", "gemini-3.1-pro-preview"])] }]
      : r < 0.62 ? (() => { const ok = rnd() > 0.12; const cn = pick(["cn-cardio-mcp", "cn-cardio-mcp", "cn-slack-er", "cn-teams-nur"]);
          return ["connector.invoke", { agent_id: ag, connector_id: cn, type: cn === "cn-cardio-mcp" ? "mcp" : cn === "cn-slack-er" ? "slack" : "teams",
            connector_action: cn === "cn-cardio-mcp" ? pick(["search_guideline", "drug_dose"]) : "send_message", ok, error: ok ? "" : pick(["timeout after 15s", "401 token expired"]),
            ...(cn === "cn-cardio-mcp" ? { args: { query: "STEMI PCI 後 DAPT 療程" } } : {}) }] as [string, Record<string, unknown>]; })()
      : r < 0.68 ? ["agent.approve", { agent_id: ag, session_id: `s-${i}`, node_id: "approval-1" }]
      : r < 0.71 ? ["agent.reject", { agent_id: ag, session_id: `s-${i}`, node_id: "approval-1" }]
      : r < 0.79 ? ["agent.update", { agent_id: ag }]
      : r < 0.83 ? ["agent.publish", { agent_id: ag, version: 1 + Math.floor(rnd() * 4) }]
      : r < 0.88 ? ["knowledge.upload", { agent_id: ag, file: pick(["中榮病歷標準詞彙庫 v4.0.pdf", "AHA/ACC 2023 ACS Guideline.pdf", "門診衛教手冊 2026.docx"]), bytes: 200000 + Math.floor(rnd() * 4e6) }]
      : r < 0.9 ? ["knowledge.error", { agent_id: ag, file: "掃描版護理紀錄.pdf", error: "RAG import failed: unsupported scanned PDF" }]
      : r < 0.94 ? (rnd() > 0.4 ? ["connector.test", { connector_id: "cn-cardio-mcp", ok: true, message: "MCP 握手成功：cardio-guidelines · 14 個工具" }]
        : ["connector.test", { connector_id: "cn-his", ok: false, message: "HIS / FHIR 閘道尚未串接" }]) as [string, Record<string, unknown>]
      : r < 0.97 ? ["connector.update", { connector_id: pick(["cn-slack-er", "cn-teams-nur"]), credentials_changed: rnd() > 0.5 }]
      : ["monitoring.export", { range_from: "2026-10-01", range_to: "2026-10-25", department: "", rows: 12 }];
    out.push(auditEntry(`evt-${String(1000 - i).padStart(4, "0")}`, uid, email, action, ago(h), d));
  }
  return out;
})();
const localDay = (iso?: string | null) => (iso ? ymdLocal(new Date(iso)) : "");
const ymdLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const auditFilter = (q: AuditQuery) => {
  const needle = q.q.trim().toLowerCase();
  return auditLog.filter((e) => {
    const day = localDay(e.at);
    if (day < q.from || day > q.to) return false;
    if (q.category === "alerts" ? e.severity !== "warning" : q.category && e.category !== q.category) return false;
    if ((q.severity && e.severity !== q.severity) || (q.department && e.department !== q.department)) return false;
    return !needle || [e.id, e.actor_email, e.action, e.target_id, e.target_label, e.agent_label, e.department, JSON.stringify(e.details)].join(" ").toLowerCase().includes(needle);
  });
};
const auditPage = (q: AuditQuery, cursor?: string | null, limit = 25): AuditPage => {
  const rows = auditFilter(q);
  const start = cursor ? rows.findIndex((e) => e.id === cursor) + 1 : 0;
  const items = rows.slice(start, start + limit);
  return { items, next_cursor: start + limit < rows.length ? items[items.length - 1].id : null, scanned: rows.length, truncated: false };
};
const auditSummary = (): AuditSummary => {
  const today = ymdLocal(new Date()), yesterday = ymdLocal(new Date(Date.now() - 864e5));
  const rows = auditLog.filter((e) => localDay(e.at) === today);
  const prev = auditLog.filter((e) => localDay(e.at) === yesterday).length;
  const count = (xs: string[]) => Object.entries(xs.reduce<Record<string, number>>((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const inv = rows.filter((e) => e.action === "connector.invoke");
  const warn = rows.filter((e) => e.severity === "warning");
  const by_category: AuditSummary["by_category"] = {};
  rows.forEach((e) => { by_category[e.category] = (by_category[e.category] ?? 0) + 1; });
  const distinct = (xs: AuditEntry[], f: (e: AuditEntry) => string) => new Set(xs.map(f)).size;
  return {
    day: today, total: rows.length, total_yesterday: prev, delta_pct: prev ? Math.round(((rows.length - prev) / prev) * 1000) / 10 : null, by_category,
    connector_calls: inv.length, connector_failed: inv.filter((e) => e.details.ok === false).length,
    top_connectors: count(inv.map((e) => e.target_id)).slice(0, 3).map(([key, n]) => ({ key, label: CONN_LABEL[key] ?? key, count: n })),
    warnings: warn.length, warning_breakdown: count(warn.map((e) => e.action)).map(([key, n]) => ({ key, label: "", count: n })),
    active_users: distinct(rows, (e) => e.actor), run_users: distinct(rows.filter((e) => e.action === "agent.run"), (e) => e.actor),
    build_users: distinct(rows.filter((e) => e.category === "build" || ["connector.create", "connector.update", "connector.delete"].includes(e.action)), (e) => e.actor),
    agents_invoked: distinct(rows.filter((e) => e.action === "agent.run"), (e) => e.target_id), capped: false,
  };
};
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
// ---- monitoring: deterministic synthetic usage per agent-day so the dashboard demo is stable across reloads.
const PRICE: Record<string, [number, number]> = { "gemini-3-flash-preview": [0.5, 3], "gemini-3.1-pro-preview": [2, 12], "gemini-2.5-flash": [0.3, 2.5] };
const PROFILE: Record<string, { calls: number; model: string; fb: string; ms: number }> = {
  "ag-er-023": { calls: 1340, model: "gemini-3-flash-preview", fb: "gemini-2.5-flash", ms: 190 },
  "ag-cardio-094": { calls: 980, model: "gemini-3.1-pro-preview", fb: "gemini-3-flash-preview", ms: 1180 },
  "ag-nur-104": { calls: 720, model: "gemini-3-flash-preview", fb: "gemini-2.5-flash", ms: 210 },
  "ag-endo-509": { calls: 410, model: "gemini-3-flash-preview", fb: "gemini-2.5-flash", ms: 240 },
  "ag-rad-302": { calls: 160, model: "gemini-3.1-pro-preview", fb: "gemini-3-flash-preview", ms: 960 },
  "ag-icc-018": { calls: 40, model: "gemini-3-flash-preview", fb: "gemini-2.5-flash", ms: 200 },
};
const seeded = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 1000) / 1000; };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const days = (from: string, to: string) => { const out: string[] = []; for (let d = new Date(`${from}T00:00:00`); ymd(d) <= to; d.setDate(d.getDate() + 1)) out.push(ymd(d)); return out; };
const usageCell = (aid: string, day: string) => {
  const p = PROFILE[aid] ?? { calls: 20, model: "gemini-3-flash-preview", fb: "gemini-2.5-flash", ms: 200 };
  const dow = new Date(`${day}T00:00:00`).getDay(); const r = seeded(aid + day);
  const weekend = dow === 0 || dow === 6 ? 0.45 : 1; const today = day === ymd(new Date()) ? 0.55 : 1;
  const calls = Math.max(1, Math.round(p.calls * weekend * today * (0.8 + r * 0.4)));
  const fallbacks = Math.round(calls * (r > 0.85 ? 0.08 : 0.01)); const failed = Math.round(calls * 0.004);
  const pt = calls * (1400 + Math.round(r * 900)); const ct = calls * (260 + Math.round(r * 220));
  const cost = (m: string, c: number) => (c * (pt / calls) * PRICE[m][0] + c * (ct / calls) * PRICE[m][1]) / 1e6;
  const main = calls - fallbacks;
  const slices = [{ model: p.model, requests: main, tokens: Math.round((pt + ct) * main / calls), cost_usd: cost(p.model, main) }];
  if (fallbacks) slices.push({ model: p.fb, requests: fallbacks, tokens: Math.round((pt + ct) * fallbacks / calls), cost_usd: cost(p.fb, fallbacks) });
  return { calls, failed, fallbacks, pt, ct, ms: p.ms * (0.9 + r * 0.3), slices };
};
const inDept = (q: MonitoringQuery) => agents.filter((a) => !q.department || a.department === q.department);
const monitoringSummary = (q: MonitoringQuery): MonitoringSummary => {
  const span = days(q.from, q.to); const list = inDept(q); const models = new Set<string>();
  const t = { requests: 0, failed: 0, fallbacks: 0, pt: 0, ct: 0, cost: 0, ms: 0 };
  const daily = span.map((day) => {
    const by: Record<string, { model: string; requests: number; tokens: number; cost_usd: number }> = {}; let requests = 0, pt = 0, ct = 0, cost = 0;
    for (const a of list) {
      const u = usageCell(a.id, day); requests += u.calls; pt += u.pt; ct += u.ct; t.failed += u.failed; t.fallbacks += u.fallbacks; t.ms += u.ms * u.calls;
      for (const s of u.slices) { models.add(s.model); const b = (by[s.model] ??= { model: s.model, requests: 0, tokens: 0, cost_usd: 0 }); b.requests += s.requests; b.tokens += s.tokens; b.cost_usd += s.cost_usd; cost += s.cost_usd; }
    }
    t.requests += requests; t.pt += pt; t.ct += ct; t.cost += cost;
    return { date: day, requests, prompt_tokens: pt, completion_tokens: ct, cost_usd: cost, by_model: Object.values(by).sort((x, y) => y.tokens - x.tokens) };
  });
  const prevFrom = new Date(`${q.from}T00:00:00`); prevFrom.setDate(prevFrom.getDate() - span.length);
  const prevTo = new Date(`${q.from}T00:00:00`); prevTo.setDate(prevTo.getDate() - 1);
  let pr = 0, ptk = 0, pc = 0;
  for (const day of days(ymd(prevFrom), ymd(prevTo))) for (const a of list) { const u = usageCell(a.id, day); pr += u.calls; ptk += u.pt + u.ct; pc += u.slices.reduce((s, x) => s + x.cost_usd, 0); }
  const now = new Date(); let month = 0;
  for (const day of days(ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(now))) for (const a of agents) month += usageCell(a.id, day).slices.reduce((s, x) => s + x.cost_usd, 0);
  const pct = (c: number, p: number) => (p > 0 ? Math.round(((c - p) / p) * 1000) / 10 : null);
  return { range_from: q.from, range_to: q.to, department: q.department, requests: t.requests, failed: t.failed, fallbacks: t.fallbacks, prompt_tokens: t.pt, completion_tokens: t.ct, cost_usd: t.cost,
    avg_latency_ms: t.requests ? Math.round(t.ms / t.requests) : 0, requests_delta_pct: pct(t.requests, pr), tokens_delta_pct: pct(t.pt + t.ct, ptk), cost_delta_pct: pct(t.cost, pc),
    active_agents: list.length, total_agents: agents.length, published_agents: agents.filter((a) => a.status === "published").length, month_cost_usd: month, monthly_budget_usd: 5000, usd_twd_rate: 32, daily, models: [...models].sort() };
};
const monitoringAgents = (q: MonitoringQuery, sort: UsageSort): AgentUsageRow[] => {
  const rows = inDept(q).map((a) => {
    let requests = 0, failed = 0, fallbacks = 0, tokens = 0, cost = 0, ms = 0;
    for (const day of days(q.from, q.to)) { const u = usageCell(a.id, day); requests += u.calls; failed += u.failed; fallbacks += u.fallbacks; tokens += u.pt + u.ct; ms += u.ms * u.calls; cost += u.slices.reduce((s, x) => s + x.cost_usd, 0); }
    return { agent_id: a.id, name: a.name, department: a.department, owner_email: a.owner_email, status: a.status, main_model: (PROFILE[a.id] ?? { model: "gemini-3-flash-preview" }).model, main_group: a.model_group, requests, failed, fallbacks, tokens, cost_usd: cost, avg_latency_ms: requests ? Math.round(ms / requests) : 0 };
  });
  const key: Record<UsageSort, (r: AgentUsageRow) => number> = { requests: (r) => -r.requests, tokens: (r) => -r.tokens, cost_usd: (r) => -r.cost_usd, fallbacks: (r) => -r.fallbacks, cost_per_call: (r) => (r.requests ? r.cost_usd / r.requests : 1e9), avg_latency_ms: (r) => r.avg_latency_ms || 1e9 };
  return rows.sort((x, y) => key[sort](x) - key[sort](y));
};

const delay = <T,>(v: T, ms = 150) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const find = (id: string) => { const a = agents.find((x) => x.id === id); if (!a) throw new Error("404 agent not found"); return a; };

export const mockApi = {
  me: () => delay<Me>({ uid: mockUser.uid, email: mockUser.email, name: mockUser.displayName, role: "admin" }),
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
    trace: [{ node_id: "in", type: "input", summary: "收到使用者輸入", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }, { node_id: "kb", type: "knowledge", summary: "檢索 2 段落（top_k=5）", ms: 310, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }, { node_id: "llm", type: "llm", group: "reasoning", model: "gemini-3.1-pro-preview", summary: "412 字", ms: 860, prompt_tokens: 2140, completion_tokens: 410, cost_usd: 0.0092 }, { node_id: "out", type: "output", summary: "回覆組裝完成", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }],
    citations: [{ source: "TCVGH-CV-Guide-v14.pdf", uri: "", score: 0.81, text: "…" }, { source: "AHA/ACC 2023 ACS Guideline.pdf", uri: "", score: 0.74, text: "…" }],
  }, 900),
  approve: (_id: string, session_id: string, approve: boolean) => delay<RunResponse>(approve
    ? { session_id, latency_ms: 420, reply: "✅ 已核准並完成後續動作：通知已送出至 #er-alerts。", citations: [],
        trace: [{ node_id: "ap", type: "approval", summary: "已由 Agent 負責人核准，繼續執行", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }, { node_id: "tool", type: "tool", summary: "Slack 跨科急診警報 Bot · post_message · 成功", ms: 380, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }, { node_id: "out", type: "output", summary: "回覆組裝完成", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }] }
    : { session_id, latency_ms: 0, reply: "已拒絕此步驟，流程停止。", citations: [], trace: [{ node_id: "ap", type: "approval", summary: "負責人拒絕，流程停止", ms: 0, prompt_tokens: 0, completion_tokens: 0, cost_usd: 0 }] }, 600),
  listKnowledge: (agentId: string) => delay(files.filter((f) => f.agent_id === agentId)),
  library: () => delay(files),
  uploadKnowledge: (agentId: string, file: File) => { const f: KnowledgeFile = { id: `k${Date.now()}`, agent_id: agentId, agent_name: find(agentId).name, name: file.name, content_type: file.type, size_bytes: file.size, gcs_uri: "gs://x", status: "indexed", error: "", uploaded_by: mockUser.email, created_at: new Date().toISOString() }; files = [f, ...files]; return delay(f, 1200); },
  deleteKnowledge: (_a: string, fileId: string) => { files = files.filter((f) => f.id !== fileId); return delay(undefined); },
  audit: (q: AuditQuery, cursor?: string | null, limit = 25) => delay(auditPage(q, cursor, limit), 250),
  auditSummary: () => delay(auditSummary(), 250),
  auditCsv: (q: AuditQuery) => delay(new Blob([`\ufeffat,event_id,actor_email,action,category,severity,target_label,department\n${auditFilter(q).map((e) => [e.at, e.id, e.actor_email, e.action, e.category, e.severity, `"${e.target_label}"`, e.department].join(",")).join("\n")}`], { type: "text/csv" })),
  connectorTypes: () => delay(TYPES),
  connectorStats: () => delay<ConnectorStats>({ connected: connectors.filter((c) => c.status === "active").length, available_types: TYPES.types.filter((t) => t.available).length, invocations_today: 14820, mcp_nodes: 1 }),
  listConnectors: () => delay(connectors),
  getConnector: (id: string) => { const c = connectors.find((x) => x.id === id); if (!c) throw new Error("404 connector not found"); return delay(c); },
  createConnector: (b: ConnectorIn) => { const c = conn(`cn-${Math.random().toString(36).slice(2, 7)}`, { ...b, secret_fields: Object.keys(b.secrets).filter((k) => b.secrets[k]), status: "unverified", last_test: null, updated_at: new Date().toISOString() }); connectors = [c, ...connectors]; return delay(c); },
  updateConnector: (id: string, b: ConnectorIn) => { const cur = connectors.find((x) => x.id === id)!; const c = { ...cur, ...b, secret_fields: [...new Set([...cur.secret_fields, ...Object.keys(b.secrets).filter((k) => b.secrets[k])])], updated_at: new Date().toISOString() }; connectors = connectors.map((x) => (x.id === id ? c : x)); return delay(c); },
  testConnector: (id: string) => { const cur = connectors.find((x) => x.id === id)!; const t = TYPES.types.find((x) => x.id === cur.type)!; const r: TestResult = t.available ? { ok: true, message: cur.type === "mcp" ? "MCP 握手成功：demo · 2 個工具" : "連線成功", ms: 42, at: new Date().toISOString(), tools: cur.type === "mcp" ? [{ id: "search_guideline", label: "search_guideline", description: "" }, { id: "drug_dose", label: "drug_dose", description: "" }] : undefined } : { ok: false, message: t.coming ?? "", ms: 0, at: new Date().toISOString() }; connectors = connectors.map((x) => (x.id === id ? { ...x, status: r.ok ? "active" : "error", last_test: r } : x)); return delay(r, 900); },
  connectorActions: (id: string) => { const cur = connectors.find((x) => x.id === id)!; const t = TYPES.types.find((x) => x.id === cur.type)!; return delay<ActionSpec[]>(t.actions === "dynamic" ? (cur.last_test?.tools ?? []).map((x) => ({ id: x.id, label: x.label, description: x.description, args: [{ key: "query", label: "query", kind: "text" }], write: true })) : t.actions); },
  deleteConnector: (id: string) => { connectors = connectors.filter((x) => x.id !== id); return delay(undefined); },
  monitoringSummary: (q: MonitoringQuery) => delay(monitoringSummary(q), 400),
  monitoringAgents: (q: MonitoringQuery, sort: UsageSort) => delay(monitoringAgents(q, sort), 300),
  monitoringCsv: (q: MonitoringQuery) => delay(new Blob([`\ufeffagent_id,name,requests,cost_usd\n${monitoringAgents(q, "cost_usd").map((r) => `${r.agent_id},${r.name},${r.requests},${r.cost_usd.toFixed(4)}`).join("\n")}`], { type: "text/csv" })),
};
