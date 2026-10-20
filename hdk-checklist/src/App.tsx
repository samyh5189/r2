import { useState } from "react";
import "./index.css";
import ChecklistPage from "./components/ChecklistPage";
import LogsPage from "./components/LogsPage";

type Tab = "checklist" | "logs" | "faults";

export default function App() {
  const [tab, setTab] = useState<Tab>("checklist");

  return (
    <div>
      <header className="app-header">
        <div className="app-header-top">
          <h1>HDK ARFF</h1>
          <span className="doc-badge">RACL-SQ-ARF-COP-24-2</span>
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
      </nav>

      {tab === "checklist" && <ChecklistPage />}
      {tab === "logs" && <LogsPage showFaults={false} />}
      {tab === "faults" && <LogsPage showFaults={true} />}
    </div>
  );
}
