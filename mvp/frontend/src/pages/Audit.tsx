import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import type { AuditEntry } from "../types";
import { Empty, ErrorBox, Icon, Spinner } from "../components/ui";

const ACTION_LABEL: Record<string, string> = {
  "agent.create": "建立 Agent", "agent.update": "更新草稿", "agent.publish": "發布版本", "agent.unpublish": "下架", "agent.delete": "刪除 Agent",
  "agent.run": "推論呼叫", "knowledge.upload": "上傳知識文件", "knowledge.delete": "移除知識文件", "knowledge.error": "知識索引失敗",
};

export default function Audit({ role }: { role: string }) {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api.audit(300).then(setRows).catch((e) => setErr(String(e))); }, []);
  const shown = useMemo(() => (rows ?? []).filter((r) => !filter || r.action === filter), [rows, filter]);
  const actions = useMemo(() => [...new Set((rows ?? []).map((r) => r.action))].sort(), [rows]);

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-2xl font-bold">資安審計與推論軌跡</h1>
          <p className="mt-1 text-sm text-on-surface-variant">{role === "admin" ? "管理員檢視：全院所有操作" : "您的操作紀錄"}（Firestore audit 集合，僅追加不可改）。對話內容已於進入前去識別化，不列於此。</p></div>
        <select className="w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">所有動作</option>{actions.map((a) => <option key={a} value={a}>{ACTION_LABEL[a] ?? a}</option>)}</select>
      </div>
      <ErrorBox msg={err} />
      {rows === null ? <div className="grid place-items-center py-20"><Spinner /></div> : shown.length === 0 ? <div className="mt-5"><Empty icon="shield" title="尚無紀錄" /></div> : (
        <div className="card mt-5 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low font-mono text-[10px] uppercase tracking-wider text-outline"><tr><th className="px-4 py-2 text-left">時間</th><th className="px-4 py-2 text-left">動作</th><th className="px-4 py-2 text-left">操作者</th><th className="px-4 py-2 text-left">詳細</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-hairline align-top hover:bg-primary-tint/40">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{r.at ? new Date(r.at).toLocaleString("zh-TW") : "—"}</td>
                  <td className="px-4 py-2"><span className="chip"><Icon name={r.action.startsWith("knowledge") ? "menu_book" : r.action === "agent.run" ? "play_arrow" : "edit"} className="text-[12px]" />{ACTION_LABEL[r.action] ?? r.action}</span></td>
                  <td className="px-4 py-2 text-xs">{r.actor_email || r.actor}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-on-surface-variant">{Object.entries(r.details).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : String(v)}`).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
