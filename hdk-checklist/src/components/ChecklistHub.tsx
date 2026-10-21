import { useCallback, useEffect, useState } from "react";
import type { CheckKind } from "../types";
import { getOverview, type Overview } from "../storage";
import { CHECK_KINDS, KIND_LABEL, periodKey } from "../checkKinds";
import { faultAge, vehicleState } from "../faultAge";
import { logTime } from "../trends";
import ChecklistPage from "./ChecklistPage";
import { ServiceBanner } from "./ServiceCard";

const STATE_TEXT = { serviceable: "Serviceable", restricted: "Restricted", grounded: "Grounded" } as const;

/** Home card: vehicle status, which checks are due, open faults and the last inspection */
function TodayPanel({ overview, kind, onKind, onOpenFaults }: { overview: Overview; kind: CheckKind; onKind: (k: CheckKind) => void; onOpenFaults?: () => void }) {
  const [today] = useState(() => new Date().toLocaleDateString("en-GB"));
  const state = vehicleState(overview.openFaults);
  const open = overview.openFaults;
  const overdue = open.filter((r) => faultAge(r).overdue).length;
  const last = CHECK_KINDS.map((k) => overview.latest[k]).filter((l) => l != null)
    .sort((a, b) => logTime(b) - logTime(a))[0];

  return (
    <div className="today-panel">
      <div className={`today-status st-${state}`}>
        <span className="today-status-word">{STATE_TEXT[state]}</span>
        <span className="today-status-sub">
          {open.length === 0 ? "No open faults" : `${open.length} open fault${open.length === 1 ? "" : "s"}${overdue ? ` · ${overdue} overdue` : ""}`}
        </span>
      </div>

      <div className="today-checks" role="tablist">
        {CHECK_KINDS.map((k) => {
          const l = overview.latest[k];
          const done = !!l && periodKey(k, l.date) === periodKey(k, today);
          return (
            <button key={k} role="tab" aria-selected={k === kind} className={`today-check${k === kind ? " active" : ""}${done ? " done" : ""}`} onClick={() => onKind(k)}>
              <span className="today-check-name">{KIND_LABEL[k]}</span>
              <span className="today-check-state">{done ? `✓ ${k === "daily" ? l!.time : l!.date.slice(0, 5)}` : "Due"}</span>
            </button>
          );
        })}
      </div>

      {open.length > 0 && (
        <div className="today-faults">
          {open.slice(0, 3).map((r) => {
            const age = faultAge(r);
            return (
              <div key={r.id} className="today-fault">
                <span className={`today-dot p-${r.priority === "Immediate Grounding" ? "g" : r.priority === "Urgent" ? "u" : "r"}`} />
                <span className="today-fault-title">{r.vehicleEquipmentLine.replace(/^RESCUE 2 \(HDK-ARFF\)\s*/, "") || r.faults.map((f) => f.label).join(", ")}</span>
                <span className={`today-fault-age${age.overdue ? " overdue" : ""}`}>{age.label.replace("Open ", "")}</span>
              </div>
            );
          })}
          {onOpenFaults && <button className="today-link" onClick={onOpenFaults}>{open.length > 3 ? `All ${open.length} open faults →` : "Open faults →"}</button>}
        </div>
      )}

      {last && (
        <p className="today-last">
          Last inspection: {KIND_LABEL[last.kind ?? "daily"]} · {last.date === today ? "today" : last.date} {last.time} · {last.operatorName} · {last.faultCount ? `${last.faultCount} fault${last.faultCount === 1 ? "" : "s"}` : "no faults"}
        </p>
      )}
      {overview.offline && <p className="today-last">Offline — showing what this device has saved.</p>}
    </div>
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
    <>
      {!active && overview && <TodayPanel overview={overview} kind={kind} onKind={setKind} onOpenFaults={onOpenFaults} />}
      {!active && !overview && (
        <div className="kind-tabs">
          {CHECK_KINDS.map((k) => (
            <button key={k} className={`kind-tab${k === kind ? " active" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
      )}
      {!active && <ServiceBanner />}
      <ChecklistPage key={kind} kind={kind} onSubmitted={() => refresh(true)} onActiveChange={setActive} />
    </>
  );
}
