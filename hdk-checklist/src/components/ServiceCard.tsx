import { fmtServiceDate, type ServiceStatus } from "../service";
import { useServiceStatus } from "../useServiceStatus";

const STATE_LABEL = { unset: "Not set up", ok: "OK", soon: "Due soon", overdue: "Overdue" } as const;

/** Engine service card for the Trends page */
export default function ServiceCard({ status }: { status: ServiceStatus }) {
  const { state, current, perDay, nextHours, hoursLeft, estDate, dueByDate } = status;
  return (
    <div className={`service-card st-${state}`}>
      <div className="service-head">
        <strong>Engine service</strong>
        <span className={`service-state st-${state}`}>{STATE_LABEL[state]}</span>
      </div>
      {state === "unset" ? (
        <p className="editor-hint" style={{ margin: 0 }}>An admin can set the service interval and the last service under Setup → Engine service.</p>
      ) : (
        <div className="service-grid">
          <div><span>Engine hours</span><strong>{current ? current.hours.toLocaleString() : "—"}</strong>{current && <em>as of {current.date}</em>}</div>
          {nextHours != null && <div><span>Next service</span><strong>{nextHours.toLocaleString()} h</strong>{hoursLeft != null && <em>{hoursLeft > 0 ? `${Math.round(hoursLeft)} h left` : `${Math.round(-hoursLeft)} h over`}</em>}</div>}
          {estDate && <div><span>At current use</span><strong>~{fmtServiceDate(estDate)}</strong>{perDay && <em>{perDay.toFixed(1)} h/day</em>}</div>}
          {dueByDate && <div><span>Calendar due</span><strong>{fmtServiceDate(dueByDate)}</strong></div>}
        </div>
      )}
    </div>
  );
}

/** Slim banner for the checklist screen, only when a service is due */
export function ServiceBanner() {
  const status = useServiceStatus();
  if (!status || (status.state !== "soon" && status.state !== "overdue")) return null;
  return (
    <div className={`service-banner st-${status.state}`}>
      🔧 Engine service {status.state === "overdue" ? "overdue" : "due soon"}: {status.reasons.join("; ")}
    </div>
  );
}
