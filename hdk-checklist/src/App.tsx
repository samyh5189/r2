import { useEffect, useState } from "react";
import { ClipboardCheck, ListChecks, Settings, TrendingUp, TriangleAlert } from "lucide-react";
import "./index.css";
import ChecklistHub from "./components/ChecklistHub";
import LogsPage from "./components/LogsPage";
import AdminLogin from "./components/AdminLogin";
import SetupPage from "./components/SetupPage";
import TrendsPage from "./components/TrendsPage";
import PdfViewer from "./components/PdfViewer";
import DialogHost from "./components/DialogHost";
import { getAdminToken, signOutAdmin } from "./storage";
import { useGeneralSettings } from "./settings";
import { CHECK_KINDS } from "./checkKinds";
import type { CheckKind } from "./types";

// A QR code on the vehicle links to /?check=<kind>; open that checklist, then tidy the address
function checkFromUrl(): CheckKind | undefined {
  const kind = new URLSearchParams(window.location.search).get("check") as CheckKind | null;
  if (!kind || !CHECK_KINDS.includes(kind)) return undefined;
  window.history.replaceState(null, "", window.location.pathname);
  return kind;
}

type Tab = "checklist" | "logs" | "faults" | "trends" | "setup";
const TABS: { id: Tab; label: string; Icon: typeof ClipboardCheck; admin?: boolean }[] = [
  { id: "checklist", label: "Checklist", Icon: ClipboardCheck },
  { id: "logs", label: "Logs", Icon: ListChecks },
  { id: "faults", label: "Faults", Icon: TriangleAlert },
  { id: "trends", label: "Trends", Icon: TrendingUp },
  { id: "setup", label: "Setup", Icon: Settings, admin: true },
];

// The tab lives in the address (#logs …) so the phone's back button steps back through tabs
const tabFromHash = (): Tab => {
  const t = window.location.hash.slice(1) as Tab;
  return TABS.some((x) => x.id === t) ? t : "checklist";
};

export default function App() {
  const [startKind] = useState(checkFromUrl);
  useGeneralSettings(); // Setup → Rules (repair targets) take effect app-wide
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [isAdmin, setIsAdmin] = useState(() => !!getAdminToken());
  const [showLogin, setShowLogin] = useState(false);
  // While an inspection is under way the bottom bar hides, so a stray tap can't leave it
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    const onPop = () => setTabState(tabFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function setTab(next: Tab) {
    if (next === tab) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    window.history.pushState(null, "", next === "checklist" ? window.location.pathname : `#${next}`);
    setTabState(next);
    window.scrollTo(0, 0);
  }

  function signOut() {
    signOutAdmin();
    setIsAdmin(false);
    if (tab === "setup") setTab("checklist");
  }

  const visible = TABS.filter((t) => !t.admin || isAdmin);
  const shown: Tab = tab === "setup" && !isAdmin ? "checklist" : tab;

  return (
    <div className={`app${inspecting ? " inspecting" : ""}`}>
      <header className="app-header">
        <div className="app-header-top">
          <div>
            <h1>HDK ARFF</h1>
            <p>RESCUE 2 — Vehicle Inspections</p>
          </div>
          <div className="header-right">
            <span className="doc-badge">RACL-SQ-ARF-COP-24-2</span>
            <button className="admin-btn" onClick={isAdmin ? signOut : () => setShowLogin(true)}>
              {isAdmin ? "Sign out" : "Admin"}
            </button>
          </div>
        </div>
        <nav className="tabs top-tabs">
          {visible.map(({ id, label }) => (
            <button key={id} className={`tab-btn ${shown === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {shown === "checklist" && <ChecklistHub initialKind={startKind} onOpenFaults={() => setTab("faults")} onActiveChange={setInspecting} />}
        {shown === "logs" && <LogsPage showFaults={false} isAdmin={isAdmin} onAuthLost={signOut} />}
        {shown === "faults" && <LogsPage showFaults={true} isAdmin={isAdmin} onAuthLost={signOut} />}
        {shown === "trends" && <TrendsPage isAdmin={isAdmin} />}
        {shown === "setup" && isAdmin && <SetupPage onAuthLost={signOut} />}
      </main>

      {!inspecting && (
        <nav className="bottom-nav" aria-label="Sections">
          {visible.map(({ id, label, Icon }) => (
            <button key={id} className={`bottom-tab${shown === id ? " active" : ""}`} onClick={() => setTab(id)} aria-current={shown === id ? "page" : undefined}>
              <Icon size={22} strokeWidth={shown === id ? 2.4 : 1.9} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}

      <PdfViewer />
      <DialogHost />
      {showLogin && (
        <AdminLogin onClose={() => setShowLogin(false)} onSignedIn={() => { setIsAdmin(true); setShowLogin(false); }} />
      )}
    </div>
  );
}
