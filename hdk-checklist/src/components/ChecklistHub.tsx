import { useCallback, useEffect, useState } from "react";
import type { CheckKind } from "../types";
import { getLogs } from "../storage";
import { CHECK_KINDS, KIND_LABEL, logKind, periodKey } from "../checkKinds";
import ChecklistPage from "./ChecklistPage";
import { ServiceBanner } from "./ServiceCard";

/** Checklist tab: pick the daily, weekly, monthly or yearly check. */
export default function ChecklistHub({ initialKind = "daily" }: { initialKind?: CheckKind }) {
  const [kind, setKind] = useState<CheckKind>(initialKind);
  const [active, setActive] = useState(false);
  // Whether each periodic check is already done for its current period
  const [done, setDone] = useState<Partial<Record<CheckKind, boolean>>>({});

  const refresh = useCallback(() => {
    getLogs().then((logs) => {
      const today = new Date().toLocaleDateString("en-GB");
      setDone(Object.fromEntries(CHECK_KINDS.slice(1).map((k) => [
        k, logs.some((l) => logKind(l) === k && periodKey(k, l.date) === periodKey(k, today)),
      ])));
    });
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      {!active && (
        <div className="kind-tabs">
          {CHECK_KINDS.map((k) => (
            <button key={k} className={`kind-tab${k === kind ? " active" : ""}`} onClick={() => setKind(k)}>
              {KIND_LABEL[k]}
              {k !== "daily" && done[k] !== undefined && (
                <span className={`kind-chip ${done[k] ? "done" : "due"}`}>{done[k] ? "✓" : "Due"}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {!active && <ServiceBanner />}
      <ChecklistPage key={kind} kind={kind} onSubmitted={refresh} onActiveChange={setActive} />
    </>
  );
}
