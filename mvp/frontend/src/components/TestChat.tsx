import { useState } from "react";
import { api } from "../api";
import type { StepTrace } from "../types";

interface Msg { role: "user" | "assistant"; content: string; trace?: StepTrace[] }

/** Right panel: run the DRAFT agent and show which model group / model each step used. */
export default function TestChat({ agentId, dirty }: { agentId: string; dirty: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [session, setSession] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const send = async () => {
    if (!text.trim()) return;
    const content = text; setText(""); setErr("");
    setMsgs((m) => [...m, { role: "user", content }]);
    setBusy(true);
    try {
      const r = await api.run(agentId, content, session);
      setSession(r.session_id);
      const extra = r.pending_approval ? `\n\n⏸ 等待核准：${r.pending_approval.message}` : "";
      setMsgs((m) => [...m, { role: "assistant", content: r.reply + extra, trace: r.trace }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="row"><strong style={{ fontSize: 13, flex: 1 }}>測試對話</strong>
        <button onClick={() => { setMsgs([]); setSession(undefined); }}>清除</button></div>
      {dirty && <div className="hint">尚有未儲存變更：測試使用的是最後儲存版本。</div>}
      <div className="chat">
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            {m.content}
            {m.trace && <div className="trace">{m.trace.map((t) => `${t.type}${t.group ? ` [${t.group}→${t.model}]` : ""}: ${t.summary}`).join("\n")}</div>}
          </div>
        ))}
        {busy && <div className="msg assistant">…</div>}
      </div>
      {err && <div className="error">{err}</div>}
      <div className="composer">
        <input value={text} placeholder="輸入訊息（PHI 會先去識別化）" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && send()} />
        <button className="primary" disabled={busy} onClick={send}>送出</button>
      </div>
    </>
  );
}
