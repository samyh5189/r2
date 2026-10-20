import { useState } from "react";
import "./index.css";
import ChecklistPage from "./components/ChecklistPage";
import LogsPage from "./components/LogsPage";
import AdminLogin from "./components/AdminLogin";
import ChecklistEditor from "./components/ChecklistEditor";
import TrendsPage from "./components/TrendsPage";
import { getAdminToken, signOutAdmin } from "./storage";

type Tab = "checklist" | "logs" | "faults" | "trends" | "setup";

export default function App() {
  const [tab, setTab] = useState<Tab>("checklist");
  const [isAdmin, setIsAdmin] = useState(() => !!getAdminToken());
  const [showLogin, setShowLogin] = useState(false);

  function signOut() {
    signOutAdmin();
    setIsAdmin(false);
    setTab((t) => (t === "setup" ? "checklist" : t));
  }

  return (
    <div>
      <header className="app-header">
        <div className="app-header-top">
          <h1>HDK ARFF</h1>
          <div className="header-right">
            <span className="doc-badge">RACL-SQ-ARF-COP-24-2</span>
            <button className="admin-btn" onClick={isAdmin ? signOut : () => setShowLogin(true)}>
              {isAdmin ? "Admin · Sign out" : "Admin"}
            </button>
          </div>
        </div>
        <p>RESCUE 2 — Daily Inspection</p>
      </header>

      <nav className="tabs">
        <button className={`tab-btn ${tab === "checklist" ? "active" : ""}`} onClick={() => setTab("checklist")}>
          Checklist
        </button>
        <button className={`tab-btn ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>
          Logs
        </button>
        <button className={`tab-btn ${tab === "faults" ? "active" : ""}`} onClick={() => setTab("faults")}>
          Faults
        </button>
        <button className={`tab-btn ${tab === "trends" ? "active" : ""}`} onClick={() => setTab("trends")}>
          Trends
        </button>
        {isAdmin && (
          <button className={`tab-btn ${tab === "setup" ? "active" : ""}`} onClick={() => setTab("setup")}>
            Setup
          </button>
        )}
      </nav>

      {tab === "checklist" && <ChecklistPage />}
      {tab === "logs" && <LogsPage showFaults={false} isAdmin={isAdmin} onAuthLost={signOut} />}
      {tab === "faults" && <LogsPage showFaults={true} isAdmin={isAdmin} onAuthLost={signOut} />}
      {tab === "trends" && <TrendsPage />}
      {tab === "setup" && isAdmin && <ChecklistEditor onAuthLost={signOut} />}

      {showLogin && (
        <AdminLogin onClose={() => setShowLogin(false)} onSignedIn={() => { setIsAdmin(true); setShowLogin(false); }} />
      )}
    </div>
  );
}
