import { useCallback, useEffect, useState } from "react";
import type { CheckKind } from "../types";
import { getOverview, type Overview } from "../storage";
import { CHECK_KINDS, KIND_LABEL, checkStatus, dayLabel } from "../checkKinds";
import { faultAge, vehicleState } from "../faultAge";
import { logTime } from "../trends";
import ChecklistPage from "./ChecklistPage";
import { ServiceBanner } from "./ServiceCard";

const STATE_TEXT = { serviceable: "Serviceable", restricted: "Restricted", grounded: "Grounded" } as const;

/**
 * Which check is open. Daily is always there; the weekly, monthly and yearly checks appear on
 * their scheduled day and stay until someone does them (amber dot, red once a cycle was missed).
 */
function KindPicker({ overview, kind, onKind }: { overview: Overview | null; kind: CheckKind; onKind: (k: CheckKind) => void }) {
  const shown = CHECK_KINDS.filter((k) => k === "daily" || k === kind || !overview || !checkStatus(k, overview.latest[k]).done);
  if (shown.length === 1) return null;
  return (
    <div className="seg" role="tablist">
      {shown.map((k) => {
        const st = overview && checkStatus(k, overview.latest[k]);
        const dot = !st ? null : st.done ? "done" : st.overdue ? "overdue" : "due";
        return (
          <button key={k} role="tab" aria-selected={k === kind} className={`seg-btn${k === kind ? " active" : ""}`} onClick={() => onKind(k)}>
            {KIND_LABEL[k]}
            {dot && <span className={`seg-dot ${dot}`} title={dot === "done" ? "Done" : dot === "overdue" ? "Overdue" : "Due"} />}
          </button>
        );
      })}
    </div>
  );
}

/** The periodic checks already done, and when each is next due */
function ComingUp({ overview }: { overview: Overview }) {
  const done = CHECK_KINDS.filter((k) => k !== "daily").map((k) => ({ k, st: checkStatus(k, overview.latest[k]) })).filter((x) => x.st.done);
  if (done.length === 0) return null;
  return <p className="status-last">Coming up · {done.map(({ k, st }) => `${KIND_LABEL[k]} ${dayLabel(st.next)}`).join(" · ")}</p>;
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

      <ComingUp overview={overview} />

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
export default function ChecklistHub({ initialKind = "daily", onOpenFaults, onActiveChange }: { initialKind?: CheckKind; onOpenFaults?: () => void; onActiveChange?: (active: boolean) => void }) {
  const [kind, setKind] = useState<CheckKind>(initialKind);
  const [active, setActiveState] = useState(false);
  const setActive = useCallback((a: boolean) => { setActiveState(a); onActiveChange?.(a); }, [onActiveChange]);
  // Leaving the tab mid-inspection brings the bottom bar back
  useEffect(() => () => onActiveChange?.(false), [onActiveChange]);
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
