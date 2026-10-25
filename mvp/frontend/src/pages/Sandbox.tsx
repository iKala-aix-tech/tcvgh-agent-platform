import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import type { AgentOut, Citation, RunResponse, StepTrace } from "../types";
import { Empty, ErrorBox, Icon, Spinner, StatusPill, fmtTime } from "../components/ui";
import { currentName, currentUid } from "../mock";

interface Msg { role: "user" | "assistant"; content: string; at: Date; trace?: StepTrace[]; citations?: Citation[]; structured?: Record<string, unknown> | null; latency?: number; pending?: RunResponse["pending_approval"]; decided?: "approved" | "rejected" }

const SUGGESTIONS = ["請摘要重點並列出注意事項", "轉為台語繁體通俗長輩語意", "依院內指引列出引用來源"];

export default function Sandbox() {
  const { id } = useParams();
  const nav = useNavigate();
  const [agent, setAgent] = useState<AgentOut | null>(null);
  const [list, setList] = useState<AgentOut[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [session, setSession] = useState<string | undefined>();
  const [usePublished, setUsePublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [err, setErr] = useState("");
  const [showTrace, setShowTrace] = useState<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const editable = !!agent && agent.owner_uid === currentUid();

  useEffect(() => {
    if (!id) { api.listAgents().then(setList); return; }
    setAgent(null); setMsgs([]); setSession(undefined); setErr("");
    api.getAgent(id).then((a) => { setAgent(a); setUsePublished(a.owner_uid !== currentUid()); }).catch((e) => setErr(String(e)));
  }, [id]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  const send = async (content = text) => {
    if (!content.trim() || !id || busy) return;
    setText(""); setErr("");
    setMsgs((m) => [...m, { role: "user", content, at: new Date() }]);
    setBusy(true);
    try {
      const r = await api.run(id, content, session, usePublished);
      setSession(r.session_id);
      setMsgs((m) => [...m, { role: "assistant", content: r.reply, at: new Date(), trace: r.trace, citations: r.citations, structured: r.structured, latency: r.latency_ms, pending: r.pending_approval }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  /** Owner decides on the step the last run paused at; approve continues the flow in this same session. */
  const decide = async (idx: number, approve: boolean) => {
    if (!id || !session || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await api.approve(id, session, approve);
      setMsgs((m) => [...m.map((x, i) => (i === idx ? { ...x, decided: approve ? "approved" as const : "rejected" as const } : x)),
        { role: "assistant", content: r.reply, at: new Date(), trace: r.trace, citations: r.citations, structured: r.structured, latency: r.latency_ms, pending: r.pending_approval }]);
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!agent) return;
    setPublishing(true); setErr("");
    try {
      const a = await api.publishAgent(agent.id); setAgent(a);
    } catch (e) { setErr(String(e)); } finally { setPublishing(false); }
  };
  const unpublish = async () => { if (!agent || !confirm("下架後其他同仁將無法在 Hub 看到或使用此 Agent。確定？")) return; setAgent(await api.unpublishAgent(agent.id)); };

  if (!id) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-2xl font-bold">沙盒測試與發布中心</h1>
        <p className="mt-1 text-sm text-on-surface-variant">選擇一個 Agent 進入臨床推論沙盒。</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {list.map((a) => (
            <button key={a.id} className="card flex items-center gap-3 px-4 py-3 text-left hover:shadow-float" onClick={() => nav(`/sandbox/${a.id}`)}>
              <Icon name="science" className="text-primary" /><span className="flex-1"><span className="block font-semibold">{a.name}</span><span className="block text-xs text-on-surface-variant">{a.owner_email}</span></span><StatusPill status={a.status} version={a.version} />
            </button>
          ))}
        </div>
        {list.length === 0 && <div className="mt-5"><Empty icon="science" title="沒有可測試的 Agent" /></div>}
      </div>
    );
  }
  if (!agent) return <div className="grid h-full place-items-center">{err ? <ErrorBox msg={err} /> : <Spinner />}</div>;

  return (
    <div className="flex h-full flex-col">
      <section className="flex shrink-0 flex-wrap items-center gap-4 border-b border-hairline bg-white px-5 py-3">
        <button className="btn-ghost px-2" onClick={() => nav(editable ? `/studio/${agent.id}` : "/hub")}><Icon name="arrow_back" /></button>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex flex-wrap items-center gap-2 text-lg font-bold">{agent.name}
            <span className="chip">沙盒驗證階段 {agent.status === "published" ? `(v${agent.version} 已發布)` : "(草稿)"}</span></p>
          <p className="font-mono text-[11px] text-outline">ID: {agent.id} · 負責人 {agent.owner_email} · 模型群組 {agent.model_group} · {agent.knowledge_count} 份知識文件</p>
        </div>
        {editable && (
          <label className="flex items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 text-xs">
            <input type="checkbox" className="w-auto" checked={usePublished} disabled={!agent.version} onChange={(e) => { setUsePublished(e.target.checked); setSession(undefined); setMsgs([]); }} />
            測試已發布版本{agent.version ? ` v${agent.version}` : "（尚無）"}
          </label>
        )}
        {editable && (agent.status === "published"
          ? <button className="btn-soft" onClick={unpublish}><Icon name="unpublished" className="text-[18px]" />下架</button>
          : null)}
        {editable && (
          <button className="btn-primary px-5 py-2.5" onClick={publish} disabled={publishing}>
            {publishing ? <Spinner /> : <Icon name="publish" className="text-[18px]" />}
            {agent.status === "published" ? `發布新版本至 Agent Hub（v${agent.version + 1}）` : "發布至 Agent Hub（全院可用）"}
          </button>
        )}
      </section>
      {agent.status === "published" && <div className="flex items-center gap-2 bg-primary-tint px-5 py-1.5 text-xs text-primary-dark"><Icon name="verified" className="text-[16px]" />v{agent.version} 已於 {fmtTime(agent.published_at)} 發布，全院同仁可在 Agent Hub 看到並對話。草稿的後續修改需再次發布才會生效。</div>}

      <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col px-5 py-4">
        <div className="card flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-tint text-primary"><Icon name="science" /></span>
              <div className="leading-tight"><p className="font-bold">臨床推論沙盒 (Playground)</p><p className="font-mono text-[11px] text-outline">{usePublished ? `已發布版本 v${agent.version}` : "草稿版本"} · 經 LiteLLM 路由 · {agent.model_group}</p></div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {agent.test_cases.length > 0 && (
                <select className="w-auto py-1 text-xs" value="" onChange={(e) => { const t = agent.test_cases[Number(e.target.value)]; if (t) send(t.message); }}>
                  <option value="">預載個案：選擇…</option>{agent.test_cases.map((t, i) => <option key={i} value={i}>{t.title}</option>)}
                </select>
              )}
              <button className="btn-ghost" onClick={() => { setMsgs([]); setSession(undefined); }}><Icon name="restart_alt" className="text-[16px]" />重設對話</button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-auto px-5 py-4">
            <p className="mx-auto w-fit rounded-full bg-surface-container-low px-3 py-1 font-mono text-[11px] text-on-surface-variant"><Icon name="lock" className="mr-1 text-[12px]" />輸入內容於推論前先經 Sensitive Data Protection 去識別化（沙盒目前 {msgs.length ? "" : ""}依 DEID_ENABLED 設定）</p>
            {msgs.length === 0 && <div className="py-10 text-center text-sm text-on-surface-variant">輸入醫師指示或測試提問開始。{agent.knowledge_count > 0 && " 本 Agent 已掛載知識庫，回答會附上引用來源。"}</div>}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex flex-col items-end">
                  <span className="mb-1 font-mono text-[10px] text-outline">{currentName() ?? "我"} · {m.at.toLocaleTimeString("zh-TW")}</span>
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-xl rounded-tr-sm bg-primary-dark px-4 py-3 text-sm text-white">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-tint font-mono text-[11px] font-semibold text-primary">AI</span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex items-center gap-2 text-xs"><b>{agent.name}</b>
                      {m.citations?.length ? <span className="chip">RAG 驗證已完成 · {m.citations.length} 段</span> : null}
                      <span className="flex-1" /><span className="font-mono text-[10px] text-outline">{m.latency ? `${(m.latency / 1000).toFixed(2)}s` : ""}</span></p>
                    <div className="card rounded-xl rounded-tl-sm px-4 py-3 text-sm leading-6">
                      {m.structured ? <pre className="overflow-auto rounded bg-surface-container-low p-3 font-mono text-xs">{JSON.stringify(m.structured, null, 2)}</pre> : <div className="whitespace-pre-wrap">{m.content}</div>}
                      {m.pending && (
                        <div className={`mt-3 rounded border px-3 py-2 text-xs ${m.decided === "approved" ? "border-primary/40 bg-primary-tint text-primary-dark" : m.decided === "rejected" ? "border-hairline bg-surface-container-low text-on-surface-variant" : "border-warning/40 bg-warning-container/50 text-warning"}`}>
                          <p className="flex items-center gap-2"><Icon name={m.decided === "approved" ? "check_circle" : m.decided === "rejected" ? "cancel" : "pause_circle"} className="text-[16px]" />
                            {m.decided === "approved" ? "已核准，流程已繼續" : m.decided === "rejected" ? "已拒絕，流程停止" : `等待人工核准：${m.pending.message}`}</p>
                          {!m.decided && (editable ? (
                            <div className="mt-2 flex items-center gap-2">
                              <button className="btn-primary py-1" disabled={busy || i !== msgs.length - 1} onClick={() => decide(i, true)}><Icon name="check" className="text-[16px]" />核准並繼續</button>
                              <button className="btn-soft py-1" disabled={busy || i !== msgs.length - 1} onClick={() => decide(i, false)}>拒絕</button>
                              <span className="font-mono text-[10px] text-outline">核准人：Agent 負責人（您）</span>
                            </div>
                          ) : <p className="mt-1 text-on-surface-variant">需由 Agent 負責人 {agent.owner_email} 在其沙盒中核准後才會執行下一步。</p>)}
                        </div>
                      )}
                      {m.citations && m.citations.length > 0 && (
                        <div className="mt-3 border-t border-hairline pt-2 text-xs">
                          <p className="mb-1 text-on-surface-variant">引用指引來源：</p>
                          <div className="flex flex-wrap gap-1.5">{m.citations.map((c, j) => <span key={j} className="chip" title={c.text}>[{j + 1}] {c.source}{c.score != null ? ` · ${c.score.toFixed(2)}` : ""}</span>)}</div>
                        </div>
                      )}
                      {m.trace && (
                        <div className="mt-2 text-xs">
                          <button className="text-primary hover:underline" onClick={() => setShowTrace(showTrace === i ? null : i)}>{showTrace === i ? "隱藏" : "顯示"}推論軌跡（{m.trace.length} 步）</button>
                          {showTrace === i && (
                            <ol className="mt-2 space-y-1 border-l-2 border-hairline pl-3 font-mono text-[11px] text-on-surface-variant">
                              {m.trace.map((t, k) => <li key={k}><span className="text-primary">{t.type}</span> {t.node_id}{t.group ? ` [${t.group} → ${t.model}]` : ""} · {t.summary}{t.ms ? ` · ${t.ms} ms` : ""}</li>)}
                            </ol>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ),
            )}
            {busy && <div className="flex items-center gap-2 text-xs text-on-surface-variant"><Spinner />推論中…</div>}
            <div ref={bottom} />
          </div>

          <div className="border-t border-hairline px-5 py-3">
            <ErrorBox msg={err} />
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant">建議指令：
              {SUGGESTIONS.map((s) => <button key={s} className="pill bg-surface-container-low px-2 py-1 text-xs font-normal hover:bg-surface-container-high" onClick={() => setText((t) => (t ? `${t}\n${s}` : s))}>+ {s}</button>)}
            </div>
            <div className="rounded-lg border border-hairline bg-surface-container-low p-2 focus-within:border-primary">
              <textarea rows={2} className="border-0 bg-transparent" value={text} placeholder="輸入醫師指示或測試提問（支援中英醫學詞彙與 HIS 病歷指令）…"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
              <div className="flex items-center gap-3 px-1 font-mono text-[11px] text-outline">
                <span>溫度: {agent.temperature.toFixed(2)} | Top-P: {agent.top_p.toFixed(2)} | 院內安全合規模式</span>
                <span className="flex-1" />
                <button className="btn-primary" disabled={busy || !text.trim()} onClick={() => send()}>送出測試 <Icon name="send" className="text-[16px]" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
