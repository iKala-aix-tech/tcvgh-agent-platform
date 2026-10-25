import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { auth } from "./firebase";
import { api } from "./api";
import Shell from "./components/Shell";
import Login from "./pages/Login";
import Hub from "./pages/Hub";
import Studio from "./pages/Studio";
import Sandbox from "./pages/Sandbox";
import Knowledge from "./pages/Knowledge";
import Audit from "./pages/Audit";
import Monitoring from "./pages/Monitoring";
import Connectors from "./pages/Connectors";
import ConnectorSetup from "./pages/ConnectorSetup";
import { Spinner } from "./components/ui";
import { MOCK, mockUser } from "./mock";

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [role, setRole] = useState<string | null>(null); // null until /api/me answers (admin routes must not bounce early)

  useEffect(() => (MOCK ? setUser(mockUser as unknown as User) : onAuthStateChanged(auth, setUser)), []);
  useEffect(() => { if (user) api.me().then((m) => setRole(m.role)).catch(() => setRole("builder")); }, [user]);

  if (user === undefined) return <div className="grid h-full place-items-center"><Spinner /></div>;
  if (!user || (MOCK && window.location.search.includes("login"))) return <Login />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell user={user} role={role ?? "builder"} />}>
          <Route index element={<Navigate to="/hub" replace />} />
          <Route path="/hub" element={<Hub user={user} />} />
          <Route path="/studio" element={<Studio />} />
          <Route path="/studio/:id" element={<Studio />} />
          <Route path="/sandbox" element={<Sandbox />} />
          <Route path="/sandbox/:id" element={<Sandbox />} />
          <Route path="/connectors" element={<Connectors />} />
          <Route path="/connectors/new" element={<ConnectorSetup />} />
          <Route path="/connectors/:id" element={<ConnectorSetup />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/audit" element={<Audit role={role ?? "builder"} />} />
          <Route path="/monitoring" element={role === null ? <div className="grid h-full place-items-center"><Spinner /></div> : role === "admin" ? <Monitoring /> : <Navigate to="/hub" replace />} />
          <Route path="*" element={<Navigate to="/hub" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
