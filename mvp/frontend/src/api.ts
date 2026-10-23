import { idToken } from "./firebase";
import type { AgentIn, AgentOut, RunResponse } from "./types";

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await idToken();
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${text}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  listAgents: () => call<AgentOut[]>("/api/agents"),
  getAgent: (id: string) => call<AgentOut>(`/api/agents/${id}`),
  createAgent: (body: AgentIn) => call<AgentOut>("/api/agents", { method: "POST", body: JSON.stringify(body) }),
  updateAgent: (id: string, body: AgentIn) => call<AgentOut>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(body) }),
  publishAgent: (id: string) => call<AgentOut>(`/api/agents/${id}/publish`, { method: "POST" }),
  deleteAgent: (id: string) => call<void>(`/api/agents/${id}`, { method: "DELETE" }),
  run: (id: string, message: string, session_id?: string) =>
    call<RunResponse>(`/api/agents/${id}/run`, { method: "POST", body: JSON.stringify({ message, session_id }) }),
};
