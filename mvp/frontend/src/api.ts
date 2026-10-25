import { idToken } from "./firebase";
import { MOCK, mockApi } from "./mock";
import type { ActionSpec, AgentIn, AgentOut, AgentUsageRow, AuditEntry, ConnectorIn, ConnectorOut, ConnectorStats, ConnectorTypes, Flow, HubStats, KnowledgeFile, Me, MonitoringQuery, MonitoringSummary, RunResponse, TestResult, UsageSort } from "./types";

async function call<T>(path: string, init: RequestInit = {}, json = true): Promise<T> {
  const token = await idToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...((init.headers as Record<string, string>) || {}) };
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let detail = await res.text();
    try { detail = JSON.parse(detail).detail ?? detail; } catch { /* plain text */ }
    throw new Error(`${res.status} ${detail}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const qs = (q: MonitoringQuery) => new URLSearchParams({ from: q.from, to: q.to, department: q.department }).toString();

const realApi = {
  me: () => call<Me>("/api/me"),
  stats: () => call<HubStats>("/api/agents/stats"),
  listAgents: () => call<AgentOut[]>("/api/agents"),
  getAgent: (id: string) => call<AgentOut>(`/api/agents/${id}`),
  createAgent: (body: AgentIn) => call<AgentOut>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id: string, body: AgentIn) => call<AgentOut>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  validate: (flow: Flow) => call<{ problems: string[] }>("/api/agents/validate", { method: "POST", body: JSON.stringify(flow) }),
  publishAgent: (id: string) => call<AgentOut>(`/api/agents/${id}/publish`, { method: "POST" }),
  unpublishAgent: (id: string) => call<AgentOut>(`/api/agents/${id}/unpublish`, { method: "POST" }),
  deleteAgent: (id: string) => call<void>(`/api/agents/${id}`, { method: "DELETE" }),
  run: (id: string, message: string, session_id?: string, use_published = false) =>
    call<RunResponse>(`/api/agents/${id}/run`, { method: "POST", body: JSON.stringify({ message, session_id, use_published }) }),
  approve: (id: string, session_id: string, approve: boolean) =>
    call<RunResponse>(`/api/agents/${id}/approve`, { method: "POST", body: JSON.stringify({ session_id, approve }) }),
  listKnowledge: (agentId: string) => call<KnowledgeFile[]>(`/api/agents/${agentId}/knowledge`),
  library: () => call<KnowledgeFile[]>("/api/knowledge"),
  uploadKnowledge: (agentId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return call<KnowledgeFile>(`/api/agents/${agentId}/knowledge`, { method: "POST", body: fd }, false);
  },
  deleteKnowledge: (agentId: string, fileId: string) => call<void>(`/api/agents/${agentId}/knowledge/${fileId}`, { method: "DELETE" }),
  audit: (limit = 100) => call<AuditEntry[]>(`/api/audit?limit=${limit}`),
  connectorTypes: () => call<ConnectorTypes>("/api/connectors/types"),
  connectorStats: () => call<ConnectorStats>("/api/connectors/stats"),
  listConnectors: () => call<ConnectorOut[]>("/api/connectors"),
  getConnector: (id: string) => call<ConnectorOut>(`/api/connectors/${id}`),
  createConnector: (body: ConnectorIn) => call<ConnectorOut>("/api/connectors", { method: "POST", body: JSON.stringify(body) }),
  updateConnector: (id: string, body: ConnectorIn) => call<ConnectorOut>(`/api/connectors/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  testConnector: (id: string) => call<TestResult>(`/api/connectors/${id}/test`, { method: "POST" }),
  connectorActions: (id: string) => call<ActionSpec[]>(`/api/connectors/${id}/actions`),
  deleteConnector: (id: string) => call<void>(`/api/connectors/${id}`, { method: "DELETE" }),
  monitoringSummary: (q: MonitoringQuery) => call<MonitoringSummary>(`/api/monitoring/summary?${qs(q)}`),
  monitoringAgents: (q: MonitoringQuery, sort: UsageSort) => call<AgentUsageRow[]>(`/api/monitoring/agents?${qs(q)}&sort=${sort}`),
  /** CSV needs the bearer token, so it is fetched as a Blob and saved client-side. */
  monitoringCsv: async (q: MonitoringQuery) => {
    const res = await fetch(`/api/monitoring/export.csv?${qs(q)}`, { headers: { Authorization: `Bearer ${await idToken()}` } });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    return res.blob();
  },
};

export const api: typeof realApi = MOCK ? (mockApi as typeof realApi) : realApi;
