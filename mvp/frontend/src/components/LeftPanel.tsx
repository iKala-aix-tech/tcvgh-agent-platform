import { MODEL_GROUPS, type AgentIn, type Connector, type FlowNode, type ModelGroup } from "../types";

const CONNECTORS: { provider: Connector["provider"]; label: string; scopes: string[] }[] = [
  { provider: "gmail", label: "Gmail（寄信）", scopes: ["https://www.googleapis.com/auth/gmail.send"] },
  { provider: "calendar", label: "Google Calendar（建立活動）", scopes: ["https://www.googleapis.com/auth/calendar.events"] },
  { provider: "drive", label: "Google Drive（讀取檔案）", scopes: ["https://www.googleapis.com/auth/drive.readonly"] },
  { provider: "docs", label: "Google Docs（讀取文件）", scopes: ["https://www.googleapis.com/auth/documents.readonly"] },
];

interface Props {
  agent: AgentIn;
  onChange: (p: Partial<AgentIn>) => void;
  selected: FlowNode | null;
  onNodeChange: (n: FlowNode) => void;
}

export default function LeftPanel({ agent, onChange, selected, onNodeChange }: Props) {
  const toggleConnector = (c: (typeof CONNECTORS)[number]) => {
    const has = agent.connectors.some((x) => x.provider === c.provider);
    onChange({
      connectors: has
        ? agent.connectors.filter((x) => x.provider !== c.provider)
        : [...agent.connectors, { provider: c.provider, scopes: c.scopes, requires_approval: true }],
    });
  };
  const setNodeData = (k: string, v: unknown) => selected && onNodeChange({ ...selected, data: { ...selected.data, [k]: v } });

  return (
    <>
      <label>Agent 名稱</label>
      <input value={agent.name} onChange={(e) => onChange({ name: e.target.value })} />
      <label>描述</label>
      <input value={agent.description} onChange={(e) => onChange({ description: e.target.value })} />
      <label>指令（System prompt）</label>
      <textarea rows={6} value={agent.instructions} onChange={(e) => onChange({ instructions: e.target.value })} />

      <label>模型群組（經 LiteLLM 路由）</label>
      <select value={agent.model_group} onChange={(e) => onChange({ model_group: e.target.value as ModelGroup, routing: { ...agent.routing, default_group: e.target.value as ModelGroup } })}>
        {MODEL_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
      </select>
      <div className="hint">{MODEL_GROUPS.find((g) => g.id === agent.model_group)?.hint}</div>

      <label>模型路由（Model routing）</label>
      <div className="row">
        <input type="checkbox" style={{ width: "auto" }} checked={agent.routing.sovereign_only}
          onChange={(e) => onChange({ routing: { ...agent.routing, sovereign_only: e.target.checked } })} />
        <span style={{ fontSize: 13 }}>僅限院內模型（sovereign，不回退雲端）</span>
      </div>
      <div className="hint" style={{ marginTop: 6 }}>遇到下列關鍵字自動升級到 reasoning：</div>
      <input value={agent.routing.reasoning_keywords.join(", ")}
        onChange={(e) => onChange({ routing: { ...agent.routing, reasoning_keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} />
      <label>成本上限</label>
      <select value={agent.routing.max_cost_tier} onChange={(e) => onChange({ routing: { ...agent.routing, max_cost_tier: e.target.value as AgentIn["routing"]["max_cost_tier"] } })}>
        <option value="budget">budget</option><option value="fast">fast</option><option value="reasoning">reasoning</option>
      </select>

      <label>連接器（Connectors，MVP = Google Workspace）</label>
      {CONNECTORS.map((c) => (
        <div className="row" key={c.provider} style={{ marginBottom: 4 }}>
          <input type="checkbox" style={{ width: "auto" }} checked={agent.connectors.some((x) => x.provider === c.provider)} onChange={() => toggleConnector(c)} />
          <span style={{ fontSize: 13 }}>{c.label}</span>
        </div>
      ))}
      <div className="hint">寫入動作預設需要人工核准（human-in-the-loop）。Slack / LINE / Teams 於第二階段。</div>

      {selected && (
        <div className="inspector">
          <strong style={{ fontSize: 13 }}>節點設定：{selected.type} · {selected.id}</strong>
          <label>顯示名稱</label>
          <input value={String(selected.data.label ?? "")} onChange={(e) => setNodeData("label", e.target.value)} />
          {selected.type === "llm" && (<>
            <label>提示詞（可用 {"{{input}}"}、{"{{last}}"}、{"{{節點id}}"}）</label>
            <textarea rows={4} value={String(selected.data.prompt ?? "{{input}}")} onChange={(e) => setNodeData("prompt", e.target.value)} />
            <label>此步驟指定模型群組（留空 = 依路由策略）</label>
            <select value={String(selected.data.group ?? "")} onChange={(e) => setNodeData("group", e.target.value || undefined)}>
              <option value="">（依路由策略）</option>
              {MODEL_GROUPS.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
            </select>
          </>)}
          {selected.type === "condition" && (<>
            <label>判斷問題（LLM 回答 YES/NO，走 true/false 分支）</label>
            <textarea rows={3} value={String(selected.data.question ?? "")} onChange={(e) => setNodeData("question", e.target.value)} />
          </>)}
          {selected.type === "tool" && (<>
            <label>連接器</label>
            <select value={String(selected.data.provider ?? "gmail")} onChange={(e) => setNodeData("provider", e.target.value)}>
              {CONNECTORS.map((c) => <option key={c.provider} value={c.provider}>{c.label}</option>)}
            </select>
            <label>動作</label>
            <input value={String(selected.data.action ?? "")} placeholder="send_email / create_event / read_file" onChange={(e) => setNodeData("action", e.target.value)} />
            <label>參數（可用模板變數）</label>
            <textarea rows={3} value={String(selected.data.args ?? "")} onChange={(e) => setNodeData("args", e.target.value)} />
          </>)}
          {selected.type === "approval" && (<>
            <label>核准訊息</label>
            <input value={String(selected.data.message ?? "")} onChange={(e) => setNodeData("message", e.target.value)} />
          </>)}
          {selected.type === "output" && (<>
            <label>回覆模板</label>
            <textarea rows={3} value={String(selected.data.template ?? "{{last}}")} onChange={(e) => setNodeData("template", e.target.value)} />
          </>)}
        </div>
      )}
    </>
  );
}
