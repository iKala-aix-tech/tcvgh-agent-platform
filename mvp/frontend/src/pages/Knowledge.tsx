import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { KnowledgeFile } from "../types";
import { Empty, ErrorBox, Icon, Spinner, fmtBytes, fmtTime } from "../components/ui";

export default function Knowledge() {
  const nav = useNavigate();
  const [files, setFiles] = useState<KnowledgeFile[] | null>(null);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api.library().then(setFiles).catch((e) => setErr(String(e))); }, []);

  const groups = useMemo(() => {
    const needle = q.toLowerCase();
    const g = new Map<string, { name: string; files: KnowledgeFile[] }>();
    for (const f of files ?? []) {
      if (needle && !f.name.toLowerCase().includes(needle) && !f.agent_name.toLowerCase().includes(needle)) continue;
      const e = g.get(f.agent_id) ?? { name: f.agent_name, files: [] };
      e.files.push(f); g.set(f.agent_id, e);
    }
    return [...g.entries()];
  }, [files, q]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">院內指引與醫學知識庫</h1>
          <p className="mt-1 text-sm text-on-surface-variant">各 Agent 掛載的指引、院規與參考文件（Vertex AI RAG Engine 向量索引）。上傳與移除請至該 Agent 的 Studio 頁。</p></div>
        <span className="chip"><Icon name="database" className="text-[14px]" />{files?.length ?? "—"} 份文件 · {groups.length} 個 Agent</span>
      </div>
      <div className="relative mt-4"><Icon name="search" className="absolute left-3 top-2.5 text-[20px] text-outline" /><input className="pl-10 py-2.5" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋文件名稱或 Agent" /></div>
      <ErrorBox msg={err} />
      {files === null ? <div className="grid place-items-center py-20"><Spinner /></div> : groups.length === 0 ? (
        <div className="mt-5"><Empty icon="menu_book" title="尚無知識文件" hint="在 Agent Studio 左側「臨床知識庫與規範掛載」上傳 PDF 或文件。" /></div>
      ) : (
        <div className="mt-5 space-y-4">
          {groups.map(([aid, g]) => (
            <section key={aid} className="card">
              <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                <Icon name="smart_toy" className="text-primary" /><p className="flex-1 font-semibold">{g.name}</p>
                <span className="chip">{g.files.length} 份</span>
                <button className="btn-ghost text-xs" onClick={() => nav(`/studio/${aid}`)}>開啟 Studio <Icon name="arrow_forward" className="text-[14px]" /></button>
              </div>
              <table className="w-full text-sm">
                <thead className="font-mono text-[10px] uppercase tracking-wider text-outline"><tr><th className="px-4 py-2 text-left">文件</th><th className="px-4 py-2 text-left">大小</th><th className="px-4 py-2 text-left">狀態</th><th className="px-4 py-2 text-left">上傳者</th><th className="px-4 py-2 text-left">時間</th></tr></thead>
                <tbody>
                  {g.files.map((f) => (
                    <tr key={f.id} className="border-t border-hairline hover:bg-primary-tint/40">
                      <td className="px-4 py-2"><span className="flex items-center gap-2"><Icon name={f.name.endsWith(".pdf") ? "picture_as_pdf" : "description"} className="text-[18px] text-primary" />{f.name}</span></td>
                      <td className="px-4 py-2 font-mono text-xs">{fmtBytes(f.size_bytes)}</td>
                      <td className="px-4 py-2"><span className={`pill ${f.status === "indexed" ? "bg-primary-tint text-primary" : f.status === "error" ? "bg-error-container text-on-error-container" : "bg-surface-container-high"}`}>{f.status}</span></td>
                      <td className="px-4 py-2 text-xs">{f.uploaded_by}</td>
                      <td className="px-4 py-2 text-xs">{fmtTime(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
