import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, signInWithGoogle, signOut } from "./firebase";
import AgentList from "./pages/AgentList";
import AgentBuilder from "./pages/AgentBuilder";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  if (user === undefined) return <div className="login">載入中…</div>;
  if (!user)
    return (
      <div className="login">
        <div className="box">
          <h2>TCVGH Agent Platform</h2>
          <p className="hint">使用院內 Google Workspace 帳號登入</p>
          <button className="primary" onClick={() => signInWithGoogle().catch((e) => setErr(String(e)))}>
            使用 Google 登入
          </button>
          {err && <p className="error">{err}</p>}
        </div>
      </div>
    );

  return (
    <>
      <div className="topbar">
        <span className="title" style={{ cursor: "pointer" }} onClick={() => setAgentId(null)}>
          TCVGH Agent Platform
        </span>
        {agentId && <span className="badge">builder</span>}
        <span className="spacer" />
        <span className="hint">{user.email}</span>
        <button onClick={() => signOut()}>登出</button>
      </div>
      {agentId ? <AgentBuilder agentId={agentId} onBack={() => setAgentId(null)} /> : <AgentList onOpen={setAgentId} />}
    </>
  );
}
