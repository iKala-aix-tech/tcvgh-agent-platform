import { useEffect, useState } from "react";
import { api } from "../api";
import { emptyAgent, type AgentOut } from "../types";

export default function AgentList({ onOpen }: { onOpen: (id: string) => void }) {
  const [agents, setAgents] = useState<AgentOut[]>([]);
  const [err, setErr] = useState("");

  const load = () => api.listAgents().then(setAgents).catch((e) => setErr(String(e)));
  useEffect(() => { load(); }, []);

  const create = async () => {
    const a = await api.createAgent(emptyAgent());
    onOpen(a.id);
  };

  return (
    <div className="list">
      <div className="row" style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, flex: 1 }}>我的 Agents</h2>
        <button className="primary" onClick={create}>＋ 建立 Agent</button>
      </div>
      {err && <p className="error">{err}</p>}
      {agents.length === 0 && !err && <p className="hint">還沒有 Agent。按「建立 Agent」開始。</p>}
      {agents.map((a) => (
        <div className="card" key={a.id}>
          <div className="grow">
            <h3>{a.name} <span className={`badge ${a.status}`}>{a.status === "published" ? `v${a.version} published` : "draft"}</span></h3>
            <p>{a.description || "（無描述）"} · 模型群組 {a.model_group} · {a.connectors.length} 個連接器</p>
          </div>
          <button onClick={() => onOpen(a.id)}>開啟</button>
          <button onClick={() => api.deleteAgent(a.id).then(load)}>刪除</button>
        </div>
      ))}
    </div>
  );
}
