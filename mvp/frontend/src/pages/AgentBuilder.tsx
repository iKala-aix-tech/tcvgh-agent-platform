import { useEffect, useState } from "react";
import { api } from "../api";
import type { AgentIn, AgentOut, FlowNode } from "../types";
import LeftPanel from "../components/LeftPanel";
import Canvas from "../components/Canvas";
import TestChat from "../components/TestChat";

/** Builder page = left panel (settings) | center canvas (drag & drop) | right test chat. */
export default function AgentBuilder({ agentId, onBack }: { agentId: string; onBack: () => void }) {
  const [agent, setAgent] = useState<AgentOut | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<FlowNode | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => { api.getAgent(agentId).then(setAgent); }, [agentId]);

  const patch = (p: Partial<AgentIn>) => { setAgent((a) => (a ? { ...a, ...p } : a)); setDirty(true); };

  const save = async () => {
    if (!agent) return;
    const { id, owner_email, status: _s, version, updated_at, ...body } = agent;
    void id; void owner_email; void _s; void version; void updated_at;
    const saved = await api.updateAgent(agentId, body as AgentIn);
    setAgent(saved); setDirty(false); setStatus("已儲存");
  };
  const publish = async () => { await save(); setAgent(await api.publishAgent(agentId)); setStatus("已發佈新版本"); };

  if (!agent) return <div className="list">載入中…</div>;

  return (
    <div className="builder">
      <aside className="left">
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={onBack}>← 返回</button>
          <span className="spacer" style={{ flex: 1 }} />
          <button onClick={save} disabled={!dirty}>儲存</button>
          <button className="ok" onClick={publish}>發佈</button>
        </div>
        <div className="hint">{agent.status === "published" ? `v${agent.version} 已發佈` : "草稿"} {status && `· ${status}`}</div>
        <LeftPanel agent={agent} onChange={patch} selected={selected}
          onNodeChange={(n) => {
            patch({ flow: { ...agent.flow, nodes: agent.flow.nodes.map((x) => (x.id === n.id ? n : x)) } });
            setSelected(n);
          }} />
      </aside>
      <main className="canvas">
        <Canvas flow={agent.flow} onChange={(flow) => patch({ flow })} onSelect={setSelected} />
      </main>
      <aside className="right">
        <TestChat agentId={agentId} dirty={dirty} />
      </aside>
    </div>
  );
}
