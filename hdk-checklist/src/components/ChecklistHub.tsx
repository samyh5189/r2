import { useCallback, useEffect, useState } from "react";
import type { CheckKind } from "../types";
import { getOverview, type Overview } from "../storage";
import { CHECK_KINDS, KIND_LABEL, periodKey } from "../checkKinds";
import { faultAge, vehicleState } from "../faultAge";
import { logTime } from "../trends";
import ChecklistPage from "./ChecklistPage";
import { ServiceBanner } from "./ServiceCard";

const STATE_TEXT = { serviceable: "Serviceable", restricted: "Restricted", grounded: "Grounded" } as const;

/** Which check is open, with a dot for done (green) or due (amber) in its current period */
function KindPicker({ overview, kind, onKind }: { overview: Overview | null; kind: CheckKind; onKind: (k: CheckKind) => void }) {
  const [today] = useState(() => new Date().toLocaleDateString("en-GB"));
  return (
    <div className="seg" role="tablist">
      {CHECK_KINDS.map((k) => {
        const l = overview?.latest[k];
        const done = !!l && periodKey(k, l.date) === periodKey(k, today);
        return (
          <button key={k} role="tab" aria-selected={k === kind} className={`seg-btn${k === kind ? " active" : ""}`} onClick={() => onKind(k)}>
            {KIND_LABEL[k]}
            {overview && <span className={`seg-dot ${done ? "done" : "due"}`} title={done ? "Done" : "Due"} />}
          </button>
        );
      })}
    </div>
  );
}

/** Below the checklist: vehicle status, open faults and the last inspection */
function StatusPanel({ overview, onOpenFaults }: { overview: Overview; onOpenFaults?: () => void }) {
  const [today] = useState(() => new Date().toLocaleDateString("en-GB"));
  const state = vehicleState(overview.openFaults);
  const open = overview.openFaults;
  const overdue = open.filter((r) => faultAge(r).overdue).length;
  const last = CHECK_KINDS.map((k) => overview.latest[k]).filter((l) => l != null)
    .sort((a, b) => logTime(b) - logTime(a))[0];

  return (
    <section className="status-panel">
      <h3 className="status-heading">Vehicle status</h3>
      <div className="status-row">
        <span className={`status-pill st-${state}`}><span className="status-led" />{STATE_TEXT[state]}</span>
        <span className="status-sub">
          {open.length === 0 ? "No open faults" : `${open.length} open fault${open.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}`}
        </span>
      </div>

      <ServiceBanner />

      {open.length > 0 && (
        <ul className="status-faults">
          {open.slice(0, 3).map((r) => {
            const age = faultAge(r);
            return (
              <li key={r.id}>
                <span className={`status-dot p-${r.priority === "Immediate Grounding" ? "g" : r.priority === "Urgent" ? "u" : "r"}`} />
                <span className="status-fault-title">{r.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*/, "") || r.faults.map((f) => f.label).join(", ")}</span>
                <span className={`status-fault-age${age.overdue ? " overdue" : ""}`}>{age.label.replace("Open ", "")}</span>
              </li>
            );
          })}
        </ul>
      )}
      {open.length > 0 && onOpenFaults && (
        <button className="status-link" onClick={onOpenFaults}>{open.length > 3 ? `All ${open.length} open faults` : "View faults"} →</button>
      )}

      {last && (
        <p className="status-last">
          Last inspection · {KIND_LABEL[last.kind ?? "daily"]} · {last.date === today ? "today" : last.date} {last.time} · {last.operatorName}
          {last.faultCount ? ` · ${last.faultCount} fault${last.faultCount === 1 ? "" : "s"}` : ""}
        </p>
      )}
      {overview.offline && <p className="status-last">Offline — showing what this device has saved.</p>}
    </section>
  );
}

/** Checklist tab: today's status, then the daily, weekly, monthly or yearly check. */
export default function ChecklistHub({ initialKind = "daily", onOpenFaults }: { initialKind?: CheckKind; onOpenFaults?: () => void }) {
  const [kind, setKind] = useState<CheckKind>(initialKind);
  const [active, setActive] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);

  const refresh = useCallback((fresh = false) => { getOverview(fresh).then(setOverview); }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div className="hub">
      {!active && <KindPicker overview={overview} kind={kind} onKind={setKind} />}
      <ChecklistPage key={kind} kind={kind} onSubmitted={() => refresh(true)} onActiveChange={setActive} />
      {!active && overview && <StatusPanel overview={overview} onOpenFaults={onOpenFaults} />}
    </div>
  );
}
