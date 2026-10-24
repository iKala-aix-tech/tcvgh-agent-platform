import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { KnowledgeFile } from "../types";
import { ErrorBox, Icon, Spinner, fmtBytes } from "./ui";

/** Left-rail "臨床知識庫與規範掛載": upload files into the agent's Vertex AI RAG corpus. */
export default function KnowledgePanel({ agentId, editable, onCount }: { agentId: string; editable: boolean; onCount?: (n: number) => void }) {
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const load = () => api.listKnowledge(agentId).then((f) => { setFiles(f); onCount?.(f.filter((x) => x.status === "indexed").length); }).catch((e) => setErr(String(e)));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [agentId]);

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setErr("");
    for (const f of Array.from(list)) {
      setBusy(f.name);
      try { await api.uploadKnowledge(agentId, f); } catch (e) { setErr(`${f.name}: ${String(e)}`); }
    }
    setBusy("");
    load();
  };
  const remove = async (f: KnowledgeFile) => {
    if (!confirm(`移除「${f.name}」？將同時自向量索引刪除。`)) return;
    try { await api.deleteKnowledge(agentId, f.id); load(); } catch (e) { setErr(String(e)); }
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="section-title text-sm"><Icon name="library_books" className="text-primary" />臨床知識庫與規範掛載</p>
        <span className="chip">{files.filter((f) => f.status === "indexed").length} 份已索引</span>
      </div>
      <p className="mt-1 text-[11px] text-outline">Vertex AI RAG Engine · 每個 Agent 一座向量庫 · PDF / DOCX / TXT / MD / CSV ≤ 25 MB</p>
      <div className="mt-3 space-y-2">
        {files.map((f) => (
          <div key={f.id} className="flex items-center gap-3 rounded-lg border border-hairline bg-surface-container-low px-3 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded bg-white text-primary"><Icon name={f.name.endsWith(".pdf") ? "picture_as_pdf" : "description"} /></span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-sm font-semibold" title={f.name}>{f.name}</p>
              <p className="font-mono text-[10px] text-outline">{fmtBytes(f.size_bytes)} · {f.uploaded_by.split("@")[0]}{f.error && <span className="text-error"> · {f.error.slice(0, 80)}</span>}</p>
            </div>
            <span className={`pill ${f.status === "indexed" ? "bg-primary-tint text-primary" : f.status === "error" ? "bg-error-container text-on-error-container" : "bg-surface-container-high text-on-surface-variant"}`}>
              {f.status === "indexed" ? "Indexed" : f.status === "error" ? "Error" : "Indexing"}</span>
            {editable && <button className="btn-ghost px-1" title="移除" onClick={() => remove(f)}><Icon name="close" className="text-[16px]" /></button>}
          </div>
        ))}
        {files.length === 0 && !busy && <p className="rounded-lg border border-dashed border-outline-variant px-3 py-4 text-center text-xs text-on-surface-variant">尚未掛載任何院內指引或規範文件</p>}
        {busy && <div className="flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-xs"><Spinner />正在上傳並建立語義切片：{busy}</div>}
      </div>
      <ErrorBox msg={err} />
      {editable && (<>
        <input ref={input} type="file" multiple hidden accept=".pdf,.txt,.md,.docx,.pptx,.html,.csv,.json" onChange={(e) => upload(e.target.files)} />
        <button className="btn-secondary mt-3 w-full" disabled={!!busy} onClick={() => input.current?.click()}><Icon name="add_circle" className="text-[18px]" />掛載臨床知識庫 / 院規文件</button>
      </>)}
    </div>
  );
}
