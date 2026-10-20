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
        <h1>REGIONAL AIRPORTS COMPANY LTD — ARFF DEPARTMENT</h1>
        <p>RESCUE 2  |  SECTION ONE — VEHICLE OPERATORS  |  Daily Inspection Checklist</p>
        <span className="doc-badge">HDK-ARFF/R3/CHK  ·  SOP: RACL-SQ-ARF-COP-24-2</span>
      </header>

      <nav className="tabs">
        <button className={`tab-btn ${tab === "checklist" ? "active" : ""}`} onClick={() => setTab("checklist")}>
          Daily Checklist
        </button>
        <button className={`tab-btn ${tab === "logs" ? "active" : ""}`} onClick={() => setTab("logs")}>
          Inspection Logs
        </button>
        <button className={`tab-btn ${tab === "faults" ? "active" : ""}`} onClick={() => setTab("faults")}>
          Fault Reports
        </button>
      </nav>

      {tab === "checklist" && <ChecklistPage />}
      {tab === "logs" && <LogsPage showFaults={false} />}
      {tab === "faults" && <LogsPage showFaults={true} />}
    </div>
  );
}
